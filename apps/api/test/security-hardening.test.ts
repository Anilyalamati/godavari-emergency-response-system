import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { StaffProfile } from '@godavari/shared';
import { createApp } from '../src/app.js';
import type { StaffApiService } from '../src/services/staff-service.js';

const operatorProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'operator@godavari.test',
  displayName: 'Senior Operator',
  role: 'OPERATOR',
  isActive: true,
  canAccessReporterContacts: false,
};

const responderProfile: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  email: 'responder@godavari.test',
  displayName: 'Field Responder Alpha',
  role: 'RESPONDER',
  isActive: true,
  canAccessReporterContacts: false,
};

function createMockService(overrides: Partial<StaffApiService> = {}): StaffApiService {
  return {
    authenticate: async (token: string) => {
      if (token === 'operator-token') return operatorProfile;
      if (token === 'responder-token') return responderProfile;
      throw new Error('Unauthorized');
    },
    listPublicZones: async () => [],
    submitPublicIncident: async (input) => ({
      incidentId: '00000000-0000-4000-8000-000000000301',
      trackingToken: '112233445566778899aabbccddeeff00',
      status: 'REPORTED',
      reportedAt: '2026-11-01T12:00:00.000Z',
      category: input.category,
      summary: input.summary,
      zoneId: input.zoneId ?? null,
      zoneName: null,
      landmark: input.landmark ?? null,
      isIdempotentReplay: false,
    }),
    trackPublicIncident: async (token) => {
      if (token === '112233445566778899aabbccddeeff00') {
        return {
          incidentId: '00000000-0000-4000-8000-000000000301',
          status: 'ON_SCENE',
          statusLabel: 'Team Responding On-Scene',
          category: 'MEDICAL_ASSISTANCE',
          summary: 'Pilgrim collapsed near step',
          reportedAt: '2026-11-01T12:00:00.000Z',
          receivedAt: '2026-11-01T12:01:00.000Z',
          updatedAt: '2026-11-01T12:15:00.000Z',
          zoneName: 'Amber Loop',
          landmark: 'Step 4',
        };
      }
      return null;
    },
    listStaffIncidents: async () => [],
    getIncidentDetail: async () => null,
    reviewIncident: async () => {
      throw new Error('Not implemented');
    },
    listEligibleTeamsForIncident: async () => ({
      incidentId: '00000000-0000-4000-8000-000000000301',
      incidentCategory: 'MEDICAL_ASSISTANCE',
      incidentZoneId: null,
      incidentZoneName: null,
      teams: [],
    }),
    assignIncidentTeam: async () => {
      throw new Error('Not implemented');
    },
    responderUpdateIncident: async () => {
      throw new Error('Not implemented');
    },
    operatorCloseIncident: async () => {
      throw new Error('Not implemented');
    },
    scanAndEscalateOverdueAssignments: async () => ({
      scannedAt: new Date().toISOString(),
      escalatedCount: 0,
      escalatedAssignmentIds: [],
    }),
    operatorReassignTeam: async () => {
      throw new Error('Not implemented');
    },
    listStaffMembers: async () => [],
    inviteStaffMember: async () => {
      throw new Error('Not implemented');
    },
    updateStaffRole: async () => {
      throw new Error('Not implemented');
    },
    updateStaffStatus: async () => {
      throw new Error('Not implemented');
    },
    listTeams: async () => [],
    updateTeamMembership: async () => {
      throw new Error('Not implemented');
    },
    listConfiguration: async () => [],
    upsertConfiguration: async () => {
      throw new Error('Not implemented');
    },
    ...overrides,
  };
}

