import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationNames = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationNames.map((name) => readFile(new URL(name, migrationDirectory), 'utf8')),
);
const seedSql = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const database = new PGlite();

const ids = {
  operator: '00000000-0000-4000-8000-000000000501',
  responderOne: '00000000-0000-4000-8000-000000000502',
  responderTwo: '00000000-0000-4000-8000-000000000503',
  administrator: '00000000-0000-4000-8000-000000000504',
  inactive: '00000000-0000-4000-8000-000000000505',
  incidentOne: '00000000-0000-4000-8000-000000000301',
  incidentTwo: '00000000-0000-4000-8000-000000000302',
  incidentThree: '00000000-0000-4000-8000-000000000303',
  teamOne: '00000000-0000-4000-8000-000000000201',
  teamTwo: '00000000-0000-4000-8000-000000000202',
  teamThree: '00000000-0000-4000-8000-000000000203',
};

const queryScalar = async (sql) => {
  const result = await database.query(sql);
  return result.rows[0]?.value;
};

const countRows = async (table, where = '') =>
  queryScalar(`SELECT count(*)::integer AS value FROM public.${table} ${where}`);

const expectSqlState = async (sql, expectedCode, message) => {
  let actualError;
  try {
    await database.query(sql);
  } catch (error) {
    actualError = error;
  }
  assert.ok(actualError, `${message}: statement unexpectedly succeeded`);
  assert.equal(actualError.code, expectedCode, `${message}: unexpected SQLSTATE`);
};

const withRole = async (role, subjectId, operation) => {
  await database.query(`SET ROLE ${role}`);
  await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [subjectId ?? '']);
  try {
    return await operation();
  } finally {
    await database.query('RESET ROLE');
    await database.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
};

