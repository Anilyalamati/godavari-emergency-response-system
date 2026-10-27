import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConfigurationItem,
  ConfigurationUpsert,
  IncidentSummary,
  ReporterContact,
  StaffInviteInput,
  StaffMember,
  StaffProfile,
  TeamSummary,
} from '@godavari/shared';
import { ApiError } from '../src/http/ApiError.js';
import { createApp } from '../src/app.js';
import { parseApiEnvironment } from '../src/env.js';
import type { StaffApiService } from '../src/services/staff-service.js';

const operator: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'operator@example.invalid',
  displayName: 'Synthetic operator',
  role: 'OPERATOR',
  isActive: true,
  canAccessReporterContacts: false,
};
const responder: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  email: 'responder@example.invalid',
  displayName: 'Synthetic responder',
  role: 'RESPONDER',
  isActive: true,
  canAccessReporterContacts: false,
};
const authorizedResponder: StaffProfile = {
  ...responder,
  id: '00000000-0000-4000-8000-000000000103',
  canAccessReporterContacts: true,
};
const administrator: StaffProfile = {
  id: '00000000-0000-4000-8000-000000000104',
  email: 'admin@example.invalid',
  displayName: 'Synthetic administrator',
  role: 'ADMIN',
  isActive: true,
  canAccessReporterContacts: false,
};
const incident: IncidentSummary = {
  id: '00000000-0000-4000-8000-000000000201',
  category: 'OTHER',
  priority: 'NORMAL',
  status: 'REPORTED',
  summary: 'Synthetic test incident only.',
  reportedAt: '2026-10-26T10:00:00+00:00',
  zoneId: null,
  locationSource: 'NOT_PROVIDED',
  landmark: null,
  isDemo: true,
};
const contact: ReporterContact = {
  contactName: 'Synthetic contact fixture',
  phoneE164: null,
  emailAddress: null,
  preferredContactMethod: 'NONE',
};

function makeService(): StaffApiService {
  const profilesByToken = new Map<string, StaffProfile>([
    ['operator-token', operator],
    ['responder-token', responder],
    ['authorized-responder-token', authorizedResponder],
    ['administrator-token', administrator],
  ]);

  return {
    authenticate: vi.fn(async (token: string) => {
      if (token === 'expired-token' || token === 'invalid-token') {
        throw new ApiError(
          401,
          'INVALID_OR_EXPIRED_TOKEN',
          'The staff session is invalid or has expired. Sign in again.',
        );
      }
      const profile = profilesByToken.get(token);
      if (!profile)
        throw new ApiError(
          403,
          'STAFF_ACCESS_DENIED',
          'This account is not an active staff account.',
        );
      return profile;
    }),
    listIncidents: vi.fn(async (token: string): Promise<IncidentSummary[]> =>
      token === 'administrator-token' ? [] : [incident],
    ),
    getReporterContact: vi.fn(async (token: string): Promise<ReporterContact | null> =>
      token === 'authorized-responder-token' || token === 'operator-token' ? contact : null,
    ),
    listStaff: vi.fn(async (): Promise<StaffMember[]> => []),
    listTeams: vi.fn(async (): Promise<TeamSummary[]> => []),
    inviteStaff: vi.fn(async (_actor: StaffProfile, _token: string, input: StaffInviteInput) => ({
      profileId: '00000000-0000-4000-8000-000000000999',
      role: input.role,
    })),
    updateStaffProfile: vi.fn(async (): Promise<void> => undefined),
    replaceTeamMemberships: vi.fn(async (): Promise<void> => undefined),
    listConfiguration: vi.fn(async (): Promise<ConfigurationItem[]> => []),
    upsertConfiguration: vi.fn(
      async (_token: string, _actorId: string, key: string, input: ConfigurationUpsert) => ({
        key,
        value: input.value,
        description: input.description,
        updatedAt: '2026-10-26T10:00:00+00:00',
      }),
    ),
  };
}

