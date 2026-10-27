BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN can_access_reporter_contacts boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_active IS
  'Server-controlled staff access switch. Inactive profiles cannot access any staff policy or API.';
COMMENT ON COLUMN public.profiles.can_access_reporter_contacts IS
  'Explicit per-user operational permission. False by default; does not bypass incident/team scope.';

CREATE FUNCTION public.current_staff_role()
RETURNS public.staff_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active
$function$;

CREATE FUNCTION public.current_staff_has_reporter_contact_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (
      SELECT p.can_access_reporter_contacts
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_active
    ),
    false
  )
$function$;

CREATE FUNCTION public.can_access_incident(p_incident_id uuid)
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
         'ACKNOWLEDGED'::public.assignment_status
       )
      WHERE p.id = auth.uid()
        AND p.is_active
        AND p.role = 'RESPONDER'::public.staff_role
    )
$function$;

CREATE FUNCTION public.can_access_reporter_contact(p_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.current_staff_has_reporter_contact_permission()
     AND public.can_access_incident(p_incident_id)
$function$;

CREATE FUNCTION public.admin_update_staff_profile(
  p_profile_id uuid,
  p_display_name text DEFAULT NULL,
  p_role public.staff_role DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_can_access_reporter_contacts boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() = p_profile_id
     OR public.current_staff_role() IS DISTINCT FROM 'ADMIN'::public.staff_role THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff_profile_update_not_allowed';
  END IF;

  IF p_display_name IS NULL
     AND p_role IS NULL
     AND p_is_active IS NULL
     AND p_can_access_reporter_contacts IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'no_staff_profile_changes';
  END IF;

  UPDATE public.profiles AS p
  SET display_name = COALESCE(p_display_name, p.display_name),
      role = COALESCE(p_role, p.role),
      is_active = COALESCE(p_is_active, p.is_active),
      can_access_reporter_contacts = COALESCE(
        p_can_access_reporter_contacts,
        p.can_access_reporter_contacts
      ),
      updated_at = now()
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'staff_profile_not_found';
  END IF;
END
$function$;

CREATE FUNCTION public.admin_replace_team_memberships(
  p_profile_id uuid,
  p_team_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() = p_profile_id
     OR public.current_staff_role() IS DISTINCT FROM 'ADMIN'::public.staff_role THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'team_membership_update_not_allowed';
  END IF;

  IF p_team_ids IS NULL OR array_position(p_team_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'team_ids_must_be_a_non_null_array';
  END IF;

  IF EXISTS (
    SELECT requested.team_id
    FROM unnest(p_team_ids) AS requested(team_id)
    GROUP BY requested.team_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'team_ids_must_be_unique';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'staff_profile_not_found';
  END IF;

  DELETE FROM public.team_memberships AS tm
  WHERE tm.profile_id = p_profile_id;

  INSERT INTO public.team_memberships (team_id, profile_id, membership_role, active)
  SELECT requested.team_id,
         p_profile_id,
         'MEMBER'::public.team_membership_role,
         true
  FROM unnest(p_team_ids) AS requested(team_id);

  RETURN cardinality(p_team_ids);
END
$function$;

REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_staff_has_reporter_contact_permission() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_incident(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_reporter_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_staff_profile(uuid, text, public.staff_role, boolean, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_replace_team_memberships(uuid, uuid[])
  FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE ON TYPE public.staff_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_has_reporter_contact_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_incident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_reporter_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_staff_profile(uuid, text, public.staff_role, boolean, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_team_memberships(uuid, uuid[])
  TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.zones,
  public.teams,
  public.team_zone_coverage,
  public.team_memberships,
  public.incidents,
  public.reporter_contacts,
  public.assignments,
  public.incident_events,
  public.configuration
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.profiles,
  public.zones,
  public.teams,
  public.team_zone_coverage,
  public.team_memberships,
  public.incidents,
  public.reporter_contacts,
  public.assignments,
  public.incident_events,
  public.configuration
TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.configuration TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.zones,
  public.teams,
  public.team_zone_coverage,
  public.team_memberships,
  public.incidents,
  public.reporter_contacts,
  public.assignments,
  public.incident_events,
  public.configuration
TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_zone_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporter_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND is_active);
CREATE POLICY profiles_select_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (public.current_staff_role() = 'ADMIN'::public.staff_role);

CREATE POLICY zones_select_active_staff
  ON public.zones FOR SELECT TO authenticated
  USING (public.current_staff_role() IS NOT NULL);
CREATE POLICY teams_select_active_staff
  ON public.teams FOR SELECT TO authenticated
  USING (public.current_staff_role() IS NOT NULL);
CREATE POLICY team_zone_coverage_select_active_staff
  ON public.team_zone_coverage FOR SELECT TO authenticated
  USING (public.current_staff_role() IS NOT NULL);
CREATE POLICY team_memberships_select_self_or_admin
  ON public.team_memberships FOR SELECT TO authenticated
  USING (
    public.current_staff_role() IS NOT NULL
    AND (
      profile_id = (SELECT auth.uid())
      OR public.current_staff_role() = 'ADMIN'::public.staff_role
    )
  );

CREATE POLICY incidents_select_operational_scope
  ON public.incidents FOR SELECT TO authenticated
  USING (public.can_access_incident(id));
CREATE POLICY assignments_select_operational_scope
  ON public.assignments FOR SELECT TO authenticated
  USING (public.can_access_incident(incident_id));
CREATE POLICY incident_events_select_operational_scope
  ON public.incident_events FOR SELECT TO authenticated
  USING (public.can_access_incident(incident_id));
CREATE POLICY reporter_contacts_select_explicit_permission
  ON public.reporter_contacts FOR SELECT TO authenticated
  USING (public.can_access_reporter_contact(incident_id));

CREATE POLICY configuration_select_admin
  ON public.configuration FOR SELECT TO authenticated
  USING (public.current_staff_role() = 'ADMIN'::public.staff_role);
CREATE POLICY configuration_insert_admin
  ON public.configuration FOR INSERT TO authenticated
  WITH CHECK (public.current_staff_role() = 'ADMIN'::public.staff_role);
CREATE POLICY configuration_update_admin
  ON public.configuration FOR UPDATE TO authenticated
  USING (public.current_staff_role() = 'ADMIN'::public.staff_role)
  WITH CHECK (public.current_staff_role() = 'ADMIN'::public.staff_role);
CREATE POLICY configuration_delete_admin
  ON public.configuration FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'ADMIN'::public.staff_role);

COMMENT ON FUNCTION public.current_staff_role() IS
  'Returns the active role from server-controlled profiles for auth.uid(); never reads JWT user metadata.';
COMMENT ON FUNCTION public.can_access_incident(uuid) IS
  'Operators can read incidents; responders require an active team membership and a pending/acknowledged team assignment. Administrators are not operationally privileged by default.';
COMMENT ON FUNCTION public.can_access_reporter_contact(uuid) IS
  'Requires the explicit profile permission and the same operator/responder incident scope.';
COMMENT ON FUNCTION public.admin_update_staff_profile(uuid, text, public.staff_role, boolean, boolean) IS
  'Administrator-only profile management RPC. Direct client writes are revoked and a user cannot target their own profile.';
COMMENT ON FUNCTION public.admin_replace_team_memberships(uuid, uuid[]) IS
  'Administrator-only atomic team membership replacement. Direct client writes are revoked and a user cannot target their own memberships.';

COMMIT;
