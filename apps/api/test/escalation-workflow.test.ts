import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { StaffApiService } from '../src/services/staff-service.js';
import { createApp } from '../src/app.js';
import { EscalationWorker } from '../src/workers/escalation-worker.js';
import type { PublicZone, StaffProfile } from '@godavari/shared';

const incidentId = '00000000-0000-4000-8000-000000000301';
const previousAssignmentId = '00000000-0000-4000-8000-000000000601';
const newAssignmentId = '00000000-0000-4000-8000-000000000602';
const newTeamId = '00000000-0000-4000-8000-000000000202';

const operatorProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  role: 'OPERATOR',
  displayName: 'Central Operator',
  email: 'operator@example.invalid',
  isActive: true,
  canAccessReporterContacts: true,
};

const responderProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  role: 'RESPONDER',
  displayName: 'Field Responder Unit',
  email: 'responder@example.invalid',
  isActive: true,
  canAccessReporterContacts: false,
};

function createMockService(overrides: Partial<StaffApiService> = {}): StaffApiService {
  return {
    authenticate: vi.fn(async (token: string) => {
      if (token === 'operator-token') return operatorProfile;
      if (token === 'responder-token') return responderProfile;
      throw new Error('Invalid token');
    }),
    listIncidents: vi.fn(),
    getIncidentDetail: vi.fn(),
    reviewIncident: vi.fn(),
    getEligibleTeams: vi.fn(),
    assignTeam: vi.fn(),
    responderUpdateIncident: vi.fn(),
    operatorCloseIncident: vi.fn(),
    reassignTeam: vi.fn(async (_token, _actor, incId, input) => {
      return {
        incidentId: incId,
        supersededAssignmentId: previousAssignmentId,
        supersededTeamCode: 'MED-01',
        newAssignmentId,
        newTeamId: input.newTeamId,
        newTeamCode: 'MED-02',
        newTeamName: 'Medical Rapid Response Bravo',
        status: 'PENDING',
        assignedAt: new Date().toISOString(),
        acknowledgementDeadline: new Date(Date.now() + 60_000).toISOString(),
        incidentStatus: 'ASSIGNED' as const,
        reassignmentReason: input.reason,
      };
    }),
    scanEscalations: vi.fn(async () => {
      return {
        scannedAt: new Date().toISOString(),
        escalatedCount: 1,
        escalatedAssignmentIds: [previousAssignmentId],
      };
    }),
    getReporterContact: vi.fn(),
    listStaff: vi.fn(),
    listTeams: vi.fn(),
    inviteStaff: vi.fn(),
    updateStaffProfile: vi.fn(),
    replaceTeamMemberships: vi.fn(),
    listConfiguration: vi.fn(),
    upsertConfiguration: vi.fn(),
    submitPublicIncident: vi.fn(),
    listPublicZones(): Promise<PublicZone[]> {
      return Promise.resolve([]);
    },
    ...overrides,
  };
}

describe('Stage 8: Missed-acknowledgement escalation and reassignment API', () => {
  it('allows operators to trigger escalation scan', async () => {
    const service = createMockService();
    const app = createApp({ service });

    const response = await request(app)
      .post('/api/staff/escalations/scan')
      .set('Authorization', 'Bearer operator-token');

    expect(response.status).toBe(200);
    expect(response.body.data.escalatedCount).toBe(1);
    expect(response.body.data.escalatedAssignmentIds).toEqual([previousAssignmentId]);
    expect(service.scanEscalations).toHaveBeenCalledWith('operator-token');
  });

  it('rejects escalation scan from responders (403)', async () => {
    const service = createMockService();
    const app = createApp({ service });

    const response = await request(app)
      .post('/api/staff/escalations/scan')
      .set('Authorization', 'Bearer responder-token');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('allows operators to reassign an incident with mandatory reason and prototype deadline', async () => {
    const service = createMockService();
    const app = createApp({ service });

    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/reassign`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        newTeamId,
        reason: 'Team uncontactable after 60s demo deadline. Reassigned to Bravo.',
        acknowledgementDeadlineSeconds: 60,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.newTeamId).toBe(newTeamId);
    expect(response.body.data.supersededAssignmentId).toBe(previousAssignmentId);
    expect(response.body.data.reassignmentReason).toContain('Team uncontactable');
    expect(service.reassignTeam).toHaveBeenCalledTimes(1);
  });

  it('rejects reassignment with empty or too-short reason (400)', async () => {
    const service = createMockService();
    const app = createApp({ service });

    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/reassign`)
      .set('Authorization', 'Bearer operator-token')
      .send({
        newTeamId,
        reason: '  ',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects reassignment by responders (403)', async () => {
    const service = createMockService();
    const app = createApp({ service });

    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/reassign`)
      .set('Authorization', 'Bearer responder-token')
      .send({
        newTeamId,
        reason: 'Trying to self-reassign',
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('handles background escalation worker lifecycle and restart recovery', async () => {
    const scanFn = vi.fn().mockResolvedValue({
      scannedAt: new Date().toISOString(),
      escalatedCount: 2,
      escalatedAssignmentIds: ['id-1', 'id-2'],
    });
    const service = createMockService({ scanEscalations: scanFn });

    const worker = new EscalationWorker(service, { intervalMs: 50 });
    expect(worker.isRunning).toBe(false);

    // Initial run triggers scan immediately for restart recovery
    worker.start();
    expect(worker.isRunning).toBe(true);

    // Verify runOnce executed
    const count = await worker.runOnce();
    expect(count).toBe(2);
    expect(scanFn).toHaveBeenCalled();

    // Verify resilient error handling in worker
    scanFn.mockRejectedValueOnce(new Error('Network transient partition'));
    const safeCount = await worker.runOnce();
    expect(safeCount).toBe(0); // Handled gracefully without throw

    worker.stop();
    expect(worker.isRunning).toBe(false);
  });
});