describe('staff API authentication and authorization', () => {
  let service: StaffApiService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    service = makeService();
    app = createApp({ service });
  });

  it('returns 401 when a protected request has no bearer token', async () => {
    const response = await request(app).get('/api/staff/incidents').expect(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(['expired-token', 'invalid-token'])(
    'returns a generic 401 for an expired or invalid access token without echoing it',
    async (token) => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(response.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      expect(response.text).not.toContain(token);
    },
  );

  it('returns 403 to an authenticated operator who tries to use an administrator API', async () => {
    const response = await request(app)
      .get('/api/admin/staff')
      .set('Authorization', 'Bearer operator-token')
      .expect(403);
    expect(response.body.error.code).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('resolves the staff role from the verified profile service, not request metadata', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer responder-token')
      .expect(200);
    expect(response.body.data.role).toBe('RESPONDER');
    expect(service.authenticate).toHaveBeenCalledWith('responder-token');
  });

  it('passes the responder bearer token into the RLS-scoped incident service', async () => {
    const response = await request(app)
      .get('/api/staff/incidents')
      .set('Authorization', 'Bearer responder-token')
      .expect(200);
    expect(response.body.data).toEqual([incident]);
    expect(service.listIncidents).toHaveBeenCalledWith('responder-token');
  });

  it('requires the explicit operational permission before querying reporter contacts', async () => {
    const denied = await request(app)
      .get(`/api/staff/incidents/${incident.id}/reporter-contact`)
      .set('Authorization', 'Bearer responder-token')
      .expect(403);
    expect(denied.body.error.code).toBe('REPORTER_CONTACT_PERMISSION_REQUIRED');
    expect(service.getReporterContact).not.toHaveBeenCalled();

    const allowed = await request(app)
      .get(`/api/staff/incidents/${incident.id}/reporter-contact`)
      .set('Authorization', 'Bearer authorized-responder-token')
      .expect(200);
    expect(allowed.body.data).toEqual(contact);
  });

  it('blocks administrators from changing their own role or team membership', async () => {
    const profileResponse = await request(app)
      .patch(`/api/admin/staff/${administrator.id}`)
      .set('Authorization', 'Bearer administrator-token')
      .send({ role: 'OPERATOR' })
      .expect(403);
    expect(profileResponse.body.error.code).toBe('SELF_MANAGEMENT_NOT_ALLOWED');

    const teamResponse = await request(app)
      .put(`/api/admin/staff/${administrator.id}/teams`)
      .set('Authorization', 'Bearer administrator-token')
      .send({ teamIds: [] })
      .expect(403);
    expect(teamResponse.body.error.code).toBe('SELF_MANAGEMENT_NOT_ALLOWED');
    expect(service.updateStaffProfile).not.toHaveBeenCalled();
    expect(service.replaceTeamMemberships).not.toHaveBeenCalled();
  });

  it('does not expose a public staff registration endpoint', async () => {
    const response = await request(app).post('/api/auth/register').send({}).expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('keeps the health check available when Supabase is not configured', async () => {
    const unconfiguredApp = createApp({ service: null });
    const response = await request(unconfiguredApp).get('/api/health').expect(200);
    expect(response.body.data.status).toBe('ok');
    await request(unconfiguredApp).get('/api/staff/incidents').expect(401);
    await request(unconfiguredApp)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(503);
  });
});

describe('Supabase environment validation', () => {
  it('accepts a local health-only setup without project secrets', () => {
    expect(parseApiEnvironment({}).API_PORT).toBe(4000);
  });

  it('requires the URL and publishable key together and requires a URL for any server secret', () => {
    expect(() => parseApiEnvironment({ SUPABASE_URL: 'https://example.supabase.co' })).toThrow();
    expect(() => parseApiEnvironment({ SUPABASE_SECRET_KEY: 'server-only-placeholder' })).toThrow();
    expect(
      parseApiEnvironment({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-placeholder',
      }).SUPABASE_URL,
    ).toBe('https://example.supabase.co');
  });
});
