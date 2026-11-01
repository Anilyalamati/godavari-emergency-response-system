import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../auth/AuthContext.js';
import { workspaceForRole } from '../components/ProtectedRoute.js';

export function StaffLoginPage() {
  const { status, profile, message, signIn, refreshSession } = useStaffAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (status === 'signed-in' && profile)
    return <Navigate to={workspaceForRole(profile.role)} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const authenticatedProfile = await signIn(email.trim(), password);
      navigate(workspaceForRole(authenticatedProfile.role), { replace: true });
    } catch {
      setFormError(
        'Sign-in could not be completed. Check your details or contact an administrator.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="staff-auth-page" aria-labelledby="staff-login-title">
      <div className="staff-auth-copy">
        <h1 id="staff-login-title">Staff sign-in</h1>
        <p className="placeholder-summary">Authorized accounts only.</p>
        <Link className="text-link" to="/">
          Overview <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="staff-auth-card">
        {status === 'unconfigured' ? (
          <div className="auth-state-panel auth-state-panel-compact" role="status">
            <h2>Staff sign-in is not configured</h2>
            <p>
              Supabase authentication settings are missing. Configure the environment variables.
            </p>
          </div>
        ) : (
          <form className="staff-form" onSubmit={handleSubmit}>
            <label htmlFor="staff-email">Work email</label>
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              disabled={busy}
            />
            <label htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              disabled={busy}
            />
            {(formError || message) && (
              <p className="form-alert" role="alert">
                {formError ?? message}
              </p>
            )}
            {status === 'unavailable' && (
              <button className="text-button" type="button" onClick={() => void refreshSession()}>
                Retry session verification
              </button>
            )}
            <button
              className="button button-primary staff-submit"
              type="submit"
              disabled={busy || status === 'loading'}
            >
              {busy ? 'Verifying…' : 'Sign in'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
            <p className="form-footnote">
              Authorized staff access only. Contact an administrator for an account.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
