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

  const version = await database.query('SHOW server_version');
  console.log(
    `Database smoke passed on embedded PostgreSQL ${version.rows[0].server_version}: all migrations, repeatable seed, exact states/FKs, role-scoped RLS, contact permission, admin RPCs, and self-change denial.`,
  );
} finally {
  await database.close();
}
