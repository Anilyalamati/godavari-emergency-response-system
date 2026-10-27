import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { StaffProfileSchema, type StaffProfile } from '@godavari/shared';
import {
  browserApiBaseUrl,
  browserAuthGateway,
  type StaffAuthGateway,
  type StaffAuthSession,
} from './authClient.js';

export type StaffAuthStatus =
  'loading' | 'signed-out' | 'signed-in' | 'unavailable' | 'unconfigured';

export class StaffApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StaffApiRequestError';
  }
}

interface StaffAuthContextValue {
  status: StaffAuthStatus;
  profile: StaffProfile | null;
  message: string | null;
  invitationPending: boolean;
  signIn(email: string, password: string): Promise<StaffProfile>;
  signOut(): Promise<void>;
  acceptInvitation(password: string): Promise<StaffProfile>;
  refreshSession(): Promise<void>;
  apiRequest<T>(path: string, init?: RequestInit): Promise<T>;
}

interface AuthProviderProps extends PropsWithChildren {
  gateway?: StaffAuthGateway | null;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

function safeApiMessage(payload: unknown, fallback: string): { code: string; message: string } {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return { code: 'REQUEST_FAILED', message: fallback };
  }
  const error = payload.error;
  if (typeof error !== 'object' || error === null)
    return { code: 'REQUEST_FAILED', message: fallback };
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === 'string' ? candidate.code : 'REQUEST_FAILED',
    message: typeof candidate.message === 'string' ? candidate.message : fallback,
  };
}

