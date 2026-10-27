import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../auth/AuthContext.js';
import { workspaceForRole } from '../components/ProtectedRoute.js';

export function InviteAcceptPage() {
  const { status, profile, message, invitationPending, acceptInvitation } = useStaffAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (status === 'signed-in' && profile && !invitationPending) {
    return <Navigate to={workspaceForRole(profile.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (password.length < 12) {
      setFormError('Use at least 12 characters for the new password.');
      return;
    }
    if (password !== confirmation) {
      setFormError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const acceptedProfile = await acceptInvitation(password);
      navigate(workspaceForRole(acceptedProfile.role), { replace: true });
    } catch {
      setFormError(
        'This invitation could not be completed. Ask an administrator for help or a new invitation.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="staff-auth-page" aria-labelledby="invite-title">
      <div className="staff-auth-copy">
        <p className="eyebrow">
          <span className="eyebrow-rule" /> Staff access / invitation
        </p>
        <h1 id="invite-title">Complete your staff invitation</h1>
        <p className="placeholder-summary">
          Set a password for the account created by an authorized administrator. This link does not
          create a public account or choose your role.
        </p>
        <div className="placeholder-boundary" role="note">
          <span className="scope-note-mark" aria-hidden="true">
            i
          </span>
          <p>
            Your profile role and team memberships are assigned by an administrator and checked
            again by the server.
          </p>
        </div>
        <Link className="text-link" to="/staff/login">
          Go to staff sign-in <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="staff-auth-card">
        {status === 'unconfigured' ? (
          <div className="auth-state-panel auth-state-panel-compact" role="status">
            <h2>Invitation setup is not configured</h2>
            <p>
              Configure the approved Supabase Auth redirect URL and browser-safe project settings
              before accepting an invitation.
            </p>
          </div>
        ) : status === 'loading' ? (
          <div className="auth-state-panel auth-state-panel-compact" role="status" aria-busy="true">
            <h2>Verifying invitation</h2>
            <p>
              Wait while the one-time invitation session is checked by Supabase Auth and the staff
              API.
            </p>
          </div>
        ) : status === 'unavailable' ? (
          <div className="auth-state-panel auth-state-panel-compact" role="alert">
            <h2>Invitation verification is unavailable</h2>
            <p>
              {message ??
                'Check connectivity and reopen the invitation link. Ask an administrator for help if it has expired.'}
            </p>
          </div>
        ) : status === 'signed-out' ? (
          <div className="auth-state-panel auth-state-panel-compact" role="status">
            <h2>Open a valid staff invitation first</h2>
            <p>
              {message ??
                'This page does not create an account. Use the one-time link sent by an authorized administrator.'}
            </p>
          </div>
        ) : !invitationPending ? (
          <div className="auth-state-panel auth-state-panel-compact" role="status">
            <h2>Open a valid staff invitation first</h2>
            <p>This page cannot change passwords without the one-time invitation session.</p>
          </div>
        ) : (
          <form className="staff-form" onSubmit={handleSubmit}>
            <p className="eyebrow">Use a unique password</p>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              disabled={busy}
            />
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              disabled={busy}
            />
            {(formError || message) && (
              <p className="form-alert" role="alert">
                {formError ?? message}
              </p>
            )}
            <button className="button button-primary staff-submit" type="submit" disabled={busy}>
              {busy ? 'Verifying invitation…' : 'Set password'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
