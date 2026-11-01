# Security and Privacy Architecture

## 1. Threat Model & Boundaries

The system is designed with strict boundaries to safeguard reporter privacy, prevent operational sabotage, and protect field personnel safety:

```
+-------------------------------------------------------------------------+
|                              PUBLIC BOUNDARY                            |
|  - Anonymized reports only                                              |
|  - Ephemeral client request IDs                                         |
|  - Unguessable tracking tokens (32-char hex, stored strictly as SHA-256)|
|  - Rate-limited intake & tracking endpoints                             |
+-------------------------------------------------------------------------+
                                    |
                                    v (Rate-limited, CORS-restricted)
+-------------------------------------------------------------------------+
|                              EXPRESS API                                |
|  - Verified JWT staff authentication via Supabase Auth                  |
|  - Server-resolved profiles and roles (never client JWT claims)         |
|  - In-memory sliding-window rate limiter with IP anonymization          |
|  - Strict CORS origin allow-list                                        |
|  - Payload size cap (32KB max, HTTP 413)                                |
|  - Redaction of tokens, passwords, and phone numbers in logs            |
+-------------------------------------------------------------------------+
                                    |
                                    v (service_role credentials only)
+-------------------------------------------------------------------------+
|                           POSTGRESQL DATABASE                           |
|  - Row-Level Security (RLS) active on all tables                        |
|  - Custom RPCs granted solely to service_role                           |
|  - PUBLIC and anon execution revoked on all stored procedures           |
|  - reporter_contacts isolated behind explicit admin permission          |
|  - Realtime publication excludes tracking tokens and reporter contacts  |
|  - Configurable data retention cleanup (purge_expired_data)             |
+-------------------------------------------------------------------------+
```

---

## 2. Core Security Controls

### Row-Level Security (RLS)

- **Zero Client Table Grants:** Anonymous visitors have zero read or write privileges on operational tables (`incidents`, `assignments`, `reporter_contacts`).
- **Role Isolation:**
  - `OPERATOR` profiles can read all operational incidents and assign/reassign teams.
  - `RESPONDER` profiles can read only active incidents assigned to their team (`team_memberships`).
  - `ADMIN` profiles manage non-operational staff profiles and system configuration; they cannot view reporter contacts without explicit grant.
- **Reporter Contact Isolation:** Access to `public.reporter_contacts` requires both an authorized role and `can_access_reporter_contacts = true` on the staff profile.

### Token & Secret Hygiene

- **SHA-256 Token Storage:** Public tracking tokens and client idempotency keys are never stored in plaintext. The database retains only 32-byte cryptographic hashes (`public_tracking_token_sha256` and `idempotency_key_sha256`).
- **URL & Referrer Protection:** Tracking tokens are transmitted exclusively in POST request bodies (`POST /api/incidents/track`), preventing leakage into browser history, server access logs, or HTTP referrer headers.
- **Bundle Verification:** The automated test `scripts/check-browser-secret-bundle.mjs` scans all Vite production chunks to guarantee that `SUPABASE_SECRET_KEY` or service-role credentials are never bundled into client assets.

### Rate Limiting & Abuse Prevention

- **Sliding-Window Limiter:** Implemented in `apps/api/src/http/rate-limiter.ts`. Applies 60 requests per 10-minute window per anonymized client key on intake and tracking endpoints.
- **IP Anonymization:** IP addresses are hashed using SHA-256 with a daily rotating salt before being used as memory bucket keys, preventing personal IP retention.
- **Non-Silent Rejection:** Excessive requests receive clear HTTP 429 `TOO_MANY_REQUESTS` responses with `Retry-After` headers; reports are never silently dropped.

### Input Sanitization & Payload Protection

- **Length Caps:** Form input constraints enforce strict upper bounds (e.g., 4000 characters for incident summaries, 240 for landmarks, 1000 for closure notes).
- **Size Bounds:** Express body-parser limits payloads to 32KB, returning clean HTTP 413 `PAYLOAD_TOO_LARGE` errors.
- **XSS Immunity:** React JSX auto-escapes string content in the DOM, preventing stored script injection.

---

## 3. Data Retention Policy

- **Stored Procedure:** `public.purge_expired_data(p_retention_days integer DEFAULT 30)` removes resolved, closed, cancelled, or duplicate incidents older than the retention threshold.
- **Cascade Cleanup:** Purging an incident automatically cascade-deletes related assignments, audit events, and reporter contacts.
- **Default Policy:** The default retention period is set to 30 days in `public.configuration` (`data_retention_policy`).

---

## 4. Honest Remaining Risks & Operational Boundaries

1. **In-Memory Rate Limiter:** The sliding-window rate limiter is currently maintained in Node.js process memory. In a clustered or multi-container production deployment, a distributed store (e.g. Redis) is required to enforce unified limits across instances.
2. **Translation Review:** Telugu language strings are draft prototype translations and require verification by certified emergency management linguists before real-world operational use.
3. **Database Cron Automation:** Automated scheduled execution of `purge_expired_data` requires a PostgreSQL cron daemon (`pg_cron`) or cloud scheduler in production.
4. **Physical Radio Outages:** Software coordination cannot replace terrestrial two-way radio channels when cellular towers experience physical damage or extreme radio congestion.
