import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { StaffRole } from '@godavari/shared';
import { useStaffAuth } from '../auth/AuthContext.js';
import { useLanguage } from '../i18n/LanguageContext.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';

const roleNavigation: Record<StaffRole, { to: string; label: string }> = {
  OPERATOR: { to: '/operator', label: 'Operator workspace' },
  RESPONDER: { to: '/responder', label: 'Responder workspace' },
  ADMIN: { to: '/admin', label: 'Administration' },
};

export function SiteLayout() {
  const { status, profile, signOut } = useStaffAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const isSignedIn = status === 'signed-in' && profile !== null;

  const publicNavigation = [
    { to: '/', label: t.navOverview, end: true },
    { to: '/report', label: t.navReport, end: false },
    { to: '/track', label: t.navTrack, end: false },
  ];

  async function handleSignOut() {
    await signOut();
    navigate('/staff/login', { replace: true });
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="safety-notice" role="note" aria-label="Safety notice">
        <span className="safety-icon" aria-hidden="true">
          !
        </span>
        <p>
          <strong>{t.safetyAlertTitle}</strong> {t.safetyAlertText}
        </p>
        <a
          className="safety-call-link"
          href="tel:112"
          aria-label="Call 112 using your phone dialer"
        >
          {t.safetyCallBtn} <span aria-hidden="true">↗</span>
        </a>
      </aside>

      {language === 'te' && t.teluguReviewDisclaimer && (
        <aside className="telugu-review-banner" role="note" aria-label="భాష సమీక్ష నోటీసు">
          <span className="safety-icon" aria-hidden="true">
            ℹ
          </span>
          <p>{t.teluguReviewDisclaimer}</p>
        </aside>
      )}

      <header className="masthead">
        <div className="masthead-top">
          <NavLink className="brand" to="/" aria-label="Godavari safety home">
            <img src="/godavari-mark.svg" alt="" width="42" height="42" />
            <span className="brand-copy">
              <span className="brand-name">{t.brandName}</span>
            </span>
          </NavLink>
          <div className="masthead-right">
            <LanguageSwitcher />
          </div>
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
                {t.navSignOut}
              </button>
            </>
          ) : (
            <NavLink
              to="/staff/login"
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
            >
              {t.navStaffLogin}
            </NavLink>
          )}
        </nav>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>Godavari Safety</span>
        <span>Test environment — not connected to emergency services.</span>
      </footer>
    </div>
  );
}
