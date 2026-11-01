BEGIN;

-- Stage 7: Responder interface & report-to-resolution lifecycle
-- Functions for responder workflow actions:
-- 1. ACKNOWLEDGE (ASSIGNED -> ACKNOWLEDGED)
-- 2. EN_ROUTE (ACKNOWLEDGED -> EN_ROUTE)
-- 3. ON_SCENE (EN_ROUTE -> ON_SCENE)
-- 4. RESOLVE (ON_SCENE or EN_ROUTE or ACKNOWLEDGED -> RESOLVED) with outcome
-- 5. REQUEST_SUPPORT (appends SUPPORT_REQUESTED audit event and notes)
-- 6. CLOSE (RESOLVED -> CLOSED) - Operator/Admin only

-- Update can_access_incident to permit responders to view incidents in active or resolved states for their team
CREATE OR REPLACE FUNCTION public.can_access_incident(p_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.role = 'OPERATOR'::public.staff_role
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.team_memberships AS tm
        ON tm.profile_id = p.id
       AND tm.active
      JOIN public.assignments AS a
        ON a.team_id = tm.team_id
       AND a.incident_id = p_incident_id
       AND a.status IN (
         'PENDING'::public.assignment_status,
         'ACKNOWLEDGED'::public.assignment_status,
         'COMPLETED'::public.assignment_status
       )
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.role = 'RESPONDER'::public.staff_role
    )
$function$;

-- Add outcome column to public.incidents if not present (for recording resolution outcome)
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS outcome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_outcome_length'
  ) THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_outcome_length
      CHECK (outcome IS NULL OR char_length(btrim(outcome)) <= 2000);
  END IF;
END $$;

