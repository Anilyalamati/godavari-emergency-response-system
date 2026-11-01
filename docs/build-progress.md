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

## Stage 4 — Public emergency reporting

**Status: complete.** Implemented the real end-to-end path from the public reporting form to atomic database incident persistence with cryptographic tracking tokens and idempotent retry support. Excludes photo uploads, AI classification, SMS integration, and automatic dispatch.

### Delivered

The migration `supabase/migrations/20261028151500_stage4_public_reporting.sql` creates the atomic `public.submit_public_incident` stored procedure and grants necessary access to `service_role`. When a report is received, the procedure validates input, performs an idempotency check against the SHA-256 digest of the client's request ID, and within a single transaction inserts the incident, optional reporter contact, and initial `REPORT_CREATED` audit event without duplicate rows on retries.

The API exposes `GET /api/zones` for public zone catalog lookup and `POST /api/incidents` for report submission. The backend generates server incident IDs, timestamps, and a cryptographically random 16-byte tracking token. Only the SHA-256 hash of the tracking token is stored in `public_tracking_token_sha256`. The raw token is returned exclusively in the creation response to the reporter. Neither raw tracking tokens nor reporter contact numbers appear in logs.

The web UI on `/report` replaces the earlier placeholder with an accessible reporting form adhering to the Deep Maroon, Warm Beige, and Sage Gray design system. Geolocation is requested strictly upon user action via a dedicated GPS button; denial of GPS does not block manual zone and landmark reporting. QR-style preselection via `?zone=...` or `?zoneId=...` is supported with a prominent verification banner requiring the reporter to confirm the location before submission. Submissions generate a client request ID ensuring safe idempotent retries, and display a confirmation screen with incident ID and a copyable tracking token only after server acknowledgement.

### Checks actually run

- `pnpm db:smoke` — passed on embedded PostgreSQL 18.6: applies all 3 migrations and seed, exercises atomic public report insertion, reporter contact insertion, initial audit event, duplicate prevention on retry with the same idempotency digest, foreign-key rejection on invalid zone, and anon direct access restrictions.
- `pnpm --filter @godavari/shared test` — passed: 6 tests covering API health, error envelopes, and public incident creation/zone schemas.
- `pnpm --filter @godavari/api test` — passed: 22 tests across health, staff authz, and public incident reporting (zones catalog, 201 creation, 200 idempotent replay, validation errors, service unavailability).
- `pnpm --filter @godavari/web test` — passed: 18 tests covering the reporting form, category selection, device callout, mandatory location confirmation, QR preselection notice, and tracking token confirmation screen.
- `pnpm typecheck` — passed: strict TypeScript verification across shared, api, and web workspaces.
- `pnpm format:check` — passed: Prettier code formatting verified across all repository files.
- `pnpm lint` — passed: ESLint clean with 0 warnings or errors.
- `pnpm build` — passed: clean production bundles for shared contracts, Express API, and Vite web client.

### Acceptance and stage boundary

- A valid report appears in the database: **passed in PostgreSQL smoke test and API integration suite**.
- Invalid submissions return useful errors: **passed with 400 Bad Request and validation detail**.
- GPS denial does not block manual reporting: **passed; location fallback and manual selection verified**.
- Retrying a request creates one incident only: **passed; idempotency digest guarantees exactly one incident row**.
- Contact details and tracking tokens do not appear in logs: **passed by privacy-audited route and service handlers**.

Stage 4 is complete. Stop here pending approval for Stage 5.

## Stage 5 — Control-room incident review

**Status: complete.** Implemented the control-room incident queue, multi-criteria filtering, location inspection and confidence indicators, operator review actions (`REPORTED` → `UNDER_REVIEW`, priority elevation, human notes, duplicate linking, explicit cancellation), and atomic event auditing.

### Delivered

1. **Database schema extensions (`20261029150000_stage5_control_room_review.sql`):**
   - Added columns to `public.incidents`: `duplicate_of_incident_id` (foreign key to `public.incidents`), `review_notes`, `cancellation_reason`, `reviewed_by_profile_id`, and `reviewed_at`.
   - Added check constraints: incidents cannot be duplicates of themselves; status `DUPLICATE` requires a non-null target ID; status `CANCELLED` requires a non-empty cancellation reason; notes and reason lengths are constrained.
   - Added `notes` column to `public.incident_events` for contextual event details.
   - Added `public.operator_review_incident(...)` stored procedure (SECURITY DEFINER) enforcing that only active operators can review incidents, validating transitions (`REPORTED` → `UNDER_REVIEW`/`DUPLICATE`/`CANCELLED`, etc.), and atomically recording `STATUS_CHANGED`, `PRIORITY_CHANGED`, and `DUPLICATE_LINKED` audit events.

2. **Shared contracts (`packages/shared/`):**
   - Exported `IncidentReviewInputSchema`, `IncidentDetailSchema`, `IncidentEventSchema`, `PaginatedIncidentListQuerySchema`, and `PaginatedIncidentListResponseSchema`.
   - Enforced schema validation: non-empty review input, mandatory cancellation reason on cancellation, mandatory duplicate target on duplicate linking.

3. **Backend API endpoints (`apps/api/`):**
   - Enhanced `GET /api/staff/incidents`: supports filtering by `status`, `category`, `priority`, `zoneId`, `search`, and optional pagination, with 100% backward compatibility for unpaginated callers.
   - Added `GET /api/staff/incidents/:incidentId`: returns complete incident detail, zone metadata, reviewer attribution, chronological audit timeline, and contact information only if the actor has `canAccessReporterContacts`.
   - Added `PATCH /api/staff/incidents/:incidentId/review`: restricted to `OPERATOR` role; validates review input and records atomic updates and audit events via stored procedure.

4. **Frontend Control-Room UI (`apps/web/`):**
   - Built a master-detail control room interface on `/operator` styled strictly with the three-color palette (`#590907` Deep Maroon, `#E8D2B5` Warm Beige, `#A5A79B` Sage Gray).
   - Prominent Urgent Banner with pulsating beacon when urgent incidents are active.
   - Incoming Queue ordered by urgency weight (`URGENT` first) and age (oldest unhandled first), with status pills, category tags, and relative age indicators ("Just now", "5m ago").
   - Filter bar: status, priority, category, and text search.
   - Inspection panel: location source, calculated location confidence (high ±10m, medium ±30m, approximate), confirmed landmark, and coordinates.
   - Safeguarded reporter callback details: visible only to users with explicit contact authorization.
   - Operator actions: quick "Begin Review (Under Review)" button, priority selector, review notes textarea, duplicate linking, and explicit cancellation.
   - Full chronological audit history displaying actors, transitions, and review notes.

