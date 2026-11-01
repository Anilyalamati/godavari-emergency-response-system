# Five-Minute Demonstration Script

This script walks through the complete end-to-end incident coordination lifecycle using **three separate browser windows or devices**.

> [!IMPORTANT]
> **Safety Notice:** This is a software-only hackathon prototype. All locations, teams, and incidents are synthetic fixtures. For genuine emergencies during the festival, citizens must dial **112**.

---

## Pre-Demo Setup (1 Minute)

Open three separate browser profiles, incognito windows, or distinct devices:

1. **Window A (Public Volunteer):** Open `http://localhost:3000/report`
2. **Window B (Control Room Operator):** Open `http://localhost:3000/staff/login` → Sign in with Operator credentials (`operator@example.invalid` / seed password) → Redirects to `/operator`
3. **Window C (Field Responder Unit):** Open `http://localhost:3000/staff/login` in mobile viewport mode → Sign in with Responder credentials (`responder@example.invalid` / seed password) → Redirects to `/responder`

---

## 5-Minute Script

```
0:00 - 1:00  [Window A] Public Intake & Resilience
1:00 - 2:00  [Window B] Operator Triage, Verification & Initial Dispatch
2:00 - 3:00  [Background] Missed Acknowledgement & Automated Escalation
3:00 - 4:00  [Window B & C] Operator Reassignment & Responder Acceptance
4:00 - 5:00  [Window C, A, B] Tactical Progression, Public Status & Case Closure
```

---

### Minute 1: Public Intake & Offline Resilience

- **Window A (Volunteer):**
  1. Highlight the top safety disclaimer (`Hackathon prototype — not an emergency service`).
  2. Toggle language switcher between **English** and **తెలుగు** to show bilingual accessibility and the fluent-speaker review notice.
  3. Select category: **Medical Assistance**.
  4. Enter description: `"Elderly pilgrim collapsed near ghat steps, breathing but weak."`
  5. Select Zone: **VIP Bathing Ghat**.
  6. Landmark: `"Near step 4 pavilion, opposite first aid tent #3"`.
  7. Confirm incident location checkbox.
  8. Click **Submit Emergency Report**.
  9. Show confirmation card: note the **Incident ID** and copy the private **Tracking Token**.
  10. Demonstrate `/track`: Click **Track incident status**, paste the token, and observe that public status shows `REPORTED` while redacting all internal notes and staff identities.

---

### Minute 2: Operator Triage, Mapping & Initial Dispatch

- **Window B (Operator):**
  1. Observe the new incident arriving in real time without manual page refresh (`🟢 Live (Realtime Connected)` indicator).
  2. Switch between **Split View**, **Queue Only**, and **Operational Map**. Show the amber manual pin positioned at VIP Bathing Ghat.
  3. Click **Inspect Incident**: Note veracity tag (`Manual / Landmark`, coordinates not live GPS).
  4. Click **Review Incident**: Set priority to `URGENT`, status to `UNDER_REVIEW`, and save review notes.
  5. Inspect **Recommended Teams**:
     - Review capability match, duty status, and transparent suitability scores.
     - Select **Team Alpha (DEMO-T01)**.
     - Choose the **60 seconds (Prototype demo setting)** acknowledgement deadline.
     - Click **Dispatch Team Alpha**.

---

### Minute 3: Missed Acknowledgement & Automated Escalation

- **System Behavior:**
  1. Team Alpha receives the dispatch but does not acknowledge (simulating field distraction or radio dead-zone).
  2. Fast-forward or allow 60 seconds to elapse.
  3. The backend `EscalationWorker` scans active assignments and flags the overdue deadline.
- **Window B (Operator):**
  1. A pulsing visual alert appears: `⚠️ Dispatch Acknowledgement Overdue`.
  2. The incident card displays an attention-grabbing `⏰ ACKNOWLEDGEMENT OVERDUE` badge.
  3. Explain that browser timers are not trusted; the escalation is an authoritative PostgreSQL audit event.

---

### Minute 4: Operator Reassignment & Responder Acceptance

- **Window B (Operator):**
  1. Click **Reassign Team**.
  2. Select **Team Bravo (DEMO-T03)**.
  3. Document mandatory reassignment reason: `"Team Alpha uncontactable past 60s demo deadline. Reassigning to Bravo."`
  4. Confirm reassignment. Team Alpha is automatically released (`SUPERSEDED`), and Team Bravo is assigned.
- **Window C (Responder Unit - Team Bravo):**
  1. The assigned incident appears immediately on the mobile responder screen.
  2. Show incident category, landmark notes, and action buttons.
  3. Click **Acknowledge Assignment**. Assignment transitions to `ACKNOWLEDGED`.

---

### Minute 5: Progression, Public Status & Case Closure

- **Window C (Responder Unit):**
  1. Click **Update: En Route →** as the team moves past crowd barriers.
  2. Click **Update: On-Scene →** upon arrival at Step 4.
  3. Click **Resolve Incident ✓**, entering outcome: `"Patient evaluated for heat exhaustion, hydrated, and stabilized in first aid tent."`
  4. Team Bravo availability is released back to `ON_DUTY` for future allocations.
- **Window A (Public Volunteer):**
  1. Refresh or check tracking lookup on `/track`.
  2. Show that status now shows `RESOLVED`, keeping citizens informed without leaking internal responder telemetry.
- **Window B (Operator):**
  1. Operator inspects the incident card showing `RESOLVED` status and responder outcome notes.
  2. Click **Close Incident**, entering final administrative notes.
  3. Inspect the complete **Audit Timeline**: all 11 sequential events (`REPORT_CREATED` → `ASSIGNMENT_CREATED` → `ACKNOWLEDGEMENT_OVERDUE` → `ASSIGNMENT_SUPERSEDED` → `ACKNOWLEDGED` → `EN_ROUTE` → `ON_SCENE` → `RESOLVED` → `CLOSED`) are permanently recorded with actors and timestamps.
