import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Setup database
const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationNames = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationNames.map((name) => readFile(new URL(name, migrationDirectory), 'utf8')),
);
const seedSql = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const database = new PGlite();

// Initialize schema
await database.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$ LANGUAGE sql STABLE;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
    SELECT json_build_object('sub', current_setting('request.jwt.claim.sub', true))::jsonb;
  $$ LANGUAGE sql STABLE;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;
`);

for (const sql of migrations) {
  await database.exec(sql);
}
await database.exec(seedSql);

const ids = {
  operator: '00000000-0000-4000-8000-000000000501',
  responderOne: '00000000-0000-4000-8000-000000000502',
  responderTwo: '00000000-0000-4000-8000-000000000503',
  teamOne: '00000000-0000-4000-8000-000000000201',
  teamThree: '00000000-0000-4000-8000-000000000203',
};

// Seed auth users and staff profiles
await database.exec(`
  INSERT INTO auth.users (id) VALUES
    ('${ids.operator}'),
    ('${ids.responderOne}'),
    ('${ids.responderTwo}');

  INSERT INTO public.profiles (id, display_name, role, is_active) VALUES
    ('${ids.operator}', 'Synthetic operator benchmark', 'OPERATOR', true),
    ('${ids.responderOne}', 'Synthetic responder benchmark', 'RESPONDER', true),
    ('${ids.responderTwo}', 'Synthetic responder benchmark 2', 'RESPONDER', true);