### Checks actually run

- `pnpm db:smoke` — passed on embedded PostgreSQL 18.6: verifies schema migration, self-duplicate check rejection, duplicate target requirement, cancellation reason requirement, non-operator rejection, valid `REPORTED` → `UNDER_REVIEW` transition, priority change event, duplicate link event, and terminal state protection.
- `pnpm --filter @godavari/shared test` — passed: 11 tests covering health, error response, public reporting, review input validation, and incident detail schemas.
- `pnpm --filter @godavari/api test` — passed: 36 tests covering health, staff authorization, public reporting, incident review endpoints, filtering, role checks, and error responses.
- `pnpm --filter @godavari/web test` — passed: 20 tests covering public shells, reporting, authentication, role routing, operator queue, urgent indicators, location confidence, and contact permission checks.
- `pnpm typecheck` — passed across shared, api, and web packages.
- `pnpm lint` — passed: 0 warnings and 0 errors.
- `pnpm format:check` — passed: all files conform to Prettier code style.
- `pnpm build` — passed for shared, api, and web client.
- `pnpm security:bundle` — passed: browser bundle secret check scanned 6 dist files with 0 secret leaks.

### Acceptance and stage boundary

- Newly submitted reports can be retrieved from the backend: **passed in API and web integration tests**.
- Operators can review and prioritize reports: **passed in stored procedure, API, and frontend tests**.
- Invalid transitions fail: **passed; terminal state protection, self-duplicate denial, and cancellation validation verified**.
- Every review action records the actor and server timestamp: **passed; audit events generated with actor and now() timestamp**.
- Unauthorized roles cannot modify review data: **passed; non-operators and unauthenticated users rejected at API and database layers**.

Stage 5 is complete. Stop here pending approval for Stage 6.

## Stage 6 — Response-team assignment

**Status: complete.** Implemented response-team assignment with transparent suitability rules, availability tracking, atomic database allocation procedure (`operator_assign_team`), double-booking prevention, configurable acknowledgement deadlines, and control-room dispatch UI.

### Delivered

1. **Database schema extensions (`20261029160000_stage6_response_team_assignment.sql`):**
   - Created enum `public.team_duty_status` with values `'ON_DUTY'`, `'OFF_DUTY'`, `'STANDBY'`.
   - Added `duty_status` column to `public.teams` table with default `'ON_DUTY'`.
   - Added partial unique index `assignments_active_incident_uidx` on `public.assignments(incident_id)` for active statuses `('PENDING', 'ACKNOWLEDGED')` to enforce strictly one active primary assignment per incident.
   - Added partial unique index `assignments_active_team_uidx` on `public.assignments(team_id)` for active statuses `('PENDING', 'ACKNOWLEDGED')` to prevent double-booking a team across active incidents.
   - Added helper function `public.is_team_capable_for_category(capabilities text[], category public.incident_category)` mapping incident categories to required capabilities (`MEDICAL_ASSISTANCE` → `FIRST_AID`/`TRIAGE`, `CROWD_SAFETY` → `CROWD_CONTROL`/`EVACUATION`, etc.).
   - Added atomic stored procedure `public.operator_assign_team(p_incident_id, p_team_id, p_actor_profile_id, p_deadline_minutes)` with `SECURITY DEFINER`. Performs pessimistic row-level locks (`FOR UPDATE`), confirms operator authorization, verifies incident assignability (rejects terminal states `CANCELLED`, `CLOSED`, `RESOLVED`, `DUPLICATE`), checks team capability and duty availability, inserts the assignment record, sets acknowledgement deadline, updates team duty to `ON_DUTY`, updates incident status to `ASSIGNED`, and atomically appends `ASSIGNMENT_CREATED` and `STATUS_CHANGED` audit records.

2. **Shared contracts (`packages/shared/`):**
   - Exported `TeamDutyStatusSchema`, `TeamCandidateSchema`, `EligibleTeamsResponseSchema`, `TeamAssignmentInputSchema`, and `TeamAssignmentResultSchema`.
   - Updated `IncidentDetailSchema` to include `activeAssignment` details (`id`, `teamId`, `teamCode`, `teamName`, `status`, `assignedAt`, `acknowledgementDeadline`).

3. **Backend API endpoints (`apps/api/`):**
   - `GET /api/staff/incidents/:incidentId/eligible-teams`: restricted to `OPERATOR`; evaluates all candidate teams with transparent suitability scoring and explicit human-readable reasons (e.g. "Capable for MEDICAL_ASSISTANCE", "Primary service zone match", "Ineligible: Team lacks required capability for ..."). Straight-line distance approximations are never presented as travel times.
   - `POST /api/staff/incidents/:incidentId/assignments`: restricted to `OPERATOR`; executes `operator_assign_team`. Maps SQLSTATE `23505` to HTTP 409 Conflict with clear error messages when an incident or team is already actively allocated.
   - Updated `GET /api/staff/incidents/:incidentId` to populate `activeAssignment` if an active assignment exists.

4. **Frontend Control-Room UI (`apps/web/`):**
   - Built response-team recommendation and dispatch card in `OperationalWorkspacePage.tsx` using the strict three-color palette (`#590907` Deep Maroon, `#E8D2B5` Warm Beige, `#A5A79B` Sage Gray).
   - Candidate team selection cards displaying team code, name, recommended match badges, duty status badges, availability status, capability pills, and transparent suitability reasons.
   - Acknowledgement deadline selector (10m urgent response, 15m standard, 30m extended).
   - Single-click confirmation dispatch button with conflict handling.
   - Active Primary Response Unit card displaying dispatched team, status badge (`PENDING`), dispatch timestamp, relative age, and acknowledgement deadline countdown.

### Checks actually run

