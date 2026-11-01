# API Summary

All endpoints are served under `/api/*` and return standard JSON payloads. Protected endpoints require a valid Supabase bearer token passed in the `Authorization: Bearer <token>` header.

---

## Public Endpoints

### 1. Health Check

- **Route:** `GET /api/health`
- **Auth:** None (Public)
- **Response:**
  ```json
  {
    "data": {
      "status": "ok",
      "service": "godavari-api",
      "timestamp": "2026-11-01T22:00:00.000Z"
    },
    "requestId": "uuid"
  }
  ```

### 2. Zones Directory

- **Route:** `GET /api/zones`
- **Auth:** None (Public)
- **Response:** List of festival zones (`id`, `zoneCode`, `name`, `description`).

### 3. Public Incident Intake

- **Route:** `POST /api/incidents`
- **Auth:** None (Rate-limited: 60 requests per 10-minute window per IP)
- **Request Body (`PublicIncidentCreateInputSchema`):**
  - `clientRequestId` (UUID, required): Client-generated deduplication key.
  - `category` (enum, required): `MEDICAL_ASSISTANCE` | `CROWD_SAFETY` | `LOST_PERSON` | `INFRASTRUCTURE` | `OTHER`
  - `summary` (string, 3–4000 chars, required)
  - `zoneId` (UUID, optional)
  - `landmark` (string, max 240 chars, optional)
  - `locationSource` (enum, required): `GPS` | `LANDMARK` | `MAP_PIN` | `NOT_PROVIDED`
  - `latitude`, `longitude`, `locationAccuracyM` (numeric, required if GPS/MAP_PIN)
  - `callbackPhone` (E.164 string, optional)
  - `reportedAt` (ISO timestamp, optional): Client draft creation time.
  - `trackingToken` (string, 16–64 hex chars, optional): Client draft token.
  - `locationConfirmed` (boolean, required literal `true`)
- **Response (HTTP 201 Created or HTTP 200 Replay):**
  ```json
  {
    "data": {
      "incidentId": "uuid",
      "trackingToken": "32-char hex token",
      "status": "REPORTED",
      "category": "MEDICAL_ASSISTANCE",
      "reportedAt": "2026-11-01T22:00:00.000Z",
      "isIdempotentReplay": false
    }
  }
  ```
- **Error Codes:** 400 `VALIDATION_ERROR`, 413 `PAYLOAD_TOO_LARGE`, 429 `TOO_MANY_REQUESTS`.

### 4. Public Incident Tracking Lookup

- **Route:** `POST /api/incidents/track`
- **Auth:** None (Rate-limited: 60 requests per 10-minute window per IP)
- **Request Body (`PublicIncidentTrackingInputSchema`):**
  - `trackingToken` (string, 16–64 hex chars, required)
- **Response (HTTP 200 OK):**
  ```json
  {
    "data": {
      "incidentId": "uuid",
      "status": "ASSIGNED",
      "statusLabel": "Team Dispatched",
      "category": "MEDICAL_ASSISTANCE",
      "summary": "Elderly pilgrim collapsed...",
      "reportedAt": "2026-11-01T22:00:00.000Z",
      "receivedAt": "2026-11-01T22:00:01.000Z",
      "updatedAt": "2026-11-01T22:01:00.000Z",
      "zoneName": "VIP Bathing Ghat",
      "landmark": "Step 4 Pavilion"
    }
  }
  ```
- **Error Codes:** 404 `INCIDENT_NOT_FOUND`, 400 `VALIDATION_ERROR`, 429 `TOO_MANY_REQUESTS`.

---

## Staff Endpoints

### 5. Staff Profile Resolution

- **Route:** `GET /api/auth/me`
- **Auth:** `OPERATOR` | `RESPONDER` | `ADMIN`
- **Response:** Authenticated staff profile (`id`, `displayName`, `role`, `isActive`, `canAccessReporterContacts`).

### 6. Operational Incident Listing

- **Route:** `GET /api/staff/incidents`
- **Auth:** `OPERATOR` | `RESPONDER`
- **Query Params:** `status`, `category`, `priority`, `zoneId`, `search`, `page`, `limit`
- **Response:** Paginated list of operational incidents.

