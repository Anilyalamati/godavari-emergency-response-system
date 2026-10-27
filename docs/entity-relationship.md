# Stage 2–3 entity-relationship diagram

All relationships below are protected by PostgreSQL foreign keys. The diagram is text-based Mermaid and can be reviewed without an image renderer.

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : "provisioned identity"
  PROFILES ||--o{ TEAM_MEMBERSHIPS : has
  TEAMS ||--o{ TEAM_MEMBERSHIPS : includes
  TEAMS ||--o{ TEAM_ZONE_COVERAGE : serves
  ZONES ||--o{ TEAM_ZONE_COVERAGE : covered_by
  ZONES ||--o{ INCIDENTS : contains
  INCIDENTS ||--o| REPORTER_CONTACTS : "contact stored separately"
  INCIDENTS ||--o{ ASSIGNMENTS : receives
  TEAMS ||--o{ ASSIGNMENTS : assigned
  PROFILES ||--o{ ASSIGNMENTS : assigns
  INCIDENTS ||--o{ INCIDENT_EVENTS : records
  PROFILES ||--o{ INCIDENT_EVENTS : acts
  PROFILES ||--o{ CONFIGURATION : updates

  AUTH_USERS {
    uuid id PK
  }
  PROFILES {
    uuid id PK, FK
    staff_role role
    boolean is_active
    boolean can_access_reporter_contacts
    timestamptz created_at
  }
  ZONES {
    uuid id PK
    text zone_code UK
    text name
    boolean is_demo
    text fictional_location_label
  }
  TEAMS {
    uuid id PK
    text team_code UK
    text name
    text_array capabilities
    boolean is_demo
  }
  TEAM_ZONE_COVERAGE {
    uuid team_id PK, FK
    uuid zone_id PK, FK
    timestamptz covered_since
  }
  TEAM_MEMBERSHIPS {
    uuid team_id PK, FK
    uuid profile_id PK, FK
    team_membership_role membership_role
    boolean active
  }
  INCIDENTS {
    uuid id PK
    incident_category category
    incident_priority priority
    incident_status status
    timestamptz reported_at
    location_source location_source
    numeric latitude
    numeric longitude
    numeric location_accuracy_m
    text landmark
    uuid zone_id FK
    timestamptz location_captured_at
    bytea idempotency_key_sha256
    bytea public_tracking_token_sha256
    boolean is_demo
    boolean location_is_fictional
  }
  REPORTER_CONTACTS {
    uuid id PK
    uuid incident_id UK, FK
    text contact_name
    text phone_e164
    text email_address
    reporter_contact_method preferred_contact_method
  }
  ASSIGNMENTS {
    uuid id PK
    uuid incident_id FK
    uuid team_id FK
    uuid assigned_by_profile_id FK
    assignment_status status
    timestamptz assigned_at
    timestamptz acknowledgement_deadline
    timestamptz acknowledged_at
  }
  INCIDENT_EVENTS {
    uuid id PK
    uuid incident_id FK
    uuid actor_profile_id FK
    incident_event_type event_type
    incident_status status_before
    incident_status status_after
    timestamptz occurred_at
  }
  CONFIGURATION {
    text configuration_key PK
    jsonb value
    uuid updated_by_profile_id FK
    timestamptz updated_at
  }
```

`AUTH_USERS` is Supabase's existing `auth.users` relation, not a table created or seeded by this repository. `TEAM_ZONE_COVERAGE` is an additional normalized table that makes each team's service zones referenceable and foreign-key checked. A reporter's name, phone, and email exist only in `REPORTER_CONTACTS`, not on `INCIDENTS`. Public idempotency and tracking values have digest columns only; the raw values are never persisted.

## Stage 3 authorization note

Stage 3 adds `profiles.is_active` and the explicit `profiles.can_access_reporter_contacts` permission. No new public staff table or self-registration relationship is created. Operators are scoped to operational incidents; responders are scoped through active `TEAM_MEMBERSHIPS` and active `ASSIGNMENTS`; administrator role alone does not grant incident access. Reporter contacts require both the explicit profile permission and access to the related incident. Profile and team-membership writes are guarded against self-targeting.
