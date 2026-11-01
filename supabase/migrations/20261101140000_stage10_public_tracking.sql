BEGIN;

-- Stage 10: Connectivity resilience and public tracking
-- 1. Update submit_public_incident to accept optional client reported_at
-- Drop the 11-parameter signature to prevent ambiguous overload
DROP FUNCTION IF EXISTS public.submit_public_incident(
  bytea,
  bytea,
  public.incident_category,
  text,
  uuid,
  text,
  public.location_source,
  numeric,
  numeric,
  numeric,
  text
);

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
  p_phone_e164 text,
  p_reported_at timestamptz DEFAULT NULL
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

  -- 3. Insert incident (preserving client original reported time if provided; server receipt time recorded in created_at)
  v_incident_id := gen_random_uuid();
  v_reported_at := COALESCE(p_reported_at, now());
  v_status := 'REPORTED';

  INSERT INTO public.incidents (
    id,
    category,
    priority,
    status,
    summary,
    reported_at,
    created_at,
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
    now(),
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
    now()
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

REVOKE ALL ON FUNCTION public.submit_public_incident FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_incident TO service_role;

-- 2. Public Tracking Lookup Procedure
-- STRICT SAFETY BOUNDARY:
-- - Uses 32-byte SHA-256 digest of tracking token (token never stored raw).
-- - Exposes LIMITED, UNDERSTANDABLE status only.
-- - Strictly EXCLUDES: staff names, internal notes, responder locations, reporter contacts, or other incidents.

CREATE OR REPLACE FUNCTION public.get_public_incident_tracking(
  p_tracking_token_sha256 bytea
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_status_label text;
  v_latest_update timestamptz;
BEGIN
  IF p_tracking_token_sha256 IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    i.id,
    i.status,
    i.category,
    i.summary,
    i.reported_at,
    i.created_at,
    i.landmark,
    z.name AS zone_name
  INTO v_rec
  FROM public.incidents i
  LEFT JOIN public.zones z ON z.id = i.zone_id
  WHERE i.public_tracking_token_sha256 = p_tracking_token_sha256
  LIMIT 1;

  IF v_rec.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Compute understandable, public-friendly status label
  v_status_label := CASE v_rec.status
    WHEN 'REPORTED' THEN 'Report Received by Control Room'
    WHEN 'UNDER_REVIEW' THEN 'Under Operational Review'
    WHEN 'ASSIGNED' THEN 'Response Team Dispatched'
    WHEN 'ACKNOWLEDGED' THEN 'Response Team Acknowledged'
    WHEN 'EN_ROUTE' THEN 'Response Team En Route'
    WHEN 'ON_SCENE' THEN 'Response Team On Scene'
    WHEN 'RESOLVED' THEN 'Incident Resolved'
    WHEN 'CLOSED' THEN 'Incident Formally Closed'
    WHEN 'DUPLICATE' THEN 'Merged with Existing Incident Report'
    WHEN 'CANCELLED' THEN 'Report Cancelled'
    ELSE v_rec.status::text
  END;

  -- Get latest activity timestamp from audit trail
  SELECT max(occurred_at) INTO v_latest_update
  FROM public.incident_events
  WHERE incident_id = v_rec.id;

  v_latest_update := COALESCE(v_latest_update, v_rec.reported_at);

  RETURN jsonb_build_object(
    'incident_id', v_rec.id,
    'status', v_rec.status,
    'status_label', v_status_label,
    'category', v_rec.category,
    'summary', v_rec.summary,
    'reported_at', v_rec.reported_at,
    'received_at', v_rec.created_at,
    'updated_at', v_latest_update,
    'zone_name', v_rec.zone_name,
    'landmark', v_rec.landmark
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_incident_tracking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_incident_tracking TO service_role;

COMMIT;
