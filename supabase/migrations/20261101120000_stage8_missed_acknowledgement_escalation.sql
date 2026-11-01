BEGIN;

-- Stage 8: Missed-acknowledgement escalation & safe reassignment
-- 1. Extend assignment_status enum to include 'SUPERSEDED'
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- 2. Extend incident_event_type enum to include 'ACKNOWLEDGEMENT_OVERDUE' and 'ASSIGNMENT_SUPERSEDED'
ALTER TYPE public.incident_event_type ADD VALUE IF NOT EXISTS 'ACKNOWLEDGEMENT_OVERDUE';
ALTER TYPE public.incident_event_type ADD VALUE IF NOT EXISTS 'ASSIGNMENT_SUPERSEDED';

-- 3. Add escalation tracking columns to public.assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassignment_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_reassignment_reason_length'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_reassignment_reason_length
      CHECK (reassignment_reason IS NULL OR char_length(btrim(reassignment_reason)) <= 1000);
  END IF;
END $$;

-- 4. Update can_access_incident to ensure SUPERSEDED assignments do NOT grant responders update access,
-- but historical access is preserved if needed. Active updates require PENDING or ACKNOWLEDGED.
-- (This is already enforced in responder_update_incident which checks status IN ('PENDING', 'ACKNOWLEDGED')).

-- 5. Stored Procedure: public.scan_and_escalate_overdue_assignments()
-- Designed for background worker execution.
-- Finds active assignments (status = 'PENDING') where now() > acknowledgement_deadline and escalated_at IS NULL.
-- Creates one ACKNOWLEDGEMENT_OVERDUE audit event per overdue assignment.
-- Marks escalated_at = now() atomically.
-- Returns count and list of escalated assignments.
CREATE OR REPLACE FUNCTION public.scan_and_escalate_overdue_assignments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_now timestamptz := now();
  v_count integer := 0;
  v_escalated jsonb := '[]'::jsonb;
BEGIN
  FOR v_rec IN
    SELECT
      a.id AS assignment_id,
      a.incident_id,
      a.team_id,
      a.acknowledgement_deadline,
      t.team_code,
      t.name AS team_name,
      i.category,
      i.priority
    FROM public.assignments a
    JOIN public.teams t ON t.id = a.team_id
    JOIN public.incidents i ON i.id = a.incident_id
    WHERE a.status = 'PENDING'::public.assignment_status
      AND a.acknowledgement_deadline < v_now
      AND a.escalated_at IS NULL
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- Mark escalated
    UPDATE public.assignments
    SET
      escalated_at = v_now,
      updated_at = v_now
    WHERE id = v_rec.assignment_id;

    -- Append exactly one ACKNOWLEDGEMENT_OVERDUE audit event
    INSERT INTO public.incident_events (
      incident_id,
      actor_profile_id,
      event_type,
      status_before,
      status_after,
      notes,
      occurred_at
    ) VALUES (
      v_rec.incident_id,
      NULL,
      'ACKNOWLEDGEMENT_OVERDUE'::public.incident_event_type,
      NULL,
      NULL,
      'Dispatch acknowledgement deadline missed by ' || v_rec.team_code || ' (' || v_rec.team_name || '). Escalated for control-room operator reassignment.',
      v_now
    );

    v_count := v_count + 1;
    v_escalated := v_escalated || jsonb_build_object(
      'assignment_id', v_rec.assignment_id,
      'incident_id', v_rec.incident_id,
      'team_id', v_rec.team_id,
      'team_code', v_rec.team_code,
      'team_name', v_rec.team_name,
      'deadline', v_rec.acknowledgement_deadline,
      'escalated_at', v_now
    );
  END LOOP;

  RETURN jsonb_build_object(
    'escalated_count', v_count,
    'escalated', v_escalated
  );
END;
$$;

