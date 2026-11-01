-- ============================================================================
-- Migration: 20261101150000_stage11_security_hardening.sql
-- Stage 11: Usability and security hardening
-- - Audit function execution permissions (revoke all from public/anon)
-- - Configurable data retention and cleanup design
-- - Hardened service role access
-- ============================================================================

-- 1. Insert default data retention policy configuration
INSERT INTO public.configuration (configuration_key, value, description)
VALUES (
  'data_retention_policy',
  '{"closedIncidentRetentionDays": 30, "auditRetentionDays": 90, "autoPurgeEnabled": false}'::jsonb,
  'Configurable retention policy for terminal incidents and operational audit trails'
)
ON CONFLICT (configuration_key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- 2. Configurable retention / cleanup function
CREATE OR REPLACE FUNCTION public.purge_expired_data(p_retention_days integer DEFAULT 30)
RETURNS TABLE (
  purged_incidents integer,
  purged_assignments integer,
  purged_events integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff_time timestamptz;
  v_incidents_count integer := 0;
  v_assignments_count integer := 0;
  v_events_count integer := 0;
  v_target_incident_ids uuid[];
BEGIN
  IF p_retention_days < 1 THEN
    RAISE EXCEPTION 'Retention days must be at least 1 day'
      USING ERRCODE = '22023';
  END IF;

  v_cutoff_time := now() - (p_retention_days || ' days')::interval;

  -- Select closed or cancelled incidents older than cutoff
  SELECT array_agg(id)
  INTO v_target_incident_ids
  FROM public.incidents
  WHERE status IN ('CLOSED', 'CANCELLED')
    AND updated_at < v_cutoff_time;

  IF v_target_incident_ids IS NOT NULL AND array_length(v_target_incident_ids, 1) > 0 THEN
    -- Count affected rows
    SELECT count(*) INTO v_events_count
    FROM public.incident_events
    WHERE incident_id = ANY(v_target_incident_ids);

    SELECT count(*) INTO v_assignments_count
    FROM public.assignments
    WHERE incident_id = ANY(v_target_incident_ids);

    v_incidents_count := array_length(v_target_incident_ids, 1);

    -- Delete in foreign-key dependency order
    DELETE FROM public.incident_events
    WHERE incident_id = ANY(v_target_incident_ids);

    DELETE FROM public.assignments
    WHERE incident_id = ANY(v_target_incident_ids);

    DELETE FROM public.reporter_contacts
    WHERE incident_id = ANY(v_target_incident_ids);

    DELETE FROM public.incidents
    WHERE id = ANY(v_target_incident_ids);
  END IF;

  RETURN QUERY SELECT v_incidents_count, v_assignments_count, v_events_count;
END;
$$;

-- 3. Comprehensive privilege audit: revoke public execution on privileged routines
REVOKE ALL ON FUNCTION public.purge_expired_data(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_data(integer) TO service_role;

REVOKE ALL ON FUNCTION public.scan_and_escalate_overdue_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_and_escalate_overdue_assignments() TO service_role;

REVOKE ALL ON FUNCTION public.operator_reassign_team(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_reassign_team(uuid, uuid, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_public_incident_tracking(bytea) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_incident_tracking(bytea) TO service_role;

REVOKE ALL ON FUNCTION public.operator_close_incident(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_close_incident(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.responder_update_incident(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.responder_update_incident(uuid, uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.operator_assign_team(uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_assign_team(uuid, uuid, uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.operator_review_incident(uuid, uuid, public.incident_status, public.incident_priority, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_review_incident(uuid, uuid, public.incident_status, public.incident_priority, text, uuid, text) TO service_role;
