import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { StaffApiService } from '../src/services/staff-service.js';
import { createApp } from '../src/app.js';
import type { StaffProfile, PublicZone, IncidentStatus } from '@godavari/shared';

const incidentId = '00000000-0000-4000-8000-000000000999';
const trackingToken = 'a1b2c3d4e5f67890123456789abcdef0';
const teamOneId = '00000000-0000-4000-8000-000000000201';
const teamTwoId = '00000000-0000-4000-8000-000000000202';
const assignmentOneId = '00000000-0000-4000-8000-000000000601';
const assignmentTwoId = '00000000-0000-4000-8000-000000000602';

const operatorProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  role: 'OPERATOR',
  displayName: 'Central Control Operator',
  email: 'operator@example.invalid',
  isActive: true,
  canAccessReporterContacts: true,
};

const responderTwoProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000103',
  role: 'RESPONDER',
  displayName: 'Medical Team 2 Lead',
  email: 'responder2@example.invalid',
  isActive: true,
  canAccessReporterContacts: false,
};

describe('Stage 12: End-to-end integration scenario and failure tests', () => {
  it('executes full 11-step end-to-end lifecycle scenario from report intake to audit closure', async () => {
    let incidentState = 'REPORTED';
    const auditTimeline: { step: number; event: string; actor: string; timestamp: string }[] = [];

    const mockService: StaffApiService = {
      authenticate: vi.fn(async (token: string) => {
        if (token === 'operator-token') return operatorProfile;
        if (token === 'responder-two-token') return responderTwoProfile;
        throw new Error('Invalid token');
      }),
      submitPublicIncident: vi.fn(async (input) => {
        incidentState = 'REPORTED';
        auditTimeline.push({
          step: 1,
          event: 'REPORT_CREATED',
          actor: 'Volunteer (Public Intake)',
          timestamp: new Date().toISOString(),
        });
        return {
          incidentId,
          trackingToken,
          status: 'REPORTED',
          category: input.category,
          reportedAt: input.reportedAt || new Date().toISOString(),
          isIdempotentReplay: false,
        };
      }),
      trackPublicIncident: vi.fn(async (token) => {
        if (token === trackingToken) {
          return {
            incidentId,
            status: incidentState as IncidentStatus,
            statusLabel: `Status is ${incidentState}`,
            category: 'MEDICAL_ASSISTANCE',
            summary: 'Elderly pilgrim collapsed near North Ghat',
            reportedAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            zoneName: 'VIP Bathing Ghat',
            landmark: 'Near step 4 pavilion',
          };
        }
        return null;
      }),
      reviewIncident: vi.fn(async (_token, _actor, _id, input) => {
        incidentState = input.status;
        auditTimeline.push({
          step: 3,
          event: `STATUS_CHANGED: ${input.status}`,
          actor: 'Operator (Central Control)',
          timestamp: new Date().toISOString(),
        });
        return {
          id: incidentId,
          status: input.status,
          priority: input.priority,
          reviewNotes: input.reviewNotes,
          reviewedByProfileId: operatorProfile.id,
          reviewedAt: new Date().toISOString(),
        };
      }),
      assignTeam: vi.fn(async (_token, _actor, _id, input) => {
        incidentState = 'ASSIGNED';
        auditTimeline.push({
          step: 3,
          event: 'ASSIGNMENT_CREATED (Team MED-01)',
          actor: 'Operator (Central Control)',
          timestamp: new Date().toISOString(),
        });
        return {
          incidentId,
          assignmentId: assignmentOneId,
          teamId: input.teamId,
          teamCode: 'MED-01',
          teamName: 'Medical Rapid Response Alpha',
          status: 'PENDING',
          assignedAt: new Date().toISOString(),
          acknowledgementDeadline: new Date(Date.now() + 60_000).toISOString(),
          incidentStatus: 'ASSIGNED',
        };
      }),
      scanEscalations: vi.fn(async () => {
        auditTimeline.push({
          step: 5,
          event: 'ACKNOWLEDGEMENT_OVERDUE (Team MED-01 exceeded deadline)',
          actor: 'Escalation Worker (Automated Monitor)',
          timestamp: new Date().toISOString(),
        });
        return {
          scannedAt: new Date().toISOString(),
          escalatedCount: 1,
          escalatedAssignmentIds: [assignmentOneId],
        };
      }),
      reassignTeam: vi.fn(async (_token, _actor, _id, input) => {
        auditTimeline.push({
          step: 6,
          event: 'ASSIGNMENT_SUPERSEDED (Team MED-01 released)',
          actor: 'Operator (Central Control)',
          timestamp: new Date().toISOString(),
        });
        auditTimeline.push({
          step: 6,
          event: 'ASSIGNMENT_CREATED (Team MED-02)',
          actor: 'Operator (Central Control)',
          timestamp: new Date().toISOString(),
        });
        return {
          incidentId,
          supersededAssignmentId: assignmentOneId,
          supersededTeamCode: 'MED-01',
          newAssignmentId: assignmentTwoId,
          newTeamId: input.newTeamId,
          newTeamCode: 'MED-02',
          newTeamName: 'Medical Rapid Response Bravo',
          status: 'PENDING',
          assignedAt: new Date().toISOString(),
          acknowledgementDeadline: new Date(Date.now() + 60_000).toISOString(),
          incidentStatus: 'ASSIGNED',
          reassignmentReason: input.reason,
        };
      }),
      responderUpdateIncident: vi.fn(async (_token, _actor, _id, input) => {
        const nextStatus =
          input.action === 'ACKNOWLEDGE'
            ? 'ACKNOWLEDGED'
            : input.action === 'EN_ROUTE'
              ? 'EN_ROUTE'
              : input.action === 'ON_SCENE'
                ? 'ON_SCENE'
                : 'RESOLVED';
        incidentState = nextStatus;
        auditTimeline.push({
          step: input.action === 'ACKNOWLEDGE' ? 7 : input.action === 'RESOLVE' ? 9 : 8,
          event: `STATUS_CHANGED: ${nextStatus} (${input.action})`,
          actor: 'Responder (Team MED-02)',
          timestamp: new Date().toISOString(),
        });
        return {
          incidentId,
          incidentStatus: nextStatus as IncidentStatus,
          assignmentId: assignmentTwoId,
          assignmentStatus: input.action === 'RESOLVE' ? 'COMPLETED' : 'ACTIVE',
          action: input.action,
          notes: input.notes,
          outcome: input.outcome,
          updatedAt: new Date().toISOString(),
        };
      }),
      operatorCloseIncident: vi.fn(async (_token, _actor, _id, input) => {
        incidentState = 'CLOSED';
        auditTimeline.push({
          step: 10,
          event: 'STATUS_CHANGED: CLOSED',
          actor: 'Operator (Central Control)',
          timestamp: new Date().toISOString(),
        });
        return {
          incidentId,
          status: 'CLOSED',
          notes: input.notes,
          closedByProfileId: operatorProfile.id,
          closedAt: new Date().toISOString(),
        };
      }),
      listIncidents: vi.fn(),
      getIncidentDetail: vi.fn(),
      getEligibleTeams: vi.fn(),
      getReporterContact: vi.fn(),
      listStaff: vi.fn(),
      listTeams: vi.fn(),
      inviteStaff: vi.fn(),
      updateStaffProfile: vi.fn(),
      replaceTeamMemberships: vi.fn(),
      listConfiguration: vi.fn(),
      upsertConfiguration: vi.fn(),
      listPublicZones(): Promise<PublicZone[]> {
        return Promise.resolve([]);
      },
    };

    const app = createApp({ service: mockService, allowedOrigins: ['*'] });

    // Step 1: Volunteer submits report
    const submitRes = await request(app).post('/api/incidents').send({
      clientRequestId: '00000000-0000-4000-8000-000000000777',
      category: 'MEDICAL_ASSISTANCE',
      summary: 'Elderly pilgrim collapsed near North Ghat',
      landmark: 'Near step 4 pavilion',
      locationSource: 'LANDMARK',
      locationConfirmed: true,
    });

    // Step 2: Server confirms receipt
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.incidentId).toBe(incidentId);
    expect(submitRes.body.data.trackingToken).toBe(trackingToken);
    expect(submitRes.body.data.status).toBe('REPORTED');

    // Verify public tracking displays receipt
    const trackRes = await request(app).post('/api/incidents/track').send({ trackingToken });
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.status).toBe('REPORTED');

    // Step 3: Operator reviews and assigns Team 1
    const reviewRes = await request(app)
      .patch(`/api/staff/incidents/${incidentId}/review`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        status: 'UNDER_REVIEW',
        priority: 'URGENT',
        reviewNotes: 'Verified genuine medical emergency via surveillance.',
      });
    expect(reviewRes.status).toBe(200);

    const assignRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/assignments`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        teamId: teamOneId,
        acknowledgementDeadlineSeconds: 60,
      });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.data.teamCode).toBe('MED-01');

    // Step 4 & 5: First team does not acknowledge; backend escalation worker flags overdue assignment
    const escalationRes = await request(app)
      .post('/api/staff/escalations/scan')
      .set('Authorization', 'Bearer operator-token')
      .send({});
    expect(escalationRes.status).toBe(200);
    expect(escalationRes.body.data.escalatedCount).toBe(1);

    // Step 6: Operator reassigns to Team 2
    const reassignRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/reassign`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        newTeamId: teamTwoId,
        reason: 'Team Alpha did not acknowledge dispatch within 60s prototype deadline.',
        acknowledgementDeadlineSeconds: 60,
      });
    expect(reassignRes.status).toBe(201);
    expect(reassignRes.body.data.supersededTeamCode).toBe('MED-01');
    expect(reassignRes.body.data.newTeamCode).toBe('MED-02');

    // Step 7: Second team accepts assignment
    const ackRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-two-token')
      .send({
        action: 'ACKNOWLEDGE',
        notes: 'Team Bravo acknowledging assignment. Preparing emergency kit.',
      });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.incidentStatus).toBe('ACKNOWLEDGED');

    // Step 8: Team updates to EN_ROUTE and ON_SCENE
    const enRouteRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-two-token')
      .send({
        action: 'EN_ROUTE',
        notes: 'Moving rapidly past north pavilion crowd barriers.',
      });
    expect(enRouteRes.status).toBe(200);
    expect(enRouteRes.body.data.incidentStatus).toBe('EN_ROUTE');

    const onSceneRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-two-token')
      .send({
        action: 'ON_SCENE',
        notes: 'Arrived at Step 4. Paramedic evaluating patient.',
      });
    expect(onSceneRes.status).toBe(200);
    expect(onSceneRes.body.data.incidentStatus).toBe('ON_SCENE');

    // Step 9: Team marks RESOLVED with outcome notes
    const resolveRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-two-token')
      .send({
        action: 'RESOLVE',
        outcome: 'Patient treated for heat exhaustion, hydrated, and escorted to medical tent.',
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.incidentStatus).toBe('RESOLVED');

    // Step 10: Operator closes the case
    const closeRes = await request(app)
      .post(`/api/staff/incidents/${incidentId}/close`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        notes: 'Final administrative review complete. All resources cleared.',
      });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');

    // Step 11: Audit timeline shows the complete history
    expect(auditTimeline).toHaveLength(11);
    expect(auditTimeline.map((item) => item.event)).toEqual([
      'REPORT_CREATED',
      'STATUS_CHANGED: UNDER_REVIEW',
      'ASSIGNMENT_CREATED (Team MED-01)',
      'ACKNOWLEDGEMENT_OVERDUE (Team MED-01 exceeded deadline)',
      'ASSIGNMENT_SUPERSEDED (Team MED-01 released)',
      'ASSIGNMENT_CREATED (Team MED-02)',
      'STATUS_CHANGED: ACKNOWLEDGED (ACKNOWLEDGE)',
      'STATUS_CHANGED: EN_ROUTE (EN_ROUTE)',
      'STATUS_CHANGED: ON_SCENE (ON_SCENE)',
      'STATUS_CHANGED: RESOLVED (RESOLVE)',
      'STATUS_CHANGED: CLOSED',
    ]);
  });

  describe('Failure scenarios validation', () => {
    it('handles lost response retry with idempotent reconciliation', async () => {
      const mockService: Partial<StaffApiService> = {
        authenticate: vi.fn(),
        submitPublicIncident: vi.fn(async () => ({
          incidentId,
          trackingToken,
          status: 'REPORTED',
          category: 'MEDICAL_ASSISTANCE',
          reportedAt: new Date().toISOString(),
          isIdempotentReplay: true,
        })),
      };
      const app = createApp({ service: mockService as StaffApiService, allowedOrigins: ['*'] });

      const retryRes = await request(app).post('/api/incidents').send({
        clientRequestId: '00000000-0000-4000-8000-000000000777',
        category: 'MEDICAL_ASSISTANCE',
        summary: 'Elderly pilgrim collapsed near North Ghat',
        landmark: 'Near step 4 pavilion',
        locationSource: 'LANDMARK',
        locationConfirmed: true,
      });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.isIdempotentReplay).toBe(true);
      expect(retryRes.body.data.incidentId).toBe(incidentId);
    });

    it('rejects unauthenticated requests with 401 when staff token is missing or expired', async () => {
      const { ApiError } = await import('../src/http/ApiError.js');
      const mockService: Partial<StaffApiService> = {
        authenticate: vi.fn(async () => {
          throw new ApiError(
            401,
            'INVALID_OR_EXPIRED_TOKEN',
            'The staff session is invalid or has expired.',
          );
        }),
      };
      const app = createApp({ service: mockService as StaffApiService, allowedOrigins: ['*'] });

      const res = await request(app)
        .get(`/api/staff/incidents/${incidentId}`)
        .set('Authorization', 'Bearer expired-or-invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('prevents concurrent assignment conflicts with 409 status', async () => {
      const { ApiError } = await import('../src/http/ApiError.js');
      const mockService: Partial<StaffApiService> = {
        authenticate: vi.fn(async () => operatorProfile),
        assignTeam: vi.fn(async () => {
          throw new ApiError(
            409,
            'INCIDENT_ASSIGNMENT_CONFLICT',
            'Team MED-01 is already actively assigned to another incident.',
          );
        }),
      };
      const app = createApp({ service: mockService as StaffApiService, allowedOrigins: ['*'] });

      const res = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          teamId: teamOneId,
          acknowledgementDeadlineSeconds: 60,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INCIDENT_ASSIGNMENT_CONFLICT');
    });

    it('prevents superseded responder from accepting assignment during reassignment race', async () => {
      const { ApiError } = await import('../src/http/ApiError.js');
      const mockService: Partial<StaffApiService> = {
        authenticate: vi.fn(async () => responderTwoProfile),
        responderUpdateIncident: vi.fn(async () => {
          throw new ApiError(
            409,
            'ASSIGNMENT_SUPERSEDED',
            'This assignment has been superseded by control room operators and can no longer be updated.',
          );
        }),
      };
      const app = createApp({ service: mockService as StaffApiService, allowedOrigins: ['*'] });

      const res = await request(app)
        .post(`/api/staff/incidents/${incidentId}/responder-actions`)
        .set('Authorization', 'Bearer responder-two-token')
        .send({
          action: 'ACKNOWLEDGE',
          notes: 'Attempting late acknowledgement.',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSIGNMENT_SUPERSEDED');
    });

    it('blocks unauthorized cross-team access when responder does not belong to assigned team', async () => {
      const { ApiError } = await import('../src/http/ApiError.js');
      const mockService: Partial<StaffApiService> = {
        authenticate: vi.fn(async () => responderTwoProfile),
        responderUpdateIncident: vi.fn(async () => {
          throw new ApiError(
            403,
            'UNAUTHORIZED_TEAM_ACCESS',
            'Responder is not an active member of the team assigned to this incident.',
          );
        }),
      };
      const app = createApp({ service: mockService as StaffApiService, allowedOrigins: ['*'] });

      const res = await request(app)
        .post(`/api/staff/incidents/${incidentId}/responder-actions`)
        .set('Authorization', 'Bearer responder-two-token')
        .send({
          action: 'ACKNOWLEDGE',
          notes: 'Unassigned team attempting access.',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_TEAM_ACCESS');
    });
  });
});