-- 6. Stored Procedure: public.operator_reassign_team(...)
-- Operator-controlled reassignment workflow for overdue or reassigned incidents.
-- Parameters:
--   p_incident_id uuid
--   p_new_team_id uuid
--   p_actor_profile_id uuid
--   p_reason text (mandatory reason for reassignment)
--   p_deadline_seconds integer DEFAULT 900 (allows 60s for demo, 900s standard)
-- Atomically:
--   a. Verifies operator role.
--   b. Locks incident and current active assignment (FOR UPDATE).
--   c. Validates that current assignment is in PENDING or ACKNOWLEDGED status.
--      If previous team is already responding (EN_ROUTE / ON_SCENE), incident status is not ASSIGNED or ACKNOWLEDGED.
--   d. Supersedes old assignment (status = 'SUPERSEDED', superseded_at = now(), reassignment_reason = p_reason).
--   e. Documented Team Release Rule:
--      Releases the old team (duty_status remains ON_DUTY, clearing active lock).
--   f. Confirms new team capability and availability.
--   g. Inserts new assignment record with specified deadline.
--   h. Links old assignment to new assignment (superseded_by_assignment_id).
--   i. Appends ASSIGNMENT_SUPERSEDED and ASSIGNMENT_CREATED audit records.
--   j. Commits atomically.
CREATE OR REPLACE FUNCTION public.operator_reassign_team(
  p_incident_id uuid,
  p_new_team_id uuid,
  p_actor_profile_id uuid,
  p_reason text,
  p_deadline_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor RECORD;
  v_incident RECORD;
  v_current_assignment RECORD;
  v_new_team RECORD;
  v_existing_team_assignment_id uuid;
  v_new_assignment_id uuid;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_deadline_interval interval;
  v_reason text;
  v_prev_team_code text;
  v_prev_team_name text;
BEGIN
  -- 1. Check caller authorization: actor must be active staff with OPERATOR role
  SELECT id, role, is_active INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_profile_id;

  IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'OPERATOR'::public.staff_role THEN
    RAISE EXCEPTION 'Operator role is required to reassign teams' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Actor mismatch with authenticated user' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate mandatory reassignment reason
  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) = 0 THEN
    RAISE EXCEPTION 'A valid reassignment reason is required' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock incident record
  SELECT id, category, status, priority, zone_id INTO v_incident
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_incident.status IN (
    'CANCELLED'::public.incident_status,
    'CLOSED'::public.incident_status,
    'RESOLVED'::public.incident_status,
    'DUPLICATE'::public.incident_status
  ) THEN
    RAISE EXCEPTION 'Cannot reassign incident in terminal status %', v_incident.status USING ERRCODE = '22023';
  END IF;

  -- 4. Lock current active assignment
  SELECT a.id, a.team_id, a.status, a.acknowledgement_deadline, t.team_code, t.name AS team_name
  INTO v_current_assignment
  FROM public.assignments a
  JOIN public.teams t ON t.id = a.team_id
  WHERE a.incident_id = p_incident_id
    AND a.status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active assignment found on incident to reassign' USING ERRCODE = '22023';
  END IF;

  v_prev_team_code := v_current_assignment.team_code;
  v_prev_team_name := v_current_assignment.team_name;

  -- Prevent reassigning to the same team
  IF v_current_assignment.team_id = p_new_team_id THEN
    RAISE EXCEPTION 'New team must be different from currently assigned team (%)', v_prev_team_code USING ERRCODE = '22023';
  END IF;

  -- 5. Lock and verify new team
  SELECT id, team_code, name, capabilities, duty_status, is_demo INTO v_new_team
  FROM public.teams
  WHERE id = p_new_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New team not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_new_team.duty_status <> 'ON_DUTY'::public.team_duty_status THEN
    RAISE EXCEPTION 'Team % is currently % and cannot be assigned', v_new_team.team_code, v_new_team.duty_status USING ERRCODE = '22023';
  END IF;

  -- Double-booking check for new team
  SELECT id INTO v_existing_team_assignment_id
  FROM public.assignments
  WHERE team_id = p_new_team_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  LIMIT 1;

  IF v_existing_team_assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Team % is currently assigned to another active incident', v_new_team.team_code USING ERRCODE = '23505';
  END IF;

  -- Capability check for new team
  IF NOT public.is_team_capable_for_category(v_new_team.capabilities, v_incident.category) THEN
    RAISE EXCEPTION 'Team % lacks suitable capabilities for incident category %', v_new_team.team_code, v_incident.category USING ERRCODE = '22023';
  END IF;

  -- 6. Supersede the old assignment
  -- Status = 'SUPERSEDED' removes it from the active partial index filter ('PENDING', 'ACKNOWLEDGED')
  UPDATE public.assignments
  SET
    status = 'SUPERSEDED'::public.assignment_status,
    superseded_at = v_now,
    reassignment_reason = v_reason,
    updated_at = v_now
  WHERE id = v_current_assignment.id;

  -- Documented Team Release Rule:
  -- The previous team is released. Their duty_status remains ON_DUTY so they are available
  -- for future assignments, while their assignment record is preserved as SUPERSEDED.
  UPDATE public.teams
  SET duty_status = 'ON_DUTY'::public.team_duty_status
  WHERE id = v_current_assignment.team_id;

  -- 7. Compute deadline for new assignment (supports seconds for 60s demo or minutes standard)
  v_deadline_interval := (GREATEST(COALESCE(p_deadline_seconds, 900), 10) || ' seconds')::interval;
  v_deadline := v_now + v_deadline_interval;

  -- 8. Create new assignment record
  v_new_assignment_id := gen_random_uuid();
  INSERT INTO public.assignments (
    id,
    incident_id,
    team_id,
    assigned_by_profile_id,
    status,
    assigned_at,
    acknowledgement_deadline,
    created_at,
    updated_at
  ) VALUES (
    v_new_assignment_id,
    p_incident_id,
    p_new_team_id,
    p_actor_profile_id,
    'PENDING'::public.assignment_status,
    v_now,
    v_deadline,
    v_now,
    v_now
  );

  -- Link old assignment to new assignment
  UPDATE public.assignments
  SET superseded_by_assignment_id = v_new_assignment_id
  WHERE id = v_current_assignment.id;

  -- 9. Update incident status back to ASSIGNED if needed
  UPDATE public.incidents
  SET
    status = 'ASSIGNED'::public.incident_status,
    updated_at = v_now
  WHERE id = p_incident_id;

  -- 10. Append audit events
  -- a. ASSIGNMENT_SUPERSEDED event
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
    'ASSIGNMENT_SUPERSEDED'::public.incident_event_type,
    NULL,
    NULL,
    'Assignment of ' || v_prev_team_code || ' (' || v_prev_team_name || ') superseded. Reason: ' || v_reason,
    v_now
  );

  -- b. ASSIGNMENT_CREATED event for new team
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
    'Reassigned to ' || v_new_team.team_code || ' (' || v_new_team.name || ') with ' || EXTRACT(EPOCH FROM v_deadline_interval) || 's acknowledgement deadline',
    v_now
  );

  -- c. STATUS_CHANGED event if prior incident status was ACKNOWLEDGED/etc.
  IF v_incident.status <> 'ASSIGNED'::public.incident_status THEN
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
      'ASSIGNED'::public.incident_status,
      'Incident reset to ASSIGNED following team reassignment',
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'incident_id', p_incident_id,
    'superseded_assignment_id', v_current_assignment.id,
    'superseded_team_code', v_prev_team_code,
    'new_assignment_id', v_new_assignment_id,
    'new_team_id', p_new_team_id,
    'new_team_code', v_new_team.team_code,
    'new_team_name', v_new_team.name,
    'status', 'PENDING',
    'assigned_at', v_now,
    'acknowledgement_deadline', v_deadline,
    'incident_status', 'ASSIGNED',
    'reassignment_reason', v_reason
  );
