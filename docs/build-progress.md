# Build progress

## Stage 1 — Project foundation

**Status: complete.** Implemented only the runnable project foundation and clearly labelled placeholders. No emergency workflow, operational data, Supabase tables, authentication, dispatch, maps, or external emergency-service integrations were introduced.

### Delivered

The pnpm 11.25.0 workspace contains `apps/web`, `apps/api`, `packages/shared`, `supabase/migrations`, and `docs`. The frontend uses React, TypeScript, Vite, Tailwind CSS, and React Router; the API uses Express and TypeScript; the shared package exports strict Zod response schemas and TypeScript types.

All requested routes are present: `/`, `/report`, `/track`, `/staff/login`, `/operator`, `/responder`, and `/admin`. The responsive shared shell includes keyboard-accessible navigation and skip link, a persistent “Hackathon prototype — not an emergency service” notice, and a clearly labelled `tel:112` alternative. The notice explains that telephone coverage is required and the prototype does not request or guarantee help. Report intake, tracking, staff sign-in, operator, responder, and admin functions remain explicit placeholders. The report-page sample field is accessible and is not submitted, transmitted, or saved.

The API validates configuration with Zod, generates request IDs on the server, returns a consistent error format, and exposes only a service status and server-generated timestamp from `GET /api/health`. Vite serves the web app on port 3000 and proxies same-origin `/api` requests to the API on port 4000. `.env.example` files contain local defaults only; real environment files are ignored. The root README contains exact setup and run commands. ESLint, Prettier, TypeScript checks, Vitest/Supertest smoke tests, and an optional Playwright smoke test are configured.

### Checks actually run

- `pnpm install` — passed; dependencies resolved and the lockfile was generated/updated.
- `pnpm check` — passed, including ESLint, Prettier, shared/API/frontend/Playwright-file TypeScript checks, all Vitest tests, and production builds for the shared package, API, and frontend.
- Vitest — 16 tests passed: 3 shared-contract tests, 4 API tests, and 9 frontend route/accessibility/safety tests.
- `pnpm e2e` — passed: 1 Playwright Chromium test exercised the disclaimer, 112 link, proxied API connection, report placeholder, and no-submit boundary.
- `pnpm health:check` — passed against the live Express API. The live Vite `/api/health` proxy also returned a valid health response without environment or credential fields.
- Live route checks — `GET /manus-routes.json` returned HTTP 200 with exactly the seven source routes. Each requested route returned the Vite app shell.
- Credential/ignore audit — no local `.env` files or tracked credentials found; both app `.env.example` files are present and `apps/api/.env` matches the repository ignore rule.

### Manual verification

For a fresh local run, follow the commands in the README: enable Corepack, activate pnpm 11.25.0, install packages, copy both `.env.example` files, and run `pnpm dev`. Open `http://localhost:3000`, tab from the skip link through the navigation, and visit each of the seven routes. On `/report`, confirm the sample field is labelled as not sent or saved and that no submission control is present. Confirm the persistent disclaimer and 112 alternative remain visible. In another terminal, `pnpm health:check` checks the API; optional browser E2E requires the one-time Playwright Chromium install command in the README.

### Acceptance criteria

- Fresh dependency installation succeeds: **passed**.
- Frontend loads: **passed**; live Vite app responds on the configured port and Playwright visits the homepage and report placeholder.
- API health check succeeds: **passed** both directly and through the frontend proxy.
- Type checking and initial tests pass: **passed**; all 16 Vitest tests and the Playwright browser smoke test pass.
- No credentials are committed: **passed** by ignore/status audit; no real environment file was present.

### Remaining limitations and stage boundary

This is a software-only hackathon prototype, not an operational emergency service. No report persistence, IndexedDB queue, database schema, Supabase Auth or Realtime, authorization policy, map, staff/team/zone records, dispatch, police/ambulance/hospital/112 integration, or guaranteed response is provided. The `tel:112` link hands off to the device dialer only where supported and telephone coverage is available. Stage 1 is complete; stop here pending approval for a later stage.

## Stage 2 — Database foundation

**Status: complete, with the full Supabase local-stack check unavailable in this sandbox.** The versioned schema, synthetic fixtures, RLS boundary, pgTAP suite, data documentation, and an embedded-PostgreSQL smoke path are present. No emergency workflow or application database integration was added.

### Delivered