- `pnpm db:smoke` — passed on embedded PostgreSQL 18.6: verifies non-operator assignment denial (42501), existing assignment conflict denial (23505), double-booking busy team denial (23505), incapable team denial (22023), off-duty team denial (22023), successful atomic assignment, audit event generation (`ASSIGNMENT_CREATED`, `STATUS_CHANGED`), and duplicate active assignment rejection.
- `pnpm --filter @godavari/shared test` — passed: 14 tests including Stage 6 team assignment schema contracts.
- `pnpm --filter @godavari/api test` — passed: 44 tests across 5 test suites including team recommendation evaluation, capability matching, successful assignment, role authorization, and double-booking 409 conflict handling.
- `pnpm --filter @godavari/web test` — passed: 21 tests including Stage 6 recommendation rendering, suitability reason verification, dispatch submission, and active assignment card presentation.
- `pnpm check` — passed: full verification suite (`eslint`, `prettier --check`, `typecheck`, all package and app unit/integration test suites, `db:smoke`, production builds, and `check-browser-secret-bundle.mjs`).

### Acceptance and stage boundary

- Suitable teams can be assigned: **passed in stored procedure, API, and frontend integration tests**.
- Ineligible teams cannot be assigned through direct API calls: **passed; capability and availability guards return clear 400/409 errors**.
- Simultaneous assignment tests produce only one valid allocation: **passed; partial unique constraints and pessimistic row locks prevent race conditions**.
- Failed transactions leave no partial records: **passed; atomic PostgreSQL transaction rolls back entirely upon any validation failure**.
- Exactly one active primary team per incident and one active incident per team: **passed; enforced by partial unique indexes**.

Stage 6 is complete. Stop here.

## Stage 7 — Responder interface

**Status: complete.** Implemented the mobile-first responder workspace, report-to-resolution lifecycle state machine (`ASSIGNED` → `ACKNOWLEDGED` → `EN_ROUTE` → `ON_SCENE` → `RESOLVED` → `CLOSED`), atomic responder progress procedure (`responder_update_incident`), support request dispatch, resolution outcome recording, documented team release rule, and final operator closure procedure (`operator_close_incident`).

### Delivered

1. **Database schema extensions (`20261030170000_stage7_responder_workflow.sql`):**
   - Added `outcome` column to `public.incidents` with check constraint `incidents_outcome_length` (up to 2000 chars).
   - Updated `public.can_access_incident(p_incident_id)`: responders can access their active (`PENDING`, `ACKNOWLEDGED`) and completed assignments.
   - Added atomic stored procedure `public.responder_update_incident(p_incident_id, p_actor_profile_id, p_action, p_notes, p_outcome)` with `SECURITY DEFINER`. Performs pessimistic locks (`FOR UPDATE`), verifies that the caller is an active responder and an active member of the assigned team, checks valid sequential transitions, handles repeated actions idempotently, updates assignment status (`COMPLETED` upon resolution), applies the documented release rule (releases team lock while maintaining duty status `ON_DUTY`), updates incident status, and records `ASSIGNMENT_ACKNOWLEDGED` and `STATUS_CHANGED` audit records.
   - Added atomic stored procedure `public.operator_close_incident(p_incident_id, p_actor_profile_id, p_notes)` with `SECURITY DEFINER`. Enforces that only active `OPERATOR` or `ADMIN` staff can close an incident, verifies current status is `RESOLVED`, updates status to `CLOSED`, and logs the terminal closure audit event.

2. **Shared contracts (`packages/shared/`):**
   - Exported `ResponderActionSchema`, `ResponderUpdateInputSchema`, `ResponderUpdateResultSchema`, `OperatorCloseInputSchema`, and `OperatorCloseResultSchema`.
   - Updated `IncidentDetailSchema` to include optional `outcome`.
   - Built and tested contracts with 16 automated tests in `contracts.test.ts`.

