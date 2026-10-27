import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StaffProfile, StaffRole } from '@godavari/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
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
      <AuthProvider gateway={options.gateway ?? null} apiBaseUrl="/api" fetcher={fetch}>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  responseProfile = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
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
      if (
        pathname === '/api/staff/incidents' ||
        pathname === '/api/admin/staff' ||
        pathname === '/api/admin/teams' ||
        pathname === '/api/admin/configuration'
      ) {
        return mockResponse({ data: [], requestId: healthResponse.requestId });
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

  it('opens the report placeholder without presenting a sending workflow', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: /^Report$/ }));

    expect(screen.getByRole('heading', { name: 'Report an emergency' })).toBeInTheDocument();
    expect(screen.getByText(/nothing on this page can send or save a report/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit|send/i })).not.toBeInTheDocument();
  });

  it('keeps the demonstration field labelled and keyboard accessible', async () => {
    const user = userEvent.setup();
    renderAt('/report');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();

    const input = screen.getByRole('textbox', { name: 'Demonstration note (not sent or saved)' });
    await user.click(input);
    await user.type(input, 'local sample');
    expect(input).toHaveValue('local sample');
    expect(screen.getByText(/not submitted, transmitted, or saved/i)).toBeInTheDocument();
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
});
