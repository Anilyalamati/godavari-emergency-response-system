BEGIN;

-- Stage 6: Response-team assignment
-- Schema extensions for team duty status, single-active concurrency constraints,
-- capability matching, and atomic operator team assignment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_duty_status') THEN
    CREATE TYPE public.team_duty_status AS ENUM ('ON_DUTY', 'OFF_DUTY', 'STANDBY');
  END IF;
END $$;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS duty_status public.team_duty_status NOT NULL DEFAULT 'ON_DUTY';

-- Enforce MVP single-allocation constraints:
-- 1. Exactly one active primary team per incident (no duplicate active assignments).
-- 2. Exactly one active incident per team (no double-booking a team across multiple incidents).
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_incident_uidx
  ON public.assignments (incident_id)
  WHERE status IN ('PENDING', 'ACKNOWLEDGED');

CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_team_uidx
  ON public.assignments (team_id)
  WHERE status IN ('PENDING', 'ACKNOWLEDGED');

-- Capability evaluation helper function
CREATE OR REPLACE FUNCTION public.is_team_capable_for_category(
  p_capabilities text[],
  p_category public.incident_category
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_capabilities IS NULL OR cardinality(p_capabilities) = 0 THEN false
    WHEN p_category = 'MEDICAL_ASSISTANCE'::public.incident_category THEN
      p_capabilities && ARRAY['first_aid', 'medical_response', 'medical', 'triage', 'welfare_check', 'paramedic', 'accessibility_support']
    WHEN p_category = 'CROWD_SAFETY'::public.incident_category THEN
      p_capabilities && ARRAY['crowd_observation', 'crowd_guidance', 'crowd_control', 'public_guidance', 'evacuation']
    WHEN p_category = 'LOST_PERSON'::public.incident_category THEN
      p_capabilities && ARRAY['wayfinding', 'public_guidance', 'welfare_check', 'search_and_rescue', 'reunification', 'lost_and_found']
    WHEN p_category = 'INFRASTRUCTURE'::public.incident_category THEN
      p_capabilities && ARRAY['hazard_containment', 'infrastructure_repair', 'safety_inspection', 'fire_safety']
    WHEN p_category = 'OTHER'::public.incident_category THEN true
    ELSE false
  END;
$$;

-- Atomic Operator Team Assignment Stored Procedure
CREATE OR REPLACE FUNCTION public.operator_assign_team(
  p_incident_id uuid,
  p_team_id uuid,
  p_actor_profile_id uuid,
  p_deadline_minutes integer DEFAULT 15
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

  -- Check duty status
  IF v_team.duty_status <> 'ON_DUTY'::public.team_duty_status THEN
    RAISE EXCEPTION 'Team % is currently % and cannot be assigned', v_team.team_code, v_team.duty_status USING ERRCODE = '22023';
  END IF;

  -- Check team availability (prevent double-booking)
  SELECT id INTO v_existing_team_assignment_id
  FROM public.assignments
  WHERE team_id = p_team_id
    AND status IN ('PENDING'::public.assignment_status, 'ACKNOWLEDGED'::public.assignment_status)
  LIMIT 1;

  IF v_existing_team_assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Team % is currently assigned to another active incident', v_team.team_code USING ERRCODE = '23505';
  END IF;

  -- Check capability suitability
  IF NOT public.is_team_capable_for_category(v_team.capabilities, v_incident.category) THEN
    RAISE EXCEPTION 'Team % lacks suitable capabilities for incident category %', v_team.team_code, v_incident.category USING ERRCODE = '22023';
  END IF;

  -- 4. Set acknowledgement deadline
  v_deadline_interval := (GREATEST(COALESCE(p_deadline_minutes, 15), 1) || ' minutes')::interval;
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

  -- 6. Update incident state
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
    'Assigned to ' || v_team.team_code || ' (' || v_team.name || ') with ' || EXTRACT(EPOCH FROM v_deadline_interval)/60 || 'm acknowledgement deadline',
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

  -- 8. Return created assignment payload
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

GRANT EXECUTE ON FUNCTION public.operator_assign_team TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.operator_assign_team FROM anon;

COMMIT;