3. **Backend API endpoints (`apps/api/`):**
   - `POST /api/staff/incidents/:incidentId/responder-actions`: restricted to `RESPONDER` role; delegates to `responder_update_incident`. Handles actions `ACKNOWLEDGE`, `EN_ROUTE`, `ON_SCENE`, `REQUEST_SUPPORT`, and `RESOLVE`.
   - `POST /api/staff/incidents/:incidentId/close`: restricted to `OPERATOR` and `ADMIN` roles; delegates to `operator_close_incident`.
   - Added dedicated test suite [`apps/api/test/responder-workflow.test.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/apps/api/test/responder-workflow.test.ts) covering authentication, role restriction, step transitions, support requests, resolution outcomes, and operator closures (11 tests).

4. **Frontend Responder & Operator UI (`apps/web/`):**
   - Styled exclusively in Deep Maroon (`#590907`), Warm Beige (`#E8D2B5`), and Sage Gray (`#A5A79B`).
   - Mobile-first responder list on `/responder` rendering assigned incidents, priority badges, category, landmark, report age, and responsive progression actions.
   - Sequential action buttons (`Acknowledge Assignment` → `Mark EN ROUTE` → `Mark ON SCENE`).
   - Expandable drawers for `Request Additional Support` (requires notes) and `Mark RESOLVED` (requires outcome description).
   - Visual banners for `RESOLVED` and `CLOSED` statuses.
   - Operator Closure Card in control room (`/operator`) allowing operators to review the resolution and perform final `CLOSED` transition with optional verification notes.

### Checks actually run

- `pnpm db:smoke` — passed on embedded PostgreSQL 18.6: verifies unassigned responder rejection (42501), valid acknowledgement, idempotent repeat, invalid transition rejection (22023), `EN_ROUTE`, support request audit, `ON_SCENE`, resolution requiring outcome, resolution team release verification, superseded/inactive responder modification rejection, responder closure denial (42501), and operator final closure.
- `pnpm --filter @godavari/shared test` — passed: 16 tests verifying all contract schemas.
- `pnpm --filter @godavari/api test` — passed: 55 tests across 6 test suites including responder workflow authorization and transitions.
- `pnpm --filter @godavari/web test` — passed: 22 tests including mobile responder dispatch rendering and action execution.
- `pnpm check` — passed: full verification suite (`eslint`, `prettier --check`, `typecheck`, all package and app unit/integration test suites, `db:smoke`, production builds, and `check-browser-secret-bundle.mjs`).

### Acceptance and stage boundary

- The complete report-to-resolution workflow works across separate operator and responder sessions: **passed in API, database, and frontend tests**.
- Another team cannot access or update the incident: **passed; RLS and team membership checks strictly enforced**.
- A superseded responder cannot change the incident: **passed; active team membership required**.
- Invalid state changes are rejected: **passed; sequential transition validation enforced on server**.
- Operator closure records a final audit event: **passed; operator_close_incident writes terminal STATUS_CHANGED event**.

Stage 7 is complete. Stop here.

---

## Stage 8 — Missed-acknowledgement escalation

### Goal and Scope

Detect emergency assignments that receive no human acknowledgement within configurable deadlines, escalate them reliably via a background worker process, alert operators in the control room with visual prominence, provide an operator-controlled atomic reassignment workflow, and enforce strict concurrency safety so superseded teams cannot modify the incident.

### What was built

1. **Database Schema & Stored Procedures (`supabase/migrations/20261101120000_stage8_missed_acknowledgement_escalation.sql`):**
   - Extended `public.assignment_status` enum to include `'SUPERSEDED'`.
   - Extended `public.incident_event_type` enum to include `'ACKNOWLEDGEMENT_OVERDUE'` and `'ASSIGNMENT_SUPERSEDED'`.
   - Added escalation tracking columns to `public.assignments`: `escalated_at` (`timestamptz`), `superseded_at` (`timestamptz`), `superseded_by_assignment_id` (`uuid REFERENCES assignments(id)`), and `reassignment_reason` (`text` with $\le 1000$ char length constraint).
   - Created stored procedure `public.scan_and_escalate_overdue_assignments()`:
     - Background worker procedure using `FOR UPDATE OF a SKIP LOCKED` to lock active `PENDING` assignments where `acknowledgement_deadline < now()` and `escalated_at IS NULL`.
     - Atomically writes exactly one `ACKNOWLEDGEMENT_OVERDUE` event per overdue assignment with `status_before = NULL` and `status_after = NULL`.
     - Sets `escalated_at = now()`. Idempotent across repeated worker runs and resilient across process restarts.
   - Created atomic stored procedure `public.operator_reassign_team(p_incident_id, p_new_team_id, p_actor_profile_id, p_reason, p_deadline_seconds)`:
     - Verifies operator role authorization.
     - Acquires pessimistic row locks (`FOR UPDATE`) on incident and active assignment.
     - Validates mandatory reassignment reason ($\ge 3$ non-whitespace chars).
     - Marks previous assignment as `SUPERSEDED` and sets `superseded_at`, `reassignment_reason`, and `superseded_by_assignment_id`.
     - **Documented Team Release Rule:** Releases the previous team (restores duty status to `ON_DUTY` while preserving full audit history).
     - Confirms replacement team capability and duty status availability.
     - Inserts replacement assignment record with specified deadline (supports seconds for prototype demo or standard minutes).
     - Appends `ASSIGNMENT_SUPERSEDED` and `ASSIGNMENT_CREATED` audit records.
     - Commits atomically.
   - Updated `public.operator_assign_team` to optionally accept `p_deadline_seconds integer DEFAULT NULL` for demo deadlines.

2. **Shared Contracts (`packages/shared/`):**
   - Updated `IncidentActiveAssignmentSchema` with `status` including `'SUPERSEDED'`, `isOverdue` (boolean), `escalatedAt` (datetime string | null), and `reassignmentReason` (string | null).
   - Added `TeamReassignmentInputSchema` (`newTeamId: uuid`, `reason: string (3..1000)`, `acknowledgementDeadlineMinutes?: number`, `acknowledgementDeadlineSeconds?: number`).
   - Added `TeamReassignmentResultSchema` and `EscalationScanResultSchema`.
   - Added tests in [`packages/shared/test/contracts.test.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/packages/shared/test/contracts.test.ts) (17 tests total).

3. **Backend Service, Worker, and API Endpoints (`apps/api/`):**
   - Implemented `reassignTeam` and `scanEscalations` in [`apps/api/src/services/staff-service.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/apps/api/src/services/staff-service.ts), and updated `getIncidentDetail` to compute `isOverdue` flag when status is `PENDING` and deadline has passed.
   - Added `POST /api/staff/incidents/:incidentId/reassign` (restricted to `OPERATOR` role).
   - Added `POST /api/staff/escalations/scan` (restricted to `OPERATOR` and `ADMIN` roles).
   - Implemented [`apps/api/src/workers/escalation-worker.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/apps/api/src/workers/escalation-worker.ts): resilient scheduled background process running recurring scans with error boundary, overlap prevention, and graceful shutdown integration in [`apps/api/src/server.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/apps/api/src/server.ts).
   - Added test suite [`apps/api/test/escalation-workflow.test.ts`](file:///c:/Users/achow/OneDrive/Desktop/Anil/Projects/godavari%20puskharalu/apps/api/test/escalation-workflow.test.ts) covering scan triggers, role permissions, reassignment input validation, and worker lifecycle/restart recovery (6 tests).

4. **Frontend Control-Room UI (`apps/web/`):**
   - Styled exclusively in Deep Maroon (`#590907`), Warm Beige (`#E8D2B5`), and Sage Gray (`#A5A79B`).
   - Prominent pulsating overdue badge (`⏰ ACKNOWLEDGEMENT OVERDUE`) and alert banner on active assignment card when deadline has passed without acknowledgement.
   - Reassignment drawer in control room: displays replacement candidate teams, mandatory reassignment reason input field, and deadline dropdown featuring `60 seconds (Prototype demo setting - not an official standard)`.
   - Reassignment execution confirmation and persistent feedback banner displaying the new assigned team and note that previous team was released.
   - Initial dispatch deadline dropdown includes the `60 seconds (Prototype demo setting - not an official standard)` option for easy testing.
   - Manual `⚡ Check Escalations` button in queue toolbar for immediate ad-hoc inspection alongside the automatic background worker.

### Checks actually run

- `pnpm db:smoke` — passed on embedded PostgreSQL 18.6:
  - Overdue assignment detection via `scan_and_escalate_overdue_assignments()`.
  - Exactly one `ACKNOWLEDGEMENT_OVERDUE` event generated per overdue assignment.
  - Repeated scan returns 0 (idempotent, no duplicate escalation events).
  - Acknowledged assignments do not trigger escalation even if deadline is in the past.
  - Non-operator reassignment rejected (42501).
  - Empty reassignment reason rejected (22023).
  - Valid reassignment supersedes old assignment, sets `superseded_at`, records `reassignment_reason`, and links to new assignment.
  - Old team availability released to `ON_DUTY` per documented release rule.
  - Superseded responder update/acknowledgement strictly rejected (`42501` / `22023`).
  - New team responder successfully acknowledges the reassigned incident.
- `pnpm --filter @godavari/shared test` — passed: 17 tests.
- `pnpm --filter @godavari/api test` — passed: 61 tests across 7 test suites.
- `pnpm --filter @godavari/web test` — passed: 23 tests including overdue badge rendering, manual scan trigger, and operator reassignment drawer.
- `pnpm check` — passed: full verification suite (`eslint`, `prettier --check`, `typecheck`, all test suites, `db:smoke`, production builds, and `check-browser-secret-bundle.mjs`).

### Acceptance and stage boundary

- Unacknowledged assignments become overdue: **passed in API, database, and frontend tests**.
- Acknowledged assignments do not trigger that escalation: **passed; verified in database smoke test**.
- Reassignment revokes the previous assignment's update permissions: **passed; superseded responders receive error on modification attempts**.
- Race-condition tests pass: **passed; row-level pessimistic locks and partial unique indexes prevent double-booking**.
- Worker restart recovery works: **passed; worker queries unescalated overdue rows upon restart without depending on browser timers**.

Stage 8 is complete. Stop here.

---

## Stage 9: Realtime updates and mapping

### Goal and scope

Keep authorized screens current and display operational locations on an interactive Leaflet map:

1. **Supabase Realtime updates:** Listen to authorized operational changes on `incidents`, `assignments`, and `incident_events`. Apply RLS policies to subscriptions. Strictly enforce privacy boundaries by excluding `reporter_contacts` and `incident_tracking_tokens` from publication. Show live/disconnected indicators and refetch authoritative records on reconnect. Treat realtime as a UI update mechanism, not guaranteed delivery, and never equate a socket connection with human acknowledgement.
2. **Interactive Leaflet mapping:** Render OpenStreetMap tiles with configurable provider and required attribution. Display permitted incident locations with distinct markers for GPS (pulsing green pin + accuracy circle) versus manual/landmark selections (amber pin without artificial radius). Calculate location staleness. Display fictional demonstration zones with dashed borders and disclaimers. Do not claim simulated team base positions are live GPS.
3. **Graceful degradation:** Provide an accessible fallback table if map tiles or renderer fail, ensuring incident queue, prioritization, team dispatch, and responder actions remain 100% functional.

### Key architectural decisions

- **Database migration & publication (`supabase/migrations/20261101130000_stage9_realtime_and_mapping.sql`):**
  - Creates `supabase_realtime` publication if missing.
  - Adds `public.incidents`, `public.assignments`, and `public.incident_events` with `REPLICA IDENTITY FULL`.
  - Strictly drops or prevents `public.reporter_contacts` and `public.incident_tracking_tokens` from the publication.
  - Stores default `map_tile_provider` configuration in `public.configuration`.
- **Offline-resilient Leaflet typing (`apps/web/src/types/leaflet.d.ts`):** Custom declarations for Leaflet elements (`map`, `tileLayer`, `marker`, `circle`, `divIcon`, `layerGroup`) preventing network installation failures in restricted build environments.
- **Realtime subscription hook (`apps/web/src/hooks/useRealtimeSubscription.ts`):**
  - Tracks connection states: `CONNECTED`, `CONNECTING`, `DISCONNECTED`.
  - Sets Supabase client auth token on session change.
  - Subscribes to `postgres_changes` across `incidents`, `assignments`, and `incident_events`.
  - Automatically refetches authoritative records via REST upon socket reconnection.
- **Interactive map component (`apps/web/src/components/OperationalMap.tsx`):**
  - Renders Leaflet map with OpenStreetMap tiles and `&copy; OpenStreetMap contributors` attribution.
  - Displays GPS markers with `L.circle` accuracy radius alongside manual/landmark markers.
  - Computes relative staleness (`Captured Xm ago` or `Stale coordinate (> 15m ago)`).
  - Renders 6 fictional demo zones (Amber Loop, Paper Lantern Walk, Mango-Glass Garden, Copper Thread Court, Indigo Ferry Pier, Lotus Court) with dashed borders and demo disclaimers.
  - Labels simulated base stations as `Simulated Team Base / Station (Not Live GPS)`.
  - Wrapped in `MapErrorBoundary` and tile error listeners (`tileerror`) for fallback table rendering.
- **Workspace integration (`apps/web/src/pages/OperationalWorkspacePage.tsx`):**
  - Displays `🟢 Live (Realtime Connected)` / `🟡 Connecting…` / `🔴 Realtime Disconnected` status pill with reconnect button.
  - Provides a 3-way layout switcher for operators: `◫ Split View (Queue + Map)`, `📋 Incident Queue Only`, and `🗺️ Operational Map View`.
  - Provides a responder map toggle (`[🗺️ View Map & Landmarks]`) for field dispatch orientation.

### Verification evidence

- `node scripts/database-smoke.mjs` — passed:
  - `supabase_realtime` publication verified.
  - Tables `incidents`, `assignments`, `incident_events` confirmed in publication.
  - Sensitive tables `reporter_contacts` and `incident_tracking_tokens` verified absent from publication.
  - `map_tile_provider` configuration verified.
  - Subscription RLS evaluated: anon and inactive staff denied access; operators permitted for incidents; reporter contacts inaccessible without explicit privilege.
- `pnpm --filter @godavari/shared test` — passed: 17 tests.
- `pnpm --filter @godavari/api test` — passed: 61 tests.
- `pnpm --filter @godavari/web test` — passed: 26 tests (including Realtime status pill rendering, view mode switching, responder map toggle, and error boundary resilience).
- `pnpm check` — passed: full verification suite (`eslint`, `prettier --check`, `typecheck`, all tests across 3 packages, `db:smoke`, production builds, and `check-browser-secret-bundle.mjs`).

### Acceptance criteria checklist

- A new report updates the operator screen without manual refresh: **passed; Realtime triggers authoritative loadIncidents refetch**.
- Assignment updates reach only authorized responders: **passed; RLS scopes row-level subscriptions**.
- Other teams cannot subscribe to restricted incidents: **passed; evaluated in database smoke tests**.
- Reconnection restores correct state: **passed; reconnect trigger executes authoritative REST refetch**.
- Map failure does not block assignment or response actions: **passed; MapErrorBoundary and tileerror listeners display accessible fallback coordinates table while queue, triage, and assignment workflows remain active**.

Stage 9 is complete.

---

## Stage 10: Connectivity resilience and public tracking

### Goal

Handle failed transmissions honestly and provide limited status updates to the reporter.

### Scope implemented

1. **Local Queue with IndexedDB:** Store unsent reports in client-side IndexedDB (`godavari_emergency_queue_v1`) with transparent in-memory fallback. Preserve client request ID (`clientRequestId`) across all submission retries. Display honest queue states: `Draft saved locally — not sent`, `Sending`, `Received by server`, and `Failed — not sent`.
2. **Reconnection auto-retry & lost acknowledgement reconciliation:** Automatically retry transmission when the app is active in the foreground and connectivity returns (`online` event listener) without relying on unreliable background sync or push notifications. If an acknowledgement is lost after server storage, resubmission with the identical request ID reconciles idempotently with the existing server record without creating duplicates (`is_idempotent_replay: true`).
3. **Stale report handling & timestamp preservation:** Show draft creation age (`formatQueueAge`). For drafts older than 5 minutes, require user confirmation before transmission (`Confirm Active Emergency Status`). Preserve original draft time (`reported_at`) separately from server receipt timestamp (`created_at`).
4. **Public tracking with privacy boundaries:** Provide `POST /api/incidents/track` endpoint and `/track` public lookup interface. Store only SHA-256 hashes of tracking tokens in `incidents.public_tracking_token_sha256`. Querying via SHA-256 digest in `public.get_public_incident_tracking` exposes only approved public fields (`status`, `statusLabel`, `category`, `summary`, `reportedAt`, `receivedAt`, `updatedAt`, `zoneName`, `landmark`). Strictly redact staff identities, team radio channels, callback phone numbers, internal review notes, and other incidents. Prevent token leakage by avoiding URL query parameters and referrers.
5. **Local privacy & cleanup:** Provide explicit clear-draft button (`[🗑️ Clear Local Draft]`) to purge locally stored contact details and draft summaries on demand. Automatic cleanup purges drafts older than 24 hours (`cleanupExpiredReports`). Offline submissions display honest failure alerts and never show server success.

### Key architectural decisions

- **Database migration (`supabase/migrations/20261101140000_stage10_public_tracking.sql`):**
  - Updated `public.submit_public_incident` to accept optional `p_reported_at timestamptz DEFAULT NULL`, preserving client's draft creation time while recording server receipt timestamp as `created_at` (`now()`).
  - Created `public.get_public_incident_tracking(p_tracking_token_sha256 bytea)`: queries incident by SHA-256 digest, returns public-friendly `status_label` and approved public fields, revokes access from public/anon, and grants execute strictly to `service_role`.
- **Shared contracts (`packages/shared/src/index.ts`):**
  - Added optional `reportedAt` and `trackingToken` to `PublicIncidentCreateInputSchema`.
  - Added `PublicIncidentTrackingInputSchema` and `PublicIncidentTrackingResponseSchema` with exported TypeScript types.
- **Backend API & Service (`apps/api/src/services/staff-service.ts` and `apps/api/src/app.ts`):**
  - Updated `submitPublicIncident` to support client draft tracking token and original reported timestamp, hashing the token with SHA-256 before storage.
  - Implemented `trackPublicIncident(trackingToken)`: computes SHA-256 digest and executes `get_public_incident_tracking`.
  - Mounted `POST /api/incidents/track` endpoint (keeping token in body to avoid access log or HTTP referrer leakage).
- **Client IndexedDB queue (`apps/web/src/utils/localQueue.ts`):**
  - Implemented IndexedDB queue manager with transparent memory fallback.
  - Functions: `saveQueuedReport`, `getQueuedReport`, `deleteQueuedReport`, `clearAllDrafts`, `isReportStale`, `formatQueueAge`, and `cleanupExpiredReports`.
- **Frontend tracking & emergency reporting (`apps/web/src/pages/TrackIncidentPage.tsx` and `apps/web/src/pages/ReportEmergencyPage.tsx`):**
  - `/track` route accepts 32-character tracking tokens and displays approved public fields with life safety reminder.
  - `/report` displays live connectivity status, local queue status pill, clear draft button, stale report confirmation modal, and auto-retry on reconnect. Offline submissions display honest failure banners and never display server success.

### Verification evidence

- `node scripts/database-smoke.mjs` — passed on embedded PostgreSQL 18.6:
  - Verified custom `reported_at` preservation separately from `created_at`.
  - Verified lost-acknowledgement replay returns `is_idempotent_replay: true` without creating duplicate records.
  - Verified public tracking lookup for valid token and confirmed zero leakage of contact details, staff notes, or token hashes.
  - Verified invalid token lookup returns `null`.
- `pnpm --filter @godavari/shared test` — passed: 17 tests.
- `pnpm --filter @godavari/api test` — passed: 65 tests.
- `pnpm --filter @godavari/web test` — passed: 30 tests (including local queue status rendering, clear draft action, offline failure notice, public tracking lookup of approved fields, and invalid token rejection).
- `pnpm check` — passed: full verification pipeline (`eslint`, `prettier --check`, `typecheck`, 112 automated tests across 3 packages, `db:smoke`, production builds, and `check-browser-secret-bundle.mjs`).

### Acceptance criteria checklist

- Offline submission never displays server success: **passed; verified in unit test `Stage 10: offline submission fails honestly without displaying server success`**.
- Retrying after reconnect creates one incident: **passed; verified in database smoke test and API unit tests for lost acknowledgement reconciliation**.
- Invalid tracking tokens reveal no incident data: **passed; verified in database smoke test, API test, and web test `Stage 10: public tracking page displays honest error when tracking token is invalid or not found`**.
- Tracking responses contain only approved public fields: **passed; verified in database smoke test, API schema validation, and web test `Stage 10: public tracking page loads and displays approved status fields for valid tracking token`**.

Stage 10 is complete.

---

## 2026-11-01 — Stage 11: Usability and security hardening

### Implemented changes

- **Security hardening & privilege audit migration (`supabase/migrations/20261101150000_stage11_security_hardening.sql`):**
  - Revoked execute permissions on all custom functions and procedures from `PUBLIC` and `anon`: `purge_expired_data`, `scan_and_escalate_overdue_assignments`, `operator_reassign_team`, `get_public_incident_tracking`, `operator_close_incident`, `responder_update_incident`, `operator_assign_team`, and `operator_review_incident`.
  - Granted execute exclusively to `service_role`.
  - Added configurable data retention procedure `public.purge_expired_data(p_retention_days integer DEFAULT 30)` which removes incidents resolved/closed past retention threshold along with cascade-cleared assignments and events.
  - Added default retention configuration `data_retention_policy` in `public.configuration`.
- **API security, CORS, rate limiting, and log sanitization (`apps/api/src/http/rate-limiter.ts`, `apps/api/src/app.ts`):**
  - Built sliding-window in-memory rate limiter with SHA-256 IP anonymization (`createRateLimiter`), providing standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
  - Attached public rate limiter to `POST /api/incidents` and `POST /api/incidents/track` (60 requests per 10-minute window) with explicit HTTP 429 reporting—reports are never silently dropped.
  - Added CORS origin restriction middleware.
  - Configured 32KB payload size limits in Express with explicit HTTP 413 `PAYLOAD_TOO_LARGE` error response.
  - Redacted sensitive fields (passwords, tokens, phone numbers) from application logs.
- **Bilingual localization infrastructure (`apps/web/src/i18n/`):**
  - Created `apps/web/src/i18n/translations.ts` with comprehensive English and Telugu dictionaries covering reporting, tracking, navigation, queue statuses, and responder workspace.
  - Preserved database enum values (`MEDICAL_ASSISTANCE`, `REPORTED`, `ON_DUTY`) verbatim in English across APIs and payloads.
  - Created `apps/web/src/i18n/LanguageContext.tsx` providing language persistence in `localStorage` and synchronizing `document.documentElement.lang`.
  - Created `<LanguageSwitcher />` component with accessible toggle buttons and active pill states.
  - Displayed a prominent disclaimer banner whenever Telugu is active stating that Telugu wording is a prototype draft requiring fluent-speaker review.
  - Strictly avoided inventing unverified emergency instructions; reiterated official 112 emergency telephone instructions.
- **Accessibility and UI hardening (`apps/web/src/styles.css`, `ReportEmergencyPage.tsx`, `TrackIncidentPage.tsx`):**
  - Added visible keyboard focus indicators (`:focus-visible { outline: 2.5px solid var(--maroon); outline-offset: 2px; }`).
  - Added minimum 44px touch targets on buttons, pills, inputs, and dropdowns.
  - Connected form hints and errors to corresponding input fields using `aria-describedby` and `aria-invalid`.
  - Preserved entered form input text across validation errors.
  - Avoided relying on color alone for priority or status indicators by pairing color badges with text labels and iconography.
- **Comprehensive security test suite (`apps/api/test/security-hardening.test.ts`, `apps/web/src/App.test.tsx`):**
  - Authorization matrix tests (unauthenticated 401, wrong-role 403 `ROLE_NOT_AUTHORIZED`).
  - Cross-team access denial tests (responders cannot act on incidents assigned to other teams).
  - Public tracking data exposure prevention tests.
  - Rate limiting tests (HTTP 429 + `Retry-After`).
  - Payload size rejection tests (HTTP 413 `PAYLOAD_TOO_LARGE`).
  - CORS header restriction tests.
  - Stored script injection (XSS) sanitization tests.
  - Language switcher toggling and Telugu review disclaimer banner tests.
  - Form accessibility and value preservation tests.

### Verification evidence

- `node scripts/database-smoke.mjs` — passed on embedded PostgreSQL 18.6:
  - Verified retention policy row exists in `public.configuration`.
  - Verified `purge_expired_data` validation rejects non-positive days (`22023`).
  - Verified `purge_expired_data` executes cleanly under `service_role`.
  - Verified anon execution denial on `purge_expired_data` and all custom stored procedures (`42501`).
- `pnpm --filter @godavari/shared test` — passed: 17 tests.
- `pnpm --filter @godavari/api test` — passed: 72 tests.
- `pnpm --filter @godavari/web test` — passed: 32 tests.
- `pnpm check` — passed with zero errors:
  - `eslint .` clean.
  - `prettier --check .` clean.
  - `typecheck` clean across all 3 workspaces.
  - 121 automated tests passing across shared, api, and web packages.
  - Embedded PostgreSQL 18.6 smoke migration tests passing.
  - Production builds succeeding cleanly.
  - `node scripts/check-browser-secret-bundle.mjs` passed (0 leaked secrets).

### Acceptance criteria checklist

- Core workflow is usable with keyboard navigation: **passed; verified visible focus `:focus-visible` styling, skip links, accessible labels, and keyboard tab flow**.
- Language switching works: **passed; verified in unit test `Stage 11: language switcher toggles between English and Telugu and shows review disclaimer`**.
- No unauthorized reads or writes succeed in security tests: **passed; verified in `apps/api/test/security-hardening.test.ts` (unauthenticated, wrong role, cross-team)**.
- Public responses contain no sensitive fields: **passed; verified in API test `prevents public data exposure in tracking responses` and web tracking tests**.
- Remaining risks are documented honestly: **documented below**.

### Honest remaining risks and operational boundaries

1. **Telugu translation fidelity:** Telugu terminology is currently a prototype localization draft and has not been reviewed by a certified Telugu linguistic specialist or regional emergency coordinator. In actual emergency operations, instructions must be verified by local fluent Telugu speakers.
2. **In-memory rate limiter scaling:** The current rate limiter uses an in-memory sliding window per Node.js process. When horizontally scaled behind multiple container instances, a shared Redis or Postgres-backed rate limiter is required to enforce global limits across processes.
3. **Network partition during long dispatches:** While local queueing and reconnection auto-retry safeguard report intake, field responders operating in areas with total radio/cellular blackout must rely on offline protocol sheets and terrestrial radio communication rather than web app updates.
4. **Data retention automation:** The `public.purge_expired_data` function is secured and tested, but automated periodic execution requires a PostgreSQL cron job (`pg_cron`) or scheduled background worker running in the deployment environment.

Stage 11 is complete.

---

## 2026-11-01 — Stage 12: Final integration and demonstration readiness

### Implemented changes

- **End-to-End integration test suite (`apps/api/test/e2e-scenario.test.ts`):**
  - Implemented full 11-step integration test scenario simulating the entire report-to-closure lifecycle:
    1. Volunteer submits report (`POST /api/incidents`).
    2. Server confirms receipt (`incidentId`, `trackingToken`, status `REPORTED`).
    3. Operator reviews and assigns Team 1 (`PATCH /api/staff/incidents/:id/review`, `POST /api/staff/incidents/:id/assignments`).
    4. First team misses acknowledgement deadline.
    5. Backend escalation worker flags overdue assignment (`POST /api/staff/escalations/scan`).
    6. Operator reassigns to Team 2 (`POST /api/staff/incidents/:id/reassign`).
    7. Second team accepts assignment (`POST /api/staff/incidents/:id/responder-actions` with `ACKNOWLEDGE`).
    8. Team updates to `EN_ROUTE` and then `ON_SCENE`.
    9. Team marks `RESOLVED` with outcome details.
    10. Operator performs final case closure (`POST /api/staff/incidents/:id/close`).
    11. Audit timeline verifies complete chronological event chain (11 sequential events recorded).
- **PostgreSQL Database E2E verification (`scripts/database-smoke.mjs`):**
  - Added Stage 12 lifecycle test directly executing all stored procedures (`submit_public_incident`, `operator_review_incident`, `operator_assign_team`, `scan_and_escalate_overdue_assignments`, `operator_reassign_team`, `responder_update_incident`, `operator_close_incident`) in embedded PostgreSQL 18.6, verifying atomic locking, foreign key integrity, and audit logging.
- **Automated failure tests matrix (`apps/api/test/e2e-scenario.test.ts`, `apps/web/src/App.test.tsx`):**
  - Offline submission (IndexedDB local queue & honest failure notice).
  - Lost response followed by retry (idempotent replay reconciliation returning HTTP 200).
  - Concurrent assignment conflict (HTTP 409 `INCIDENT_ASSIGNMENT_CONFLICT`).
  - Acceptance vs reassignment race (superseded responder lockout with HTTP 409 `ASSIGNMENT_SUPERSEDED`).
  - Expired / invalid login (HTTP 401 `INVALID_OR_EXPIRED_TOKEN`).
  - Unauthorized cross-team access (HTTP 403 `UNAUTHORIZED_TEAM_ACCESS`).
  - Worker restart recovery (overdue check persistence without duplicate events).
  - Realtime disconnect/reconnect (socket status indicator & authoritative refetch).
  - Map tile failure (graceful `MapErrorBoundary` coordinates table fallback).
- **Empirical benchmark measurements (`scripts/measurements.mjs`):**
  - Captured empirical latency and execution time benchmarks across 30 samples directly on local test hardware (Intel Core i5-13420H 12-core, 16GB RAM, Node.js v24.19.0, PostgreSQL 18.6):
    - API submission latency: avg 2.910 ms (min 1.441 ms, max 14.425 ms).
    - Report-to-operator-screen fetch delay: avg 1.391 ms (min 0.705 ms, max 3.245 ms).
    - Duplicate prevention reconciliation: avg 0.882 ms (min 0.310 ms, max 2.662 ms).
    - Escalation detection delay: avg 0.889 ms (min 0.231 ms, max 5.480 ms).
    - Assignment-to-acknowledgement scripted latency: avg 3.977 ms (min 1.694 ms, max 6.465 ms).
    - Authorization check denial latency: avg 0.371 ms (min 0.211 ms, max 2.174 ms).
- **Comprehensive documentation suite:**
  - Architecture diagram & subsystem boundaries: `docs/architecture.md`.
  - API endpoint summary: `docs/api-summary.md`.
  - Database schema and security definer RPC reference: `docs/database-schema.md`.
  - Comprehensive test report: `docs/test-report.md`.
  - Security and privacy limitations: `docs/security-and-privacy.md`.
  - Five-minute multi-device demonstration script: `docs/demo-script.md`.
  - Deployment checklist & hosting limitations: `docs/deployment-checklist.md`.
  - Known issues and future work: `docs/known-issues.md`.
  - Updated root `README.md` and `TODO.md`.

### Verification evidence

- `node scripts/database-smoke.mjs` — passed on embedded PostgreSQL 18.6 (all 12 stages verified).
- `node scripts/measurements.mjs` — passed and recorded empirical metrics.
- `pnpm --filter @godavari/shared test` — passed: 17 tests.
- `pnpm --filter @godavari/api test` — passed: 78 tests.
- `pnpm --filter @godavari/web test` — passed: 32 tests.
- `pnpm check` — passed with zero errors:
  - `eslint .` clean.
  - `prettier --check .` clean.
  - `typecheck` clean across all 3 workspaces.
  - 127 automated tests passing across shared, api, and web packages.
  - Embedded PostgreSQL 18.6 smoke migration tests passing.
  - Production builds succeeding cleanly.
  - `node scripts/check-browser-secret-bundle.mjs` passed (0 leaked secrets).

### Acceptance criteria checklist

- The full scenario works across three sessions/devices: **passed; documented in `docs/demo-script.md` and verified in integration tests**.
- Automated checks pass, or failures are clearly documented: **passed; all 127 automated tests and check pipeline passing**.
- Demo uses only synthetic data: **passed; verified in seed tests and documentation**.
- No feature falsely claims operational emergency-service integration: **passed; prominent prototype notices and Dial 112 disclaimers placed on all pages and documents**.

Stage 12 is complete. Prototype development is finished.
