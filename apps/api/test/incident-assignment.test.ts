import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EligibleTeamsResponse,
  StaffProfile,
  TeamAssignmentInput,
  TeamAssignmentResult,
} from '@godavari/shared';
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
const teamId = '00000000-0000-4000-8000-000000000301';

const mockEligibleTeams: EligibleTeamsResponse = {
  incidentId,
  incidentCategory: 'MEDICAL_ASSISTANCE',
  incidentZoneId: '00000000-0000-4000-8000-000000000401',
  incidentZoneName: 'Kotilingala Ghat',
  teams: [
    {
      id: teamId,
      teamCode: 'MED-01',
      name: 'First Aid River Squad',
      capabilities: ['first_aid', 'welfare_check'],
      dutyStatus: 'ON_DUTY',
      serviceZones: [
        {
          id: '00000000-0000-4000-8000-000000000401',
          name: 'Kotilingala Ghat',
          zoneCode: 'KG-01',
        },
      ],
      isAvailable: true,
      activeAssignment: null,
      isEligible: true,
      isRecommended: true,
      suitabilityScore: 100,
      reasons: [
        'Covers incident service zone Kotilingala Ghat (Primary zone match)',
        'Verified capability match: first_aid, welfare_check for Medical Assistance',
        'Team is on duty and available for assignment',
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      teamCode: 'CROWD-02',
      name: 'North Gate Crowd Support',
      capabilities: ['crowd_guidance'],
      dutyStatus: 'ON_DUTY',
      serviceZones: [],
      isAvailable: true,
      activeAssignment: null,
      isEligible: false,
      isRecommended: false,
      suitabilityScore: 0,
      reasons: ['Ineligible: Lacks suitable capability for Medical Assistance'],
    },
  ],
};

const mockAssignmentResult: TeamAssignmentResult = {
  assignmentId: '00000000-0000-4000-8000-000000000501',
  incidentId,
  teamId,
  teamCode: 'MED-01',
  teamName: 'First Aid River Squad',
  status: 'PENDING',
  assignedAt: '2026-10-29T10:00:00+00:00',
  acknowledgementDeadline: '2026-10-29T10:15:00+00:00',
  incidentStatus: 'ASSIGNED',
};

function makeService(): StaffApiService {
  const profilesByToken = new Map<string, StaffProfile>([
    ['operator-token', operator],
    ['responder-token', responder],
  ]);

  return {
    authenticate: vi.fn(async (token: string) => {
      const profile = profilesByToken.get(token);
      if (!profile) throw new ApiError(401, 'INVALID_OR_EXPIRED_TOKEN', 'Session invalid.');
      return profile;
    }),
    listIncidents: vi.fn(),
    getIncidentDetail: vi.fn(),
    reviewIncident: vi.fn(),
    getEligibleTeams: vi.fn(async (_token: string, id: string, actor: StaffProfile) => {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(403, 'OPERATOR_ROLE_REQUIRED', 'Operators only.');
      }
      if (id !== incidentId) {
        throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
      }
      return mockEligibleTeams;
    }),
    assignTeam: vi.fn(
      async (
        _token: string,
        actor: StaffProfile,
        id: string,
        input: TeamAssignmentInput,
      ): Promise<TeamAssignmentResult> => {
        if (actor.role !== 'OPERATOR') {
          throw new ApiError(403, 'OPERATOR_ROLE_REQUIRED', 'Operators only.');
        }
        if (input.teamId === '00000000-0000-4000-8000-000000000302') {
          throw new ApiError(
            400,
            'INVALID_ASSIGNMENT',
            'Team lacks suitable capabilities for incident category.',
          );
        }
        if (input.teamId === '00000000-0000-4000-8000-000000000399') {
          throw new ApiError(
            409,
            'ASSIGNMENT_CONFLICT',
            'Team already has an active assignment (double-booking prevented).',
          );
        }
        return {
          ...mockAssignmentResult,
          incidentId: id,
          teamId: input.teamId,
        };
      },
    ),
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

describe('Stage 6 Response-team assignment endpoints', () => {
  let service: StaffApiService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    service = makeService();
    app = createApp({ service });
  });

  describe('GET /api/staff/incidents/:incidentId/eligible-teams', () => {
    it('returns eligible and recommended teams with transparent suitability reasons', async () => {
      const response = await request(app)
        .get(`/api/staff/incidents/${incidentId}/eligible-teams`)
        .set('Authorization', 'Bearer operator-token')
        .expect(200);

      expect(response.body.data.incidentId).toBe(incidentId);
      expect(response.body.data.teams).toHaveLength(2);
      expect(response.body.data.teams[0].isRecommended).toBe(true);
      expect(response.body.data.teams[0].reasons).toContain(
        'Covers incident service zone Kotilingala Ghat (Primary zone match)',
      );
      expect(response.body.data.teams[1].isEligible).toBe(false);
    });

    it('rejects responders from querying eligible teams with 403', async () => {
      const response = await request(app)
        .get(`/api/staff/incidents/${incidentId}/eligible-teams`)
        .set('Authorization', 'Bearer responder-token')
        .expect(403);

      expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app).get(`/api/staff/incidents/${incidentId}/eligible-teams`).expect(401);
    });
  });

  describe('POST /api/staff/incidents/:incidentId/assignments', () => {
    it('allows operator to assign an eligible team and returns 201 Created', async () => {
      const response = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer operator-token')
        .send({
          teamId,
          acknowledgementDeadlineMinutes: 15,
        })
        .expect(201);

      expect(response.body.data.assignmentId).toBe(mockAssignmentResult.assignmentId);
      expect(response.body.data.incidentStatus).toBe('ASSIGNED');
      expect(response.body.data.teamCode).toBe('MED-01');
      expect(response.body.data.status).toBe('PENDING');
    });

    it('rejects responder from assigning teams with 403', async () => {
      const response = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer responder-token')
        .send({ teamId })
        .expect(403);

      expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
    });

    it('rejects assignment of ineligible team with 400', async () => {
      const response = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer operator-token')
        .send({ teamId: '00000000-0000-4000-8000-000000000302' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ASSIGNMENT');
    });

    it('returns 409 Conflict when team or incident already has an active assignment (double-booking prevented)', async () => {
      const response = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer operator-token')
        .send({ teamId: '00000000-0000-4000-8000-000000000399' })
        .expect(409);

      expect(response.body.error.code).toBe('ASSIGNMENT_CONFLICT');
    });

    it('rejects invalid payload (deadline 0) with 400', async () => {
      const response = await request(app)
        .post(`/api/staff/incidents/${incidentId}/assignments`)
        .set('Authorization', 'Bearer operator-token')
        .send({ teamId, acknowledgementDeadlineMinutes: 0 })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });
});
