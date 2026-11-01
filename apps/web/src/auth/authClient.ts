import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { BrowserSupabaseConfigSchema } from '@godavari/shared';

export interface StaffAuthSession {
  accessToken: string;
  email: string | null;
}

export interface StaffAuthGateway {
  getSession(): Promise<StaffAuthSession | null>;
  onAuthStateChange(listener: (session: StaffAuthSession | null) => void): () => void;
  hasPendingInvitation(): boolean;
  clearPendingInvitation(): void;
  signInWithPassword(email: string, password: string): Promise<StaffAuthSession>;
  signOut(): Promise<void>;
  setPassword(password: string): Promise<StaffAuthSession>;
}

const parsedEnvironment = BrowserSupabaseConfigSchema.safeParse({
  url: import.meta.env.VITE_PUBLIC_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const browserAuthConfigurationError = parsedEnvironment.success
  ? null
  : 'Supabase Auth configuration is incomplete. Configure both the public project URL and publishable key.';

export const browserApiBaseUrl = (import.meta.env.VITE_PUBLIC_API_BASE_URL || '/api').replace(
  /\/$/,
  '',
);

const invitationMarkerKey = 'godavari.pending-staff-invitation';
const invitationCallbackDetected = (() => {
  if (typeof window === 'undefined' || window.location.pathname !== '/staff/accept-invite')
    return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return query.has('code') || query.get('type') === 'invite' || hash.get('type') === 'invite';
})();

let pendingInvitation = false;
try {
  pendingInvitation = window.sessionStorage.getItem(invitationMarkerKey) === 'true';
  if (invitationCallbackDetected) {
    pendingInvitation = true;
    window.sessionStorage.setItem(invitationMarkerKey, 'true');
  }
} catch {
  pendingInvitation = invitationCallbackDetected;
}

function clearPendingInvitation() {
  pendingInvitation = false;
  try {
    window.sessionStorage.removeItem(invitationMarkerKey);
  } catch {
    // The in-memory marker is still cleared if browser storage is unavailable.
  }
}

function toSessionSnapshot(session: Session | null): StaffAuthSession | null {
  if (!session?.access_token) return null;
  return {
    accessToken: session.access_token,
    email: session.user.email ?? null,
  };
}

function createGateway(client: SupabaseClient): StaffAuthGateway {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return toSessionSnapshot(data.session);
    },

    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toSessionSnapshot(session));
      });
      return () => data.subscription.unsubscribe();
    },

    hasPendingInvitation() {
      return pendingInvitation;
    },

    clearPendingInvitation,

    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error('Staff sign-in failed.');
      const session = toSessionSnapshot(data.session);
      if (!session) throw new Error('Staff sign-in failed.');
      return session;
    },

    async signOut() {
      clearPendingInvitation();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },

    async setPassword(password) {
      if (!pendingInvitation) throw new Error('A verified staff invitation is required.');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error('The invitation could not be accepted.');
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError || !data.session) throw new Error('The invitation session has expired.');
      const session = toSessionSnapshot(data.session);
      if (!session) throw new Error('The invitation session has expired.');
      clearPendingInvitation();
      return session;
    },
  };
}

let authClient: SupabaseClient | null = null;
if (
  parsedEnvironment.success &&
  parsedEnvironment.data.url &&
  parsedEnvironment.data.publishableKey
) {
  authClient = createClient(parsedEnvironment.data.url, parsedEnvironment.data.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: 'pkce',
    },
  });
}

export const browserAuthGateway: StaffAuthGateway | null = authClient
  ? createGateway(authClient)
  : null;

export const supabaseClient: SupabaseClient | null = authClient;
export function getSupabaseBrowserClient(): SupabaseClient | null {
  return authClient;
}
