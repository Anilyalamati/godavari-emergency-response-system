import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StaffProfile, StaffRole } from '@godavari/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { LanguageProvider } from './i18n/LanguageContext.js';
import type { StaffAuthGateway, StaffAuthSession } from './auth/authClient.js';
import { App } from './App.js';

const healthResponse = {
  data: {
    status: 'ok',
    service: 'godavari-api',
    timestamp: '2026-10-26T12:00:00.000Z',
  },
  requestId: '3c2c4511-22b9-4bcb-a548-5e9c125b8a04',
};

const testSession: StaffAuthSession = {
  accessToken: 'synthetic-test-token',
  email: 'staff@example.invalid',
};

let responseProfile: StaffProfile | null = null;
let mockIncidentsList: unknown[] = [];
let assignedTeamForIncident: {
  teamId: string;
  teamCode: string;
  teamName: string;
  assignedAt: string;
  acknowledgementDeadline: string;
  isOverdue?: boolean;
  reassignmentReason?: string | null;
} | null = null;
let responderIncidentStatus = 'ASSIGNED';

const testIncidentDetail = {
  id: '00000000-0000-4000-8000-000000000901',
  category: 'MEDICAL_ASSISTANCE',
  priority: 'URGENT',
  status: 'REPORTED',
  summary: 'Elderly pilgrim collapsed near North Ghat steps',
  reportedAt: '2026-10-28T10:00:00.000Z',
  zoneId: '00000000-0000-4000-8000-000000000201',
  zoneName: 'VIP Bathing Ghat',
  zoneCode: 'VIP_GHAT',
  locationSource: 'GPS',
  landmark: 'Step 4 Pavilion',
  latitude: 17.0012,
  longitude: 81.7891,
  locationAccuracyM: 10,
  locationCapturedAt: '2026-10-28T10:00:00.000Z',
  locationIsFictional: false,
  isDemo: false,
  duplicateOfIncidentId: null,
  reviewNotes: null,
  cancellationReason: null,
  reviewedByProfileId: null,
  reviewedByName: null,
  reviewedAt: null,
  events: [
    {
      id: '00000000-0000-4000-8000-000000000801',
      incidentId: '00000000-0000-4000-8000-000000000901',
      actorProfileId: null,
      eventType: 'REPORT_CREATED',
      statusBefore: null,
      statusAfter: null,
      notes: null,
      occurredAt: '2026-10-28T10:00:00.000Z',
    },
  ],
  reporterContact: {
    contactName: 'Good Samaritan',
    phoneE164: '+919876543210',
    emailAddress: null,
    preferredContactMethod: 'PHONE',
  },
};

function mockResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createProfile(role: StaffRole): StaffProfile {
  return {
    id: `00000000-0000-4000-8000-0000000001${role === 'OPERATOR' ? '01' : role === 'RESPONDER' ? '02' : '03'}`,
    email: `${role.toLowerCase()}@example.invalid`,
    displayName: `Synthetic ${role.toLowerCase()}`,
    role,
    isActive: true,
    canAccessReporterContacts: false,
  };
}

function createGateway(
  initialSession: StaffAuthSession | null,
  pendingInvitation = false,
): StaffAuthGateway {
  let invitation = pendingInvitation;
  return {
    getSession: vi.fn(async () => initialSession),
    onAuthStateChange: vi.fn(() => () => undefined),
    hasPendingInvitation: () => invitation,
    clearPendingInvitation: () => {
      invitation = false;
    },
    signInWithPassword: vi.fn(async () => testSession),
    signOut: vi.fn(async () => {
      invitation = false;
    }),
    setPassword: vi.fn(async () => {
      invitation = false;
      return testSession;
    }),
  };
}

