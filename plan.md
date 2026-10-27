# Implementation plan — Stage 1: Project foundation

## Scope and assumptions

Implement only the foundation for the Godavari Emergency Response Coordination System hackathon prototype. This stage creates a clean, runnable monorepo and placeholder UI/API. It does not implement incident reporting, assignment, tracking data, response workflow, authentication, staff/zone management, database tables, Supabase integration, realtime, maps, medical triage, or connections to emergency services. Use synthetic, explicitly labelled placeholder content only. A `tel:112` link is an alternative that hands off to the device dialer if available; this prototype cannot verify telephone coverage, route calls, or guarantee assistance. Do not create or commit credentials.

Assume Node.js 20 or newer and pnpm as the pinned package manager. Use one local command to run Vite on the platform Preview port 3000 and Express on 4000; Vite proxies `/api` to Express. Environment values are parsed with Zod at server startup and checked-in `.env.example` files contain no secrets. The health endpoint returns service status and a server-generated timestamp, never configuration or credentials. Generate request IDs on the server; do not accept a caller-supplied identifier as authoritative. Share response and schema types from `packages/shared`.

## Project structure and implementation

- `apps/web`: React + TypeScript + Vite + Tailwind CSS v4; React Router; shared page shell and responsive placeholder pages for `/`, `/report`, `/track`, `/staff/login`, `/operator`, `/responder`, and `/admin`; Vite development proxy; UI smoke tests.
- `apps/api`: Express + TypeScript; Zod-validated environment; request-ID middleware; common JSON error handler; `GET /api/health`; Supertest/Vitest API smoke tests.
- `packages/shared`: exported error/health contracts, shared response schemas, and package build output/types consumed by both apps.
- `supabase/migrations`: empty, documented placeholder for a later stage; no operational schema in Stage 1.
- `docs`: build-progress notes and future architecture documentation as needed.
- Root workspace: pnpm workspace, pinned toolchain, shared lint/format/typecheck/test/build scripts, `.gitignore`, lockfile, and exact local setup commands in `README.md`. Include app-specific `.env.example` files and never include actual `.env` files.

Run the frontend on `0.0.0.0:3000` for Preview and the API on `0.0.0.0:4000`; the browser uses relative `/api` requests through Vite. The API has a configurable `PORT`, defaulting to 4000. Keep browser code free of server secrets. Use explicit source and test boundaries so this foundation can grow without introducing service layers or infrastructure not required in Stage 1.

## Design direction

Three possible styles: **Civic field-notes** (0.08), a warm paper editorial interface with disciplined wayfinding; **Night-shift console** (0.05), a dark high-contrast command display; **Pilgrim's atlas** (0.03), a restrained cartographic visual language. Choose **Civic field-notes**.

- **Design Movement:** Contemporary civic editorial design, borrowing from well-printed public-service field guides rather than military command software.
- **Core Principles:** Clear hierarchy before decoration; calm high-contrast text; visible safety boundaries; responsive wayfinding that works without a mouse.
- **Color Philosophy:** Warm chalk backgrounds and ink-dark text make the interface approachable; deep river teal signals the prototype identity; muted saffron highlights navigational emphasis without implying urgency or medical priority; red is reserved for the safety disclaimer and never for a fabricated incident.
- **Layout Paradigm:** An editorial masthead, narrow persistent safety rail, and asymmetric content column; a compact row of route links becomes a keyboard-friendly wrap/scroll navigation on small screens. No dashboard metrics or fake reports.
- **Signature Elements:** An abstract three-current monogram (purely geometric, not a real map); numbered route markers; fine rule lines and small mono labels like a printed guide.
- **Interaction Philosophy:** Real links and buttons, visible focus rings, generous touch targets, explicit page titles and short explanatory copy. Placeholder pages do not imply a successful submission or actual case data.
- **Animation:** No animation is necessary for the foundation; honor reduced-motion preferences and avoid movement that could suggest live status.
- **Typography System:** Inter or a system sans-serif for headings/body; IBM Plex Mono or a system monospace for route markers and metadata. Strong readable sizes and line heights; no condensed display fonts.
- **Brand Essence:** A clearly bounded hackathon prototype for people exploring public-safety coordination; calm, legible, candid.
- **Brand Voice:** Plain and specific, never promises dispatch or guaranteed response. Example: “A coordination prototype, not an emergency service.” “Use your phone’s dialer for 112 when telephone service is available.”
- **Wordmark & Logo:** A custom abstract SVG mark of three short flowing strokes meeting at a single point beside a small-cap wordmark; it represents coordination only and must not resemble an official seal or locate an actual ghat.
- **Signature Brand Color:** River teal, a dark blue-green unique to this prototype, paired with warm chalk and ink.