The migration `supabase/migrations/20261026135100_stage2_database_foundation.sql` creates all nine requested tables plus normalized `team_zone_coverage`, with UUID identifiers, timezone-aware timestamps, foreign keys, indexes, check constraints, and the exact ten requested `incident_status` values. Reporter names and contact channels are kept in the separate `reporter_contacts` table. Incidents carry constrained location provenance/coordinate/accuracy/landmark/zone/capture-time fields; assignments require a deadline after assignment; public idempotency and tracking values have only optional 32-byte SHA-256 digest columns. No raw token columns exist.

RLS is enabled on all ten tables. Browser-role schema/table privileges are revoked and no anonymous or authenticated policies are defined; only the backend-only `service_role` has the listed table DML grants. Local Auth sign-up and anonymous sign-in are disabled. There are no public staff-registration pages, staff seed accounts, synthetic memberships, reporter contact fixtures, or staffed assignments. Secure account provisioning is described separately in `docs/database-setup.md`.

`supabase/seed.sql` is deterministic and conflict-safe: five labelled fictional zones, three fictional capability-bearing teams, six normalized service-zone links, three fictional synthetic incidents and event rows, and one non-secret demo label. No fixture includes real-world coordinates. `supabase/tests/database_foundation.test.sql` contains Supabase pgTAP checks. The text ERD is in `docs/entity-relationship.md`; the field and enum reference is in `docs/data-dictionary.md`; local CLI and staff-provisioning instructions are in `docs/database-setup.md` and linked from `README.md`.

### Checks actually run

- `pnpm install` — passed after pinning Supabase CLI `2.122.0` and PGlite `0.5.11` in the root lockfile.
- `pnpm db:smoke` — passed on a fresh embedded PostgreSQL `18.6` database. The harness stubs only Supabase roles and `auth.users`, applies the actual migration and seed, runs the seed a second time, verifies the exact incident-state set, all-ten-table RLS, no direct client policies, anonymous/authenticated denial for incidents and reporter contacts, fictional fixture counts and no seeded PII, and rejection of invalid states/foreign keys.
- `pnpm check` — passed after Stage 2 changes: ESLint, Prettier, TypeScript checks, all 16 shared/API/UI Vitest tests, the embedded PostgreSQL smoke, and production builds.
- After restarting the development service, `pnpm health:check` passed; direct and Vite-proxied health responses were secret-free, `/manus-routes.json` matched the seven source routes, and all seven page paths returned the app shell. `pnpm e2e` passed again with one Playwright test for the safety boundary, API proxy, and placeholder navigation.
- Credential audit — only `.env.example` files were present; no tracked credential-pattern matches were found. Supabase CLI temporary state is ignored; the versioned service lock contains service/version/checksum metadata, not project secrets.

### Supabase runtime limitation

The full local Supabase CLI test could not be executed here. `pnpm db:start` failed before starting services with `Owner response unavailable` / `owner: unavailable`; a read-only status check showed no services or database endpoints/processes. Docker and Podman are absent. The project was not linked to a hosted Supabase instance, and no remote database was contacted. Thus `pnpm db:test`, `pnpm db:reset`, and the CLI's standalone `pnpm db:seed` were not run against full Supabase. The PGlite smoke verifies the actual PostgreSQL migration and SQL-level role/grant behavior, but is not an emulator for Supabase Auth (GoTrue), PostgREST, or hosted configuration. Run the commands in `docs/database-setup.md` on a supported local Supabase runtime for full pgTAP verification.

### Acceptance and stage boundary

- Migrations work against a clean embedded PostgreSQL database with the Supabase Auth relation and roles stubbed: **passed**.
- Seeds can be rerun safely: **passed**; a second application produced unchanged fixture counts.
- Invalid foreign keys and invalid incident states are rejected: **passed** with their expected PostgreSQL error classes.
- Anonymous clients cannot list incidents or reporter contacts: **passed** through missing-grant checks and direct role queries; authenticated direct listing is denied as well.
- No credentials are committed: **passed** by the Git status, ignore, and tracked-pattern audit.

This stage stops at the schema, synthetic seed, access boundary, and supporting documentation. It does not add report submission, tracking, staff authentication, dispatch, maps, realtime, external emergency-service integration, or live operational data. Continue only after approval for a later stage.

## Stage 3 — Authentication and authorization

**Status: implementation and code-level checks complete; a real Supabase Auth project was not configured.** This stage adds staff authentication and role boundaries only; it does not implement public emergency-report submission, dispatch, or live operations.

### Delivered

