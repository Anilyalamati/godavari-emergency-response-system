# Supabase database setup

This guide covers the local, synthetic Stage 2 schema and the Stage 3 role/RLS foundation. The project is not linked to a hosted Supabase project. Do not run `supabase link` or `supabase db push` as part of these stages. Local migrations, fixtures, Auth configuration, and policy checks can be exercised without a remote connection. [1] [2]

## Local setup

The repository pins Supabase CLI `2.122.0` as a development dependency. From the repository root:

```sh
pnpm install
pnpm db:start
pnpm db:reset
pnpm db:seed
pnpm db:test
pnpm db:smoke
```

`pnpm db:start` uses the Supabase CLI experimental local-stack feature and its native runtime. The native runtime is intended for Linux `amd64`/`arm64` and macOS on Apple silicon; on Linux it requires Ubuntu 22.04 or a compatible glibc 2.35-or-later distribution, `tar`, and network access to the CLI artifact hosts. The experimental stack/runtime is subject to CLI changes. [3] [4]

If native startup is unavailable but Docker or Podman is installed and running, start with:

```sh
pnpm exec supabase start --runtime docker
```

Then reset and test with `pnpm db:reset` and `pnpm db:test`. To stop local services, use `pnpm db:stop`. The CLI's local stack starts from this repository's `supabase/config.toml`; it is not linked to a hosted project. Startup prints local endpoints and keys: treat that output as local credentials, do not paste it into public logs, and never commit it. [2]

`pnpm db:reset` deletes the _local_ database state, replays every migration, then applies `supabase/seed.sql`. This follows Supabase's documented reset/seed workflow. Do not use it against a local dataset you need to retain. The SQL seed uses fixed UUIDs and conflict-safe upserts, so the same fixture identities can be re-applied without duplicate rows. [1]

`pnpm db:test` runs the pgTAP assertions in `supabase/tests` against a running local Supabase stack. The tests cover anonymous denial, operator/responder/admin policy scopes, active team assignment, explicit reporter-contact permission, administrator configuration/staff operations, self-management denial, and database rejection of invalid incident states and foreign keys.

`pnpm db:smoke` runs as part of `pnpm test` and applies the actual migrations and seed to a fresh embedded PostgreSQL database. It provides minimal Supabase role, `auth.users`, and `auth.uid()` stubs; it verifies SQL constraints and row-level policies, but it does not emulate GoTrue, PostgREST, or a hosted Supabase service. Use `pnpm db:test` on a full local Supabase stack for end-to-end database/API behavior.

## Access boundary

RLS is enabled on every application table. Anonymous users have no staff-table grants. Authenticated access is limited by explicit grants and RLS; RLS policies use server-controlled `profiles` fields rather than client-editable Auth metadata. A user can read their own profile; administrators can read the staff directory. Operators can read operational incidents. Responders can read only incidents currently assigned to their active team. Administrator access is limited to staff management and non-secret configuration; administrator status alone does not grant incident access. Reporter-contact reads require both the explicit `can_access_reporter_contacts` permission and access to the associated incident. Team and zone lookup is read-only for active staff. [5]

Authenticated users have no direct table write grants for role/profile or team-membership changes. Narrow administrator RPCs validate the caller's active role and reject changes to the caller's own role or team memberships. Admin-management API endpoints perform an additional role and self-target check. The API validates each access token using Supabase Auth `getUser`, resolves the role from `profiles`, then uses the caller's bearer token with the publishable key so database RLS still applies.[7]

The server-only Supabase secret key bypasses RLS. This project uses it only for guarded administrator Auth invitations and initial profile creation. It must stay on the trusted API server; never put it in browser configuration, return it in an API response, log it, or commit it. [6]

## Secure staff account provisioning — separate from public registration

There is no public self-registration route or public staff form. The local Supabase configuration disables `auth.enable_signup` and anonymous sign-in while permitting only administrator-controlled invitations. A trusted administrator verifies the person's identity and authorization through the organization's controlled process, uses the protected administrator API to invite their email, assigns the minimum approved role and team membership, and grants reporter-contact permission only after a separate operational approval. [3] [5]

The invite callback must be the exact URL `SUPABASE_INVITE_REDIRECT_URL` and must also appear in the Supabase Auth redirect allow-list. The local config allows `/staff/accept-invite` on `localhost:3000` and `127.0.0.1:3000`; a hosted project must allowlist only its approved deployment origin. The recipient sets a password through the one-time invitation session. Do not call browser `auth.signUp()` or accept role selection from a registration form. The invitation email requires the local mail catcher or an approved hosted email provider. Disable the Auth identity and remove team memberships during offboarding; inactive profiles fail staff-role resolution and RLS checks.

## Fixture boundaries and token handling

Every zone and team fixture is marked fictional. Seed incidents use fixed fictional zone/landmark labels, omit latitude/longitude, set the fictional-location marker, and include only synthetic incident descriptions. The seed creates no profiles, staff memberships, reporter contacts, or assignments. This avoids fabricated accounts and personal contact data.

The incident schema stores only a 32-byte SHA-256 digest for an optional high-entropy public submission idempotency key and an optional high-entropy tracking token. The raw values are not database columns and must not be logged. Hash random values in the trusted backend before insertion or lookup; never expose the digest as the public token.

## Verification note

In this sandbox, `pnpm db:smoke` passed on embedded PostgreSQL 18.6 with the actual migration/seed SQL and minimal Auth/role stubs. The full Supabase local CLI stack did not start: the CLI reported `owner: unavailable` and no services; Docker and Podman are absent. Therefore `pnpm db:test` was not run here and no GoTrue/PostgREST integration is claimed. The database smoke harness is useful for SQL-level RLS regression checks, but a full local Supabase run remains recommended before connecting any hosted project.

## References

[1]: https://supabase.com/docs/guides/local-development/database-migrations 'Supabase Database Migrations'
[2]: https://supabase.com/docs/guides/local-development/cli/getting-started 'Supabase CLI Getting Started'
[3]: https://supabase.com/docs/guides/local-development/cli/config 'Supabase CLI Configuration'
[4]: https://supabase.com/docs/guides/local-development/docker-and-native-runtimes 'Supabase Docker and Native Runtimes'
[5]: https://supabase.com/docs/guides/database/postgres/row-level-security 'Supabase Row Level Security'
[6]: https://supabase.com/docs/guides/getting-started/api-keys 'Supabase API Keys'
[7]: https://supabase.com/docs/reference/javascript/auth-getuser 'Supabase JavaScript Auth getUser'
