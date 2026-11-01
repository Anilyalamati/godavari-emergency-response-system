import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PublicIncidentCreateInput,
  PublicIncidentCreatedResponse,
  PublicZone,
} from '@godavari/shared';
import { createApp } from '../src/app.js';
import type { StaffApiService } from '../src/services/staff-service.js';

const sampleZone: PublicZone = {
  id: '00000000-0000-4000-8000-000000000201',
  zoneCode: 'VIP_GHAT',
  name: 'VIP Bathing Ghat',
  description: 'Designated area for pilgrims near North Entrance',
  isDemo: true,
  fictionalLocationLabel: 'Demonstration Zone A',
};

const validIncidentInput: PublicIncidentCreateInput = {
  clientRequestId: '00000000-0000-4000-8000-000000000999',
  category: 'MEDICAL_ASSISTANCE',
  summary: 'Elderly pilgrim collapsed on steps due to heat exhaustion',
  zoneId: '00000000-0000-4000-8000-000000000201',
  landmark: 'Near Step 4, North Pavilion',
  callbackPhone: '+919876543210',
  locationSource: 'LANDMARK',
  locationConfirmed: true,
};

const createdIncidentResponse: PublicIncidentCreatedResponse = {
  incidentId: '00000000-0000-4000-8000-000000000333',
  trackingToken: 'a1b2c3d4e5f67890123456789abcdef0',
  status: 'REPORTED',
  reportedAt: '2026-10-28T10:00:00.000Z',
  category: 'MEDICAL_ASSISTANCE',
  summary: 'Elderly pilgrim collapsed on steps due to heat exhaustion',
  zoneId: '00000000-0000-4000-8000-000000000201',
  zoneName: 'VIP Bathing Ghat',
  landmark: 'Near Step 4, North Pavilion',
  isIdempotentReplay: false,
};

function makeService(overrides: Partial<StaffApiService> = {}): StaffApiService {
  return {
    authenticate: vi.fn(),
    listIncidents: vi.fn(),
    getReporterContact: vi.fn(),
    listStaff: vi.fn(),
    listTeams: vi.fn(),
    inviteStaff: vi.fn(),
    updateStaffProfile: vi.fn(),
    replaceTeamMemberships: vi.fn(),
    listConfiguration: vi.fn(),
    upsertConfiguration: vi.fn(),
    listPublicZones: vi.fn(async () => [sampleZone]),
    submitPublicIncident: vi.fn(async () => createdIncidentResponse),
    trackPublicIncident: vi.fn(async () => ({
      incidentId: createdIncidentResponse.incidentId,
      status: 'REPORTED',
      statusLabel: 'Report Received by Control Room',
      category: 'MEDICAL_ASSISTANCE',
      summary: 'Elderly pilgrim collapsed on steps due to heat exhaustion',
      reportedAt: '2026-10-28T10:00:00.000Z',
      receivedAt: '2026-10-28T10:01:00.000Z',
      updatedAt: '2026-10-28T10:01:00.000Z',
      zoneName: 'VIP Bathing Ghat',
      landmark: 'Near Step 4, North Pavilion',
    })),
    ...overrides,
  };
}

describe('Public emergency reporting endpoints', () => {
  let service: StaffApiService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    service = makeService();
    app = createApp({ service });
  });

  it('GET /api/zones returns the public zone catalogue without authentication', async () => {
    const response = await request(app).get('/api/zones');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(sampleZone);
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('POST /api/incidents creates a report and returns 201 Created with tracking token', async () => {
    const response = await request(app).post('/api/incidents').send(validIncidentInput);

    expect(response.status).toBe(201);
    expect(response.body.data.incidentId).toBe(createdIncidentResponse.incidentId);
    expect(response.body.data.trackingToken).toBe(createdIncidentResponse.trackingToken);
    expect(response.body.data.status).toBe('REPORTED');
    expect(response.body.data.isIdempotentReplay).toBe(false);
    expect(service.submitPublicIncident).toHaveBeenCalledWith(validIncidentInput);
  });

  it('POST /api/incidents returns 200 OK on idempotent retry without creating a second incident', async () => {
    service.submitPublicIncident = vi.fn(async () => ({
      ...createdIncidentResponse,
      isIdempotentReplay: true,
    }));

    const response = await request(app).post('/api/incidents').send(validIncidentInput);

    expect(response.status).toBe(200);
    expect(response.body.data.incidentId).toBe(createdIncidentResponse.incidentId);
    expect(response.body.data.isIdempotentReplay).toBe(true);
  });

  it('POST /api/incidents rejects submission when location confirmation is missing', async () => {
    const unconfirmed = {
      ...validIncidentInput,
      locationConfirmed: false,
    };

    const response = await request(app).post('/api/incidents').send(unconfirmed);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /api/incidents rejects submission when description is too short', async () => {
    const shortDesc = {
      ...validIncidentInput,
      summary: 'ab',
    };

    const response = await request(app).post('/api/incidents').send(shortDesc);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /api/incidents returns 503 when the reporting service is unavailable', async () => {
    const appWithoutService = createApp({ service: null });
    const response = await request(appWithoutService)
      .post('/api/incidents')
      .send(validIncidentInput);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('POST /api/incidents/track returns approved public tracking fields for a valid token', async () => {
    const validToken = 'a1b2c3d4e5f67890123456789abcdef0';
    const response = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: validToken });

    expect(response.status).toBe(200);
    expect(response.body.data.incidentId).toBe(createdIncidentResponse.incidentId);
    expect(response.body.data.status).toBe('REPORTED');
    expect(response.body.data.statusLabel).toBe('Report Received by Control Room');
    expect(response.body.data.summary).toBe(validIncidentInput.summary);
    expect(response.body.data.zoneName).toBe('VIP Bathing Ghat');
    expect(response.body.data.landmark).toBe(validIncidentInput.landmark);
    // Verify privacy safety: sensitive fields MUST NOT be present
    expect(response.body.data.callbackPhone).toBeUndefined();
    expect(response.body.data.phoneE164).toBeUndefined();
    expect(response.body.data.reviewNotes).toBeUndefined();
    expect(response.body.data.internalNotes).toBeUndefined();
    expect(response.body.data.trackingToken).toBeUndefined();
    expect(service.trackPublicIncident).toHaveBeenCalledWith(validToken);
  });

  it('POST /api/incidents/track returns 404 when tracking token does not match any incident', async () => {
    const nonExistentToken = 'deadbeefdeadbeefdeadbeefdeadbeef';
    const { ApiError } = await import('../src/http/ApiError.js');
    service.trackPublicIncident = vi.fn(async () => {
      throw new ApiError(
        404,
        'INCIDENT_NOT_FOUND',
        'No incident found matching this tracking token.',
      );
    });

    const response = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: nonExistentToken });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INCIDENT_NOT_FOUND');
    expect(response.body.data).toBeUndefined();
  });

  it('POST /api/incidents/track rejects malformed or non-hex tracking tokens', async () => {
    const response = await request(app)
      .post('/api/incidents/track')
      .send({ trackingToken: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /api/incidents accepts offline queue draft reportedAt timestamp and trackingToken', async () => {
    const queuedInput: PublicIncidentCreateInput = {
      ...validIncidentInput,
      reportedAt: '2026-10-28T09:30:00.000Z',
      trackingToken: '11223344556677889900aabbccddeeff',
    };

    const response = await request(app).post('/api/incidents').send(queuedInput);

    expect(response.status).toBe(201);
    expect(service.submitPublicIncident).toHaveBeenCalledWith(queuedInput);
  });
});