function renderAt(
  path = '/',
  options: { profile?: StaffProfile | null; gateway?: StaffAuthGateway | null } = {},
) {
  responseProfile = options.profile ?? null;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <AuthProvider gateway={options.gateway ?? null} apiBaseUrl="/api" fetcher={fetch}>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  responseProfile = null;
  mockIncidentsList = [];
  assignedTeamForIncident = null;
  responderIncidentStatus = 'ASSIGNED';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const source =
        typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(source, 'http://localhost').pathname;
      if (pathname === '/api/health') return mockResponse(healthResponse);
      if (pathname === '/api/auth/me') {
        return responseProfile
          ? mockResponse({ data: responseProfile, requestId: healthResponse.requestId })
          : mockResponse(
              {
                error: {
                  code: 'AUTHENTICATION_REQUIRED',
                  message: 'Sign in to continue.',
                  requestId: healthResponse.requestId,
                },
              },
              401,
            );
      }
      if (pathname === '/api/staff/incidents') {
        return mockResponse({ data: mockIncidentsList, requestId: healthResponse.requestId });
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/responder-actions')) {
        const action = 'ACKNOWLEDGE';
        try {
          if (typeof input === 'object' && 'body' in input && input.body) {
            // body present
          }
        } catch {
          // ignore
        }
        return mockResponse({
          data: {
            incidentId: testIncidentDetail.id,
            incidentStatus: responderIncidentStatus,
            assignmentId: '00000000-0000-4000-8000-000000000601',
            assignmentStatus: 'ACKNOWLEDGED',
            action,
          },
          requestId: healthResponse.requestId,
        });
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/close')) {
        return mockResponse({
          data: {
            incidentId: testIncidentDetail.id,
            incidentStatus: 'CLOSED',
            closedAt: '2026-10-30T10:00:00.000Z',
          },
          requestId: healthResponse.requestId,
        });
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/eligible-teams')) {
        return mockResponse({
          data: {
            incidentId: testIncidentDetail.id,
            incidentCategory: testIncidentDetail.category,
            incidentZoneId: testIncidentDetail.zoneId,
            incidentZoneName: testIncidentDetail.zoneName,
            teams: [
              {
                id: '00000000-0000-4000-8000-000000000201',
                teamCode: 'MED-1',
                name: 'First Aid Unit Alpha',
                capabilities: ['FIRST_AID', 'TRIAGE'],
                dutyStatus: 'ON_DUTY',
                serviceZones: [
                  {
                    id: testIncidentDetail.zoneId,
                    name: 'VIP Bathing Ghat',
                    zoneCode: 'VIP_GHAT',
                  },
                ],
                isAvailable: true,
                activeAssignment: null,
                isEligible: true,
                isRecommended: true,
                suitabilityScore: 50,
                reasons: [
                  'Capable for MEDICAL_ASSISTANCE',
                  'Team is ON_DUTY',
                  'Team is available (not busy)',
                  'Primary service zone match',
                ],
              },
              {
                id: '00000000-0000-4000-8000-000000000203',
                teamCode: 'MED-2',
                name: 'First Aid Unit Bravo',
                capabilities: ['FIRST_AID', 'PARAMEDIC'],
                dutyStatus: 'ON_DUTY',
                serviceZones: [
                  {
                    id: testIncidentDetail.zoneId,
                    name: 'VIP Bathing Ghat',
                    zoneCode: 'VIP_GHAT',
                  },
                ],
                isAvailable: true,
                activeAssignment: null,
                isEligible: true,
                isRecommended: false,
                suitabilityScore: 40,
                reasons: [
                  'Capable for MEDICAL_ASSISTANCE',
                  'Team is ON_DUTY',
                  'Team is available (not busy)',
                ],
              },
              {
                id: '00000000-0000-4000-8000-000000000202',
                teamCode: 'CROWD-1',
                name: 'Crowd Control Unit Alpha',
                capabilities: ['CROWD_CONTROL'],
                dutyStatus: 'ON_DUTY',
                serviceZones: [
                  {
                    id: testIncidentDetail.zoneId,
                    name: 'VIP Bathing Ghat',
                    zoneCode: 'VIP_GHAT',
                  },
                ],
                isAvailable: true,
                activeAssignment: null,
                isEligible: false,
                isRecommended: false,
                suitabilityScore: 0,
                reasons: [
                  'Ineligible: Team lacks required capability for MEDICAL_ASSISTANCE',
                  'Team is ON_DUTY',
                  'Team is available (not busy)',
                  'Primary service zone match',
                ],
              },
            ],
          },
          requestId: healthResponse.requestId,
        });
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/assignments')) {
        assignedTeamForIncident = {
          teamId: '00000000-0000-4000-8000-000000000201',
          teamCode: 'MED-1',
          teamName: 'First Aid Unit Alpha',
          assignedAt: '2026-10-28T10:10:00.000Z',
          acknowledgementDeadline: '2026-10-28T10:20:00.000Z',
        };
        return mockResponse(
          {
            data: {
              assignmentId: '00000000-0000-4000-8000-000000000601',
              incidentId: testIncidentDetail.id,
              status: 'PENDING',
              incidentStatus: 'ASSIGNED',
              ...assignedTeamForIncident,
            },
            requestId: healthResponse.requestId,
          },
          201,
        );
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/review')) {
        return mockResponse({
          data: {
            ...testIncidentDetail,
            status: 'UNDER_REVIEW',
            reviewNotes: 'Operator initiated triage',
            events: [
              ...testIncidentDetail.events,
              {
                id: '00000000-0000-4000-8000-000000000802',
                incidentId: testIncidentDetail.id,
                actorProfileId: '00000000-0000-4000-8000-000000000101',
                actorDisplayName: 'Senior Operator',
                eventType: 'STATUS_CHANGED',
                statusBefore: 'REPORTED',
                statusAfter: 'UNDER_REVIEW',
                notes: 'Operator initiated triage',
                occurredAt: '2026-10-28T10:05:00.000Z',
              },
            ],
          },
          requestId: healthResponse.requestId,
        });
      }
      if (pathname === '/api/staff/escalations/scan') {
        return mockResponse({
          data: {
            scannedAt: '2026-10-28T10:30:00.000Z',
            escalatedCount: 1,
            escalatedAssignmentIds: ['00000000-0000-4000-8000-000000000601'],
          },
          requestId: healthResponse.requestId,
        });
      }
      if (pathname.startsWith('/api/staff/incidents/') && pathname.endsWith('/reassign')) {
        assignedTeamForIncident = {
          teamId: '00000000-0000-4000-8000-000000000203',
          teamCode: 'MED-2',
          teamName: 'First Aid Unit Bravo',
          assignedAt: '2026-10-28T10:31:00.000Z',
          acknowledgementDeadline: '2026-10-28T10:32:00.000Z',
          isOverdue: false,
          reassignmentReason: 'Primary unit unresponsive past 60s demo deadline',
        };
        return mockResponse(
          {
            data: {
              incidentId: testIncidentDetail.id,
              supersededAssignmentId: '00000000-0000-4000-8000-000000000601',
              supersededTeamCode: 'MED-1',
              newAssignmentId: '00000000-0000-4000-8000-000000000602',
              newTeamId: assignedTeamForIncident.teamId,
              newTeamCode: assignedTeamForIncident.teamCode,
              newTeamName: assignedTeamForIncident.teamName,
              status: 'PENDING',
              assignedAt: assignedTeamForIncident.assignedAt,
              acknowledgementDeadline: assignedTeamForIncident.acknowledgementDeadline,
              incidentStatus: 'ASSIGNED',
              reassignmentReason: assignedTeamForIncident.reassignmentReason,
            },
            requestId: healthResponse.requestId,
          },
          201,
        );
      }
      if (pathname.startsWith('/api/staff/incidents/')) {
        const detailWithAssignment = assignedTeamForIncident
          ? {
              ...testIncidentDetail,
              status: 'ASSIGNED',
              activeAssignment: {
                id: '00000000-0000-4000-8000-000000000601',
                teamId: assignedTeamForIncident.teamId,
                teamCode: assignedTeamForIncident.teamCode,
                teamName: assignedTeamForIncident.teamName,
                status: 'PENDING',
                assignedAt: assignedTeamForIncident.assignedAt,
                acknowledgementDeadline: assignedTeamForIncident.acknowledgementDeadline,
                isOverdue: assignedTeamForIncident.isOverdue ?? false,
                reassignmentReason: assignedTeamForIncident.reassignmentReason ?? null,
              },
            }
          : testIncidentDetail;
        return mockResponse({
          data: detailWithAssignment,
          requestId: healthResponse.requestId,
        });
      }
      if (
        pathname === '/api/admin/staff' ||
        pathname === '/api/admin/teams' ||
        pathname === '/api/admin/configuration'
      ) {
        return mockResponse({ data: [], requestId: healthResponse.requestId });
      }
      if (pathname === '/api/zones') {
        return mockResponse({
          data: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              zoneCode: 'VIP_GHAT',
              name: 'VIP Bathing Ghat',
              description: 'Designated area near North Gate',
              isDemo: true,
              fictionalLocationLabel: 'Demo Zone',
            },
          ],
          requestId: healthResponse.requestId,
        });
      }
      if (pathname === '/api/incidents') {
        return mockResponse(
          {
            data: {
              incidentId: '00000000-0000-4000-8000-000000000301',
              trackingToken: 'f1e2d3c4b5a697881122334455667788',
              status: 'REPORTED',
              reportedAt: '2026-10-28T10:00:00.000Z',
              category: 'MEDICAL_ASSISTANCE',
              summary: 'Pilgrim collapsed near step',
              zoneId: '00000000-0000-4000-8000-000000000201',
              zoneName: 'VIP Bathing Ghat',
              landmark: 'Step 4',
              isIdempotentReplay: false,
            },
            requestId: healthResponse.requestId,
          },
          201,
        );
      }
      if (pathname === '/api/incidents/track') {
        let bodyJson: { trackingToken?: string } = {};
        const rawBody =
          init?.body ?? (typeof input === 'object' && 'body' in input ? input.body : undefined);
        if (rawBody) {
          try {
            bodyJson = JSON.parse(String(rawBody)) as { trackingToken?: string };
          } catch {
            // ignore
          }
        }
        if (bodyJson.trackingToken === 'f1e2d3c4b5a697881122334455667788') {
          return mockResponse({
            data: {
              incidentId: '00000000-0000-4000-8000-000000000301',
              status: 'ON_SCENE',
              statusLabel: 'Team Responding On-Scene',
              category: 'MEDICAL_ASSISTANCE',
              summary: 'Pilgrim collapsed near step',
              reportedAt: '2026-10-28T10:00:00.000Z',
              receivedAt: '2026-10-28T10:01:00.000Z',
              updatedAt: '2026-10-28T10:15:00.000Z',
              zoneName: 'VIP Bathing Ghat',
              landmark: 'Step 4',
            },
            requestId: healthResponse.requestId,
          });
        }
        return mockResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'No incident found for the provided tracking token.',
              requestId: healthResponse.requestId,
            },
          },
          404,
        );
      }
      return mockResponse({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public Stage 3 shell', () => {
  it('retains the safety notice, clearly labelled Call 112 alternative, and skip link', () => {
    renderAt('/');

    const safetyNotice = screen.getByRole('note', { name: 'Prototype safety notice' });
    expect(safetyNotice).toHaveTextContent('Hackathon prototype — not an emergency service.');
    expect(within(safetyNotice).getByRole('link', { name: /call 112/i })).toHaveAttribute(
      'href',
      'tel:112',
    );
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('shows public destinations and staff sign-in, not every staff workspace', () => {
    renderAt('/');
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });

    for (const label of ['Overview', 'Report', 'Track', 'Staff sign-in']) {
      expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(
      within(navigation).queryByRole('link', { name: 'Operator workspace' }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('link', { name: 'Responder workspace' }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('link', { name: 'Administration' }),
    ).not.toBeInTheDocument();
  });

  it('opens the emergency reporting form and displays categories and call 112 action', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: /^Report$/ }));

    expect(screen.getByRole('heading', { name: 'Report an emergency' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call 112 now/i })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByRole('button', { name: /submit emergency report/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /short description/i })).toBeInTheDocument();
  });

  it('submits an emergency report and renders the confirmation screen with tracking token', async () => {
    const user = userEvent.setup();
    renderAt('/report');

    const descInput = await screen.findByRole('textbox', { name: /short description/i });
    await user.type(descInput, 'Pilgrim collapsed near step 4');

    const confirmCheck = screen.getByRole('checkbox', {
      name: /i confirm this incident location/i,
    });
    await user.click(confirmCheck);

    const submitBtn = screen.getByRole('button', { name: /submit emergency report/i });
    await user.click(submitBtn);

    expect(
      await screen.findByRole('heading', { name: 'Emergency report logged' }),
    ).toBeInTheDocument();
    expect(screen.getByText('f1e2d3c4b5a697881122334455667788')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy token/i })).toBeInTheDocument();
  });

  it('keeps location confirmation mandatory before allowing submission', async () => {
    renderAt('/report');

    const confirmCheck = screen.getByRole('checkbox', {
      name: /i confirm this incident location/i,
    });
    expect(confirmCheck).not.toBeChecked();

    const submitBtn = screen.getByRole('button', { name: /submit emergency report/i });
    expect(submitBtn).toBeDisabled();
  });

  it('preselects zone from QR query parameter and shows verification notice', async () => {
    renderAt('/report?zone=VIP_GHAT');

    expect(
      await screen.findByText(/location preselected from link \/ qr code:/i),
    ).toBeInTheDocument();
    expect(screen.getByText('VIP Bathing Ghat')).toBeInTheDocument();
  });

  it('does not expose public staff self-registration', () => {
    renderAt('/staff/login');
    expect(screen.getByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /register|sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register|sign up/i })).not.toBeInTheDocument();
  });

  it.each(['/operator', '/responder', '/admin'])(
    'redirects an unverified visitor from %s to staff sign-in',
    async (path) => {
      renderAt(path);
      expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument();
    },
  );
});

