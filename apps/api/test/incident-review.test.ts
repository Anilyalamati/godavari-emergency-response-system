import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncidentDetail, IncidentSummary, StaffProfile } from '@godavari/shared';
import { ApiError } from '../src/http/ApiError.js';
import { createApp } from '../src/app.js';
import type { StaffApiService } from '../src/services/staff-service.js';

const operator: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'operator@example.invalid',
  displayName: 'Synthetic operator',
  role: 'OPERATOR',
  isActive: true,
  canAccessReporterContacts: true,
};

const responder: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  email: 'responder@example.invalid',
  displayName: 'Synthetic responder',
  role: 'RESPONDER',
  isActive: true,
  canAccessReporterContacts: false,
};

const incidentId = '00000000-0000-4000-8000-000000000201';

const mockIncidentSummary: IncidentSummary = {
  id: incidentId,
  category: 'MEDICAL_ASSISTANCE',
  priority: 'NORMAL',
  status: 'REPORTED',
  summary: 'Elderly pilgrim experiencing heat exhaustion near bathing steps.',
  reportedAt: '2026-10-29T10:00:00+00:00',
  zoneId: '00000000-0000-4000-8000-000000000301',
  locationSource: 'GPS',
  landmark: 'Kotilingala Ghat Pavilion',
  isDemo: false,
};

const mockIncidentDetail: IncidentDetail = {
  ...mockIncidentSummary,
  zoneName: 'Kotilingala Ghat',
  zoneCode: 'KG-01',
  latitude: 17.0012,
  longitude: 81.7891,
  locationAccuracyM: 10,
  locationCapturedAt: '2026-10-29T10:00:00+00:00',
  locationIsFictional: false,
  duplicateOfIncidentId: null,
  reviewNotes: null,
  cancellationReason: null,
  reviewedByProfileId: null,
  reviewedByName: null,
  reviewedAt: null,
  events: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      incidentId,
      actorProfileId: null,
      eventType: 'REPORT_CREATED',
      statusBefore: null,
      statusAfter: null,
      notes: null,
      occurredAt: '2026-10-29T10:00:00+00:00',
    },
  ],
  reporterContact: {
    contactName: 'Concerned Citizen',
    phoneE164: '+919876543210',
    emailAddress: null,
    preferredContactMethod: 'PHONE',
  },
};

