# Database Schema Summary

The database is built on PostgreSQL 18.6 with Row-Level Security (RLS) active across all tables. Mutating business logic runs inside transactional `SECURITY DEFINER` stored procedures.

---

## Enumerated Types

| Enum Name             | Allowed Values                                                                                                                                                              |
| :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `incident_category`   | `MEDICAL_ASSISTANCE`, `CROWD_SAFETY`, `LOST_PERSON`, `INFRASTRUCTURE`, `OTHER`                                                                                              |
| `incident_priority`   | `LOW`, `NORMAL`, `URGENT`, `CRITICAL`                                                                                                                                       |
| `incident_status`     | `REPORTED`, `UNDER_REVIEW`, `ASSIGNED`, `ACKNOWLEDGED`, `EN_ROUTE`, `ON_SCENE`, `RESOLVED`, `CLOSED`, `DUPLICATE`, `CANCELLED`                                              |
| `location_source`     | `GPS`, `LANDMARK`, `MAP_PIN`, `NOT_PROVIDED`                                                                                                                                |
| `team_duty_status`    | `ON_DUTY`, `OFF_DUTY`, `STANDBY`                                                                                                                                            |
| `assignment_status`   | `PENDING`, `ACKNOWLEDGED`, `DECLINED`, `COMPLETED`, `CANCELLED`, `SUPERSEDED`                                                                                               |
| `staff_role`          | `OPERATOR`, `RESPONDER`, `ADMIN`                                                                                                                                            |
| `incident_event_type` | `REPORT_CREATED`, `STATUS_CHANGED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_ACKNOWLEDGED`, `ACKNOWLEDGEMENT_OVERDUE`, `ASSIGNMENT_SUPERSEDED`, `SUPPORT_REQUESTED`, `DEMO_SEEDED` |

---

## Core Tables

### 1. `public.incidents`

- `id` (uuid, PK, default `gen_random_uuid()`)
- `category` (`incident_category`, NOT NULL)
- `priority` (`incident_priority`, default `'NORMAL'`)
- `status` (`incident_status`, default `'REPORTED'`)
- `summary` (text, NOT NULL)
- `zone_id` (uuid, FK `public.zones.id`, nullable)
- `landmark` (text, nullable)
- `location_source` (`location_source`, NOT NULL)
- `latitude` (numeric, nullable)
- `longitude` (numeric, nullable)
- `location_accuracy_m` (numeric, nullable)
- `location_captured_at` (timestamptz, nullable)
- `location_is_fictional` (boolean, default false)
- `is_demo` (boolean, default false)
- `idempotency_key_sha256` (bytea, unique, 32-byte digest)
- `public_tracking_token_sha256` (bytea, unique, 32-byte digest)
- `reported_at` (timestamptz, NOT NULL)
- `created_at` (timestamptz, default `now()`)
- `updated_at` (timestamptz, default `now()`)
- `review_notes` (text, nullable)
- `cancellation_reason` (text, nullable)
- `duplicate_of_incident_id` (uuid, FK `public.incidents.id`, nullable)
- `reviewed_by_profile_id` (uuid, FK `public.profiles.id`, nullable)
- `reviewed_at` (timestamptz, nullable)
- `outcome` (text, nullable)

### 2. `public.assignments`

- `id` (uuid, PK)
- `incident_id` (uuid, FK `public.incidents.id`, NOT NULL)
- `team_id` (uuid, FK `public.teams.id`, NOT NULL)
- `assigned_by_profile_id` (uuid, FK `public.profiles.id`, NOT NULL)
- `status` (`assignment_status`, default `'PENDING'`)
- `assigned_at` (timestamptz, default `now()`)
- `acknowledgement_deadline` (timestamptz, NOT NULL)
- `acknowledged_at` (timestamptz, nullable)
- `created_at` (timestamptz, default `now()`)
- `updated_at` (timestamptz, default `now()`)
- `escalated_at` (timestamptz, nullable)
- `superseded_at` (timestamptz, nullable)
- `superseded_by_assignment_id` (uuid, FK `public.assignments.id`, nullable)
- `reassignment_reason` (text, nullable)
- _Partial Unique Indexes:_ One active assignment per incident; one active incident per team (`WHERE status IN ('PENDING', 'ACKNOWLEDGED')`).

