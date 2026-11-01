BEGIN;

-- Stage 4: Public emergency reporting stored procedure
-- Atomically creates the incident, optional reporter contact, and initial audit event.
-- Guarantees idempotency via SHA-256 digest of client request ID.

CREATE OR REPLACE FUNCTION public.submit_public_incident(
  p_idempotency_key_sha256 bytea,
  p_tracking_token_sha256 bytea,
  p_category public.incident_category,
  p_summary text,
  p_zone_id uuid,
  p_landmark text,
  p_location_source public.location_source,
  p_latitude numeric,
  p_longitude numeric,
  p_location_accuracy_m numeric,
  p_phone_e164 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_incident_id uuid;
  v_reported_at timestamptz;
  v_status public.incident_status;
  v_zone_name text;
BEGIN
  -- 1. Check for existing incident by idempotency key digest
  IF p_idempotency_key_sha256 IS NOT NULL THEN
    SELECT id, reported_at, status INTO v_existing_id, v_reported_at, v_status
    FROM public.incidents
    WHERE idempotency_key_sha256 = p_idempotency_key_sha256
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      SELECT name INTO v_zone_name FROM public.zones WHERE id = p_zone_id;
      RETURN jsonb_build_object(
        'incident_id', v_existing_id,
        'status', v_status,
        'reported_at', v_reported_at,
        'category', p_category,
        'summary', p_summary,
        'zone_id', p_zone_id,
        'zone_name', v_zone_name,
        'landmark', p_landmark,
        'is_idempotent_replay', true
      );
    END IF;
  END IF;

  -- 2. Validate zone existence if provided
  IF p_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone_name FROM public.zones WHERE id = p_zone_id;
    IF v_zone_name IS NULL THEN
      RAISE EXCEPTION 'Invalid zone specified' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 3. Insert incident
  v_incident_id := gen_random_uuid();
  v_reported_at := now();
  v_status := 'REPORTED';

  INSERT INTO public.incidents (
    id,
    category,
    priority,
    status,
    summary,
    reported_at,
    location_source,
    latitude,
    longitude,
    location_accuracy_m,
    landmark,
    zone_id,
    location_captured_at,
    idempotency_key_sha256,
    public_tracking_token_sha256
  ) VALUES (
    v_incident_id,
    p_category,
    'NORMAL',
    v_status,
    p_summary,
    v_reported_at,
    p_location_source,
    p_latitude,
    p_longitude,
    p_location_accuracy_m,
    p_landmark,
    p_zone_id,
    CASE WHEN p_latitude IS NOT NULL THEN now() ELSE NULL END,
    p_idempotency_key_sha256,
    p_tracking_token_sha256
  );

  -- 4. If callback phone provided, insert into reporter_contacts
  IF p_phone_e164 IS NOT NULL AND char_length(btrim(p_phone_e164)) > 0 THEN
    INSERT INTO public.reporter_contacts (
      incident_id,
      phone_e164,
      preferred_contact_method
    ) VALUES (
      v_incident_id,
      p_phone_e164,
      'PHONE'
    );
  END IF;

  -- 5. Insert initial audit event
  INSERT INTO public.incident_events (
    incident_id,
    actor_profile_id,
    event_type,
    status_before,
    status_after,
    occurred_at
  ) VALUES (
    v_incident_id,
    NULL,
    'REPORT_CREATED',
    NULL,
    NULL,
    v_reported_at
  );

  RETURN jsonb_build_object(
    'incident_id', v_incident_id,
    'status', v_status,
    'reported_at', v_reported_at,
    'category', p_category,
    'summary', p_summary,
    'zone_id', p_zone_id,
    'zone_name', v_zone_name,
    'landmark', p_landmark,
    'is_idempotent_replay', false
  );
END;
$$;

-- Backend-only service_role grants for the atomic reporting procedure and zone catalog
REVOKE ALL ON FUNCTION public.submit_public_incident FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_incident TO service_role;

GRANT SELECT ON public.zones TO service_role;

COMMIT;