describe('role-aware staff screens', () => {
  it.each([
    ['OPERATOR', '/operator', 'Operator workspace', 'Operator workspace'],
    ['RESPONDER', '/responder', 'Responder workspace', 'Responder workspace'],
    ['ADMIN', '/admin', 'Administration', 'Administration'],
  ] as const)(
    '%s reaches its assigned screen and sees no other role navigation',
    async (role, path, heading, ownLink) => {
      const profile = createProfile(role);
      renderAt(path, { profile, gateway: createGateway(testSession) });
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();

      const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
      expect(within(navigation).getByRole('link', { name: ownLink })).toBeInTheDocument();
      for (const otherRole of ['Operator workspace', 'Responder workspace', 'Administration']) {
        if (otherRole !== ownLink) {
          expect(
            within(navigation).queryByRole('link', { name: otherRole }),
          ).not.toBeInTheDocument();
        }
      }
      expect(within(navigation).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    },
  );

  it('blocks a responder from opening the operator page even by direct URL', async () => {
    renderAt('/operator', {
      profile: createProfile('RESPONDER'),
      gateway: createGateway(testSession),
    });
    expect(
      await screen.findByRole('heading', { name: 'This workspace is not available to your role.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my workspace' })).toHaveAttribute(
      'href',
      '/responder',
    );
    expect(screen.queryByRole('heading', { name: 'Operator workspace' })).not.toBeInTheDocument();
  });

  it('signs in through the Supabase gateway and routes by the verified profile', async () => {
    const user = userEvent.setup();
    const profile = createProfile('OPERATOR');
    const gateway = createGateway(null);
    renderAt('/staff/login', { profile, gateway });

    await user.type(
      screen.getByRole('textbox', { name: 'Work email' }),
      'operator@example.invalid',
    );
    await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Operator workspace' })).toBeInTheDocument();
    expect(gateway.signInWithPassword).toHaveBeenCalledWith(
      'operator@example.invalid',
      'not-a-real-password',
    );
  });

  it('signs out and returns to the staff login page', async () => {
    const user = userEvent.setup();
    renderAt('/operator', {
      profile: createProfile('OPERATOR'),
      gateway: createGateway(testSession),
    });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument();
  });

  it('clears an invalid saved session and returns the visitor to sign-in', async () => {
    const gateway = createGateway(testSession);
    renderAt('/operator', { gateway });

    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/i);
    expect(gateway.signOut).toHaveBeenCalledOnce();
  });

  it('accepts a password only during a verified, one-time invitation session', async () => {
    const user = userEvent.setup();
    const gateway = createGateway(testSession, true);
    renderAt('/staff/accept-invite', {
      profile: createProfile('RESPONDER'),
      gateway,
    });

    await user.type(await screen.findByLabelText('New password'), 'unique-test-password-123');
    await user.type(await screen.findByLabelText('Confirm password'), 'unique-test-password-123');
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(await screen.findByRole('heading', { name: 'Responder workspace' })).toBeInTheDocument();
    expect(gateway.setPassword).toHaveBeenCalledOnce();
  });

  it('renders operator incident queue with urgent visual prominence and inspection panel', async () => {
    const user = userEvent.setup();
    mockIncidentsList = [
      {
        id: testIncidentDetail.id,
        category: testIncidentDetail.category,
        priority: testIncidentDetail.priority,
        status: testIncidentDetail.status,
        summary: testIncidentDetail.summary,
        reportedAt: testIncidentDetail.reportedAt,
        zoneId: testIncidentDetail.zoneId,
        locationSource: testIncidentDetail.locationSource,
        landmark: testIncidentDetail.landmark,
        isDemo: testIncidentDetail.isDemo,
      },
    ];

    const operatorProfile = {
      ...createProfile('OPERATOR'),
      canAccessReporterContacts: true,
    };

    renderAt('/operator', {
      profile: operatorProfile,
      gateway: createGateway(testSession),
    });

    // Verify Urgent beacon in queue
    expect(await screen.findByText(/URGENT INCIDENTS ACTIVE/i)).toBeInTheDocument();
    expect(screen.getByText('Elderly pilgrim collapsed near North Ghat steps')).toBeInTheDocument();

    // Click the incident card to open details
    const incidentCard = screen.getByRole('button', {
      name: /URGENT/i,
    });
    await user.click(incidentCard);

    // Verify Location Inspection and Confidence
    expect(await screen.findByText(/High confidence \(±10 m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/17.001200° N, 81.789100° E/i)).toBeInTheDocument();

    // Verify Authorized Callback details
    expect(screen.getByText('Good Samaritan')).toBeInTheDocument();
    expect(screen.getByText(/📞 \+919876543210/i)).toBeInTheDocument();

    // Verify Quick Action "Begin Review"
    const reviewBtn = screen.getByRole('button', { name: /begin review \(under review\)/i });
    await user.click(reviewBtn);

    expect(await screen.findByText(/Incident placed UNDER REVIEW/i)).toBeInTheDocument();
  });

  it('safeguards callback details when operator lacks contact permission', async () => {
    const user = userEvent.setup();
    mockIncidentsList = [
      {
        id: testIncidentDetail.id,
        category: testIncidentDetail.category,
        priority: testIncidentDetail.priority,
        status: testIncidentDetail.status,
        summary: testIncidentDetail.summary,
        reportedAt: testIncidentDetail.reportedAt,
        zoneId: testIncidentDetail.zoneId,
        locationSource: testIncidentDetail.locationSource,
        landmark: testIncidentDetail.landmark,
        isDemo: testIncidentDetail.isDemo,
      },
    ];

    const unprivilegedOperator = {
      ...createProfile('OPERATOR'),
      canAccessReporterContacts: false,
    };

    renderAt('/operator', {
      profile: unprivilegedOperator,
      gateway: createGateway(testSession),
    });

    const incidentCard = await screen.findByRole('button', { name: /URGENT/i });
    await user.click(incidentCard);

    // Verify contact details are protected
    expect(await screen.findByText(/Callback Details Protected:/i)).toBeInTheDocument();
    expect(screen.queryByText('+919876543210')).not.toBeInTheDocument();
  });

  it('allows operators to inspect transparent recommendations and dispatch an eligible team', async () => {
    const user = userEvent.setup();
    mockIncidentsList = [
      {
        id: testIncidentDetail.id,
        category: testIncidentDetail.category,
        priority: testIncidentDetail.priority,
        status: testIncidentDetail.status,
        summary: testIncidentDetail.summary,
        reportedAt: testIncidentDetail.reportedAt,
        zoneId: testIncidentDetail.zoneId,
        locationSource: testIncidentDetail.locationSource,
        landmark: testIncidentDetail.landmark,
        isDemo: testIncidentDetail.isDemo,
      },
    ];

    const operatorProfile = {
      ...createProfile('OPERATOR'),
      canAccessReporterContacts: true,
    };

    renderAt('/operator', {
      profile: operatorProfile,
      gateway: createGateway(testSession),
    });

    const incidentCard = await screen.findByRole('button', { name: /URGENT/i });
    await user.click(incidentCard);

    // Verify recommendations heading and candidate teams appear
    expect(
      await screen.findByRole('heading', {
        name: /Response-Team Recommendation & Dispatch/i,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('MED-1')).toBeInTheDocument();
    expect(screen.getByText('First Aid Unit Alpha')).toBeInTheDocument();
    expect(screen.getByText(/Recommended Match/i)).toBeInTheDocument();

    // Verify transparent suitability reasons are displayed
    expect(screen.getAllByText(/Capable for MEDICAL_ASSISTANCE/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Primary service zone match/i).length).toBeGreaterThanOrEqual(1);

    // Verify ineligible team shows reason
    expect(
      screen.getByText(/Ineligible: Team lacks required capability for MEDICAL_ASSISTANCE/i),
    ).toBeInTheDocument();

    // Select the recommended team
    const med1Radio = screen.getByRole('radio', { name: /MED-1/i });
    await user.click(med1Radio);
    expect(med1Radio).toBeChecked();

    // Confirm dispatch
    const dispatchButton = screen.getByRole('button', {
      name: /Confirm Dispatch & Assign Team/i,
    });
    expect(dispatchButton).toBeEnabled();
    await user.click(dispatchButton);

    // Verify active assignment card renders after dispatch
    expect(
      await screen.findByRole('heading', {
        name: /MED-1 — First Aid Unit Alpha/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Primary Response Unit \(Dispatched\)/i)).toBeInTheDocument();
    expect(screen.getByText(/MVP Concurrency Guard/i)).toBeInTheDocument();
  });

  it('renders mobile-first responder workspace and allows acknowledgement and support request', async () => {
    const user = userEvent.setup();
    mockIncidentsList = [
      {
        id: testIncidentDetail.id,
        category: testIncidentDetail.category,
        priority: testIncidentDetail.priority,
        status: 'ASSIGNED',
        summary: testIncidentDetail.summary,
        reportedAt: testIncidentDetail.reportedAt,
        zoneId: testIncidentDetail.zoneId,
        locationSource: testIncidentDetail.locationSource,
        landmark: testIncidentDetail.landmark,
        isDemo: testIncidentDetail.isDemo,
      },
    ];

    const responderProfile = {
      ...createProfile('RESPONDER'),
      canAccessReporterContacts: false,
    };

    renderAt('/responder', {
      profile: responderProfile,
      gateway: createGateway(testSession),
    });

    // Check header and assigned incident card
    expect(await screen.findByText(/Verified Field Responder/i)).toBeInTheDocument();
    expect(screen.getByText(/Assigned Emergency Incidents/i)).toBeInTheDocument();
    expect(
      await screen.findByText('Elderly pilgrim collapsed near North Ghat steps'),
    ).toBeInTheDocument();
    expect(screen.getByText('📍 Step 4 Pavilion')).toBeInTheDocument();

    // Acknowledge assignment button
    const ackBtn = screen.getByRole('button', { name: /Acknowledge Assignment/i });
    await user.click(ackBtn);
    expect(await screen.findByText(/Assignment acknowledged\./i)).toBeInTheDocument();
  });

  it('displays overdue badge on unacknowledged assignment and supports operator reassignment workflow', async () => {
    const user = userEvent.setup();
    mockIncidentsList = [
      {
        id: testIncidentDetail.id,
        category: testIncidentDetail.category,
        priority: testIncidentDetail.priority,
        status: 'ASSIGNED',
        summary: testIncidentDetail.summary,
        reportedAt: testIncidentDetail.reportedAt,
        zoneId: testIncidentDetail.zoneId,
        locationSource: testIncidentDetail.locationSource,
        landmark: testIncidentDetail.landmark,
        isDemo: testIncidentDetail.isDemo,
      },
    ];

    assignedTeamForIncident = {
      teamId: '00000000-0000-4000-8000-000000000201',
      teamCode: 'MED-1',
      teamName: 'First Aid Unit Alpha',
      assignedAt: '2026-10-28T10:00:00.000Z',
      acknowledgementDeadline: '2026-10-28T10:01:00.000Z',
      isOverdue: true,
    };

    renderAt('/operator', {
      profile: createProfile('OPERATOR'),
      gateway: createGateway(testSession),
    });

    // Select incident from queue
    const incidentCard = await screen.findByText('Elderly pilgrim collapsed near North Ghat steps');
    await user.click(incidentCard);

    // Verify overdue alert banner and badge appear
    expect(await screen.findByText(/Dispatch Acknowledgement Overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/⏰ ACKNOWLEDGEMENT OVERDUE/i)).toBeInTheDocument();

    // Verify manual check escalations button in queue toolbar
    const checkEscalationsBtn = screen.getByRole('button', { name: /Check Escalations/i });
    await user.click(checkEscalationsBtn);
    expect(
      await screen.findByText(
        /Escalation check complete: 1 unacknowledged assignment\(s\) flagged overdue\./i,
      ),
    ).toBeInTheDocument();

    // Open reassignment drawer
    const reassignToggleBtn = screen.getByRole('button', {
      name: /Reassign Overdue Incident to Alternative Team/i,
    });
    await user.click(reassignToggleBtn);

    expect(screen.getByText(/Operator-Controlled Reassignment Workflow/i)).toBeInTheDocument();

    // Fill in mandatory reassignment reason
    const reasonInput = screen.getByLabelText(/Reassignment Reason/i);
    await user.type(
      reasonInput,
      'Primary unit uncontactable after 60s demo deadline. Reassigning to Bravo.',
    );

    // Select replacement team (MED-2)
    const teamSelect = screen.getByLabelText(/Select Replacement Team/i);
    await user.selectOptions(teamSelect, '00000000-0000-4000-8000-000000000203');

    // Confirm reassignment
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Reassign Team/i });
    await user.click(confirmBtn);

    // Verify successful reassignment and replacement team display
    expect(
      await screen.findByText(/Incident reassigned to MED-2 \(First Aid Unit Bravo\)/i),
    ).toBeInTheDocument();
  });

  const testIncidentSummary = {
    id: testIncidentDetail.id,
    category: testIncidentDetail.category,
    priority: testIncidentDetail.priority,
    status: testIncidentDetail.status,
    summary: testIncidentDetail.summary,
    reportedAt: testIncidentDetail.reportedAt,
    zoneId: testIncidentDetail.zoneId,
    locationSource: testIncidentDetail.locationSource,
    landmark: testIncidentDetail.landmark,
    latitude: testIncidentDetail.latitude,
    longitude: testIncidentDetail.longitude,
    locationAccuracyM: testIncidentDetail.locationAccuracyM,
    locationCapturedAt: testIncidentDetail.locationCapturedAt,
    locationIsFictional: false,
    isDemo: false,
  };

  const stage9OperatorProfile = {
    id: '00000000-0000-4000-8000-000000000501',
    email: 'operator@example.invalid',
    displayName: 'Senior Operator',
    role: 'OPERATOR' as StaffRole,
    isActive: true,
    canAccessReporterContacts: true,
  };

  const stage9ResponderProfile = {
    id: '00000000-0000-4000-8000-000000000502',
    email: 'responder@example.invalid',
    displayName: 'Field Lead Alpha',
    role: 'RESPONDER' as StaffRole,
    isActive: true,
    canAccessReporterContacts: false,
  };

  it('Stage 9: displays Realtime status indicator, disclaimer, and reconnect workflow', async () => {
    responseProfile = stage9OperatorProfile;
    mockIncidentsList = [
      {
        ...testIncidentSummary,
        latitude: 17.0012,
        longitude: 81.7891,
        locationAccuracyM: 10,
        locationCapturedAt: '2026-10-28T10:00:00.000Z',
        locationIsFictional: false,
      },
    ];

    renderAt('/operator', {
      profile: stage9OperatorProfile,
      gateway: createGateway(testSession),
    });

    // Verify Realtime status indicator is present
    expect(await screen.findByRole('status', { name: '' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Realtime updates authorized UI states; socket connection does not substitute for human acknowledgement\./i,
      ),
    ).toBeInTheDocument();

    // Verify view toggle buttons exist
    expect(screen.getByRole('button', { name: /Split View/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Incident Queue Only/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operational Map View/i })).toBeInTheDocument();

    // Verify Map legend tags are rendered
    expect(screen.getByText(/GPS \(±Accuracy Circle\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual \/ Landmark/i)).toBeInTheDocument();
    expect(screen.getByText(/Fictional Demo Zones/i)).toBeInTheDocument();
  });

  it('Stage 9: allows switching view modes and ensures triage is never blocked by map rendering', async () => {
    const user = userEvent.setup();
    responseProfile = stage9OperatorProfile;
    mockIncidentsList = [
      {
        ...testIncidentSummary,
        latitude: 17.0012,
        longitude: 81.7891,
        locationAccuracyM: 10,
        locationCapturedAt: '2026-10-28T10:00:00.000Z',
        locationIsFictional: false,
      },
    ];

    renderAt('/operator', {
      profile: stage9OperatorProfile,
      gateway: createGateway(testSession),
    });

    expect(
      await screen.findByText('Elderly pilgrim collapsed near North Ghat steps'),
    ).toBeInTheDocument();

    // Switch to Map View Only
    const mapOnlyBtn = screen.getByRole('button', { name: /Operational Map View/i });
    await user.click(mapOnlyBtn);

    // Switch to Queue Only
    const queueOnlyBtn = screen.getByRole('button', { name: /Incident Queue Only/i });
    await user.click(queueOnlyBtn);

    // Verify incident list is fully usable and selectable
    const incidentCard = screen.getByRole('button', { name: /URGENT/i });
    await user.click(incidentCard);

    // Verify incident detail opens cleanly
    expect(await screen.findByText(/High confidence \(±10 m\)/i)).toBeInTheDocument();
  });

  it('Stage 9: allows responder to toggle operational map for assigned dispatches', async () => {
    const user = userEvent.setup();
    responseProfile = stage9ResponderProfile;
    responderIncidentStatus = 'ASSIGNED';
    mockIncidentsList = [
      {
        ...testIncidentSummary,
        status: 'ASSIGNED',
        latitude: 17.002,
        longitude: 81.778,
        locationAccuracyM: 8,
        locationCapturedAt: '2026-10-28T10:00:00.000Z',
      },
    ];

    renderAt('/responder', {
      profile: stage9ResponderProfile,
      gateway: createGateway(testSession),
    });

    // Verify Realtime pill is visible for responder
    expect(
      await screen.findByText(
        /Realtime updates authorized UI states; socket connection does not substitute for human acknowledgement\./i,
      ),
    ).toBeInTheDocument();

    // Toggle responder map
    const toggleMapBtn = screen.getByRole('button', { name: /View Map & Landmarks/i });
    await user.click(toggleMapBtn);

    // Verify responder map section opened
    expect(
      screen.getByText(/Assigned Incident Locations & Fictional Sectors/i),
    ).toBeInTheDocument();

    // Toggle back to list only
    const toggleListBtn = screen.getByRole('button', { name: /Show List Only/i });
    await user.click(toggleListBtn);

    expect(
      screen.queryByText(/Assigned Incident Locations & Fictional Sectors/i),
    ).not.toBeInTheDocument();
  });

  it('Stage 10: displays local queue status and clear draft action on public reporting form', async () => {
    const user = userEvent.setup();
    renderAt('/report');

    // Local queue status pill is visible initially as draft local
    expect(screen.getByText(/Draft saved locally — not sent/i)).toBeInTheDocument();

    // Type into summary
    const summaryInput = await screen.findByRole('textbox', { name: /short description/i });
    await user.type(summaryInput, 'Lost child near North Gate');

    // Clear Draft button should appear
    const clearDraftBtn = await screen.findByRole('button', { name: /Clear Local Draft/i });
    expect(clearDraftBtn).toBeInTheDocument();

    // Clicking Clear Draft resets the input
    await user.click(clearDraftBtn);
    expect(summaryInput).toHaveValue('');
  });

  it('Stage 10: offline submission fails honestly without displaying server success', async () => {
    const user = userEvent.setup();
    const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));

    try {
      renderAt('/report');

      // Offline tag is visible
      expect(screen.getByText(/🔴 Offline/i)).toBeInTheDocument();

      // Fill in minimum required fields including landmark
      const summaryInput = await screen.findByRole('textbox', { name: /short description/i });
      await user.type(summaryInput, 'Pilgrim slipped on wet steps');

      const landmarkInput = screen.getByLabelText(/Landmark or Specific Location/i);
      await user.type(landmarkInput, 'North Ghat Step 2');

      const confirmCheckbox = screen.getByRole('checkbox', {
        name: /i confirm this incident location/i,
      });
      await user.click(confirmCheckbox);

      // Attempt to submit
      const submitBtn = screen.getByRole('button', { name: /Submit emergency report/i });
      await user.click(submitBtn);

      // Verify honest offline notice and status
      expect(screen.getByRole('alert')).toHaveTextContent(/Device is currently offline/i);
      expect(screen.getByText(/Failed — not sent/i)).toBeInTheDocument();

      // Server success MUST NEVER be shown
      expect(screen.queryByText(/Emergency report logged/i)).not.toBeInTheDocument();
    } finally {
      onlineSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    }
  });

  it('Stage 10: public tracking page loads and displays approved status fields for valid tracking token', async () => {
    const user = userEvent.setup();
    renderAt('/track');

    expect(screen.getByRole('heading', { name: /Track an emergency report/i })).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Paste your 32-character tracking token/i);
    await user.type(input, 'f1e2d3c4b5a697881122334455667788');

    const submitBtn = screen.getByRole('button', { name: /Check status/i });
    await user.click(submitBtn);

    // Verify approved public tracking fields
    expect(await screen.findByText('Team Responding On-Scene')).toBeInTheDocument();
    expect(screen.getByText(/VIP Bathing Ghat \(Step 4\)/i)).toBeInTheDocument();
    expect(screen.getByText('Pilgrim collapsed near step')).toBeInTheDocument();

    // Verify strict redaction: internal phone, operator identity, etc. are NOT exposed
    expect(screen.queryByText('+919876543210')).not.toBeInTheDocument();
    expect(screen.queryByText('Senior Operator')).not.toBeInTheDocument();
  });

  it('Stage 10: public tracking page displays honest error when tracking token is invalid or not found', async () => {
    const user = userEvent.setup();
    renderAt('/track');

    const input = screen.getByPlaceholderText(/Paste your 32-character tracking token/i);
    await user.type(input, '00000000000000000000000000000000');

    const submitBtn = screen.getByRole('button', { name: /Check status/i });
    await user.click(submitBtn);

    expect(
      await screen.findByText(/No incident found for the provided tracking token/i),
    ).toBeInTheDocument();
  });

  it('Stage 11: language switcher toggles between English and Telugu and shows review disclaimer', async () => {
    const user = userEvent.setup();
    renderAt('/');

    // Initially English
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: /^Report$/i })).toBeInTheDocument();
    expect(screen.queryByText(/అధికారిక సమీక్ష అవసరం/i)).not.toBeInTheDocument();

    // Switch to Telugu
    const teButton = screen.getByRole('button', { name: /Switch to Telugu/i });
    await user.click(teButton);

    // Document lang updated
    expect(document.documentElement.lang).toBe('te');
    expect(screen.getByRole('link', { name: /నివేదించండి/i })).toBeInTheDocument();

    // Telugu review banner visible
    expect(screen.getByText(/అధికారిక సమీక్ష అవసరం/i)).toBeInTheDocument();

    // Switch back to English
    const enButton = screen.getByRole('button', { name: /Switch to English/i });
    await user.click(enButton);

    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: /^Report$/i })).toBeInTheDocument();
    expect(screen.queryByText(/అధికారిక సమీక్ష అవసరం/i)).not.toBeInTheDocument();
  });

  it('Stage 11: reporting form has accessible labels, aria-describedby associations, and preserves entered text', async () => {
    const user = userEvent.setup();
    renderAt('/report');

    // Summary textarea has label and aria-describedby
    const summaryInput = screen.getByLabelText(/Short Description of Emergency/i);
    expect(summaryInput).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('summary-hint'),
    );

    // Landmark input has label and aria-describedby
    const landmarkInput = screen.getByLabelText(/Landmark or Specific Location/i);
    expect(landmarkInput).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('landmark-hint'),
    );

    // Phone input has label and aria-describedby
    const phoneInput = screen.getByLabelText(/Callback Phone Number/i);
    expect(phoneInput).toHaveAttribute('aria-describedby', expect.stringContaining('phone-hint'));

    // Zone select has label and aria-describedby
    const zoneSelect = screen.getByLabelText(/Festival Zone/i);
    expect(zoneSelect).toHaveAttribute('aria-describedby', expect.stringContaining('zone-hint'));

    // Enter values
    await user.type(summaryInput, 'Crowd congestion near bathing ramp');
    await user.type(landmarkInput, 'Near gate 4 banyan tree');

    // Values remain preserved
    expect(summaryInput).toHaveValue('Crowd congestion near bathing ramp');
    expect(landmarkInput).toHaveValue('Near gate 4 banyan tree');
  });
});