-- Atomic Responder Incident Progress Procedure
CREATE OR REPLACE FUNCTION public.responder_update_incident(
  p_incident_id uuid,
  p_actor_profile_id uuid,
  p_action text, -- 'ACKNOWLEDGE', 'EN_ROUTE', 'ON_SCENE', 'RESOLVE', 'REQUEST_SUPPORT'
  p_notes text DEFAULT NULL,
  p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor RECORD;
  v_team_membership RECORD;
  v_incident RECORD;
  v_assignment RECORD;
  v_now timestamptz := now();
  v_new_incident_status public.incident_status;
  v_new_assignment_status public.assignment_status;
  v_event_notes text;
  v_status_changed boolean := false;
BEGIN
  -- 1. Check caller authorization: actor must be active staff with RESPONDER role
  SELECT id, role, is_active INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_profile_id;

  IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'RESPONDER'::public.staff_role THEN
    RAISE EXCEPTION 'Active responder role is required for this action' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Actor mismatch with authenticated user' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock incident record
  SELECT id, status, outcome INTO v_incident
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;

  -- Reject actions on closed, duplicate, or cancelled incidents
  IF v_incident.status IN (
    'CLOSED'::public.incident_status,
    'CANCELLED'::public.incident_status,
    'DUPLICATE'::public.incident_status
  ) THEN
    RAISE EXCEPTION 'Cannot modify incident in terminal status %', v_incident.status USING ERRCODE = '22023';
  END IF;

  -- 3. Lock active assignment for this incident
  -- Active assignment must be PENDING or ACKNOWLEDGED
  SELECT id, team_id, status, assigned_at, acknowledgement_deadline, acknowledged_at
  INTO v_assignment
  FROM public.assignments
  WHERE incident_id = p_incident_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active assignment found for this incident' USING ERRCODE = '22023';
  END IF;

  -- 4. Verify responder is an active member of the assigned team
  SELECT team_id, membership_role INTO v_team_membership
  FROM public.team_memberships
  WHERE profile_id = p_actor_profile_id
    AND team_id = v_assignment.team_id
    AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Responder is not an active member of the assigned team' USING ERRCODE = '42501';
  END IF;

  -- 5. Process action
  IF p_action = 'ACKNOWLEDGE' THEN
    -- ASSIGNED -> ACKNOWLEDGED
    IF v_incident.status = 'ACKNOWLEDGED'::public.incident_status AND v_assignment.status = 'ACKNOWLEDGED'::public.assignment_status THEN
      -- Idempotent repeat: already acknowledged
      RETURN jsonb_build_object(
        'incident_id', v_incident.id,
        'incident_status', v_incident.status,
        'assignment_id', v_assignment.id,
        'assignment_status', v_assignment.status,
        'is_repeat', true
      );
    END IF;

    IF v_incident.status <> 'ASSIGNED'::public.incident_status THEN
      RAISE EXCEPTION 'Cannot acknowledge incident in status % (must be ASSIGNED)', v_incident.status USING ERRCODE = '22023';
    END IF;

    v_new_incident_status := 'ACKNOWLEDGED'::public.incident_status;
    v_new_assignment_status := 'ACKNOWLEDGED'::public.assignment_status;
    v_status_changed := true;

    UPDATE public.assignments
    SET
      status = v_new_assignment_status,
      acknowledged_at = v_now,
      updated_at = v_now
    WHERE id = v_assignment.id;

    UPDATE public.incidents
    SET
      status = v_new_incident_status,
      updated_at = v_now
    WHERE id = v_incident.id;

    -- Audit event: ASSIGNMENT_ACKNOWLEDGED
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
      'ASSIGNMENT_ACKNOWLEDGED'::public.incident_event_type,
      NULL,
      NULL,
      COALESCE(p_notes, 'Team acknowledged assignment'),
      v_now
    );

    -- Audit event: STATUS_CHANGED
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
      v_incident.status,
      v_new_incident_status,
      COALESCE(p_notes, 'Incident status progressed to ACKNOWLEDGED'),
      v_now
    );

  ELSIF p_action = 'EN_ROUTE' THEN
    -- ACKNOWLEDGED -> EN_ROUTE
    IF v_incident.status = 'EN_ROUTE'::public.incident_status THEN
      -- Idempotent repeat
      RETURN jsonb_build_object(
        'incident_id', v_incident.id,
        'incident_status', v_incident.status,
        'assignment_id', v_assignment.id,
        'assignment_status', v_assignment.status,
        'is_repeat', true
      );
    END IF;

    IF v_incident.status <> 'ACKNOWLEDGED'::public.incident_status THEN
      RAISE EXCEPTION 'Cannot update to EN_ROUTE from status % (must be ACKNOWLEDGED)', v_incident.status USING ERRCODE = '22023';
    END IF;

    v_new_incident_status := 'EN_ROUTE'::public.incident_status;
    v_status_changed := true;

    UPDATE public.incidents
    SET
      status = v_new_incident_status,
      updated_at = v_now
    WHERE id = v_incident.id;

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
      v_incident.status,
      v_new_incident_status,
      COALESCE(p_notes, 'Response team en route to location'),
      v_now
    );

  ELSIF p_action = 'ON_SCENE' THEN
    -- EN_ROUTE -> ON_SCENE
    IF v_incident.status = 'ON_SCENE'::public.incident_status THEN
      -- Idempotent repeat
      RETURN jsonb_build_object(
        'incident_id', v_incident.id,
        'incident_status', v_incident.status,
        'assignment_id', v_assignment.id,
        'assignment_status', v_assignment.status,
        'is_repeat', true
      );
    END IF;

    IF v_incident.status <> 'EN_ROUTE'::public.incident_status THEN
      RAISE EXCEPTION 'Cannot update to ON_SCENE from status % (must be EN_ROUTE)', v_incident.status USING ERRCODE = '22023';
    END IF;

    v_new_incident_status := 'ON_SCENE'::public.incident_status;
    v_status_changed := true;

    UPDATE public.incidents
    SET
      status = v_new_incident_status,
      updated_at = v_now
    WHERE id = v_incident.id;

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
      v_incident.status,
      v_new_incident_status,
      COALESCE(p_notes, 'Response team arrived on scene'),
      v_now
    );

  ELSIF p_action = 'REQUEST_SUPPORT' THEN
    -- Request additional support while retaining current status
    IF p_notes IS NULL OR char_length(btrim(p_notes)) = 0 THEN
      RAISE EXCEPTION 'Notes explaining the support requested are required' USING ERRCODE = '22023';
    END IF;

    -- Append audit event (ASSIGNMENT_CREATED event type allows status_before and status_after to be NULL)
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
      'ASSIGNMENT_CREATED'::public.incident_event_type,
      NULL,
      NULL,
      'ADDITIONAL SUPPORT REQUESTED: ' || btrim(p_notes),
      v_now
    );

    RETURN jsonb_build_object(
      'incident_id', v_incident.id,
      'incident_status', v_incident.status,
      'assignment_id', v_assignment.id,
      'assignment_status', v_assignment.status,
      'support_requested', true,
      'notes', btrim(p_notes)
    );

  ELSIF p_action = 'RESOLVE' THEN
    -- Progress to RESOLVED
    IF v_incident.status = 'RESOLVED'::public.incident_status THEN
      -- Idempotent repeat
      RETURN jsonb_build_object(
        'incident_id', v_incident.id,
        'incident_status', v_incident.status,
        'assignment_id', v_assignment.id,
        'assignment_status', 'COMPLETED',
        'is_repeat', true
      );
    END IF;

    IF v_incident.status NOT IN (
      'ON_SCENE'::public.incident_status,
      'EN_ROUTE'::public.incident_status,
      'ACKNOWLEDGED'::public.incident_status
    ) THEN
      RAISE EXCEPTION 'Cannot resolve incident from status %', v_incident.status USING ERRCODE = '22023';
    END IF;

    IF p_outcome IS NULL OR char_length(btrim(p_outcome)) = 0 THEN
      RAISE EXCEPTION 'A resolution outcome description is required' USING ERRCODE = '22023';
    END IF;

    v_new_incident_status := 'RESOLVED'::public.incident_status;
    v_new_assignment_status := 'COMPLETED'::public.assignment_status;
    v_status_changed := true;

    -- Update assignment to COMPLETED (releases active lock on the team)
    UPDATE public.assignments
    SET
      status = v_new_assignment_status,
      updated_at = v_now
    WHERE id = v_assignment.id;

    -- Documented Team Release Rule:
    -- When an incident is resolved, the team assignment transitions to COMPLETED,
    -- clearing the active index filter. Team duty_status remains ON_DUTY, freeing them
    -- to be assigned to new incoming incidents.
    UPDATE public.teams
    SET
      duty_status = 'ON_DUTY'::public.team_duty_status
    WHERE id = v_assignment.team_id;

    -- Update incident with status and outcome
    UPDATE public.incidents
    SET
      status = v_new_incident_status,
      outcome = btrim(p_outcome),
      updated_at = v_now
    WHERE id = v_incident.id;

    v_event_notes := 'Incident marked RESOLVED: ' || btrim(p_outcome);
    IF p_notes IS NOT NULL AND char_length(btrim(p_notes)) > 0 THEN
      v_event_notes := v_event_notes || ' (Notes: ' || btrim(p_notes) || ')';
    END IF;

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
      v_incident.status,
      v_new_incident_status,
      v_event_notes,
      v_now
    );

  ELSE
    RAISE EXCEPTION 'Unknown responder action %', p_action USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'incident_id', v_incident.id,
    'incident_status', COALESCE(v_new_incident_status, v_incident.status),
    'assignment_id', v_assignment.id,
    'assignment_status', COALESCE(v_new_assignment_status, v_assignment.status),
    'action', p_action
  );
