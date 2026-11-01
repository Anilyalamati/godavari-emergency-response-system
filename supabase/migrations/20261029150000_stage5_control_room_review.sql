BEGIN;

-- Stage 5: Control-room incident review
-- Schema extensions for operator review, duplicate linking, and explicit cancellation.

ALTER TABLE public.incidents
  ADD COLUMN duplicate_of_incident_id uuid REFERENCES public.incidents (id) ON DELETE SET NULL,
  ADD COLUMN review_notes text,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN reviewed_by_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD CONSTRAINT incidents_not_duplicate_of_self
    CHECK (duplicate_of_incident_id IS NULL OR duplicate_of_incident_id <> id),
  ADD CONSTRAINT incidents_duplicate_requires_target
    CHECK (status <> 'DUPLICATE' OR duplicate_of_incident_id IS NOT NULL),
  ADD CONSTRAINT incidents_cancelled_requires_reason
    CHECK (status <> 'CANCELLED' OR (cancellation_reason IS NOT NULL AND char_length(btrim(cancellation_reason)) > 0)),
  ADD CONSTRAINT incidents_review_notes_length
    CHECK (review_notes IS NULL OR char_length(btrim(review_notes)) <= 4000),
  ADD CONSTRAINT incidents_cancellation_reason_length
    CHECK (cancellation_reason IS NULL OR char_length(btrim(cancellation_reason)) <= 1000);

-- Allow recording human-readable context or links on audit events
ALTER TABLE public.incident_events
  ADD COLUMN notes text
    CHECK (notes IS NULL OR char_length(notes) <= 1000);

CREATE INDEX incidents_queue_order_idx
  ON public.incidents (priority, reported_at);

CREATE INDEX incidents_duplicate_of_idx
  ON public.incidents (duplicate_of_incident_id);

CREATE INDEX incident_events_incident_occurred_idx
  ON public.incident_events (incident_id, occurred_at ASC);