## Stage boundary

Finish the runnable skeleton, safety shell, health endpoint, environment examples, documentation, and checks. Update `docs/build-progress.md`, report checks actually run, list any limitations, and stop for approval. Do not start Stage 2 or present any UI as an operational emergency system.

# Implementation plan — Stage 2: Database foundation

## Scope and assumptions

Implement the version-controlled Supabase/PostgreSQL schema and repeatable synthetic demonstration data only. Preserve the Stage 1 web/API shell; do not add emergency/report workflows, staff signup, UI database access, real project credentials, remote links, production migrations, real staff, operational incident data, or real coordinates. Keep all access server-side: all Stage 2 tables receive RLS and explicit revocation of client-role privileges; there are no anonymous, authenticated, or broad `USING (true)` policies. Grant only the server `service_role` the table DML privileges it needs. Future server code must perform its own authentication, authorization, privacy, and input validation before using this RLS-bypassing secret role. No browser-side Supabase client or secret is created.

Use a timestamped SQL migration and PostgreSQL enums/checks/FKs/indexes for the nine requested tables. Add one normalized `team_zone_coverage` join table so service-area relationships have real foreign keys. `profiles.id` references Supabase `auth.users`; staff/member/contact/assignment rows are not fabricated. Keep reporter PII only in the separate `reporter_contacts` table. Store public idempotency keys and tracking tokens only as 32-byte SHA-256 digests of high-entropy random values; never as raw text. Store nullable coordinates with range/pair/source/accuracy constraints, time-zone-aware timestamps, and a `location_is_fictional` marker; seed locations have no real coordinates and carry explicit fictional labels. The incident-status enum has exactly the ten requested states. Seed five fictional zones, three fictional teams and their normalized coverage links, and three fixed-UUID sample incidents; seed no profiles, memberships, reporter contacts, or assignments.

## Project structure and implementation

- `supabase/config.toml`: repository-local CLI project configuration with SQL seed enabled and the experimental native-stack feature enabled for supported no-Docker developer environments.
- `supabase/migrations/<timestamp>_stage2_database_foundation.sql`: tables, enums, keys, constraints, indexes, RLS, explicit grants/revokes, and secure default privileges.
- `supabase/seed.sql`: deterministic synthetic-only fixture rows, fixed UUIDs/timestamps, `ON CONFLICT` upserts, and no PII, staff, real coordinates, or secret values.
- `supabase/tests/database_foundation.test.sql`: pgTAP checks for RLS/grants, anonymous denial, invalid states, and foreign keys.
- Root workspace: pin a project-scoped Supabase CLI and add local start/reset/test/stop commands without adding credentials or linking a remote project.
- `docs/entity-relationship.md`: text/mermaid ERD including the additional coverage join table.
- `docs/data-dictionary.md`: table/field definitions, allowed values, nullability, synthetic fixtures, hashes, privacy, and access rules.
- `docs/database-setup.md`: exact local setup/test/seed commands and a separate controlled staff-provisioning procedure; cite Supabase's local migration, RLS/grants, API-key, and native-runtime guides.
- `README.md`, `TODO.md`, and `docs/build-progress.md`: link the database guide and record the Stage 2 boundary, verified commands, limitations, and acceptance status.

The default Supabase local project remains unlinked. Local `db reset` is destructive to local database state and reapplies migrations plus seed data. This work will use the CLI's native local stack only if it is supported by the sandbox; it will never target a remote project. If full Supabase local verification is unavailable, report that explicitly rather than claim migration compatibility or test success.

If the environment cannot start Supabase services, include a pinned PGlite-backed `pnpm db:smoke` harness that creates a fresh embedded PostgreSQL database, stubs only Supabase's `auth.users` relation and built-in roles, applies the actual migration and seed twice, and checks integrity/security behavior. Keep the real Supabase pgTAP suite as the authoritative full-stack verification path; explain that PGlite does not emulate GoTrue, PostgREST, or hosted Supabase when the full stack is unavailable. Include the smoke test in `pnpm test` so fresh checkouts can execute the schema verification without Docker or remote credentials.

## Stage boundary

Stop after the requested schema, local synthetic seed, tests, ERD, data dictionary, and setup/provisioning documentation are complete. Do not implement staff access, incident submission, token lookup, dispatch, or other workflow code.

# Implementation plan — Stage 3: Authentication and authorization

## Scope and access model