END;
$$;

-- Atomic Operator Incident Closure Procedure
CREATE OR REPLACE FUNCTION public.operator_close_incident(
  p_incident_id uuid,
  p_actor_profile_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor RECORD;
  v_incident RECORD;
  v_now timestamptz := now();
  v_notes text;
BEGIN
  -- 1. Check caller authorization: actor must be active staff with OPERATOR or ADMIN role
  SELECT id, role, is_active INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_profile_id;

  IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role NOT IN ('OPERATOR'::public.staff_role, 'ADMIN'::public.staff_role) THEN
    RAISE EXCEPTION 'Operator or Admin role is required to close incidents' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Actor mismatch with authenticated user' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock incident record
  SELECT id, status, outcome INTO v_incident
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_incident.status = 'CLOSED'::public.incident_status THEN
    RETURN jsonb_build_object(
      'incident_id', v_incident.id,
      'incident_status', 'CLOSED',
      'is_repeat', true
    );
  END IF;

  IF v_incident.status <> 'RESOLVED'::public.incident_status THEN
    RAISE EXCEPTION 'Only RESOLVED incidents can be closed (current status is %)', v_incident.status USING ERRCODE = '22023';
  END IF;

  -- 3. Update incident status to CLOSED
  UPDATE public.incidents
  SET
    status = 'CLOSED'::public.incident_status,
    updated_at = v_now
  WHERE id = p_incident_id;

  -- 4. Complete any remaining active assignments if present
  UPDATE public.assignments
  SET
    status = 'COMPLETED'::public.assignment_status,
    updated_at = v_now
  WHERE incident_id = p_incident_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status);

  -- 5. Record final closure audit event
  v_notes := COALESCE(btrim(p_notes), 'Incident officially closed by control room operator');
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
    'RESOLVED'::public.incident_status,
    'CLOSED'::public.incident_status,
    v_notes,
    v_now
  );

  RETURN jsonb_build_object(
    'incident_id', v_incident.id,
    'incident_status', 'CLOSED',
    'closed_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.responder_update_incident TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_close_incident TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.responder_update_incident FROM anon;
REVOKE EXECUTE ON FUNCTION public.operator_close_incident FROM anon;

COMMIT;
