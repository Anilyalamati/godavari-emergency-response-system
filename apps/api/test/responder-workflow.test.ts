import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { StaffApiService } from '../src/services/staff-service.js';
import { createApp } from '../src/app.js';
import type { StaffProfile } from '@godavari/shared';

const incidentId = '00000000-0000-4000-8000-000000000301';
const assignmentId = '00000000-0000-4000-8000-000000000601';

const responderProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  role: 'RESPONDER',
  displayName: 'Field Responder Unit',
  email: 'responder@example.invalid',
  isActive: true,
  canAccessReporterContacts: false,
};

const operatorProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  role: 'OPERATOR',
  displayName: 'Central Operator',
  email: 'operator@example.invalid',
  isActive: true,
  canAccessReporterContacts: true,
};

function createMockService(overrides: Partial<StaffApiService> = {}): StaffApiService {
  return {
    authenticate: vi.fn(async (token: string) => {
      if (token === 'responder-token') return responderProfile;
      if (token === 'operator-token') return operatorProfile;
      throw new Error('Invalid token');
    }),
    listIncidents: vi.fn(),
    getIncidentDetail: vi.fn(),
    reviewIncident: vi.fn(),
    getEligibleTeams: vi.fn(),
    assignTeam: vi.fn(),
    responderUpdateIncident: vi.fn(async (_token, _actor, incId, input) => {
      return {
        incidentId: incId,
        incidentStatus:
          input.action === 'ACKNOWLEDGE'
            ? 'ACKNOWLEDGED'
            : input.action === 'EN_ROUTE'
              ? 'EN_ROUTE'
              : input.action === 'ON_SCENE'
                ? 'ON_SCENE'
                : input.action === 'RESOLVE'
                  ? 'RESOLVED'
                  : 'ASSIGNED',
        assignmentId,
        assignmentStatus: input.action === 'RESOLVE' ? 'COMPLETED' : 'ACKNOWLEDGED',
        action: input.action,
        supportRequested: input.action === 'REQUEST_SUPPORT',
        notes: input.notes,
        isRepeat: false,
      };
    }),
    operatorCloseIncident: vi.fn(async (_token, _actor, incId) => {
      return {
        incidentId: incId,
        incidentStatus: 'CLOSED',
        closedAt: '2026-10-30T10:00:00.000Z',
        isRepeat: false,
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
    listPublicZones: vi.fn(),
    submitPublicIncident: vi.fn(),
    ...overrides,
  };
}

describe('Stage 7: Responder Workflow API', () => {
  it('requires authentication for responder actions', async () => {
    const app = createApp({ service: createMockService() });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .send({ action: 'ACKNOWLEDGE' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects operators from calling responder action endpoint', async () => {
    const app = createApp({ service: createMockService() });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer operator-token')
      .send({ action: 'ACKNOWLEDGE' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('allows verified responder to acknowledge assignment', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'ACKNOWLEDGE', notes: 'Copy that, responding.' });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatus).toBe('ACKNOWLEDGED');
    expect(service.responderUpdateIncident).toHaveBeenCalledWith(
      'responder-token',
      responderProfile,
      incidentId,
      { action: 'ACKNOWLEDGE', notes: 'Copy that, responding.' },
    );
  });

  it('allows responder to update to EN_ROUTE', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'EN_ROUTE' });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatus).toBe('EN_ROUTE');
  });

  it('allows responder to update to ON_SCENE', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'ON_SCENE' });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatus).toBe('ON_SCENE');
  });

  it('allows responder to request additional support with notes', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'REQUEST_SUPPORT', notes: 'Need water tanker for barrier cooling' });

    expect(response.status).toBe(200);
    expect(response.body.data.supportRequested).toBe(true);
  });

  it('rejects REQUEST_SUPPORT without notes', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'REQUEST_SUPPORT' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('allows responder to mark RESOLVED with required outcome', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({
        action: 'RESOLVE',
        outcome: 'Child safely reunited with parents at helpdesk.',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatus).toBe('RESOLVED');
    expect(response.body.data.assignmentStatus).toBe('COMPLETED');
  });

  it('rejects RESOLVE without outcome description', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/responder-actions`)
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'RESOLVE' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('allows operator to perform final closure on RESOLVED incident', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/close`)
      .set('Authorization', 'Bearer operator-token')
      .send({ notes: 'Verified and closed.' });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatus).toBe('CLOSED');
    expect(service.operatorCloseIncident).toHaveBeenCalledWith(
      'operator-token',
      operatorProfile,
      incidentId,
      { notes: 'Verified and closed.' },
    );
  });

  it('bars responders from performing final operator closure', async () => {
    const service = createMockService();
    const app = createApp({ service });
    const response = await request(app)
      .post(`/api/staff/incidents/${incidentId}/close`)
      .set('Authorization', 'Bearer responder-token')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });
});