-- Operator incident review stored procedure
-- Atomically validates role, transition constraints, updates fields, and logs audit events.
CREATE OR REPLACE FUNCTION public.operator_review_incident(
  p_incident_id uuid,
  p_actor_profile_id uuid,
  p_status public.incident_status DEFAULT NULL,
  p_priority public.incident_priority DEFAULT NULL,
  p_review_notes text DEFAULT NULL,
  p_duplicate_of_incident_id uuid DEFAULT NULL,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role public.staff_role;
  v_actor_active boolean;
  v_current_status public.incident_status;
  v_current_priority public.incident_priority;
  v_current_duplicate_of uuid;
  v_current_review_notes text;
  v_current_cancellation_reason text;
  v_target_duplicate_exists boolean;
  v_new_status public.incident_status;
  v_new_priority public.incident_priority;
  v_new_duplicate_of uuid;
  v_new_review_notes text;
  v_new_cancellation_reason text;
  v_status_changed boolean := false;
  v_priority_changed boolean := false;
  v_duplicate_linked boolean := false;
  v_now timestamptz := now();
BEGIN
  -- 1. Check caller authorization: actor must be active staff with OPERATOR role
  SELECT role, is_active INTO v_actor_role, v_actor_active
  FROM public.profiles
  WHERE id = p_actor_profile_id;

  IF v_actor_role IS NULL OR NOT v_actor_active OR v_actor_role <> 'OPERATOR'::public.staff_role THEN
    RAISE EXCEPTION 'Operator role is required to review incidents' USING ERRCODE = '42501';
  END IF;

  -- If auth.uid() is available (client session), ensure it matches actor
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Actor mismatch with authenticated user' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock incident row and read current values
  SELECT
    status, priority, duplicate_of_incident_id, review_notes, cancellation_reason
  INTO
    v_current_status, v_current_priority, v_current_duplicate_of, v_current_review_notes, v_current_cancellation_reason
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;

  -- Check terminal states: cannot modify CANCELLED or CLOSED incidents
  IF v_current_status IN ('CANCELLED'::public.incident_status, 'CLOSED'::public.incident_status) THEN
    RAISE EXCEPTION 'Incident is in terminal status and cannot be modified' USING ERRCODE = '22023';
  END IF;

  -- 3. Determine new values
  v_new_status := COALESCE(p_status, v_current_status);
  v_new_priority := COALESCE(p_priority, v_current_priority);
  v_new_duplicate_of := COALESCE(p_duplicate_of_incident_id, v_current_duplicate_of);
  v_new_review_notes := CASE
    WHEN p_review_notes IS NOT NULL THEN btrim(p_review_notes)
    ELSE v_current_review_notes
  END;
  v_new_cancellation_reason := CASE
    WHEN p_cancellation_reason IS NOT NULL THEN btrim(p_cancellation_reason)
    ELSE v_current_cancellation_reason
  END;

  -- 4. Validate duplicate linking
  IF p_duplicate_of_incident_id IS NOT NULL THEN
    IF p_duplicate_of_incident_id = p_incident_id THEN
      RAISE EXCEPTION 'Incident cannot be marked as a duplicate of itself' USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.incidents WHERE id = p_duplicate_of_incident_id
    ) INTO v_target_duplicate_exists;

    IF NOT v_target_duplicate_exists THEN
      RAISE EXCEPTION 'Target duplicate incident does not exist' USING ERRCODE = '23503';
    END IF;

    -- If status wasn't explicitly provided, marking duplicate sets status to DUPLICATE
    IF p_status IS NULL THEN
      v_new_status := 'DUPLICATE'::public.incident_status;
    END IF;

    IF v_current_duplicate_of IS DISTINCT FROM p_duplicate_of_incident_id THEN
      v_duplicate_linked := true;
    END IF;
  END IF;

  -- 5. Validate status transitions
  IF v_new_status <> v_current_status THEN
    v_status_changed := true;

    -- Specific transition validation
    IF v_current_status = 'REPORTED'::public.incident_status THEN
      IF v_new_status NOT IN (
        'UNDER_REVIEW'::public.incident_status,
        'DUPLICATE'::public.incident_status,
        'CANCELLED'::public.incident_status
      ) THEN
        RAISE EXCEPTION 'Invalid status transition from REPORTED to %', v_new_status USING ERRCODE = '22023';
      END IF;
    ELSIF v_current_status = 'UNDER_REVIEW'::public.incident_status THEN
      IF v_new_status NOT IN (
        'ASSIGNED'::public.incident_status,
        'RESOLVED'::public.incident_status,
        'CLOSED'::public.incident_status,
        'DUPLICATE'::public.incident_status,
        'CANCELLED'::public.incident_status
      ) THEN
        RAISE EXCEPTION 'Invalid status transition from UNDER_REVIEW to %', v_new_status USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_new_status = 'DUPLICATE'::public.incident_status AND v_new_duplicate_of IS NULL THEN
      RAISE EXCEPTION 'Duplicate status requires a duplicate target incident ID' USING ERRCODE = '23514';
    END IF;

    IF v_new_status = 'CANCELLED'::public.incident_status AND (v_new_cancellation_reason IS NULL OR char_length(v_new_cancellation_reason) = 0) THEN
      RAISE EXCEPTION 'Cancellation reason is required when cancelling an incident' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 6. Check priority change
  IF v_new_priority <> v_current_priority THEN
    v_priority_changed := true;
  END IF;

  -- 7. Update incident record
  UPDATE public.incidents
  SET
    status = v_new_status,
    priority = v_new_priority,
    duplicate_of_incident_id = v_new_duplicate_of,
    review_notes = v_new_review_notes,
    cancellation_reason = v_new_cancellation_reason,
    reviewed_by_profile_id = p_actor_profile_id,
    reviewed_at = v_now,
    updated_at = v_now
  WHERE id = p_incident_id;

  -- 8. Record audit events
  IF v_status_changed THEN
    INSERT INTO public.incident_events (
      incident_id,
      actor_profile_id,
      event_type,
      status_before,
      status_after,
      notes,
      occurred_at
    ) VALUES (
      p_incident_id,
      p_actor_profile_id,
      'STATUS_CHANGED'::public.incident_event_type,
      v_current_status,
      v_new_status,
      CASE WHEN v_new_status = 'CANCELLED' THEN v_new_cancellation_reason ELSE NULL END,
      v_now
    );
  END IF;

  IF v_priority_changed THEN
    INSERT INTO public.incident_events (
      incident_id,
      actor_profile_id,
      event_type,
      status_before,
      status_after,
      notes,
      occurred_at
    ) VALUES (
      p_incident_id,
      p_actor_profile_id,
      'PRIORITY_CHANGED'::public.incident_event_type,
      NULL,
      NULL,
      'Priority changed from ' || v_current_priority::text || ' to ' || v_new_priority::text,
      v_now
    );
  END IF;

  IF v_duplicate_linked THEN
    INSERT INTO public.incident_events (
      incident_id,
      actor_profile_id,
      event_type,
      status_before,
      status_after,
      notes,
      occurred_at
    ) VALUES (
      p_incident_id,
      p_actor_profile_id,
      'DUPLICATE_LINKED'::public.incident_event_type,
      NULL,
      NULL,
      'Linked to duplicate incident ' || v_new_duplicate_of::text,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_incident_id,
    'status', v_new_status,
    'priority', v_new_priority,
    'duplicate_of_incident_id', v_new_duplicate_of,
    'review_notes', v_new_review_notes,
    'cancellation_reason', v_new_cancellation_reason,
    'reviewed_by_profile_id', p_actor_profile_id,
    'reviewed_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.operator_review_incident TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.operator_review_incident FROM anon;

COMMIT;