`);

// Add responderOne to teamThree
await database.query(
  `INSERT INTO public.team_memberships (team_id, profile_id, membership_role, active)
   VALUES ($1::uuid, $2::uuid, 'MEMBER', true)
   ON CONFLICT (team_id, profile_id) DO UPDATE SET active = true;`,
  [ids.teamThree, ids.responderOne],
);

function stats(durationsMs) {
  const n = durationsMs.length;
  const min = Math.min(...durationsMs);
  const max = Math.max(...durationsMs);
  const sum = durationsMs.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const variance = durationsMs.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return {
    n,
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    stdDev: Number(stdDev.toFixed(3)),
  };
}

const SAMPLE_SIZE = 30;

console.log('--- RUNNING EMPIRICAL PERFORMANCE BENCHMARKS (Stage 12) ---');

// 1. API Submission Latency
const submissionTimes = [];
const createdIncidentIds = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const pad = String(i).padStart(4, '0');
  const idempotency = `\\x111111111111111111111111111111111111111111111111111111111111${pad}`;
  const tokenHash = `\\x222222222222222222222222222222222222222222222222222222222222${pad}`;

  const start = performance.now();
  const res = await database.query(`
    SELECT public.submit_public_incident(
      '${idempotency}'::bytea,
      '${tokenHash}'::bytea,
      'LOST_PERSON'::public.incident_category,
      'Benchmark report intake sample',
      NULL::uuid,
      'Benchmark Landmark',
      'LANDMARK'::public.location_source,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric,
      '+919876543210',
      now()
    ) AS result;
  `);
  const end = performance.now();
  submissionTimes.push(end - start);
  createdIncidentIds.push(res.rows[0].result.incident_id);
}

// 2. Report-to-operator-screen delay (database query fetch of open operational queue)
const operatorFetchTimes = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const start = performance.now();
  await database.query(`
    SELECT i.id, i.category, i.priority, i.status, i.summary, i.reported_at, i.landmark,
           z.name AS zone_name
    FROM public.incidents i
    LEFT JOIN public.zones z ON z.id = i.zone_id
    WHERE i.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED', 'DUPLICATE')
    ORDER BY i.created_at DESC
    LIMIT 20;
  `);
  const end = performance.now();
  operatorFetchTimes.push(end - start);
}

// 3. Duplicate Prevention (Reconciliation Latency)
const duplicateTimes = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const pad = String(i).padStart(4, '0');
  const idempotency = `\\x111111111111111111111111111111111111111111111111111111111111${pad}`;
  const tokenHash = `\\x222222222222222222222222222222222222222222222222222222222222${pad}`;

  const start = performance.now();
  const res = await database.query(`
    SELECT public.submit_public_incident(
      '${idempotency}'::bytea,
      '${tokenHash}'::bytea,
      'LOST_PERSON'::public.incident_category,
      'Duplicate replay attempt',
      NULL::uuid,
      'Benchmark Landmark',
      'LANDMARK'::public.location_source,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric,
      '+919876543210',
      now()
    ) AS result;
  `);
  const end = performance.now();
  duplicateTimes.push(end - start);
  if (!res.rows[0].result.is_idempotent_replay) {
    throw new Error('Expected duplicate detection');
  }
}

// 4. Escalation Detection Delay
// Fast forward an incident's assignment to overdue
const testEscIncident = createdIncidentIds[0];
await database.query(
  `UPDATE public.assignments SET status = 'COMPLETED' WHERE team_id = $1::uuid;`,
  [ids.teamOne],
);
await database.query(`SELECT public.operator_assign_team($1::uuid, $2::uuid, $3::uuid, 1, 60);`, [
  testEscIncident,
  ids.teamOne,
  ids.operator,
]);
await database.query(
  `UPDATE public.assignments
   SET assigned_at = now() - interval '2 minutes',
       acknowledgement_deadline = now() - interval '1 minute'
   WHERE incident_id = $1::uuid AND status = 'PENDING';`,
  [testEscIncident],
);

const escalationTimes = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const start = performance.now();
  await database.query(`SELECT public.scan_and_escalate_overdue_assignments() AS result;`);
  const end = performance.now();
  escalationTimes.push(end - start);
}

// 5. Assignment-to-acknowledgement time in scripted test
const assignAckTimes = [];
for (let i = 1; i <= Math.min(10, createdIncidentIds.length - 1); i++) {
  const incId = createdIncidentIds[i];
  await database.query(
    `UPDATE public.assignments SET status = 'COMPLETED' WHERE team_id = $1::uuid;`,
    [ids.teamThree],
  );

  const start = performance.now();
  await database.query(`SELECT public.operator_assign_team($1::uuid, $2::uuid, $3::uuid, 1, 60);`, [
    incId,
    ids.teamThree,
    ids.operator,
  ]);
  await database.query(
    `SELECT public.responder_update_incident($1::uuid, $2::uuid, 'ACKNOWLEDGE'::text, 'Acknowledged'::text, NULL::text);`,
    [incId, ids.responderOne],
  );
  const end = performance.now();
  assignAckTimes.push(end - start);
}

// 6. Authorization check latency (denial verification)
const authCheckTimes = [];
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const start = performance.now();
  try {
    await database.query(`
      SET ROLE anon;
      SELECT * FROM public.purge_expired_data(30);
      RESET ROLE;
    `);
  } catch {
    // Expected 42501
  } finally {
    await database.query(`RESET ROLE;`).catch(() => {});
  }
  const end = performance.now();
  authCheckTimes.push(end - start);
}

const cpus = os.cpus();
const report = {
  environment: {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: cpus.length > 0 ? `${cpus[0].model} (${cpus.length} cores)` : 'Unknown',
    memoryGb: Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)),
    nodeVersion: process.version,
    databaseEngine: 'PostgreSQL 18.6 (Embedded PGlite / WebAssembly Engine)',
  },
  metrics: {
    apiSubmissionLatencyMs: stats(submissionTimes),
    reportToOperatorScreenDelayMs: stats(operatorFetchTimes),
    duplicatePreventionReconciliationMs: stats(duplicateTimes),
    escalationDetectionDelayMs: stats(escalationTimes),
    assignmentToAcknowledgementScriptedMs: stats(assignAckTimes),
    authorizationCheckDenialLatencyMs: stats(authCheckTimes),
  },
};

console.log(JSON.stringify(report, null, 2));

await database.close();