function makeService(): StaffApiService {
  const profilesByToken = new Map<string, StaffProfile>([
    ['operator-token', operator],
    ['responder-token', responder],
  ]);

  return {
    authenticate: vi.fn(async (token: string) => {
      const profile = profilesByToken.get(token);
      if (!profile) {
        throw new ApiError(401, 'INVALID_OR_EXPIRED_TOKEN', 'Session invalid.');
      }
      return profile;
    }),
    listIncidents: vi.fn(async () => {
      return [mockIncidentSummary];
    }),
    getIncidentDetail: vi.fn(async (_token: string, id: string) => {
      if (id !== incidentId) {
        throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
      }
      return mockIncidentDetail;
    }),
    reviewIncident: vi.fn(async (_token: string, actor: StaffProfile, id: string, input) => {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(403, 'OPERATOR_ROLE_REQUIRED', 'Operators only.');
      }
      return {
        ...mockIncidentDetail,
        status: input.status ?? mockIncidentDetail.status,
        priority: input.priority ?? mockIncidentDetail.priority,
        reviewNotes: input.reviewNotes ?? mockIncidentDetail.reviewNotes,
        duplicateOfIncidentId: input.duplicateOfIncidentId ?? null,
        cancellationReason: input.cancellationReason ?? null,
        reviewedByProfileId: actor.id,
        reviewedByName: actor.displayName,
        reviewedAt: '2026-10-29T10:05:00+00:00',
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
    listPublicZones: vi.fn(),
  };
}

describe('Control-room incident review endpoints', () => {
  let service: StaffApiService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    service = makeService();
    app = createApp({ service });
  });

  describe('GET /api/staff/incidents', () => {
    it('returns list of incidents without filter parameters', async () => {
      const response = await request(app)
        .get('/api/staff/incidents')
        .set('Authorization', 'Bearer operator-token')
        .expect(200);

      expect(response.body.data).toEqual([mockIncidentSummary]);
      expect(service.listIncidents).toHaveBeenCalledWith('operator-token');
    });

    it('passes filter and pagination parameters to service', async () => {
      const response = await request(app)
        .get('/api/staff/incidents?status=REPORTED&priority=NORMAL&page=1&limit=10')
        .set('Authorization', 'Bearer operator-token')
        .expect(200);

      expect(response.body.data).toEqual([mockIncidentSummary]);
      expect(service.listIncidents).toHaveBeenCalledWith('operator-token', {
        status: 'REPORTED',
        priority: 'NORMAL',
        page: 1,
        limit: 10,
      });
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app).get('/api/staff/incidents').expect(401);
    });
  });

  describe('GET /api/staff/incidents/:incidentId', () => {
    it('returns full incident detail including timeline events and location', async () => {
      const response = await request(app)
        .get(`/api/staff/incidents/${incidentId}`)
        .set('Authorization', 'Bearer operator-token')
        .expect(200);

      expect(response.body.data.id).toBe(incidentId);
      expect(response.body.data.events).toHaveLength(1);
      expect(response.body.data.zoneName).toBe('Kotilingala Ghat');
      expect(response.body.data.reporterContact?.phoneE164).toBe('+919876543210');
    });

    it('returns 404 for unknown incident ID', async () => {
      const unknownId = '00000000-0000-4000-8000-999999999999';
      await request(app)
        .get(`/api/staff/incidents/${unknownId}`)
        .set('Authorization', 'Bearer operator-token')
        .expect(404);
    });

    it('returns 400 for malformed incident UUID', async () => {
      await request(app)
        .get('/api/staff/incidents/not-a-valid-uuid')
        .set('Authorization', 'Bearer operator-token')
        .expect(400);
    });
  });

  describe('PATCH /api/staff/incidents/:incidentId/review', () => {
    it('allows operator to review incident, elevate priority, and record notes', async () => {
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          status: 'UNDER_REVIEW',
          priority: 'URGENT',
          reviewNotes: 'Verified with Ghat supervisor. Dispatching medical team.',
        })
        .expect(200);

      expect(response.body.data.status).toBe('UNDER_REVIEW');
      expect(response.body.data.priority).toBe('URGENT');
      expect(response.body.data.reviewNotes).toBe(
        'Verified with Ghat supervisor. Dispatching medical team.',
      );
      expect(response.body.data.reviewedByProfileId).toBe(operator.id);
    });

    it('allows operator to mark incident as duplicate with target ID', async () => {
      const targetId = '00000000-0000-4000-8000-000000000199';
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          status: 'DUPLICATE',
          duplicateOfIncidentId: targetId,
          reviewNotes: 'Duplicate report of earlier incident.',
        })
        .expect(200);

      expect(response.body.data.status).toBe('DUPLICATE');
      expect(response.body.data.duplicateOfIncidentId).toBe(targetId);
    });

    it('allows operator to cancel incident with mandatory cancellation reason', async () => {
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          status: 'CANCELLED',
          cancellationReason: 'False alarm confirmed on CCTV inspection.',
        })
        .expect(200);

      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.cancellationReason).toBe(
        'False alarm confirmed on CCTV inspection.',
      );
    });

    it('rejects responder role from reviewing incidents with 403', async () => {
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer responder-token')
        .send({
          status: 'UNDER_REVIEW',
        })
        .expect(403);

      expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .send({ status: 'UNDER_REVIEW' })
        .expect(401);
    });

    it('rejects cancellation without reason with 400', async () => {
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          status: 'CANCELLED',
          cancellationReason: '',
        })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('rejects duplicate status without duplicateOfIncidentId with 400', async () => {
      const response = await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          status: 'DUPLICATE',
        })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('rejects empty review payload with 400', async () => {
      await request(app)
        .patch(`/api/staff/incidents/${incidentId}/review`)
        .set('Authorization', 'Bearer operator-token')
        .send({})
        .expect(400);
    });
  });
});