Add staff-only authentication and authorization on top of the existing Stage 1 application shell and Stage 2 Supabase/PostgreSQL schema. Keep the database project unlinked and do not contact a hosted project. Read credentials only from local/server environment variables; `.env.example` remains blank of actual keys. The site stays a software-only hackathon prototype and does not implement dispatch or emergency-service integrations.

Use Supabase Auth email/password sign-in and sign-out in the browser with `@supabase/supabase-js`, a project URL, and the publishable key. Public self-registration and anonymous sign-ins stay disabled. The backend independently validates every bearer access token with Supabase Auth `getUser(token)` and then resolves the user's active role and permissions from `public.profiles` through a user-scoped Supabase client. Do not trust JWT user metadata for role authorization. Routine reads and RPCs use the request's user token plus the publishable key so PostgreSQL RLS applies. A server-only `SUPABASE_SECRET_KEY` is used only for the Admin Auth invitation API and initial server-controlled profile creation. It must not be named with a `VITE_` prefix, bundled, returned, or logged.

Map the database roles `ADMIN`, `OPERATOR`, and `RESPONDER` to the administrator, operator, and responder screens. Administrators may manage staff and non-secret configuration but do not gain incident access solely by being administrators. Operators may read operational incidents. Responders may read incidents only while a currently active assignment connects their active team membership to that incident. Reporter-contact reads require the explicit server-controlled `can_access_reporter_contacts` permission and incident access; a role alone never grants contact access. Unknown/inactive/no-profile accounts are denied. Public users cannot access staff pages or APIs. Direct self-service writes to profile roles or team memberships are not granted; narrow administrator RPCs reject attempts to target the caller's own profile or membership.

## Project structure and implementation

- `supabase/migrations/<timestamp>_stage3_staff_auth_rls.sql`: add `profiles.is_active` and `profiles.can_access_reporter_contacts`, secure helper functions and administrator-only RPCs, exact role-aware RLS policies and least-privilege grants, while leaving all demo staff/contact/assignment tables empty in the checked-in seed.
- `supabase/tests/staff_access.test.sql` and `scripts/database-smoke.mjs`: cover profile and team isolation, operator/responder incident scoping, contact permission, administrator configuration/staff actions, self-promotion prevention, and denied anonymous access. The local embedded PostgreSQL harness stubs only `auth.uid()` and Supabase roles; it cannot establish hosted Auth/PostgREST behavior.
- `apps/api/src/auth/`: validated API bearer parsing, remote `getUser` verification, role resolution from trusted profile data, role/permission middleware, and a request-scoped publishable-key Supabase client. Missing credentials keep health available but make staff routes return a safe 503.
- `apps/api/src/routes/`: `/api/auth/me`, RLS-protected incident/contact reads, and administrator-only staff invitation/profile/team membership/configuration APIs. Validate request bodies with shared Zod schemas, normalize token/DB failures to the common error envelope, and never log tokens, contact data, email addresses, or secret values.
- `packages/shared`: export staff-role, authenticated-profile, incident-list, staff-administration, and configuration response/request schemas.
- `apps/web/src/auth/`: browser-safe Supabase client, session provider and role-aware route guard. On invalid/expired tokens, clear the local Supabase session, show a safe reauthentication message, and redirect away from staff routes.
- `apps/web/src/pages/`: accessible Supabase email/password staff login, guarded operator/responder incident screens, and administrator staff/configuration screens. Navigation shows only the signed-in role's workspace plus logout; API authorization and RLS remain authoritative even when UI links are hidden.
- `.env.example` files document only the public Supabase URL/publishable key for the browser and the URL/publishable key/server-only secret key for the API. `docs/authentication.md` documents role boundaries, invitation provisioning, hosted redirect/email-provider configuration, key handling and safe failure behavior; `docs/database-setup.md` and `README.md` link to it.
- Keep `public/manus-routes.json` synchronized with the existing page routes, update build progress, preserve prior stages' evidence, and stop at Stage 3.

## Existing design and interaction continuity

Reuse the approved Civic field-notes styling. Keep the persistent prototype disclaimer, Call 112 caveat, visible keyboard focus, and warm editorial shell. Add clear sign-in, session-expired, forbidden, and role-specific screen labels; avoid live-looking status animations and any implication of a real response. Login fields use explicit labels and autocomplete semantics. The administrator UI explains that contact-access permission is exceptional and defaults off.

## Stage boundary

Complete secure staff sign-in/out, backend token verification, role-aware screens and APIs, role/permission RLS, non-self staff administration, tests, and provisioning documentation only. Do not implement public report intake, assignment workflows, public tracking, emergency dispatch, maps, or live operational integrations.
