import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { StaffRole } from '@godavari/shared';
import { useStaffAuth } from '../auth/AuthContext.js';

interface ProtectedRouteProps {
  role: StaffRole;
  children: ReactNode;
}

export function workspaceForRole(role: StaffRole): string {
  if (role === 'OPERATOR') return '/operator';
  if (role === 'RESPONDER') return '/responder';
  return '/admin';
}

export function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const { status, profile } = useStaffAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <section className="auth-state-panel" aria-live="polite" aria-busy="true">
        <p className="eyebrow">Staff access / verifying</p>
        <h1>Checking your access</h1>
        <p>Your session and server-controlled staff role are being verified.</p>
      </section>
    );
  }

  if (status !== 'signed-in' || !profile) {
    return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;
  }

  if (profile.role !== role) {
    return (
      <section className="auth-state-panel" aria-labelledby="access-denied-title">
        <p className="eyebrow">Staff access / restricted</p>
        <h1 id="access-denied-title">This workspace is not available to your role.</h1>
        <p>Your verified role can open its assigned workspace, but not this route.</p>
        <Link className="text-link" to={workspaceForRole(profile.role)}>
          Open my workspace <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }

  return children;
}
