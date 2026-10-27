BEGIN;
SELECT no_plan();

INSERT INTO auth.users (id)
VALUES
  ('00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000502'),
  ('00000000-0000-4000-8000-000000000503'),
  ('00000000-0000-4000-8000-000000000504'),
  ('00000000-0000-4000-8000-000000000505');

INSERT INTO public.profiles (
  id,
  display_name,
  role,
  is_active,
  can_access_reporter_contacts
)
VALUES
  ('00000000-0000-4000-8000-000000000501', 'Synthetic operator fixture', 'OPERATOR', true, false),
  ('00000000-0000-4000-8000-000000000502', 'Synthetic responder one', 'RESPONDER', true, false),
  ('00000000-0000-4000-8000-000000000503', 'Synthetic responder two', 'RESPONDER', true, false),
  ('00000000-0000-4000-8000-000000000504', 'Synthetic administrator', 'ADMIN', true, false),
  ('00000000-0000-4000-8000-000000000505', 'Inactive synthetic account', 'OPERATOR', false, false);

INSERT INTO public.team_memberships (team_id, profile_id)
VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000502'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000503');

INSERT INTO public.assignments (
  id,
  incident_id,
  team_id,
  status,
  assigned_at,
  acknowledgement_deadline,
  acknowledged_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    'PENDING',
    '2026-10-26 12:00:00+00',
    '2026-10-26 12:15:00+00',
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    'ACKNOWLEDGED',
    '2026-10-26 12:00:00+00',
    '2026-10-26 12:15:00+00',
    '2026-10-26 12:01:00+00'
  );

INSERT INTO public.reporter_contacts (incident_id, contact_name, preferred_contact_method)
VALUES
  ('00000000-0000-4000-8000-000000000301', 'Synthetic contact fixture one', 'NONE'),
  ('00000000-0000-4000-8000-000000000302', 'Synthetic contact fixture two', 'NONE');

SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous clients have no profile SELECT grant'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.incidents', 'SELECT'),
  'anonymous clients have no incident SELECT grant'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.reporter_contacts', 'SELECT'),
  'anonymous clients have no contact SELECT grant'
);

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.profiles$$, '42501', NULL, 'anonymous clients cannot list staff profiles');
SELECT throws_ok($$SELECT * FROM public.incidents$$, '42501', NULL, 'anonymous clients cannot list incidents');
SELECT throws_ok($$SELECT * FROM public.reporter_contacts$$, '42501', NULL, 'anonymous clients cannot list reporter contacts');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
SELECT is(
  (SELECT count(*)::integer FROM public.incidents),
  3,
  'operators can read operational incidents'
);
SELECT is(
  (SELECT count(*)::integer FROM public.configuration),
  0,
  'operators cannot read administrator configuration'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'ADMIN' WHERE id = auth.uid()$$,
  '42501', NULL,
  'operators cannot promote themselves through direct SQL'
);
SELECT throws_ok(
  $$DELETE FROM public.team_memberships WHERE profile_id = auth.uid()$$,
  '42501', NULL,
  'staff cannot alter their own team membership through direct SQL'
);
SELECT throws_ok(
  $$SELECT public.admin_update_staff_profile(auth.uid(), NULL::text, 'ADMIN'::public.staff_role, NULL::boolean, NULL::boolean)$$,
  '42501', NULL,
  'non-administrators cannot manage staff profiles'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
SELECT results_eq(
  $$SELECT id::text FROM public.incidents ORDER BY id$$,
  ARRAY['00000000-0000-4000-8000-000000000301']::text[],
  'responders see incidents assigned to their own active team only'
);
SELECT is(
  (SELECT count(*)::integer FROM public.team_memberships),
  1,
  'responders see their own team membership only'
);
SELECT is(
  (SELECT count(*)::integer FROM public.reporter_contacts),
  0,
  'responder role alone does not grant reporter-contact access'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'ADMIN' WHERE id = auth.uid()$$,
  '42501', NULL,
  'responders cannot promote themselves through direct SQL'
);
RESET ROLE;

UPDATE public.profiles
SET can_access_reporter_contacts = true
WHERE id = '00000000-0000-4000-8000-000000000502';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
SELECT results_eq(
  $$SELECT incident_id::text FROM public.reporter_contacts ORDER BY incident_id$$,
  ARRAY['00000000-0000-4000-8000-000000000301']::text[],
  'explicit contact permission remains limited to incidents assigned to the responder team'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000503', true);
SELECT results_eq(
  $$SELECT id::text FROM public.incidents ORDER BY id$$,
  ARRAY['00000000-0000-4000-8000-000000000302']::text[],
  'a second responder sees only the other team’s assigned incident'
);
RESET ROLE;

UPDATE public.profiles
SET can_access_reporter_contacts = true
WHERE id = '00000000-0000-4000-8000-000000000501';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
SELECT results_eq(
  $$SELECT incident_id::text FROM public.reporter_contacts ORDER BY incident_id$$,
  ARRAY[
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  ]::text[],
  'an operator requires explicit permission before reading contacts'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000504', true);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles),
  5,
  'administrators can manage the staff directory'
);
SELECT is(
  (SELECT count(*)::integer FROM public.incidents),
  0,
  'administrator role alone does not grant incident access'
);
SELECT lives_ok(
  $$INSERT INTO public.configuration (configuration_key, value, description) VALUES ('stage3_test', '{"enabled": true}'::jsonb, 'Synthetic test value only')$$,
  'administrators can add configuration through RLS'
);
SELECT lives_ok(
  $$SELECT public.admin_update_staff_profile('00000000-0000-4000-8000-000000000501'::uuid, NULL::text, 'OPERATOR'::public.staff_role, NULL::boolean, NULL::boolean)$$,
  'administrators can manage another staff profile through the guarded RPC'
);
SELECT lives_ok(
  $$SELECT public.admin_replace_team_memberships('00000000-0000-4000-8000-000000000501'::uuid, ARRAY['00000000-0000-4000-8000-000000000202']::uuid[])$$,
  'administrators can replace another staff member’s team membership'
);
SELECT throws_ok(
  $$SELECT public.admin_update_staff_profile(auth.uid(), NULL::text, 'OPERATOR'::public.staff_role, NULL::boolean, NULL::boolean)$$,
  '42501', NULL,
  'administrators cannot change their own role or profile'
);
SELECT throws_ok(
  $$SELECT public.admin_replace_team_memberships(auth.uid(), ARRAY['00000000-0000-4000-8000-000000000201']::uuid[])$$,
  '42501', NULL,
  'administrators cannot change their own team membership'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000505', true);
SELECT is(
  (SELECT count(*)::integer FROM public.incidents),
  0,
  'inactive profiles cannot access incidents'
);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles),
  0,
  'inactive profiles cannot read their staff profile'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