END;
$$;

-- 7. Update operator_assign_team to optionally accept p_deadline_seconds for prototype demo settings
DROP FUNCTION IF EXISTS public.operator_assign_team(uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.operator_assign_team(
  p_incident_id uuid,
  p_team_id uuid,
  p_actor_profile_id uuid,
  p_deadline_minutes integer DEFAULT 15,
  p_deadline_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role public.staff_role;
  v_actor_active boolean;
  v_incident RECORD;
  v_team RECORD;
  v_existing_incident_assignment_id uuid;
  v_existing_team_assignment_id uuid;
  v_assignment_id uuid;
  v_assigned_at timestamptz := now();
  v_deadline timestamptz;
  v_prev_status public.incident_status;
  v_deadline_interval interval;
BEGIN
  -- 1. Check caller authorization: actor must be active staff with OPERATOR role
  SELECT role, is_active INTO v_actor_role, v_actor_active
  FROM public.profiles
  WHERE id = p_actor_profile_id;

  IF v_actor_role IS NULL OR NOT v_actor_active OR v_actor_role <> 'OPERATOR'::public.staff_role THEN
    RAISE EXCEPTION 'Operator role is required to assign teams to incidents' USING ERRCODE = '42501';
  END IF;

  -- Verify session match if auth.uid() is set
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Actor mismatch with authenticated user' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock & check incident record
  SELECT id, category, status, priority, zone_id INTO v_incident
  FROM public.incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;

  -- Reject terminal incident states
  IF v_incident.status IN (
    'CANCELLED'::public.incident_status,
    'CLOSED'::public.incident_status,
    'RESOLVED'::public.incident_status,
    'DUPLICATE'::public.incident_status
  ) THEN
    RAISE EXCEPTION 'Incident is in terminal status (%) and cannot be assigned', v_incident.status USING ERRCODE = '22023';
  END IF;

  -- Check if incident already has an active assignment (prevent duplicate active assignment)
  SELECT id INTO v_existing_incident_assignment_id
  FROM public.assignments
  WHERE incident_id = p_incident_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  LIMIT 1;

  IF v_existing_incident_assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Incident already has an active team assignment' USING ERRCODE = '23505';
  END IF;

  -- 3. Lock & check team record
  SELECT id, team_code, name, capabilities, duty_status, is_demo INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found' USING ERRCODE = 'P0002';
  END IF;

  -- Prevent assigning team with existing active assignment (prevent double-booking)
  SELECT id INTO v_existing_team_assignment_id
  FROM public.assignments
  WHERE team_id = p_team_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  LIMIT 1;

  IF v_existing_team_assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Team % is currently assigned to another active incident', v_team.team_code USING ERRCODE = '23505';
  END IF;

  -- Verify team duty status
  IF v_team.duty_status <> 'ON_DUTY'::public.team_duty_status THEN
    RAISE EXCEPTION 'Team % is not currently ON_DUTY (status: %)', v_team.team_code, v_team.duty_status USING ERRCODE = '22023';
  END IF;

  -- Verify team capability matches incident category
  IF NOT public.is_team_capable_for_category(v_team.capabilities, v_incident.category) THEN
    RAISE EXCEPTION 'Team % lacks suitable capabilities for incident category %', v_team.team_code, v_incident.category USING ERRCODE = '22023';
  END IF;

  -- 4. Set acknowledgement deadline (supports seconds for prototype demo or minutes standard)
  IF p_deadline_seconds IS NOT NULL THEN
    v_deadline_interval := (GREATEST(p_deadline_seconds, 10) || ' seconds')::interval;
  ELSE
    v_deadline_interval := (GREATEST(COALESCE(p_deadline_minutes, 15), 1) || ' minutes')::interval;
  END IF;
  v_deadline := v_assigned_at + v_deadline_interval;

  -- 5. Create assignment record
  v_assignment_id := gen_random_uuid();
  INSERT INTO public.assignments (
    id,
    incident_id,
    team_id,
    assigned_by_profile_id,
    status,
    assigned_at,
    acknowledgement_deadline,
    created_at,
    updated_at
  ) VALUES (
    v_assignment_id,
    p_incident_id,
    p_team_id,
    p_actor_profile_id,
    'PENDING'::public.assignment_status,
    v_assigned_at,
    v_deadline,
    v_assigned_at,
    v_assigned_at
  );

  -- 6. Transition incident status to ASSIGNED
  v_prev_status := v_incident.status;
  UPDATE public.incidents
  SET
    status = 'ASSIGNED'::public.incident_status,
    updated_at = v_assigned_at
  WHERE id = p_incident_id;

  -- 7. Append audit events
  -- a. ASSIGNMENT_CREATED event
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
    'Assigned primary team ' || v_team.team_code || ' (' || v_team.name || ') with ' || EXTRACT(EPOCH FROM v_deadline_interval) || 's acknowledgement deadline',
    v_assigned_at
  );

  -- b. STATUS_CHANGED event if transitioning to ASSIGNED
  IF v_prev_status <> 'ASSIGNED'::public.incident_status THEN
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
      v_prev_status,
      'ASSIGNED'::public.incident_status,
      'Status transitioned to ASSIGNED following response team dispatch',
      v_assigned_at
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id', v_assignment_id,
    'incident_id', p_incident_id,
    'team_id', p_team_id,
    'team_code', v_team.team_code,
    'team_name', v_team.name,
    'status', 'PENDING',
    'assigned_at', v_assigned_at,
    'acknowledgement_deadline', v_deadline,
    'incident_status', 'ASSIGNED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.operator_assign_team(uuid, uuid, uuid, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.operator_assign_team(uuid, uuid, uuid, integer, integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.scan_and_escalate_overdue_assignments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_reassign_team(uuid, uuid, uuid, text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.scan_and_escalate_overdue_assignments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.operator_reassign_team(uuid, uuid, uuid, text, integer) FROM anon;

COMMIT;
