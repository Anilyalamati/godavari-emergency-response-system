# Deployment Checklist and Infrastructure Guide

This guide outlines production-like deployment procedures, environment configuration, process models, and hosting limitations for the Godavari Pushkaralu Emergency Response Coordination System.

---

## 1. Process Architecture

The system is designed to run as three primary workloads:

```
[ Static CDN / Edge ]  -->  Serves Vite Single-Page Application (HTML, JS, CSS)
         |
         v
[ Node.js API Service ] -->  Runs Express REST API (app.ts) on Port 4000
         |
         v
[ Escalation Worker ]   -->  Runs scheduled polling daemon (escalation-worker.ts)
         |
         v
[ PostgreSQL 18.6 DB ]  -->  Supabase / Managed PostgreSQL with RLS & Realtime
```

### Which Process Runs the Escalation Worker?

- **Small Deployments / Single Instance:** The escalation worker can run embedded inside the Express API process (`new EscalationWorker(service, 10_000).start()`).
- **Production / Clustered Deployments (Recommended):** Run the escalation worker as a dedicated, singleton background worker container (`node dist/workers/escalation-worker.js`) to prevent multiple processes from performing redundant scans simultaneously.

---

## 2. Environment Variables Checklist

### Backend API (`apps/api/.env`)

| Variable                      | Description                                       | Production Example                                  |
| :---------------------------- | :------------------------------------------------ | :-------------------------------------------------- |
| `NODE_ENV`                    | Runtime environment                               | `production`                                        |
| `PORT`                        | Listening HTTP port                               | `4000`                                              |
| `API_BASE_URL`                | Self-referencing API URL                          | `https://api.godavari-response.org`                 |
| `ALLOWED_ORIGINS`             | Comma-delimited CORS origin allow-list            | `https://godavari-response.org`                     |
| `SUPABASE_URL`                | Supabase / Database Project URL                   | `https://xyzcompany.supabase.co`                    |
| `SUPABASE_SECRET_KEY`         | Privileged service_role JWT key (**server only**) | `eyJhbGciOi...`                                     |
| `ESCALATION_POLL_INTERVAL_MS` | Interval between escalation scans                 | `10000`                                             |
| `INVITE_REDIRECT_URL`         | Allowed invitation password setup URL             | `https://godavari-response.org/staff/accept-invite` |

> [!CAUTION]
> Never expose `SUPABASE_SECRET_KEY` in frontend bundles or `apps/web/.env`. The secret key bypasses RLS and must reside exclusively in backend server memory.

### Frontend Client (`apps/web/.env`)

| Variable                 | Description                              | Production Example                  |
| :----------------------- | :--------------------------------------- | :---------------------------------- |
| `VITE_API_BASE_URL`      | Base URL for REST API requests           | `https://api.godavari-response.org` |
| `VITE_SUPABASE_URL`      | Public Supabase project URL              | `https://xyzcompany.supabase.co`    |
| `VITE_SUPABASE_ANON_KEY` | Public publishable anon key (**public**) | `eyJhbGciOi...`                     |

---

## 3. Production Deployment Steps

### Step 1: Database Migration

1. Apply versioned migrations in order from `supabase/migrations/`:
   ```bash
   # Using Supabase CLI or native psql
   psql -d "$DATABASE_URL" -f supabase/migrations/20261026090000_stage2_core_schema.sql
   psql -d "$DATABASE_URL" -f supabase/migrations/20261027110000_stage3_profiles_and_roles.sql
   # ... through Stage 11 migration:
   psql -d "$DATABASE_URL" -f supabase/migrations/20261101150000_stage11_security_hardening.sql
   ```
2. For production environments, **DO NOT run `supabase/seed.sql`**. The seed script contains synthetic demo fixtures only.

### Step 2: Build Artifacts

```bash
# Clean install and build all packages
pnpm install --frozen-lockfile
pnpm build
```

### Step 3: Verify Bundle Security

```bash
pnpm security:bundle
```

Verifies that no secrets or service tokens were bundled into static browser assets.

### Step 4: Health & Readiness Checks

- API liveness endpoint: `GET /api/health`
- Verify HTTP 200 and JSON response: `{"data": {"status": "ok", "service": "godavari-api"}}`.

---

## 4. Hosting Platform Limitations & Warnings

> [!WARNING]
> **Free / Sleeping Cloud Tiers (Render, Fly.io, Railway, Heroku):**
>
> - Free hosting plans often put containers to sleep after 15 minutes of inactivity.
> - A cold start takes 30–60 seconds, which causes catastrophic delays during emergency report intake.
> - Background worker processes in sleeping tiers will **halt execution**, causing missed-acknowledgement escalations to fail silently.
> - **Production Rule:** Run the API and escalation worker on always-on, non-sleeping dedicated container instances with health check restart policies.

> [!WARNING]
> **Memory & Connection Limits:**
>
> - Postgres connection pooling (e.g. Supabase Supavisor / PgBouncer) must be used to prevent connection exhaustion during traffic surges.
> - The in-memory rate limiter requires ~100MB for 100,000 active visitor buckets; configure process memory ceilings accordingly.