### 7. Incident Detail

- **Route:** `GET /api/staff/incidents/:incidentId`
- **Auth:** `OPERATOR` | `RESPONDER` (limited to team assignment)
- **Response:** Full incident record including audit event history.

### 8. Operator Triage & Review

- **Route:** `PATCH /api/staff/incidents/:incidentId/review`
- **Auth:** `OPERATOR`
- **Request Body (`IncidentReviewInputSchema`):** `status`, `priority`, `reviewNotes`, `duplicateOfIncidentId`, `cancellationReason`.
- **Response:** Updated incident record.

### 9. Candidate Team Suitability

- **Route:** `GET /api/staff/incidents/:incidentId/eligible-teams`
- **Auth:** `OPERATOR`
- **Response:** Transparent candidate teams with capability match, duty status, zone coverage, eligibility flag, recommendation score, and detailed reason strings.

### 10. Operator Team Assignment

- **Route:** `POST /api/staff/incidents/:incidentId/assignments`
- **Auth:** `OPERATOR`
- **Request Body (`TeamAssignmentInputSchema`):**
  - `teamId` (UUID, required)
  - `acknowledgementDeadlineMinutes` (integer, 1–120, default 15)
  - `acknowledgementDeadlineSeconds` (integer, 30–7200, optional prototype demo setting)
- **Response (HTTP 201 Created):**
  ```json
  {
    "data": {
      "assignmentId": "uuid",
      "incidentId": "uuid",
      "teamId": "uuid",
      "teamCode": "MED-01",
      "teamName": "Medical Rapid Response Alpha",
      "status": "PENDING",
      "assignedAt": "2026-11-01T22:00:00.000Z",
      "acknowledgementDeadline": "2026-11-01T22:01:00.000Z",
      "incidentStatus": "ASSIGNED"
    }
  }
  ```
- **Error Codes:** 409 `INCIDENT_ASSIGNMENT_CONFLICT`, 404 `INCIDENT_OR_TEAM_NOT_FOUND`, 400 `INVALID_ASSIGNMENT`.

### 11. Overdue Escalation Scanner

- **Route:** `POST /api/staff/escalations/scan`
- **Auth:** `OPERATOR` | `ADMIN`
- **Response:** Count and IDs of escalated assignments.

### 12. Operator Team Reassignment

- **Route:** `POST /api/staff/incidents/:incidentId/reassign`
- **Auth:** `OPERATOR`
- **Request Body (`TeamReassignmentInputSchema`):**
  - `newTeamId` (UUID, required)
  - `reason` (string, 3–1000 chars, required)
  - `acknowledgementDeadlineSeconds` (integer, 30–7200, optional)
- **Response (HTTP 201 Created):** Superseded assignment ID, released team code, new assignment record.

### 13. Field Responder Update

- **Route:** `POST /api/staff/incidents/:incidentId/responder-actions`
- **Auth:** `RESPONDER` (Must belong to actively assigned team)
- **Request Body (`ResponderUpdateInputSchema`):**
  - `action` (enum, required): `ACKNOWLEDGE` | `EN_ROUTE` | `ON_SCENE` | `REQUEST_SUPPORT` | `RESOLVE`
  - `notes` (string, required for `REQUEST_SUPPORT`)
  - `outcome` (string, required for `RESOLVE`)
- **Response:** Updated incident and assignment status.
- **Error Codes:** 409 `ASSIGNMENT_SUPERSEDED`, 403 `UNAUTHORIZED_TEAM_ACCESS`, 400 `INVALID_TRANSITION`.

### 14. Operator Final Closure

- **Route:** `POST /api/staff/incidents/:incidentId/close`
- **Auth:** `OPERATOR` | `ADMIN`
- **Request Body (`OperatorCloseInputSchema`):** `notes` (string, max 1000 chars, optional)
- **Response:** Closed incident record.

### 15. Protected Reporter Contact Inspection

- **Route:** `GET /api/staff/incidents/:incidentId/reporter-contact`
- **Auth:** `OPERATOR` | `RESPONDER` with explicit `can_access_reporter_contacts = true` permission.