### 3. `public.incident_events` (Audit Trail)

- `id` (uuid, PK)
- `incident_id` (uuid, FK `public.incidents.id`, NOT NULL)
- `actor_profile_id` (uuid, FK `public.profiles.id`, nullable)
- `assignment_id` (uuid, FK `public.assignments.id`, nullable)
- `event_type` (`incident_event_type`, NOT NULL)
- `status_before` (`incident_status`, nullable)
- `status_after` (`incident_status`, nullable)
- `notes` (text, nullable)
- `occurred_at` (timestamptz, default `now()`)

### 4. `public.teams`

- `id` (uuid, PK)
- `team_code` (varchar(16), unique, NOT NULL)
- `name` (varchar(120), NOT NULL)
- `capabilities` (text[], NOT NULL)
- `duty_status` (`team_duty_status`, default `'ON_DUTY'`)
- `is_demo` (boolean, default false)
- `fictional_team_label` (text, nullable)

### 5. `public.zones`

- `id` (uuid, PK)
- `zone_code` (varchar(16), unique, NOT NULL)
- `name` (varchar(120), NOT NULL)
- `description` (text, nullable)
- `is_demo` (boolean, default false)
- `fictional_location_label` (text, nullable)

### 6. `public.profiles`

- `id` (uuid, PK, references `auth.users.id` ON DELETE CASCADE)
- `display_name` (text, NOT NULL)
- `role` (`staff_role`, NOT NULL)
- `is_active` (boolean, default true)
- `can_access_reporter_contacts` (boolean, default false)

### 7. `public.reporter_contacts`

- `id` (uuid, PK)
- `incident_id` (uuid, FK `public.incidents.id`, unique, NOT NULL)
- `contact_name` (text, nullable)
- `phone_e164` (text, nullable)
- `email_address` (text, nullable)
- `preferred_contact_method` (text, default `'PHONE'`)

### 8. `public.configuration`

- `configuration_key` (text, PK)
- `value` (jsonb, NOT NULL)
- `description` (text, nullable)
- `updated_by_profile_id` (uuid, FK `public.profiles.id`, nullable)
- `updated_at` (timestamptz, default `now()`)

---

## Privileged Security Definer Functions

All privileged stored procedures execute with `SECURITY DEFINER` rights. Execution grants are revoked from `PUBLIC` and `anon`, and restricted to `service_role`:

1. `public.submit_public_incident(p_idempotency_key_sha256, p_tracking_token_sha256, p_category, p_summary, p_zone_id, p_landmark, p_location_source, p_latitude, p_longitude, p_location_accuracy_m, p_phone_e164, p_reported_at)`
2. `public.operator_review_incident(p_incident_id, p_actor_profile_id, p_status, p_priority, p_review_notes, p_duplicate_of_incident_id, p_cancellation_reason)`
3. `public.operator_assign_team(p_incident_id, p_team_id, p_actor_profile_id, p_deadline_minutes, p_deadline_seconds)`
4. `public.scan_and_escalate_overdue_assignments()`
5. `public.operator_reassign_team(p_incident_id, p_new_team_id, p_actor_profile_id, p_reason, p_deadline_seconds)`
6. `public.responder_update_incident(p_incident_id, p_actor_profile_id, p_action, p_notes, p_outcome)`
7. `public.operator_close_incident(p_incident_id, p_actor_profile_id, p_notes)`
8. `public.get_public_incident_tracking(p_tracking_token_sha256)`
9. `public.purge_expired_data(p_retention_days)`