export function AuthProvider({
  children,
  gateway = browserAuthGateway,
  apiBaseUrl = browserApiBaseUrl,
  fetcher = fetch,
}: AuthProviderProps) {
  const [status, setStatus] = useState<StaffAuthStatus>(gateway ? 'loading' : 'unconfigured');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invitationPending, setInvitationPending] = useState(
    gateway?.hasPendingInvitation() ?? false,
  );
  const activeSession = useRef<StaffAuthSession | null>(null);
  const activeProfile = useRef<StaffProfile | null>(null);
  const verificationSequence = useRef(0);

  const clearLocalSession = useCallback(
    async (nextMessage: string | null) => {
      verificationSequence.current += 1;
      activeSession.current = null;
      activeProfile.current = null;
      setProfile(null);
      setStatus(gateway ? 'signed-out' : 'unconfigured');
      setMessage(nextMessage);
      if (gateway) {
        gateway.clearPendingInvitation();
        setInvitationPending(false);
        try {
          await gateway.signOut();
        } catch {
          // Local state is cleared even when the provider cannot be reached.
        }
      }
    },
    [gateway],
  );

  const verifySession = useCallback(
    async (session: StaffAuthSession): Promise<StaffProfile | null> => {
      const requestSequence = ++verificationSequence.current;
      activeSession.current = session;
      activeProfile.current = null;
      setProfile(null);
      setStatus('loading');
      setMessage(null);

      let response: Response;
      try {
        response = await fetcher(`${apiBaseUrl}/auth/me`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
        });
      } catch {
        if (requestSequence === verificationSequence.current) {
          setStatus('unavailable');
          setMessage('The staff session could not be verified. Check connectivity and retry.');
        }
        return null;
      }

      if (requestSequence !== verificationSequence.current) return null;
      if (response.status === 401 || response.status === 403) {
        const expired = response.status === 401;
        await clearLocalSession(
          expired
            ? 'Your session is invalid or expired. Sign in again.'
            : 'This account is not currently provisioned for staff access. Contact an administrator.',
        );
        return null;
      }
      if (!response.ok) {
        setStatus('unavailable');
        setMessage('The staff session could not be verified. Try again later.');
        return null;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setStatus('unavailable');
        setMessage('The staff session response was invalid. Try again later.');
        return null;
      }

      const data =
        typeof payload === 'object' && payload !== null && 'data' in payload
          ? (payload as { data?: unknown }).data
          : undefined;
      const parsedProfile = StaffProfileSchema.safeParse(data);
      if (!parsedProfile.success) {
        setStatus('unavailable');
        setMessage('The staff profile could not be verified. Try again later.');
        return null;
      }

      activeProfile.current = parsedProfile.data;
      setProfile(parsedProfile.data);
      setStatus('signed-in');
      setMessage(null);
      return parsedProfile.data;
    },
    [apiBaseUrl, clearLocalSession, fetcher],
  );

  useEffect(() => {
    if (!gateway) {
      setStatus('unconfigured');
      return;
    }

    let mounted = true;
    const unsubscribe = gateway.onAuthStateChange((session) => {
      if (!mounted) return;
      if (session) {
        void verifySession(session);
      } else {
        verificationSequence.current += 1;
        activeSession.current = null;
        activeProfile.current = null;
        setProfile(null);
        setStatus('signed-out');
      }
    });

    void gateway
      .getSession()
      .then((session) => {
        if (!mounted) return;
        if (session) void verifySession(session);
        else {
          activeSession.current = null;
          activeProfile.current = null;
          setProfile(null);
          setStatus('signed-out');
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus('unavailable');
          setMessage('The saved staff session could not be read. Sign in again.');
        }
      });

    return () => {
      mounted = false;
      verificationSequence.current += 1;
      unsubscribe();
    };
  }, [gateway, verifySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!gateway) throw new Error('Staff authentication is not configured.');
      setStatus('loading');
      setMessage(null);
      try {
        const session = await gateway.signInWithPassword(email, password);
        const authenticatedProfile = await verifySession(session);
        if (!authenticatedProfile) throw new Error('Staff access could not be verified.');
        return authenticatedProfile;
      } catch {
        const message =
          'Sign-in could not be completed. Check your details or contact an administrator.';
        await clearLocalSession(message);
        throw new Error(message);
      }
    },
    [clearLocalSession, gateway, verifySession],
  );

  const signOut = useCallback(async () => {
    if (!gateway) return;
    await clearLocalSession(null);
  }, [clearLocalSession, gateway]);

  const acceptInvitation = useCallback(
    async (password: string) => {
      if (!gateway) throw new Error('Staff authentication is not configured.');
      if (!gateway.hasPendingInvitation()) {
        throw new Error('A verified staff invitation is required.');
      }
      try {
        const session = await gateway.setPassword(password);
        const authenticatedProfile = await verifySession(session);
        if (!authenticatedProfile) throw new Error('The invitation session could not be verified.');
        setInvitationPending(false);
        return authenticatedProfile;
      } catch {
        const errorMessage =
          'The invitation could not be accepted. The link may have expired; ask an administrator for a new one.';
        await clearLocalSession(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [clearLocalSession, gateway, verifySession],
  );

  const refreshSession = useCallback(async () => {
    if (!gateway) {
      setStatus('unconfigured');
      return;
    }
    try {
      const session = await gateway.getSession();
      if (session) await verifySession(session);
      else {
        activeSession.current = null;
        activeProfile.current = null;
        setProfile(null);
        setStatus('signed-out');
        setMessage('No active staff session was found. Sign in again.');
      }
    } catch {
      setStatus('unavailable');
      setMessage('The staff session could not be refreshed. Try again later.');
    }
  }, [gateway, verifySession]);

  const apiRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const session = activeSession.current;
      if (!session || !activeProfile.current) {
        throw new StaffApiRequestError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
      }
      if (!path.startsWith('/') || path.startsWith('//')) {
        throw new StaffApiRequestError(400, 'INVALID_API_PATH', 'The request path is invalid.');
      }

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${session.accessToken}`);
      headers.set('Accept', 'application/json');
      if (init.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');

      let response: Response;
      try {
        response = await fetcher(`${apiBaseUrl}${path}`, {
          ...init,
          headers,
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch {
        throw new StaffApiRequestError(
          503,
          'API_UNAVAILABLE',
          'The staff API is temporarily unavailable.',
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.status === 401) {
        await clearLocalSession('Your session is invalid or expired. Sign in again.');
        throw new StaffApiRequestError(
          401,
          'INVALID_OR_EXPIRED_TOKEN',
          'Your staff session has expired.',
        );
      }
      if (!response.ok) {
        const failure = safeApiMessage(payload, 'The staff request could not be completed.');
        throw new StaffApiRequestError(response.status, failure.code, failure.message);
      }

      if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
        throw new StaffApiRequestError(
          502,
          'INVALID_API_RESPONSE',
          'The staff API returned an invalid response.',
        );
      }
      return (payload as { data: T }).data;
    },
    [apiBaseUrl, clearLocalSession, fetcher],
  );

  const value: StaffAuthContextValue = {
    status,
    profile,
    message,
    invitationPending,
    signIn,
    signOut,
    acceptInvitation,
    refreshSession,
    apiRequest,
  };

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth(): StaffAuthContextValue {
  const context = useContext(StaffAuthContext);
  if (!context) throw new Error('useStaffAuth must be used inside AuthProvider.');
  return context;
}
