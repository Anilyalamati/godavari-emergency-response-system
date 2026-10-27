# Staff authentication and authorization

## Sign-in and token verification

Staff sign in with their provisioned email and password through Supabase Auth. The browser SDK stores and refreshes the Supabase session, but the browser never establishes its own authorization decision. Every staff API request sends the short-lived access token as a bearer token. The Express backend validates it with `supabase.auth.getUser(token)`, which makes a request to the Supabase Auth server and returns a server-confirmed user record.[1] A missing or invalid/expired token gets `401`; an authenticated user without an active staff profile or the required role/permission gets `403`. If Auth or the profile lookup is unavailable, the API fails closed with a generic `503` response and does not log the token or raw provider error.

The backend ignores role claims in user-editable Auth metadata. It looks up `profiles.role`, `profiles.is_active`, and `profiles.can_access_reporter_contacts` by the verified `auth.users.id`. These are trusted only because browser writes are revoked and administrator changes go through guarded server/database paths. The role values in the database are `ADMIN`, `OPERATOR`, and `RESPONDER`; the UI labels them administrator, operator, and responder.

## Role and data boundaries

Operators can read operational incidents. Responders can read incidents only when an active membership and a pending/acknowledged assignment connect the incident to one of their teams. Administrator access is limited to staff management and non-secret configuration; administrator status alone does not grant incident or reporter-contact access. Reporter-contact records remain separate from incident records and are visible only when the staff profile carries the explicit `can_access_reporter_contacts` permission and the same incident/team scope also allows access. That permission is false by default.

RLS and table grants enforce these boundaries for direct database access as well as API calls.[2] An authenticated user can read only their own profile, except an administrator can read the staff directory. There are no direct client write grants for profiles or team memberships. The `admin_update_staff_profile` and `admin_replace_team_memberships` RPCs check the caller's active server-controlled role and reject attempts to target the caller's own profile or team memberships. Administrator configuration writes have distinct RLS policies. Public/anonymous requests receive no staff-table grants or staff-page access.

The API uses the request's verified bearer token with the project's publishable key for normal profile, incident, membership, configuration, and RLS-protected RPC calls. The server-only `SUPABASE_SECRET_KEY` is used only for administrator-guarded Auth invitations and initial profile creation. Supabase secret keys bypass RLS and must never be bundled, exposed in a public response, or logged; publishable keys are public and rely on RLS for data protection.[3]

## Provisioning and invitation procedure

Public signup and anonymous sign-in remain disabled in the local Supabase configuration. Supabase exposes `auth.enable_signup` and `auth.enable_anonymous_sign_ins` configuration switches for this purpose.[4] There is no public registration route or self-service role assignment.

A verified administrator provisions staff as follows: confirm the person's identity and authorization using the organization's controlled process; use the authenticated administrator screen to send an Auth invitation; assign the minimum required role and any team membership; enable reporter-contact access only after a separate explicit operational approval; and review access during onboarding and offboarding. The server sends invites using Supabase's `auth.admin.inviteUserByEmail` API. Supabase documents Admin Auth methods as requiring a secret key and restricting them to a trusted server.[5] The invitation email requires a configured SMTP/email provider and an allowlisted redirect URL. Local development uses the Supabase local mail catcher; hosted deployments must configure their own approved email provider and exact callback/redirect origin. Do not use `auth.signUp()` from the browser.

Deactivation immediately makes the profile fail staff-role resolution and RLS checks. Remove team memberships and disable the Auth identity during offboarding. Do not share service secrets with administrators or place them in browser variables.

## Configuration variables

`apps/web/.env.example` contains only the Vite-allowlisted `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and same-origin API base. Those values are public application configuration. `apps/api/.env.example` contains `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, the optional server-only `SUPABASE_SECRET_KEY`, and the exact invitation redirect URL. The API health endpoint never returns environment values. The app remains runnable without a configured Supabase project; staff routes fail closed and show a setup message until credentials are provided.

Prefer Supabase's current `sb_publishable_...` and `sb_secret_...` keys. Supabase documents the legacy `anon` and `service_role` keys as deprecated by the end of 2026.[3] Never put the secret key behind a `VITE_` prefix. A release/build check injects a harmless sentinel into the server-only variable and scans the browser output to catch accidental bundling.

## Supabase project configuration

The repository's `supabase/config.toml` disables self-registration and anonymous sign-in for local development. A real hosted project is not linked or configured by this stage. Before connecting one, apply migrations and tests to an isolated project, set the same Auth signup restrictions, configure an approved email provider, and add only the deployed site origin to the Auth redirect allow-list. Do not use production staff records or production secrets in local tests.

## References

[1]: https://supabase.com/docs/reference/javascript/auth-getuser 'Supabase JavaScript Auth getUser'
[2]: https://supabase.com/docs/guides/database/postgres/row-level-security 'Supabase Row Level Security'
[3]: https://supabase.com/docs/guides/getting-started/api-keys 'Supabase API Keys'
[4]: https://supabase.com/docs/guides/local-development/cli/config 'Supabase CLI Configuration'
[5]: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail 'Supabase JavaScript Admin Auth inviteUserByEmail'