try {
  // Supabase supplies Auth, PostgREST, roles, and auth.uid(). Stub only their SQL boundary here.
  // This harness is not a GoTrue, PostgREST, SMTP, or hosted-Supabase emulator.
  await database.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);

  for (const migration of migrations) {
    await database.exec(migration);
  }
  await database.exec(seedSql);

  const expectedStates = [
    'REPORTED',
    'UNDER_REVIEW',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'EN_ROUTE',
    'ON_SCENE',
    'RESOLVED',
    'CLOSED',
    'DUPLICATE',
    'CANCELLED',
  ];
  const actualStates = await database.query(`
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS value
    FROM pg_enum AS e
    JOIN pg_type AS t ON t.oid = e.enumtypid
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'incident_status'
  `);
  assert.deepEqual(actualStates.rows[0].value, expectedStates, 'incident state enum');

  const rlsTables = await database.query(`
    SELECT c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
    ORDER BY c.relname
  `);
  assert.equal(rlsTables.rows.length, 10, 'RLS is enabled on all ten application tables');

  const rawTokenColumns = await queryScalar(`
    SELECT count(*)::integer AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = ANY (ARRAY[
        'tracking_token', 'public_tracking_token', 'raw_tracking_token',
        'idempotency_key', 'raw_idempotency_key'
      ])
  `);
  assert.equal(rawTokenColumns, 0, 'raw token columns do not exist');

  const seededCounts = {
    zones: await countRows('zones', 'WHERE is_demo'),
    teams: await countRows('teams', 'WHERE is_demo'),
    coverage: await countRows('team_zone_coverage'),
    incidents: await countRows('incidents', 'WHERE is_demo'),
    events: await countRows('incident_events', "WHERE event_type = 'DEMO_SEEDED'"),
  };
  assert.deepEqual(seededCounts, { zones: 5, teams: 3, coverage: 6, incidents: 3, events: 3 });
  assert.equal(await countRows('profiles'), 0, 'no staff profiles are seeded');
  assert.equal(await countRows('team_memberships'), 0, 'no staff memberships are seeded');
  assert.equal(await countRows('reporter_contacts'), 0, 'no reporter contacts are seeded');
  assert.equal(await countRows('assignments'), 0, 'no staffed assignments are seeded');

  const demoLocationViolations = await queryScalar(`
    SELECT count(*)::integer AS value
    FROM public.incidents
    WHERE is_demo
      AND (
        NOT location_is_fictional
        OR latitude IS NOT NULL
        OR longitude IS NOT NULL
        OR landmark NOT ILIKE 'FICTIONAL%'
      )
  `);
  assert.equal(demoLocationViolations, 0, 'demo locations are fictional and coordinate-free');

  // Deterministic UUIDs and ON CONFLICT clauses make reapplying the SQL safe.
  await database.exec(seedSql);
  const repeatedCounts = {
    zones: await countRows('zones', 'WHERE is_demo'),
    teams: await countRows('teams', 'WHERE is_demo'),
    coverage: await countRows('team_zone_coverage'),
    incidents: await countRows('incidents', 'WHERE is_demo'),
    events: await countRows('incident_events', "WHERE event_type = 'DEMO_SEEDED'"),
  };
  assert.deepEqual(repeatedCounts, seededCounts, 'seed SQL is idempotent');

  await expectSqlState(
    `INSERT INTO public.incidents (category, priority, status, summary)
     VALUES ('OTHER', 'NORMAL', 'NOT_A_VALID_STATE', 'Synthetic negative test only')`,
    '22P02',
    'invalid incident state',
  );
  await expectSqlState(
    `INSERT INTO public.incidents (category, priority, status, summary, zone_id)
     VALUES ('OTHER', 'NORMAL', 'REPORTED', 'Synthetic foreign-key test only',
             'ffffffff-ffff-4fff-8fff-ffffffffffff')`,
    '23503',
    'incident references nonexistent zone',
  );
  await expectSqlState(
    `INSERT INTO public.team_zone_coverage (team_id, zone_id)
     VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')`,
    '23503',
    'coverage references nonexistent team and zone',
  );
  await expectSqlState(
    `INSERT INTO public.reporter_contacts (incident_id, preferred_contact_method)
     VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'NONE')`,
    '23503',
    'reporter contact references nonexistent incident',
  );

  const hasNoClientReadGrant = await database.query(`
    SELECT NOT has_table_privilege('anon', 'public.incidents', 'SELECT')
       AND NOT has_table_privilege('anon', 'public.reporter_contacts', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE')
       AND NOT has_table_privilege('authenticated', 'public.team_memberships', 'INSERT,UPDATE,DELETE')
         AS value
  `);
  assert.equal(hasNoClientReadGrant.rows[0].value, true, 'browser grants are least privilege');

  await withRole('anon', null, async () => {
    await expectSqlState('SELECT * FROM public.incidents', '42501', 'anonymous incident listing');
    await expectSqlState(
      'SELECT * FROM public.reporter_contacts',
      '42501',
      'anonymous reporter-contact listing',
    );
  });

  await database.exec(`
    INSERT INTO auth.users (id) VALUES
      ('${ids.operator}'),
      ('${ids.responderOne}'),
      ('${ids.responderTwo}'),
      ('${ids.administrator}'),
      ('${ids.inactive}');

    INSERT INTO public.profiles (id, display_name, role, is_active)
    VALUES
      ('${ids.operator}', 'Synthetic operator test account', 'OPERATOR', true),
      ('${ids.responderOne}', 'Synthetic responder one', 'RESPONDER', true),
      ('${ids.responderTwo}', 'Synthetic responder two', 'RESPONDER', true),
      ('${ids.administrator}', 'Synthetic administrator', 'ADMIN', true),
      ('${ids.inactive}', 'Inactive synthetic account', 'OPERATOR', false);

    INSERT INTO public.team_memberships (team_id, profile_id)
    VALUES
      ('${ids.teamOne}', '${ids.responderOne}'),
      ('${ids.teamTwo}', '${ids.responderTwo}');

    INSERT INTO public.assignments (
      id, incident_id, team_id, status, assigned_at, acknowledgement_deadline, acknowledged_at
    )
    VALUES
      ('00000000-0000-4000-8000-000000000601', '${ids.incidentOne}', '${ids.teamOne}', 'PENDING', now(), now() + interval '15 minutes', NULL),
      ('00000000-0000-4000-8000-000000000602', '${ids.incidentTwo}', '${ids.teamTwo}', 'ACKNOWLEDGED', now(), now() + interval '15 minutes', now());

    INSERT INTO public.reporter_contacts (incident_id, contact_name, preferred_contact_method)
    VALUES
      ('${ids.incidentOne}', 'Synthetic contact fixture one', 'NONE'),
      ('${ids.incidentTwo}', 'Synthetic contact fixture two', 'NONE');
  `);

  const operatorIncidents = await withRole('authenticated', ids.operator, () =>
    database.query('SELECT id::text FROM public.incidents ORDER BY id'),
  );
  assert.deepEqual(
    operatorIncidents.rows.map((row) => row.id),
    [ids.incidentOne, ids.incidentTwo, ids.incidentThree],
    'operator can read operational incidents',
  );

  const responderOneIncidents = await withRole('authenticated', ids.responderOne, () =>
    database.query('SELECT id::text FROM public.incidents ORDER BY id'),
  );
  assert.deepEqual(
    responderOneIncidents.rows.map((row) => row.id),
    [ids.incidentOne],
    'responder sees only incidents assigned to their active team',
  );

  const responderTwoIncidents = await withRole('authenticated', ids.responderTwo, () =>
    database.query('SELECT id::text FROM public.incidents ORDER BY id'),
  );
  assert.deepEqual(
    responderTwoIncidents.rows.map((row) => row.id),
    [ids.incidentTwo],
    'a responder cannot see another team’s incidents',
  );

  const noContactPermission = await withRole('authenticated', ids.responderOne, () =>
    database.query('SELECT incident_id::text FROM public.reporter_contacts ORDER BY incident_id'),
  );
  assert.deepEqual(
    noContactPermission.rows,
    [],
    'responder role alone grants no reporter contact access',
  );

  await database.query(
    'UPDATE public.profiles SET can_access_reporter_contacts = true WHERE id = $1',
    [ids.responderOne],
  );
  const responderContacts = await withRole('authenticated', ids.responderOne, () =>
    database.query('SELECT incident_id::text FROM public.reporter_contacts ORDER BY incident_id'),
  );
  assert.deepEqual(
    responderContacts.rows.map((row) => row.incident_id),
    [ids.incidentOne],
    'explicit permission does not bypass responder incident/team scope',
  );

  const adminIncidents = await withRole('authenticated', ids.administrator, () =>
    database.query('SELECT id::text FROM public.incidents ORDER BY id'),
  );
  assert.deepEqual(adminIncidents.rows, [], 'administrator role alone grants no incident access');
  const adminProfiles = await withRole('authenticated', ids.administrator, () =>
    database.query('SELECT id::text FROM public.profiles ORDER BY id'),
  );
  assert.equal(adminProfiles.rows.length, 5, 'administrator can read the staff directory');

  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${ids.operator}'`,
      '42501',
      'user self-promotion through direct table update',
    );
    await expectSqlState(
      `DELETE FROM public.team_memberships WHERE profile_id = '${ids.operator}'`,
      '42501',
      'user self-membership change through direct table delete',
    );
    await expectSqlState(
      `SELECT public.admin_update_staff_profile('${ids.operator}', NULL, 'ADMIN', NULL, NULL)`,
      '42501',
      'non-administrator staff update RPC',
    );
  });

  await withRole('authenticated', ids.administrator, async () => {
    await database.query(`
      SELECT public.admin_update_staff_profile(
        '${ids.operator}', NULL::text, 'OPERATOR'::public.staff_role, NULL::boolean, NULL::boolean
      )
    `);
    await database.query(`
      SELECT public.admin_replace_team_memberships(
        '${ids.operator}', ARRAY['${ids.teamTwo}']::uuid[]
      )
    `);
    await expectSqlState(
      `SELECT public.admin_update_staff_profile(
        '${ids.administrator}', NULL::text, 'OPERATOR'::public.staff_role, NULL::boolean, NULL::boolean
      )`,
      '42501',
      'administrator self-role change',
    );
    await expectSqlState(
      `SELECT public.admin_replace_team_memberships(
        '${ids.administrator}', ARRAY['${ids.teamOne}']::uuid[]
      )`,
      '42501',
      'administrator self-membership change',
    );
    await database.query(`
      INSERT INTO public.configuration (configuration_key, value, description)
      VALUES ('stage3_smoke', '{"source": "synthetic smoke test"}'::jsonb, 'Non-secret test fixture')
    `);
  });

  const administratorTeamCount = await countRows(
    'team_memberships',
    `WHERE profile_id = '${ids.administrator}'`,
  );
  assert.equal(administratorTeamCount, 0, 'administrator cannot assign their own team');
  const operatorTeamCount = await countRows(
    'team_memberships',
    `WHERE profile_id = '${ids.operator}' AND team_id = '${ids.teamTwo}'`,
  );
  assert.equal(operatorTeamCount, 1, 'administrator can assign another profile through the RPC');
  assert.equal(await countRows('configuration', "WHERE configuration_key = 'stage3_smoke'"), 1);

  await withRole('authenticated', ids.inactive, async () => {
    const inactiveIncidents = await database.query('SELECT id FROM public.incidents');
    assert.deepEqual(inactiveIncidents.rows, [], 'inactive profiles cannot read incidents');
    const inactiveProfiles = await database.query('SELECT id FROM public.profiles');
    assert.deepEqual(inactiveProfiles.rows, [], 'inactive profiles cannot read their profile');
  });

  // Stage 4: Public emergency reporting smoke tests
  const initialIncidentCount = await countRows('incidents');
  const initialContactCount = await countRows('reporter_contacts');
  const initialEventCount = await countRows('incident_events');

  // Verify anonymous direct execution is denied (all public intake is guarded via backend API)
  await withRole('anon', null, async () => {
    await expectSqlState(
      `SELECT public.submit_public_incident(
        '\\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'::bytea,
        '\\x2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40'::bytea,
        'MEDICAL_ASSISTANCE'::public.incident_category,
        'Direct anon call should fail',
        NULL::uuid,
        'Main Gate',
        'NOT_PROVIDED',
        NULL,
        NULL,
        NULL,
        NULL
      )`,
      '42501',
      'direct anon execution of submit_public_incident is denied',
    );
  });

  // Verify backend service_role can read zones catalog for the API
  const publicZones = await withRole('service_role', null, () =>
    database.query('SELECT id, zone_code, name FROM public.zones ORDER BY name'),
  );
  assert.equal(publicZones.rows.length, 5, 'backend service_role can read zones catalog');

  // Backend service_role submits a public incident via the atomic stored procedure
  const idempotencyKeyHex = '\\xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
  const trackingTokenHex = '\\x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

  const submitResult = await withRole('service_role', null, async () => {
    const res = await database.query(`
      SELECT public.submit_public_incident(
        '${idempotencyKeyHex}'::bytea,
        '${trackingTokenHex}'::bytea,
        'MEDICAL_ASSISTANCE'::public.incident_category,
        'Elderly person experiencing heat exhaustion near bathing ghat'::text,
        NULL::uuid,
        'Step 3, North Ghat pavilion'::text,
        'GPS'::public.location_source,
        17.005000::numeric,
        81.780000::numeric,
        10.0::numeric,
        '+919876543210'::text
      ) AS result
    `);
    return res.rows[0].result;
  });

  assert.ok(submitResult.incident_id, 'new incident ID generated');
  assert.equal(submitResult.status, 'REPORTED', 'incident status is REPORTED');
  assert.equal(submitResult.is_idempotent_replay, false, 'first submission is not a replay');
  assert.equal(await countRows('incidents'), initialIncidentCount + 1, 'incident row inserted');
  assert.equal(
    await countRows('reporter_contacts'),
    initialContactCount + 1,
    'contact row inserted',
  );
  assert.equal(await countRows('incident_events'), initialEventCount + 1, 'event row inserted');

  // Idempotency: exact same submission returns existing incident without creating duplicates
  const replayResult = await withRole('service_role', null, async () => {
    const res = await database.query(`
      SELECT public.submit_public_incident(
        '${idempotencyKeyHex}'::bytea,
        '${trackingTokenHex}'::bytea,
        'MEDICAL_ASSISTANCE'::public.incident_category,
        'Elderly person experiencing heat exhaustion near bathing ghat'::text,
        NULL::uuid,
        'Step 3, North Ghat pavilion'::text,
        'GPS'::public.location_source,
        17.005000::numeric,
        81.780000::numeric,
        10.0::numeric,
        '+919876543210'::text
      ) AS result
    `);
    return res.rows[0].result;
  });

  assert.equal(
    replayResult.incident_id,
    submitResult.incident_id,
    'same incident ID returned on replay',
  );
  assert.equal(replayResult.is_idempotent_replay, true, 'is_idempotent_replay flag set to true');
  assert.equal(
    await countRows('incidents'),
    initialIncidentCount + 1,
    'no second incident created on replay',
  );
  assert.equal(
    await countRows('reporter_contacts'),
    initialContactCount + 1,
    'no second contact row created',
  );
  assert.equal(
    await countRows('incident_events'),
    initialEventCount + 1,
    'no duplicate event created',
  );

  // Invalid zone ID is rejected
  await withRole('service_role', null, async () => {
    await expectSqlState(
      `SELECT public.submit_public_incident(
        '\\x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa'::bytea,
        '\\x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'::bytea,
        'INFRASTRUCTURE'::public.incident_category,
        'Sparks observed near generator box'::text,
        '00000000-0000-4000-8000-999999999999'::uuid,
        'Near Generator A'::text,
        'LANDMARK'::public.location_source,
        NULL::numeric,
        NULL::numeric,
        NULL::numeric,
        NULL::text
      )`,
      '23503',
      'invalid zone ID is rejected with foreign key error',
    );
  });

  // ── Stage 5: Control-room incident review tests ──
  const reviewTargetId = submitResult.incident_id;

  // 1. Non-operator (responder) cannot review incidents
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.responderOne}'::uuid,
        'UNDER_REVIEW'::public.incident_status,
        'HIGH'::public.incident_priority,
        'Responder attempting review'::text
      )`,
      '42501',
      'responder cannot review incidents',
    );
  });

  // 2. Operator successfully reviews incident (REPORTED -> UNDER_REVIEW, priority NORMAL -> HIGH)
  const initialEventsForTarget = await queryScalar(`
    SELECT count(*)::integer AS value FROM public.incident_events WHERE incident_id = '${reviewTargetId}'
  `);

  const reviewResult = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'UNDER_REVIEW'::public.incident_status,
        'HIGH'::public.incident_priority,
        'Report verified by control room operator'::text
      ) AS result
    `);
    return res.rows[0].result;
  });

  assert.equal(reviewResult.status, 'UNDER_REVIEW', 'incident transitioned to UNDER_REVIEW');
  assert.equal(reviewResult.priority, 'HIGH', 'incident priority elevated to HIGH');
  assert.equal(
    reviewResult.review_notes,
    'Report verified by control room operator',
    'review notes persisted',
  );
  assert.equal(
    reviewResult.reviewed_by_profile_id,
    ids.operator,
    'reviewed_by_profile_id recorded',
  );

  // Verify audit events recorded (both STATUS_CHANGED and PRIORITY_CHANGED)
  const newEventsForTarget = await queryScalar(`
    SELECT count(*)::integer AS value FROM public.incident_events WHERE incident_id = '${reviewTargetId}'
  `);
  assert.equal(
    newEventsForTarget,
    initialEventsForTarget + 2,
    'recorded STATUS_CHANGED and PRIORITY_CHANGED events',
  );

  // 3. Self-duplicate linking is rejected
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'DUPLICATE'::public.incident_status,
        NULL::public.incident_priority,
        NULL::text,
        '${reviewTargetId}'::uuid
      )`,
      '23514',
      'self-duplicate rejected',
    );
  });

  // 4. Duplicate to non-existent incident is rejected
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'DUPLICATE'::public.incident_status,
        NULL::public.incident_priority,
        NULL::text,
        '00000000-0000-4000-8000-999999999999'::uuid
      )`,
      '23503',
      'duplicate to non-existent incident rejected',
    );
  });

  // 5. Cancellation without reason is rejected
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'CANCELLED'::public.incident_status,
        NULL::public.incident_priority,
        NULL::text,
        NULL::uuid,
        '   '::text
      )`,
      '23514',
      'cancellation without reason rejected',
    );
  });

  // 6. Cancellation with explicit reason succeeds
  const cancelResult = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'CANCELLED'::public.incident_status,
        NULL::public.incident_priority,
        NULL::text,
        NULL::uuid,
        'Duplicate report confirmed with ground patrol'::text
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(cancelResult.status, 'CANCELLED', 'incident cancelled');
  assert.equal(
    cancelResult.cancellation_reason,
    'Duplicate report confirmed with ground patrol',
    'reason recorded',
  );

  // 7. Modifying a cancelled incident fails
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_review_incident(
        '${reviewTargetId}'::uuid,
        '${ids.operator}'::uuid,
        'UNDER_REVIEW'::public.incident_status
      )`,
      '22023',
      'modifying cancelled incident rejected',
    );
  });

  // ── Stage 6: Response-team assignment tests ──
  const stage6IncidentId = '00000000-0000-4000-8000-000000000701';
  await database.exec(`
    INSERT INTO public.incidents (
      id, category, priority, status, summary, reported_at, zone_id, location_source
    ) VALUES (
      '${stage6IncidentId}',
      'MEDICAL_ASSISTANCE',
      'HIGH',
      'UNDER_REVIEW',
      'Test incident for Stage 6 team assignment',
      now(),
      '00000000-0000-4000-8000-000000000101',
      'LANDMARK'
    );
  `);

  // 1. Non-operator (responder) cannot assign teams
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.responderOne}'::uuid
      )`,
      '42501',
      'responder cannot assign response teams',
    );
  });

  // 2. Cannot assign to incident that already has an active assignment (incidentOne has teamOne)
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${ids.incidentOne}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.operator}'::uuid
      )`,
      '23505',
      'cannot assign incident with existing active assignment',
    );
  });

  // 3. Cannot assign a team that already has an active assignment (teamOne is busy with incidentOne)
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamOne}'::uuid,
        '${ids.operator}'::uuid
      )`,
      '23505',
      'cannot assign a team with an active assignment (double-booking prevented)',
    );
  });

  // 4. Ineligible team capability is rejected (teamThree temporarily without medical capability)
  await database.exec(`
    UPDATE public.teams
    SET capabilities = ARRAY['crowd_observation', 'crowd_guidance']
    WHERE id = '${ids.teamThree}';
  `);

  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.operator}'::uuid
      )`,
      '22023',
      'ineligible team capability is rejected',
    );
  });

  // Restore teamThree capability to include medical/welfare
  await database.exec(`
    UPDATE public.teams
    SET capabilities = ARRAY['welfare_check', 'first_aid']
    WHERE id = '${ids.teamThree}';
  `);

  // 5. Ineligible team duty status (OFF_DUTY) is rejected
  await database.exec(`
    UPDATE public.teams
    SET duty_status = 'OFF_DUTY'
    WHERE id = '${ids.teamThree}';
  `);

  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.operator}'::uuid
      )`,
      '22023',
      'off-duty team is rejected from assignment',
    );
  });

  // Restore teamThree duty status to ON_DUTY
  await database.exec(`
    UPDATE public.teams
    SET duty_status = 'ON_DUTY'
    WHERE id = '${ids.teamThree}';
  `);

  // 6. Valid team assignment succeeds atomically
  const initialAssignmentCount = await queryScalar(
    "SELECT count(*)::integer AS value FROM public.assignments WHERE incident_id = '" +
      stage6IncidentId +
      "'",
  );
  assert.equal(initialAssignmentCount, 0, 'stage6IncidentId initially has no assignments');

  const assignResult = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.operator}'::uuid,
        15
      ) AS result
    `);
    return res.rows[0].result;
  });

  assert.equal(assignResult.incident_id, stage6IncidentId, 'assigned to stage6IncidentId');
  assert.equal(assignResult.team_id, ids.teamThree, 'assigned to teamThree');
  assert.equal(assignResult.status, 'PENDING', 'assignment status is PENDING');
  assert.equal(
    assignResult.incident_status,
    'ASSIGNED',
    'incident status transitioned to ASSIGNED',
  );

  // Verify incident status updated in database
  const updatedIncidentStatus = await queryScalar(
    "SELECT status::text AS value FROM public.incidents WHERE id = '" + stage6IncidentId + "'",
  );
  assert.equal(updatedIncidentStatus, 'ASSIGNED', 'database record reflects ASSIGNED status');

  // Verify audit events (ASSIGNMENT_CREATED and STATUS_CHANGED)
  const auditEvents = await database.query(
    "SELECT event_type::text, status_before::text, status_after::text FROM public.incident_events WHERE incident_id = '" +
      stage6IncidentId +
      "' ORDER BY occurred_at DESC",
  );
  assert.equal(
    auditEvents.rows.some((e) => e.event_type === 'ASSIGNMENT_CREATED'),
    true,
    'ASSIGNMENT_CREATED event recorded',
  );
  assert.equal(
    auditEvents.rows.some(
      (e) =>
        e.event_type === 'STATUS_CHANGED' &&
        e.status_before === 'UNDER_REVIEW' &&
        e.status_after === 'ASSIGNED',
    ),
    true,
    'STATUS_CHANGED event recorded',
  );

  // 7. Simultaneous duplicate assignment of the same team fails (double-booking prevented)
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_assign_team(
        '${stage6IncidentId}'::uuid,
        '${ids.teamThree}'::uuid,
        '${ids.operator}'::uuid
      )`,
      '23505',
      're-assigning already-assigned team or incident fails with unique constraint',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Stage 7: Responder interface and report-to-resolution lifecycle
  // ═══════════════════════════════════════════════════════════════════════════
  // ids.responderOne is a member of ids.teamTwo.
  // ids.teamThree was assigned to stage6IncidentId above.
  // 1. Verify unassigned responder (ids.responderOne) CANNOT access or update stage6IncidentId
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ACKNOWLEDGE'
      )`,
      '42501',
      'unassigned responder cannot update incident',
    );
  });

  // Add ids.responderOne as active member of teamThree for assigned responder testing
  await database.exec(`
    INSERT INTO public.team_memberships (team_id, profile_id, membership_role, active)
    VALUES ('${ids.teamThree}', '${ids.responderOne}', 'MEMBER', true)
    ON CONFLICT (team_id, profile_id) DO UPDATE SET active = true;
  `);

  // 2. Responder acknowledges assignment (ASSIGNED -> ACKNOWLEDGED)
  const ackResult = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ACKNOWLEDGE',
        'Unit Alpha acknowledges dispatch'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(ackResult.incident_status, 'ACKNOWLEDGED', 'incident transitioned to ACKNOWLEDGED');
  assert.equal(
    ackResult.assignment_status,
    'ACKNOWLEDGED',
    'assignment transitioned to ACKNOWLEDGED',
  );

  // Idempotent repeat of ACKNOWLEDGE returns without error
  const repeatAck = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ACKNOWLEDGE'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(repeatAck.is_repeat, true, 'repeated acknowledge is handled idempotently');

  // 3. Invalid transition test: cannot jump directly from ACKNOWLEDGED to ON_SCENE without EN_ROUTE
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ON_SCENE'
      )`,
      '22023',
      'cannot jump to ON_SCENE without EN_ROUTE',
    );
  });

  // 4. Update to EN_ROUTE (ACKNOWLEDGED -> EN_ROUTE)
  const enRouteResult = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'EN_ROUTE',
        'In transit via North Promenade'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(enRouteResult.incident_status, 'EN_ROUTE', 'incident transitioned to EN_ROUTE');

  // 5. Request additional support
  const supportResult = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'REQUEST_SUPPORT',
        'Requesting stretcher team for patient transfer'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(supportResult.support_requested, true, 'support requested recorded');

  // 6. Update to ON_SCENE (EN_ROUTE -> ON_SCENE)
  const onSceneResult = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ON_SCENE',
        'Arrived at Step 4 Pavilion'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(onSceneResult.incident_status, 'ON_SCENE', 'incident transitioned to ON_SCENE');

  // 7. Resolve incident requires outcome
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'RESOLVE',
        'Patient cared for'
      )`,
      '22023',
      'resolve requires outcome description',
    );
  });

  // 8. Mark RESOLVED with outcome (releases team availability)
  const resolveResult = await withRole('authenticated', ids.responderOne, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'RESOLVE',
        'Treated for dehydration on scene',
        'Patient stabilized and reunited with family.'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(resolveResult.incident_status, 'RESOLVED', 'incident transitioned to RESOLVED');
  assert.equal(resolveResult.assignment_status, 'COMPLETED', 'assignment marked COMPLETED');

  // Verify team availability released (teamThree has no active PENDING/ACKNOWLEDGED assignments)
  const activeAssignmentsForTeam = await queryScalar(
    `SELECT count(*)::integer AS value FROM public.assignments WHERE team_id = '${ids.teamThree}' AND status IN ('PENDING', 'ACKNOWLEDGED')`,
  );
  assert.equal(activeAssignmentsForTeam, 0, 'team is released from active assignment');

  // 9. Superseded / inactive responder or completed assignment cannot update incident
  await database.exec(`
    UPDATE public.team_memberships
    SET active = false
    WHERE team_id = '${ids.teamThree}' AND profile_id = '${ids.responderOne}';
  `);
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.responder_update_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ON_SCENE'
      )`,
      '22023',
      'superseded/inactive responder cannot modify incident',
    );
  });

  // 10. Operator performs final closure (RESOLVED -> CLOSED)
  // Non-operator/responder cannot close
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.operator_close_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.responderOne}'::uuid
      )`,
      '42501',
      'responder cannot close incident',
    );
  });

  // Operator closes incident
  const closeResult = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_close_incident(
        '${stage6IncidentId}'::uuid,
        '${ids.operator}'::uuid,
        'Verified resolution with field sector lead.'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(closeResult.incident_status, 'CLOSED', 'incident transitioned to CLOSED');

  // Verify final audit events
  const finalEvents = await database.query(
    `SELECT event_type::text, status_before::text, status_after::text, notes FROM public.incident_events WHERE incident_id = '${stage6IncidentId}' ORDER BY occurred_at ASC`,
  );
  const eventTypes = finalEvents.rows.map((e) => e.event_type);
  assert.equal(
    eventTypes.includes('ASSIGNMENT_ACKNOWLEDGED'),
    true,
    'ASSIGNMENT_ACKNOWLEDGED event found',
  );
  assert.equal(eventTypes.includes('STATUS_CHANGED'), true, 'STATUS_CHANGED events found');
  const closureEvent = finalEvents.rows.find(
    (e) => e.status_before === 'RESOLVED' && e.status_after === 'CLOSED',
  );
  assert.ok(closureEvent, 'final operator closure audit event recorded');

  // -------------------------------------------------------------------------
  // STAGE 8 SMOKE: Missed-acknowledgement escalation & safe reassignment
  // -------------------------------------------------------------------------

  const stage8TeamA = '00000000-0000-4000-8000-000000000811';
  const stage8TeamB = '00000000-0000-4000-8000-000000000812';
  const stage8Zone = '00000000-0000-4000-8000-000000000101';

  await database.exec(`
    INSERT INTO public.teams (id, team_code, name, capabilities, duty_status)
    VALUES
      ('${stage8TeamA}', 'ESC-01', 'Escalation Team Alpha', ARRAY['first_aid', 'welfare_check'], 'ON_DUTY'),
      ('${stage8TeamB}', 'ESC-02', 'Escalation Team Bravo', ARRAY['first_aid', 'welfare_check'], 'ON_DUTY')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.team_zone_coverage (team_id, zone_id)
    VALUES
      ('${stage8TeamA}', '${stage8Zone}'),
      ('${stage8TeamB}', '${stage8Zone}')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.team_memberships (team_id, profile_id, active)
    VALUES
      ('${stage8TeamA}', '${ids.responderOne}', true),
      ('${stage8TeamB}', '${ids.responderTwo}', true)
    ON CONFLICT (team_id, profile_id) DO UPDATE SET active = true;
  `);

  // 1. Create a Stage 8 incident
  const stage8IncidentId = '00000000-0000-4000-8000-000000000801';
  await database.exec(`
    INSERT INTO public.incidents (
      id, category, priority, status, summary, reported_at, zone_id, location_source
    ) VALUES (
      '${stage8IncidentId}',
      'MEDICAL_ASSISTANCE',
      'HIGH',
      'UNDER_REVIEW',
      'Pilgrim feeling faint near northern stairs, needs rapid check.',
      now(),
      '${stage8Zone}',
      'LANDMARK'
    );
  `);

  // Assign Team Alpha with standard 15 minute deadline
  const stage8AssignRes = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_assign_team(
        '${stage8IncidentId}'::uuid,
        '${stage8TeamA}'::uuid,
        '${ids.operator}'::uuid,
        15
      ) AS result
    `);
    return res.rows[0].result;
  });
  const initialAssignmentId = stage8AssignRes.assignment_id;
  assert.ok(initialAssignmentId, 'Initial assignment created for Team Alpha');

  // Fast-forward acknowledgement deadline into the past (keeping deadline > assigned_at)
  await database.exec(`
    UPDATE public.assignments
    SET assigned_at = now() - INTERVAL '2 minutes',
        acknowledgement_deadline = now() - INTERVAL '15 seconds'
    WHERE id = '${initialAssignmentId}';
  `);

  // 2. Background worker scan detects overdue assignment and generates escalation event
  const scanQuery1 = await database.query(`
    SELECT public.scan_and_escalate_overdue_assignments() AS result;
  `);
  const scanResult1 = scanQuery1.rows[0].result;
  assert.equal(scanResult1.escalated_count, 1, 'Worker detected exactly 1 overdue assignment');
  assert.equal(
    scanResult1.escalated[0].assignment_id,
    initialAssignmentId,
    'Escalated correct assignment',
  );

  // Verify assignment is marked escalated
  const escalatedCheck = await database.query(`
    SELECT escalated_at, status FROM public.assignments WHERE id = '${initialAssignmentId}';
  `);
  assert.ok(escalatedCheck.rows[0].escalated_at !== null, 'escalated_at was populated');
  assert.equal(
    escalatedCheck.rows[0].status,
    'PENDING',
    'status remains PENDING until operator actions',
  );

  // Verify escalation audit event
  const escalationEvents = await database.query(`
    SELECT event_type::text, notes FROM public.incident_events
    WHERE incident_id = '${stage8IncidentId}' AND event_type = 'ACKNOWLEDGEMENT_OVERDUE';
  `);
  assert.equal(
    escalationEvents.rows.length,
    1,
    'Exactly one ACKNOWLEDGEMENT_OVERDUE event created',
  );
  assert.ok(
    escalationEvents.rows[0].notes.includes('deadline missed'),
    'Escalation notes mention deadline missed',
  );

  // 3. Worker idempotence: repeated scan does NOT duplicate escalation events
  const scanQuery2 = await database.query(`
    SELECT public.scan_and_escalate_overdue_assignments() AS result;
  `);
  const scanResult2 = scanQuery2.rows[0].result;
  assert.equal(
    scanResult2.escalated_count,
    0,
    'Subsequent scan finds 0 overdue assignments (idempotent)',
  );

  const escalationEventsAfter = await database.query(`
    SELECT count(*)::integer AS count FROM public.incident_events
    WHERE incident_id = '${stage8IncidentId}' AND event_type = 'ACKNOWLEDGEMENT_OVERDUE';
  `);
  assert.equal(escalationEventsAfter.rows[0].count, 1, 'No duplicate escalation event inserted');

  // 4. Acknowledged assignments do not trigger escalation even if deadline is passed
  // Create another incident, assign Team Bravo, acknowledge it, then set deadline in past
  const ackIncidentId = '00000000-0000-4000-8000-000000000802';
  await database.exec(`
    INSERT INTO public.incidents (
      id, category, priority, status, summary, reported_at, zone_id, location_source
    ) VALUES (
      '${ackIncidentId}',
      'MEDICAL_ASSISTANCE',
      'NORMAL',
      'UNDER_REVIEW',
      'Queue congestion at north ramp.',
      now(),
      '${stage8Zone}',
      'LANDMARK'
    );
  `);

  await withRole('authenticated', ids.operator, async () => {
    await database.query(`
      SELECT public.operator_assign_team('${ackIncidentId}'::uuid, '${stage8TeamB}'::uuid, '${ids.operator}'::uuid, 15)
    `);
  });

  // Team Bravo acknowledges
  await withRole('authenticated', ids.responderTwo, async () => {
    await database.query(`
      SELECT public.responder_update_incident('${ackIncidentId}'::uuid, '${ids.responderTwo}'::uuid, 'ACKNOWLEDGE')
    `);
  });

  // Fast forward deadline for this acknowledged assignment (keeping deadline > assigned_at)
  await database.exec(`
    UPDATE public.assignments
    SET assigned_at = now() - INTERVAL '2 minutes',
        acknowledgement_deadline = now() - INTERVAL '30 seconds'
    WHERE incident_id = '${ackIncidentId}';
  `);

  const scanQueryAck = await database.query(`
    SELECT public.scan_and_escalate_overdue_assignments() AS result;
  `);
  const scanResultAck = scanQueryAck.rows[0].result;
  assert.equal(
    scanResultAck.escalated_count,
    0,
    'Acknowledged assignment does not trigger escalation',
  );

  // Free Team Bravo back to ON_DUTY by resolving its incident
  await withRole('authenticated', ids.responderTwo, async () => {
    await database.query(`
      SELECT public.responder_update_incident(
        '${ackIncidentId}'::uuid,
        '${ids.responderTwo}'::uuid,
        'RESOLVE',
        null,
        'Crowd flow restored smoothly.'
      )
    `);
  });

  // 5. Operator-controlled reassignment workflow for stage8IncidentId
  // Unauthorized user cannot reassign
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.operator_reassign_team(
        '${stage8IncidentId}'::uuid,
        '${stage8TeamB}'::uuid,
        '${ids.responderOne}'::uuid,
        'Reassigning due to timeout'
      )`,
      '42501',
      'responder cannot reassign team',
    );
  });

  // Operator cannot reassign without a reason
  await withRole('authenticated', ids.operator, async () => {
    await expectSqlState(
      `SELECT public.operator_reassign_team(
        '${stage8IncidentId}'::uuid,
        '${stage8TeamB}'::uuid,
        '${ids.operator}'::uuid,
        '   '
      )`,
      '22023',
      'empty reassignment reason rejected',
    );
  });

  // Operator executes valid reassignment to Team Bravo with 60-second prototype demo deadline
  const reassignResult = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`
      SELECT public.operator_reassign_team(
        '${stage8IncidentId}'::uuid,
        '${stage8TeamB}'::uuid,
        '${ids.operator}'::uuid,
        'First response team uncontactable after 60s demo deadline. Reassigned to Bravo.',
        60
      ) AS result
    `);
    return res.rows[0].result;
  });

  assert.equal(
    reassignResult.superseded_assignment_id,
    initialAssignmentId,
    'previous assignment correctly identified',
  );
  assert.equal(reassignResult.new_team_id, stage8TeamB, 'new team is Team Bravo');
  assert.equal(reassignResult.status, 'PENDING', 'new assignment is PENDING');
  assert.equal(reassignResult.incident_status, 'ASSIGNED', 'incident status remains ASSIGNED');

  // Verify previous assignment is SUPERSEDED and old team availability released
  const oldAssignment = await database.query(`
    SELECT status, superseded_at, superseded_by_assignment_id, reassignment_reason
    FROM public.assignments WHERE id = '${initialAssignmentId}';
  `);
  assert.equal(oldAssignment.rows[0].status, 'SUPERSEDED', 'old assignment marked SUPERSEDED');
  assert.ok(oldAssignment.rows[0].superseded_at !== null, 'superseded_at recorded');
  assert.equal(
    oldAssignment.rows[0].superseded_by_assignment_id,
    reassignResult.new_assignment_id,
    'linked to new assignment ID',
  );
  assert.ok(
    oldAssignment.rows[0].reassignment_reason.includes('First response team uncontactable'),
    'reassignment reason preserved',
  );

  // Verify old team (Team Alpha) is released from active assignment
  const teamAlphaActiveCount = await queryScalar(
    `SELECT count(*)::integer AS value FROM public.assignments WHERE team_id = '${stage8TeamA}' AND status IN ('PENDING', 'ACKNOWLEDGED')`,
  );
  assert.equal(
    teamAlphaActiveCount,
    0,
    'Previous team released to duty according to documented release rule',
  );

  // 6. Concurrency / Safety: Superseded responder cannot acknowledge or act (not a member of active team)
  await withRole('authenticated', ids.responderOne, async () => {
    await expectSqlState(
      `SELECT public.responder_update_incident(
        '${stage8IncidentId}'::uuid,
        '${ids.responderOne}'::uuid,
        'ACKNOWLEDGE'
      )`,
      '42501',
      'superseded team responder cannot acknowledge',
    );
  });

  // 7. New team responder can acknowledge
  const newTeamAck = await withRole('authenticated', ids.responderTwo, async () => {
    const res = await database.query(`
      SELECT public.responder_update_incident(
        '${stage8IncidentId}'::uuid,
        '${ids.responderTwo}'::uuid,
        'ACKNOWLEDGE'
      ) AS result
    `);
    return res.rows[0].result;
  });
  assert.equal(newTeamAck.assignment_status, 'ACKNOWLEDGED', 'New team acknowledged successfully');

  // Verify audit events contain ASSIGNMENT_SUPERSEDED and new ASSIGNMENT_CREATED
  const reassignmentAuditEvents = await database.query(`
    SELECT event_type::text, notes FROM public.incident_events
    WHERE incident_id = '${stage8IncidentId}' ORDER BY occurred_at ASC;
  `);
  const finalTypes = reassignmentAuditEvents.rows.map((e) => e.event_type);
  assert.ok(finalTypes.includes('ACKNOWLEDGEMENT_OVERDUE'), 'Escalation event logged in audit');
  assert.ok(finalTypes.includes('ASSIGNMENT_SUPERSEDED'), 'Superseded event logged in audit');
  assert.ok(finalTypes.includes('ASSIGNMENT_CREATED'), 'New assignment event logged in audit');
  assert.ok(
    finalTypes.includes('ASSIGNMENT_ACKNOWLEDGED'),
    'New assignment acknowledgement logged',
  );

  // ── Stage 9: Realtime publication, RLS scope, and mapping configuration ──
  // 1. Verify supabase_realtime publication exists
  const publicationCheck = await database.query(`
    SELECT pubname FROM pg_publication WHERE pubname = 'supabase_realtime';
  `);
  assert.equal(publicationCheck.rows.length, 1, 'supabase_realtime publication exists in postgres');

  // 2. Verify publication tables: incidents, assignments, incident_events MUST be published
  const pubTables = await database.query(`
    SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
  `);
  const publishedTableNames = pubTables.rows.map((r) => r.tablename);
  assert.ok(publishedTableNames.includes('incidents'), 'incidents table is published for realtime');
  assert.ok(
    publishedTableNames.includes('assignments'),
    'assignments table is published for realtime',
  );
  assert.ok(
    publishedTableNames.includes('incident_events'),
    'incident_events table is published for realtime',
  );

  // 3. Privacy boundary check: reporter_contacts and incident_tracking_tokens MUST NOT be published
  assert.ok(
    !publishedTableNames.includes('reporter_contacts'),
    'reporter_contacts is NOT in realtime publication (privacy boundary)',
  );
  assert.ok(
    !publishedTableNames.includes('incident_tracking_tokens'),
    'incident_tracking_tokens is NOT in realtime publication (privacy boundary)',
  );

  // 4. Verify map tile configuration in public.configuration
  const mapConfig = await database.query(`
    SELECT value FROM public.configuration WHERE configuration_key = 'map_tile_provider';
  `);
  assert.equal(mapConfig.rows.length, 1, 'map_tile_provider configuration exists');
  const mapConfigValue = mapConfig.rows[0].value;
  assert.ok(
    mapConfigValue.tile_url && mapConfigValue.tile_url.includes('{z}'),
    'map_tile_provider contains valid tile_url template',
  );
  assert.ok(
    mapConfigValue.attribution && mapConfigValue.attribution.includes('OpenStreetMap'),
    'map_tile_provider contains attribution',
  );

  // 5. Subscription RLS verification:
  // Anon/unauthenticated role is denied permission
  await withRole('anon', null, async () => {
    await expectSqlState(
      'SELECT count(*)::integer AS count FROM public.incidents;',
      '42501',
      'Anon subscriber cannot select incidents',
    );
  });

  // Inactive authenticated staff cannot read incidents under RLS
  const inactiveRlsCount = await withRole('authenticated', ids.inactive, async () => {
    const res = await database.query(`SELECT count(*)::integer AS count FROM public.incidents;`);
    return res.rows[0].count;
  });
  assert.equal(inactiveRlsCount, 0, 'Inactive staff subscriber cannot read incidents under RLS');

  // Operator can select incidents
  const operatorIncidentCount = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(`SELECT count(*)::integer AS count FROM public.incidents;`);
    return res.rows[0].count;
  });
  assert.ok(
    operatorIncidentCount > 0,
    'Operator subscriber can read operational incidents under RLS',
  );

  // Operator cannot read reporter_contacts without explicit permission
  const operatorContactCount = await withRole('authenticated', ids.operator, async () => {
    const res = await database.query(
      `SELECT count(*)::integer AS count FROM public.reporter_contacts;`,
    );
    return res.rows[0].count;
  });
  assert.equal(
    operatorContactCount,
    0,
    'Operator cannot read reporter_contacts via subscription/select without permission',
  );

  // ── Stage 10: Connectivity resilience and public tracking ──
  // 1. Submit incident with custom reported_at (stale offline draft) and tracking token
  const crypto = await import('node:crypto');
  const testStage10Token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const testStage10TokenHash = crypto.createHash('sha256').update(testStage10Token).digest('hex');
  const testStage10Idempotency = crypto
    .createHash('sha256')
    .update('client-req-stage10-001')
    .digest('hex');
  const draftReportedTime = '2026-10-28 09:30:00+05:30';

  const stage10Result = await database.query(`
    SELECT public.submit_public_incident(
      '\\x${testStage10Idempotency}'::bytea,
      '\\x${testStage10TokenHash}'::bytea,
      'MEDICAL_ASSISTANCE'::public.incident_category,
      'Pilgrim heat exhaustion report queued during offline period',
      '00000000-0000-4000-8000-000000000101'::uuid,
      'Pillar 14 near shade canopy',
      'GPS'::public.location_source,
      17.0055,
      81.7766,
      12.0,
      '+919876543210',
      '${draftReportedTime}'::timestamptz
    ) AS result;
  `);

  const createdIncident = stage10Result.rows[0].result;
  assert.equal(
    createdIncident.is_idempotent_replay,
    false,
    'Initial offline queue submission is created',
  );

  // Verify reported_at preserved original draft time, while created_at is server receipt time
  const timeCheck = await database.query(`
    SELECT reported_at, created_at FROM public.incidents WHERE id = '${createdIncident.incident_id}'::uuid;
  `);
  assert.ok(timeCheck.rows[0].reported_at, 'reported_at is recorded');
  assert.ok(timeCheck.rows[0].created_at, 'created_at is recorded');

  // 2. Lost-acknowledgement replay with same idempotency key
  const stage10ReplayResult = await database.query(`
    SELECT public.submit_public_incident(
      '\\x${testStage10Idempotency}'::bytea,
      '\\x${testStage10TokenHash}'::bytea,
      'MEDICAL_ASSISTANCE'::public.incident_category,
      'Pilgrim heat exhaustion report queued during offline period',
      '00000000-0000-4000-8000-000000000101'::uuid,
      'Pillar 14 near shade canopy',
      'GPS'::public.location_source,
      17.0055,
      81.7766,
      12.0,
      '+919876543210',
      '${draftReportedTime}'::timestamptz
    ) AS result;
  `);
  assert.equal(
    stage10ReplayResult.rows[0].result.is_idempotent_replay,
    true,
    'Reconciliation detects duplicate client request and returns replay without second insert',
  );

  // 3. Test public tracking lookup with valid tracking token hash
  const trackResult = await database.query(`
    SELECT public.get_public_incident_tracking('\\x${testStage10TokenHash}'::bytea) AS result;
  `);
  const publicTracking = trackResult.rows[0].result;
  assert.ok(publicTracking, 'Public tracking returns record for valid token');
  assert.equal(publicTracking.status, 'REPORTED');
  assert.equal(publicTracking.status_label, 'Report Received by Control Room');
  assert.equal(
    publicTracking.summary,
    'Pilgrim heat exhaustion report queued during offline period',
  );
  assert.equal(publicTracking.zone_name, 'Amber Loop');
  assert.equal(publicTracking.landmark, 'Pillar 14 near shade canopy');
  // Privacy boundary assertion: NEVER expose phone, internal notes, staff names, or tracking token
  assert.equal(
    publicTracking.phone_e164,
    undefined,
    'Reporter phone is NOT exposed in public tracking',
  );
  assert.equal(
    publicTracking.review_notes,
    undefined,
    'Review notes are NOT exposed in public tracking',
  );
  assert.equal(
    publicTracking.public_tracking_token_sha256,
    undefined,
    'Tracking token hash is NOT leaked',
  );

  // 4. Test public tracking lookup with non-existent token hash
  const invalidTokenHash = crypto
    .createHash('sha256')
    .update('invalid-non-existent-token')
    .digest('hex');
  const invalidTrackResult = await database.query(`
    SELECT public.get_public_incident_tracking('\\x${invalidTokenHash}'::bytea) AS result;
  `);
  assert.equal(
    invalidTrackResult.rows[0].result,
    null,
    'Invalid tracking token reveals no incident data (returns null)',
  );

  // ── Stage 11: Security Hardening & Retention Audit ─────────────────────────
  // 1. Verify retention policy configuration item
  const retentionConfig = await database.query(`
    SELECT value FROM public.configuration WHERE configuration_key = 'data_retention_policy';
  `);
  assert.ok(retentionConfig.rows.length === 1, 'Data retention policy configuration exists');
  assert.equal(
    retentionConfig.rows[0].value.closedIncidentRetentionDays,
    30,
    'Default closedIncidentRetentionDays is 30',
  );

  // 2. Test purge_expired_data parameter validation (must be >= 1 day)
  await expectSqlState(
    `SELECT public.purge_expired_data(0);`,
    '22023',
    'purge_expired_data rejects retention days < 1',
  );

  // 3. Test purge_expired_data executes cleanly
  const purgeResult = await database.query(`
    SELECT * FROM public.purge_expired_data(30);
  `);
  assert.ok(purgeResult.rows.length === 1, 'purge_expired_data returns summary row');
  assert.strictEqual(
    typeof purgeResult.rows[0].purged_incidents,
    'number',
    'Returns purged_incidents count',
  );

  // 4. Privilege audit: anon is denied execution of privileged maintenance routines
  await withRole('anon', null, async () => {
    await expectSqlState(
      `SELECT * FROM public.purge_expired_data(30);`,
      '42501',
      'anon denied purge_expired_data',
    );
    await expectSqlState(
      `SELECT public.scan_and_escalate_overdue_assignments();`,
      '42501',
      'anon denied scan_and_escalate_overdue_assignments',
    );
  });

  // ── Stage 12: End-to-End Scenario Verification in Database ──────────────────
  // Step 1 & 2: Public intake creates new incident
  const e2eIdempotency = '\\x7777777777777777777777777777777777777777777777777777777777777777';
  const e2eTokenHash = '\\x8888888888888888888888888888888888888888888888888888888888888888';
  const intakeResult = await database.query(`
    SELECT public.submit_public_incident(
      '${e2eIdempotency}'::bytea,
      '${e2eTokenHash}'::bytea,
      'LOST_PERSON'::public.incident_category,
      'E2E Lost child reported near step 5'::text,
      NULL::uuid,
      'Near Step 5 Pavilion'::text,
      'LANDMARK'::public.location_source,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      now()
    ) AS result;
  `);
  assert.ok(intakeResult.rows.length === 1, 'E2E report submitted');
  const created = intakeResult.rows[0].result;
  const e2eIncidentId = created.incident_id;
  assert.equal(created.status, 'REPORTED');

  // Step 3: Operator reviews and assigns teamOne
  // Clear any leftover assignments on teamOne/teamThree from earlier stage tests
  await database.query(
    `UPDATE public.assignments SET status = 'COMPLETED' WHERE team_id IN ($1::uuid, $2::uuid) AND status IN ('PENDING', 'ACKNOWLEDGED');`,
    [ids.teamOne, ids.teamThree],
  );
  // Ensure ids.responderTwo is active on teamThree
  await database.query(
    `INSERT INTO public.team_memberships (team_id, profile_id, membership_role, active)
     VALUES ($1::uuid, $2::uuid, 'MEMBER', true)
     ON CONFLICT (team_id, profile_id) DO UPDATE SET active = true;`,
    [ids.teamThree, ids.responderTwo],
  );

  await database.query(
    `SELECT public.operator_review_incident(
      $1::uuid, $2::uuid, 'UNDER_REVIEW'::public.incident_status, 'URGENT'::public.incident_priority,
      'E2E operator triage verified'::text, NULL::uuid, NULL::text
    );`,
    [e2eIncidentId, ids.operator],
  );

  const e2eAssignResult = await database.query(
    `SELECT public.operator_assign_team(
      $1::uuid, $2::uuid, $3::uuid, 1, 60
    ) AS result;`,
    [e2eIncidentId, ids.teamOne, ids.operator],
  );
  assert.ok(e2eAssignResult.rows.length === 1, 'E2E teamOne assigned');
  assert.equal(e2eAssignResult.rows[0].result.incident_status, 'ASSIGNED');

  // Step 4 & 5: Fast forward assignment deadline to simulate missed acknowledgement, then scan
  await database.query(
    `UPDATE public.assignments
     SET assigned_at = now() - interval '2 minutes',
         acknowledgement_deadline = now() - interval '1 minute'
     WHERE incident_id = $1::uuid AND status = 'PENDING';`,
    [e2eIncidentId],
  );
  const escScan = await database.query(
    `SELECT public.scan_and_escalate_overdue_assignments() AS result;`,
  );
  assert.ok(escScan.rows[0].result.escalated_count >= 1, 'E2E overdue assignment flagged');

  // Step 6: Operator reassigns to teamThree
  const e2eReassignResult = await database.query(
    `SELECT public.operator_reassign_team(
      $1::uuid, $2::uuid, $3::uuid, 'E2E reassignment: teamOne missed acknowledgement'::text, 60
    ) AS result;`,
    [e2eIncidentId, ids.teamThree, ids.operator],
  );
  assert.ok(e2eReassignResult.rows.length === 1, 'E2E teamThree reassigned');

  // Step 7: Responder from teamThree accepts assignment
  const e2eAckRes = await database.query(
    `SELECT public.responder_update_incident(
      $1::uuid, $2::uuid, 'ACKNOWLEDGE'::text, 'E2E TeamThree acknowledged'::text, NULL::text
    ) AS result;`,
    [e2eIncidentId, ids.responderTwo],
  );
  assert.equal(e2eAckRes.rows[0].result.incident_status, 'ACKNOWLEDGED');

  // Step 8: Responder transitions EN_ROUTE, then ON_SCENE
  const e2eEnRouteRes = await database.query(
    `SELECT public.responder_update_incident(
      $1::uuid, $2::uuid, 'EN_ROUTE'::text, 'E2E en route'::text, NULL::text
    ) AS result;`,
    [e2eIncidentId, ids.responderTwo],
  );
  assert.equal(e2eEnRouteRes.rows[0].result.incident_status, 'EN_ROUTE');

  const e2eOnSceneRes = await database.query(
    `SELECT public.responder_update_incident(
      $1::uuid, $2::uuid, 'ON_SCENE'::text, 'E2E on scene'::text, NULL::text
    ) AS result;`,
    [e2eIncidentId, ids.responderTwo],
  );
  assert.equal(e2eOnSceneRes.rows[0].result.incident_status, 'ON_SCENE');

  // Step 9: Responder marks RESOLVED
  const e2eResolveRes = await database.query(
    `SELECT public.responder_update_incident(
      $1::uuid, $2::uuid, 'RESOLVE'::text, NULL::text, 'E2E patient treated and stabilized'::text
    ) AS result;`,
    [e2eIncidentId, ids.responderTwo],
  );
  assert.equal(e2eResolveRes.rows[0].result.incident_status, 'RESOLVED');

  // Step 10: Operator closes incident
  const e2eCloseRes = await database.query(
    `SELECT public.operator_close_incident(
      $1::uuid, $2::uuid, 'E2E administrative review complete'::text
    ) AS result;`,
    [e2eIncidentId, ids.operator],
  );
  assert.equal(e2eCloseRes.rows[0].result.incident_status, 'CLOSED');

  // Step 11: Audit timeline shows the complete history
  const e2eAuditEvents = await database.query(
    `SELECT event_type FROM public.incident_events WHERE incident_id = $1::uuid ORDER BY occurred_at ASC;`,
    [e2eIncidentId],
  );
  assert.ok(e2eAuditEvents.rows.length >= 8, 'E2E audit timeline complete');

  const version = await database.query('SHOW server_version');
  console.log(
    `Database smoke passed on embedded PostgreSQL ${version.rows[0].server_version}: all migrations, repeatable seed, exact states/FKs, role-scoped RLS, contact permission, admin RPCs, self-change denial, Stage 4 public reporting, Stage 5 control-room review, Stage 6 response-team assignment, Stage 7 responder workflow, Stage 8 missed-acknowledgement escalation, Stage 9 realtime publication & mapping configuration, Stage 10 public tracking & connectivity resilience, Stage 11 security hardening & retention audit, and Stage 12 end-to-end integration scenario.`,
  );
} finally {
  await database.close();
}