The migration `supabase/migrations/20261026142900_stage3_staff_auth_rls.sql` adds server-controlled profile activation and explicit reporter-contact permission, role/team/incident-scoped RLS, admin-only configuration/staff access, and narrowly guarded staff-management RPCs. Direct client writes cannot change profile roles or team membership, and the RPCs reject self-targeting. Operators can read operational incidents; responders can read incidents tied to their active team assignment; administrator status alone does not grant incident access. Reporter-contact access requires both explicit permission and access to the related incident.

The frontend uses Supabase Auth email/password login, session refresh, logout, and one-time invitation password setup. Public self-registration is absent and disabled in local Auth configuration. Routes and navigation show only the authenticated role's workspace. The API verifies access tokens with Supabase Auth `getUser`, resolves role/permission from trusted `profiles`, uses user-scoped tokens for ordinary RLS reads, and returns the common 401/403 error envelope. Administrator invitation and profile bootstrap require an API-only secret key and a fixed allowlisted redirect; self-targeting updates are denied. `.env.example` names distinguish browser-safe publishable settings from the API-only secret.

`docs/authentication.md` documents the trusted-role model and administrator-controlled provisioning. The Stage 2 data dictionary and text ERD now include the Stage 3 profile fields and authorization boundary. Vite exposes only the browser-safe public env prefix; `scripts/check-browser-secret-bundle.mjs` injects harmless server-only sentinels and scans production output.

### Checks actually run

- `pnpm check` — passed: ESLint, Prettier, strict TypeScript checks, 3 shared-contract tests, 16 API tests, 16 frontend tests, the embedded database smoke, shared/API/web production builds, and the browser-secret sentinel build scan.
- `pnpm db:smoke` — passed on fresh embedded PostgreSQL 18.6 with Supabase role/Auth stubs. It applies all migrations and the repeatable seed, then checks role/team/contact RLS, administrator RPC restrictions, self-change prevention, invalid state/FK rejection, and fictional fixture boundaries.
- `pnpm e2e` — passed: 2 Playwright Chromium tests for the persistent safety boundary, public navigation, proxied health endpoint, report placeholder, protected direct staff URLs, and no self-registration.
- Live local checks — `GET /api/health` returned 200; no-token `/api/auth/me`, `/api/staff/incidents`, and `/api/admin/staff` returned 401 with the common request-ID error envelope. `GET /manus-routes.json` returned HTTP 200 and exactly eight routes, including `/staff/accept-invite`.
- Credential audit — no local `.env` file or tracked key-like credential value found. The frontend bundle sentinel scan passed; the backend logs only listener information and do not log tokens or provider errors.

### Supabase verification boundary and manual setup

No hosted Supabase URL, keys, SMTP provider, or real staff identity was supplied or used. The Supabase CLI native stack could not start in this sandbox (`owner: unavailable` and no services); Docker and Podman are absent. `pnpm db:test` against full Supabase, GoTrue login/invitations, and PostgREST JWT/RLS integration therefore remain unverified here. The PGlite smoke uses the real PostgreSQL migration/seed SQL and checks SQL-level RLS under role/auth stubs; it is not a Supabase service emulator. API/frontend Auth tests use controlled test doubles. No real invitations were sent and no remote project was contacted.

For manual integration on a supported local Supabase runtime, follow `docs/database-setup.md` and `docs/authentication.md`: install dependencies, start/reset the local stack, run `pnpm db:test`, configure the browser-safe URL/publishable key in the web app and API, keep `SUPABASE_SECRET_KEY` only in the API environment, set the exact invitation redirect, then provision the initial administrator through a trusted process and exercise each role. The provided unauthenticated health endpoint remains available without any Supabase configuration.

### Acceptance and stage boundary

- Each role can reach only its intended screens and APIs: **passed in frontend/API tests and embedded RLS checks**. A real Supabase Auth identity was not available.
- Hiding a frontend button is not the only security control: **passed by server role middleware and direct SQL RLS/privilege tests**.
- Missing tokens return 401; authenticated but unauthorized requests return 403: **passed in API tests**.
- Responders cannot access another team's incidents: **passed in the embedded PostgreSQL policy tests**.
- Users cannot promote themselves or change their own team membership: **passed in API and SQL policy/RPC tests**.
- Privileged keys never appear in the browser bundle or logs: **passed by the sentinel build scan, API logging inspection, and credential audit; no real key was configured**.

Stage 3 stops with sign-in, logout, role-aware routes, backend authorization, RLS, staff provisioning controls, and test/docs foundation. No public self-registration or emergency workflow is added.
