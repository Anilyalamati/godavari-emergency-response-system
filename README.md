# Godavari Emergency Response Coordination System

A software-only hackathon prototype for exploring emergency detection, public safety, and response coordination for Godavari Pushkaralu. **Hackathon prototype — not an emergency service.** Stage 3 adds administrator-provisioned staff authentication, server-checked roles, and database-enforced access boundaries. The app still does not submit public reports, dispatch teams, contact emergency services, or guarantee assistance. Demonstration data remains synthetic; no official locations, personnel, or operational data are included.

## Requirements

- Node.js 20.19 or newer (Node 22 LTS is recommended).
- Corepack-enabled pnpm 11.25.0, pinned in `package.json`.
- For local database services: the pinned Supabase CLI, installed by `pnpm install`; use the native runtime on a supported Linux/macOS platform or Docker/Podman. See the [database setup guide](docs/database-setup.md).
- For working staff sign-in: a Supabase project with Auth and the Stage 2/3 migrations applied. Local development may use the repository’s local Supabase project.

## Fresh local setup

From the repository root, run these commands in a macOS/Linux shell:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

The Vite frontend listens on `http://localhost:3000`. The Express API listens on `http://localhost:4000`. Browser requests to `/api/*` use Vite’s same-origin development proxy. Open `http://localhost:3000`. If port 3000 or 4000 is already in use, stop the other process first; Vite deliberately uses a strict port.

To enable staff Auth locally, start the local Supabase stack, then copy its project URL and **publishable** key to both `.env` files using the names shown in their examples. Keep `SUPABASE_SECRET_KEY` only in `apps/api/.env`; set the exact invitation callback URL there and use the matching local Auth allow-list. The browser values are public; no secret key belongs in `apps/web/.env` or any `VITE_*` variable. Without a configured Supabase project, the public site and API health check remain available, while staff sign-in and protected APIs fail closed.

Check API health directly or through the frontend proxy:

```sh
curl -i http://localhost:4000/api/health
curl -i http://localhost:3000/api/health
```

Both responses include a server-generated timestamp and request ID; neither reveals environment configuration.

## Project commands

```sh
pnpm dev             # Start frontend and API together
pnpm dev:web         # Start only Vite
pnpm dev:api         # Start only Express (also builds the shared package)
pnpm lint            # ESLint for JavaScript/TypeScript
pnpm format:check    # Check formatting
pnpm format          # Apply Prettier formatting
pnpm typecheck       # Check the shared package, API, and frontend types
pnpm test            # Shared/API/UI tests plus the embedded PostgreSQL database smoke test
pnpm e2e             # Optional real-browser frontend smoke test
pnpm build           # Production builds for shared package, API, and frontend
pnpm security:bundle # Build with harmless secret sentinels and scan browser output
pnpm check           # Run lint, formatting, type checking, tests, builds, and the bundle-secret scan
pnpm health:check    # Check the running local API
pnpm db:start        # Start the isolated local Supabase native stack
pnpm db:start:docker # Start the isolated local Supabase Docker runtime
pnpm db:reset        # Destructively replay local migrations and seed
pnpm db:seed         # Re-apply the idempotent local SQL seed
pnpm db:test         # Run local Supabase pgTAP database tests
pnpm db:smoke        # Test SQL migrations/seed/RLS in embedded PostgreSQL without Docker
pnpm db:stop         # Stop local Supabase services
```

Supabase CLI database commands use only the unlinked local project configured in `supabase/config.toml`; they do not push to or link a hosted project. `pnpm db:reset` deletes the local database before replaying migrations and seed. `pnpm db:seed` can be repeated against the local stack. `pnpm db:smoke` uses a fresh embedded PostgreSQL database and minimal Supabase role/Auth-schema stubs; it is not a GoTrue or PostgREST emulator.

For the optional browser test, install Playwright Chromium once and run:

```sh
pnpm --filter @godavari/web exec playwright install chromium
pnpm e2e
```

## Routes

| Route                  | Access and content                                                    |
| ---------------------- | --------------------------------------------------------------------- |
| `/`                    | Public prototype overview                                             |
| `/report`              | Non-submitting placeholder and local-only accessible field example    |
| `/track`               | Public tracking placeholder; no lookup or access to other reports     |
| `/staff/login`         | Provisioned staff email/password sign-in; no public registration      |
| `/staff/accept-invite` | One-time administrator invitation password setup                      |
| `/operator`            | Verified operator; operational incident read-only view                |
| `/responder`           | Verified responder; incidents assigned to their active team only      |
| `/admin`               | Verified administrator; staff and non-secret configuration management |

Each page retains the persistent prototype disclaimer, keyboard-accessible navigation, and clearly labelled `tel:112` alternative. The link can only hand off to a device dialer where supported; telephone coverage is required. This prototype does not place or route calls.

## Authentication and authorization boundary

The backend confirms every staff access token through Supabase Auth and then resolves the role and permissions from server-controlled `profiles` data, never from client-editable user metadata. RLS applies the same boundaries to direct database access: operators can read operational incidents; responders are limited to active team assignments; administrators manage staff/configuration but do not automatically get incident or reporter-contact access. Reporter contacts require an explicit administrator-granted operational permission and the incident-access policy. Users cannot change their own role or team memberships. Public visitors cannot access staff routes or staff data.

`SUPABASE_SECRET_KEY` is server-only. It is used only for protected administrator invitations/profile creation, is never returned or logged, and is never included in the browser bundle. `pnpm security:bundle` verifies this using harmless sentinel values. See [authentication and administrator provisioning](docs/authentication.md) for the exact key, invitation redirect, and role requirements.

## Monorepo layout

- `apps/web`: React, TypeScript, Vite, Tailwind CSS, React Router, Supabase Auth UI, role-aware screens, and browser tests.
- `apps/api`: Express token verification, server-controlled staff roles, authorization middleware, and guarded staff/configuration APIs.
- `packages/shared`: shared Zod contracts and TypeScript types.
- `supabase/migrations`: versioned PostgreSQL schema, Auth profile, and RLS policy changes.
- `supabase/seed.sql`: repeatable fictional demonstration zones, teams, coverage, and incidents.
- `supabase/tests`: pgTAP tests for database constraints and role/team/contact RLS.
- `docs`: database setup, data dictionary, text ERD, Auth/provisioning guide, and stage build progress.

## Prototype limits

The Stage 3 staff workspace is read-only for operational incidents; it does not submit reports, assign or dispatch teams, publish responder locations, or initiate a response. Administrator forms change staff access and non-secret configuration only. Do not enter real incidents or reporter information. Do not use this prototype in an emergency.