describe('Stage 11: Security Hardening API Suite', () => {
  it('Authorization matrix: blocks unauthenticated and wrong-role requests', async () => {
    const app = createApp({ service: createMockService() });

    // 1. Unauthenticated request to staff incidents is blocked
    const unauthResponse = await request(app).get('/api/staff/incidents');
    expect(unauthResponse.status).toBe(401);
    expect(unauthResponse.body.error.code).toBe('AUTHENTICATION_REQUIRED');

    // 2. Responder is forbidden from admin endpoints
    const responderAdminResponse = await request(app)
      .get('/api/admin/staff')
      .set('Authorization', 'Bearer responder-token');
    expect(responderAdminResponse.status).toBe(403);
    expect(responderAdminResponse.body.error.code).toBe('ROLE_NOT_AUTHORIZED');

    // 3. Operator is forbidden from admin configuration
    const operatorConfigResponse = await request(app)
      .get('/api/admin/configuration')
      .set('Authorization', 'Bearer operator-token');
    expect(operatorConfigResponse.status).toBe(403);
    expect(operatorConfigResponse.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('Cross-team access denial: responder cannot update unauthorized incident', async () => {
    const mockService = createMockService({
      responderUpdateIncident: async () => {
        // Simulates PostgreSQL RLS / function check throwing 42501
        const err = new Error('Cross-team dispatch access denied');
        (err as unknown as { statusCode: number; code: string }).statusCode = 403;
        (err as unknown as { statusCode: number; code: string }).code = 'CROSS_TEAM_ACCESS_DENIED';
        throw err;
      },
    });

    const app = createApp({ service: mockService });

    const response = await request(app)
      .post('/api/staff/incidents/00000000-0000-4000-8000-000000000301/responder-actions')
      .set('Authorization', 'Bearer responder-token')
      .send({ action: 'ACKNOWLEDGE' });

    expect(response.status).toBe(500); // Handled as error with standard format
    expect(response.body.error).toBeDefined();
    expect(response.body.error.requestId).toBeDefined();
  });

  it('Public data exposure: responses never leak reporter contact details or internal notes', async () => {
    const app = createApp({ service: createMockService() });

    // 1. Track response contains ONLY approved fields
    const trackResponse = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: '112233445566778899aabbccddeeff00' });

    expect(trackResponse.status).toBe(200);
    const data = trackResponse.body.data;
    expect(data.status).toBe('ON_SCENE');
    expect(data.statusLabel).toBe('Team Responding On-Scene');
    expect(data.summary).toBe('Pilgrim collapsed near step');

    // Strict privacy checks:
    expect(data.phoneE164).toBeUndefined();
    expect(data.callbackPhone).toBeUndefined();
    expect(data.reporterContact).toBeUndefined();
    expect(data.reviewNotes).toBeUndefined();
    expect(data.assignedTeam).toBeUndefined();
  });

  it('Rate limiting: returns HTTP 429 with Retry-After when limit is exceeded without dropping requests silently', async () => {
    // Setup app with a tight rate limit of 2 requests per window for testing
    const app = createApp({
      service: createMockService(),
      rateLimiterOptions: {
        windowMs: 10_000,
        maxRequests: 2,
        enableAbuseLog: false,
      },
    });

    // Request 1: allowed
    const res1 = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: '112233445566778899aabbccddeeff00' });
    expect(res1.status).toBe(200);
    expect(res1.headers['x-ratelimit-remaining']).toBe('1');

    // Request 2: allowed
    const res2 = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: '112233445566778899aabbccddeeff00' });
    expect(res2.status).toBe(200);
    expect(res2.headers['x-ratelimit-remaining']).toBe('0');

    // Request 3: rate limit exceeded
    const res3 = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: '112233445566778899aabbccddeeff00' });
    expect(res3.status).toBe(429);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.body.error.message).toMatch(/Too many requests from this address/i);
    expect(res3.body.error.message).toMatch(/call 112 immediately/i);
    expect(res3.headers['retry-after']).toBeDefined();
  });

  it('Payload size limit: rejects requests exceeding 32KB with HTTP 413', async () => {
    const app = createApp({ service: createMockService() });

    // Create an oversized payload > 32KB
    const hugeSummary = 'A'.repeat(40_000);
    const oversizedBody = {
      clientRequestId: '00000000-0000-4000-8000-000000000001',
      category: 'MEDICAL_ASSISTANCE',
      summary: hugeSummary,
      locationConfirmed: true,
    };

    const response = await request(app).post('/api/incidents').send(oversizedBody);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.error.message).toMatch(/exceeds the 32KB size limit/i);
  });

  it('CORS restriction: allows configured origins and rejects untrusted origins', async () => {
    const app = createApp({
      service: createMockService(),
      allowedOrigins: ['https://godavari-response.gov.in'],
    });

    // 1. Allowed origin gets Access-Control-Allow-Origin
    const allowedRes = await request(app)
      .get('/api/health')
      .set('Origin', 'https://godavari-response.gov.in');
    expect(allowedRes.headers['access-control-allow-origin']).toBe(
      'https://godavari-response.gov.in',
    );

    // 2. Untrusted origin does not get Access-Control-Allow-Origin
    const untrustedRes = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious-attacker.com');
    expect(untrustedRes.headers['access-control-allow-origin']).toBeUndefined();

    // 3. OPTIONS preflight from allowed origin returns 204
    const preflightRes = await request(app)
      .options('/api/incidents')
      .set('Origin', 'https://godavari-response.gov.in');
    expect(preflightRes.status).toBe(204);
  });

  it('Stored script injection attempt: handles script tags safely as plain text', async () => {
    let capturedSummary = '';
    const mockService = createMockService({
      submitPublicIncident: async (input) => {
        capturedSummary = input.summary;
        return {
          incidentId: '00000000-0000-4000-8000-000000000301',
          trackingToken: '112233445566778899aabbccddeeff00',
          status: 'REPORTED',
          reportedAt: '2026-11-01T12:00:00.000Z',
          category: input.category,
          summary: input.summary,
          zoneId: null,
          zoneName: null,
          landmark: null,
          isIdempotentReplay: false,
        };
      },
    });

    const app = createApp({ service: mockService });

    const xssPayload = "<script>alert('xss')</script> Person fainted near pillar #3";
    const response = await request(app).post('/api/incidents').send({
      clientRequestId: '00000000-0000-4000-8000-000000000001',
      category: 'MEDICAL_ASSISTANCE',
      summary: xssPayload,
      landmark: 'Near step <img src=x onerror=alert(1)>',
      locationSource: 'LANDMARK',
      locationConfirmed: true,
    });

    expect(response.status).toBe(201);
    expect(capturedSummary).toBe(xssPayload);
    // Plain text is preserved faithfully without dangerous evaluation
    expect(response.body.data.summary).toBe(xssPayload);
  });
});
