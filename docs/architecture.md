# System Architecture

## Overview

The Godavari Pushkaralu Emergency Response Coordination System is a software-only prototype designed to explore reliable intake, operator triage, dispatch allocation, missed-acknowledgement escalation, and public tracking during large-scale festival gatherings.

```mermaid
flowchart TD
    subgraph Clients["Client Layer (Browsers & Devices)"]
        PublicUser["Public / Volunteer Intake<br/>(/report, /track)<br/>IndexedDB Local Queue"]
        OperatorUI["Control Room Operator<br/>(/operator)<br/>Triage, Map & Dispatch"]
        ResponderUI["Field Responder Unit<br/>(/responder)<br/>Mobile-First Task Action"]
        AdminUI["Administrator<br/>(/admin)<br/>Staff & Config"]
    end

    subgraph Edge["Edge & Security Layer"]
        RateLimiter["In-Memory Rate Limiter<br/>Sliding Window & IP Anonymizer"]
        CORS["CORS Protection<br/>Configured Allowed Origins"]
        PayloadGuard["Payload Size Guard<br/>32KB Max & HTTP 413"]
    end

    subgraph Backend["API & Background Services (Express & Node.js)"]
        API["Express REST API<br/>(/api/*)"]
        AuthMiddleware["Auth & Role Verification<br/>(requireStaff, requireRoles)"]
        EscalationWorker["Escalation Worker<br/>(Scheduled Polling Loop)"]
    end

    subgraph Data["Authoritative Data Layer (PostgreSQL 18.6 / Supabase)"]
        PostgresTables["Core Tables (RLS Enforced)<br/>incidents, assignments, profiles,<br/>teams, zones, events, configuration"]
        StoredProcedures["Security Definer RPCs<br/>submit_public_incident<br/>operator_assign_team<br/>operator_reassign_team<br/>responder_update_incident<br/>scan_and_escalate_overdue_assignments<br/>purge_expired_data"]
        AuditTrail["Immutable Audit Trail<br/>(incident_events)"]
        RealtimePub["Supabase Realtime Publication<br/>(incidents, assignments, events)<br/>*Excludes tokens & contacts*"]
    end

    PublicUser -->|POST /api/incidents| Edge
    PublicUser -->|POST /api/incidents/track| Edge
    OperatorUI -->|REST + Realtime| API
    ResponderUI -->|REST + Realtime| API
    AdminUI -->|REST| API

    Edge --> API
    API --> AuthMiddleware
    AuthMiddleware --> PostgresTables
    API --> StoredProcedures
    EscalationWorker -->|scan_and_escalate_overdue_assignments| StoredProcedures
    StoredProcedures --> PostgresTables
    StoredProcedures --> AuditTrail
    PostgresTables -.->|CDC / WebSocket| RealtimePub
    RealtimePub -.-> OperatorUI
    RealtimePub -.-> ResponderUI
```

---

## Subsystem Boundaries

### 1. Public Visitor Intake & Local Queue

- **Routes:** `/report`, `/track`
- **Resilience:** Unsent emergency drafts are written to client-side IndexedDB (`godavari_emergency_queue_v1`) with transparent memory fallback. Retries reuse the client-generated `clientRequestId` to reconcile lost acknowledgements idempotently without duplicate records.
- **Privacy:** Form contact details and tokens are never broadcast via Realtime sockets or exposed in server URL query parameters. Tokens are hashed with SHA-256 before storage.

### 2. Control Room Operator Workspace

- **Route:** `/operator`
- **Capabilities:** Incident queue inspection, manual vs GPS veracity auditing, zone-based candidate team recommendation, atomic team assignment, missed-acknowledgement escalation monitoring, operator-directed team reassignment, and final incident closure.
- **Views:** Three-way split toggle between Queue Only, Map Only, and Split View (Queue + Leaflet Map).

### 3. Field Responder Interface

- **Route:** `/responder`
- **Capabilities:** Mobile-first, single-incident focus displaying assigned incident category, location coordinates/landmark, report age, and tactical notes.
- **State Progression:** Sequential transition execution (`ACKNOWLEDGE` → `EN_ROUTE` → `ON_SCENE` → `RESOLVE`). Allows requesting support with mandatory notes and marks resolution with documented release of team availability.

### 4. Background Escalation Worker

- **Process:** Scheduled daemon service (`EscalationWorker` in `apps/api/src/workers/escalation-worker.ts`).
- **Function:** Periodically executes PostgreSQL stored procedure `public.scan_and_escalate_overdue_assignments()`. Detects unacknowledged assignments past deadline and appends an `ACKNOWLEDGEMENT_OVERDUE` event. Completely decoupled from browser sessions and recovers immediately upon worker process restart.

### 5. PostgreSQL Authoritative Storage & RLS

- **Database Engine:** PostgreSQL 18.6 with Row-Level Security (RLS) enabled on all tables.
- **Privilege Partitioning:** Direct client table writes are barred; state mutations run exclusively through `SECURITY DEFINER` stored procedures granted to `service_role`. Anonymous and public execution privileges on privileged procedures are revoked.
