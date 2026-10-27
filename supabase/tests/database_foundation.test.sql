BEGIN;
SELECT no_plan();

SELECT ok(
  (
    SELECT count(*) = 10
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname = ANY (
        ARRAY[
          'profiles',
          'zones',
          'teams',
          'team_zone_coverage',
          'team_memberships',
          'incidents',
          'reporter_contacts',
          'assignments',
          'incident_events',
          'configuration'
        ]
      )
  ),
  'RLS is enabled on all ten application tables'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.incidents', 'SELECT'),
  'anon has no SELECT grant on incidents'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.reporter_contacts', 'SELECT'),
  'anon has no SELECT grant on reporter contacts'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.incidents', 'SELECT'),
  'authenticated has no direct SELECT grant on incidents in Stage 2'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.reporter_contacts', 'SELECT'),
  'authenticated has no direct SELECT grant on reporter contacts in Stage 2'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (
        ARRAY[
          'profiles',
          'zones',
          'teams',
          'team_zone_coverage',
          'team_memberships',
          'incidents',
          'reporter_contacts',
          'assignments',
          'incident_events',
          'configuration'
        ]
      )
  ),
  0,
  'Stage 2 intentionally defines no direct client policies'
);

SELECT is(
  ARRAY(
    SELECT e.enumlabel::text
    FROM pg_enum AS e
    JOIN pg_type AS t ON t.oid = e.enumtypid
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'incident_status'
    ORDER BY e.enumsortorder
  ),
  ARRAY[
    'REPORTED',
    'UNDER_REVIEW',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'EN_ROUTE',
    'ON_SCENE',
    'RESOLVED',
    'CLOSED',
    'DUPLICATE',
    'CANCELLED'
  ]::text[],
  'incident states match the requested initial set'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN (
        'tracking_token',
        'public_tracking_token',
        'raw_tracking_token',
        'idempotency_key',
        'raw_idempotency_key'
      )
  ),
  'no raw public tracking or idempotency token column exists'
);

SELECT is(
  (SELECT count(*)::integer FROM public.zones WHERE is_demo),
  5,
  'five clearly labelled fictional demonstration zones are seeded'
);
SELECT is(
  (SELECT count(*)::integer FROM public.teams WHERE is_demo),
  3,
  'three fictional demonstration teams are seeded'
);
SELECT is(
  (SELECT count(*)::integer FROM public.incidents WHERE is_demo),
  3,
  'three synthetic demonstration incidents are seeded'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.zones
    WHERE is_demo
      AND (
        fictional_location_label IS NULL
        OR fictional_location_label NOT ILIKE 'FICTIONAL%'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.incidents
    WHERE is_demo
      AND (
        NOT location_is_fictional
        OR latitude IS NOT NULL
        OR longitude IS NOT NULL
        OR landmark NOT ILIKE 'FICTIONAL%'
      )
  ),
  'all seeded demo locations are labelled fictional and have no coordinates'
);
SELECT is((SELECT count(*)::integer FROM public.profiles), 0, 'no staff profiles are fabricated');
SELECT is((SELECT count(*)::integer FROM public.team_memberships), 0, 'no staff memberships are fabricated');
SELECT is((SELECT count(*)::integer FROM public.reporter_contacts), 0, 'no reporter contact details are fabricated');
SELECT is((SELECT count(*)::integer FROM public.assignments), 0, 'no staffed assignments are fabricated');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.incidents$$,
  '42501',
  NULL,
  'anonymous clients cannot list incidents'
);
SELECT throws_ok(
  $$SELECT * FROM public.reporter_contacts$$,
  '42501',
  NULL,
  'anonymous clients cannot list reporter contacts'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.incidents$$,
  '42501',
  NULL,
  'authenticated clients have no direct incident listing in Stage 2'
);
SELECT throws_ok(
  $$SELECT * FROM public.reporter_contacts$$,
  '42501',
  NULL,
  'authenticated clients have no direct reporter-contact listing in Stage 2'
);
RESET ROLE;

SELECT throws_ok(
  $$
    INSERT INTO public.incidents (id, category, priority, status, summary)
    VALUES (
      '00000000-0000-4000-8000-000000009901',
      'OTHER',
      'NORMAL',
      'NOT_A_VALID_STATE',
      'Synthetic negative test only'
    )
  $$,
  '22P02',
  NULL,
  'invalid incident state is rejected'
);

SELECT throws_ok(
  $$
    INSERT INTO public.incidents (
      id,
      category,
      priority,
      status,
      summary,
      zone_id
    )
    VALUES (
      '00000000-0000-4000-8000-000000009902',
      'OTHER',
      'NORMAL',
      'REPORTED',
      'Synthetic foreign-key negative test only',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    )
  $$,
  '23503',
  NULL,
  'an incident cannot reference a nonexistent zone'
);

SELECT throws_ok(
  $$
    INSERT INTO public.team_zone_coverage (team_id, zone_id)
    VALUES (
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )
  $$,
  '23503',
  NULL,
  'team service-zone coverage rejects invalid foreign keys'
);

SELECT throws_ok(
  $$
    INSERT INTO public.reporter_contacts (incident_id, preferred_contact_method)
    VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'NONE')
  $$,
  '23503',
  NULL,
  'reporter contacts reject nonexistent incident foreign keys'
);

SELECT * FROM finish();
ROLLBACK;
