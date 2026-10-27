import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { StaffRole } from '@godavari/shared';
import { useStaffAuth } from '../auth/AuthContext.js';
import { ApiStatus } from './ApiStatus.js';

const publicNavigation = [
  { to: '/', label: 'Overview', end: true },
  { to: '/report', label: 'Report', end: false },
  { to: '/track', label: 'Track', end: false },
];

const roleNavigation: Record<StaffRole, { to: string; label: string }> = {
  OPERATOR: { to: '/operator', label: 'Operator workspace' },
  RESPONDER: { to: '/responder', label: 'Responder workspace' },
  ADMIN: { to: '/admin', label: 'Administration' },
};

export function SiteLayout() {
  const { status, profile, signOut } = useStaffAuth();
  const navigate = useNavigate();
  const isSignedIn = status === 'signed-in' && profile !== null;

  async function handleSignOut() {
    await signOut();
    navigate('/staff/login', { replace: true });
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="safety-notice" role="note" aria-label="Prototype safety notice">
        <span className="safety-icon" aria-hidden="true">
          !
        </span>
        <p>
          <strong>Hackathon prototype — not an emergency service.</strong> This site cannot request
          or guarantee help. For urgent assistance, use a phone to call 112 if telephone coverage is
          available.
        </p>
        <a
          className="safety-call-link"
          href="tel:112"
          aria-label="Call 112 using your phone dialer"
        >
          Call 112 <span aria-hidden="true">↗</span>
        </a>
      </aside>

      <header className="masthead">
        <div className="masthead-top">
          <NavLink className="brand" to="/" aria-label="Godavari coordination prototype home">
            <img src="/godavari-mark.svg" alt="" width="42" height="42" />
            <span className="brand-copy">
              <span className="brand-name">GODAVARI</span>
              <span className="brand-caption">COORDINATION PROTOTYPE</span>
            </span>
          </NavLink>
          <span className="stage-tag">
            <span aria-hidden="true" className="stage-tag-dot" /> Staff access / prototype
          </span>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {publicNavigation.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
          {isSignedIn ? (
            <>
              <NavLink
                to={roleNavigation[profile.role].to}
                className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
              >
                {roleNavigation[profile.role].label}
              </NavLink>
              <span className="nav-identity">
                {profile.displayName} ·{' '}
                {roleNavigation[profile.role].label.replace(' workspace', '')}
              </span>
              <button className="nav-signout" type="button" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/staff/login"
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
            >
              Staff sign-in
            </NavLink>
          )}
        </nav>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>Godavari Emergency Response Coordination System</span>
        <span>Software-only hackathon prototype · Not for operational use</span>
      </footer>
      <ApiStatus />
    </div>
  );
}
