import { Link } from 'react-router-dom';
import type { StaffRole } from '@godavari/shared';
import { useStaffAuth } from '../auth/AuthContext.js';

const publicDestinations = [
  { number: '01', title: 'Public report', href: '/report', label: 'Open the report placeholder' },
  { number: '02', title: 'Track a report', href: '/track', label: 'Open the tracking placeholder' },
] as const;

const roleDestination: Record<
  StaffRole,
  { number: string; title: string; href: string; label: string }
> = {
  OPERATOR: {
    number: '03',
    title: 'Operator workspace',
    href: '/operator',
    label: 'Open the operator workspace',
  },
  RESPONDER: {
    number: '03',
    title: 'Responder workspace',
    href: '/responder',
    label: 'Open the responder workspace',
  },
  ADMIN: {
    number: '03',
    title: 'Administration',
    href: '/admin',
    label: 'Open administration',
  },
};

const signInDestination = {
  number: '03',
  title: 'Staff sign-in',
  href: '/staff/login',
  label: 'Open staff sign-in',
} as const;

export function HomePage() {
  const { status, profile } = useStaffAuth();
  const destinations = [
    ...publicDestinations,
    status === 'signed-in' && profile ? roleDestination[profile.role] : signInDestination,
  ];

  return (
    <div className="home-page">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-rule" /> Stage 03 / Staff access
          </p>
          <h1 id="home-title">A coordination idea, built with care.</h1>
          <p className="hero-description">
            A software-only hackathon prototype for exploring role-aware public-safety coordination.
            Staff identity and permissions are checked by the API and database; this site is still
            not an emergency service.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/report">
              Explore the public report page <span aria-hidden="true">→</span>
            </Link>
            <a className="button button-secondary" href="tel:112">
              Call 112 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="hero-footnote">
            The 112 link opens your phone dialer if supported; telephone coverage is required.
          </p>
        </div>
        <div className="hero-aside" aria-label="Prototype scope">
          <div className="aside-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="aside-label">CURRENT SCOPE</p>
          <p className="aside-title">Staff access foundation</p>
          <p className="aside-copy">
            Provisioned staff sessions, role-specific screens, and server-enforced data boundaries.
          </p>
          <div className="aside-divider" />
          <p className="aside-meta">
            <span>Not implemented</span> Public report intake · dispatch · live response
          </p>
        </div>
      </section>

      <section className="destination-section" aria-labelledby="destination-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" /> Your available pages
            </p>
            <h2 id="destination-title">Browse this prototype</h2>
          </div>
          <span className="section-index">{destinations.length} DESTINATIONS</span>
        </div>
        <nav className="destination-list" aria-label="Prototype pages">
          {destinations.map((item) => (
            <Link
              className="destination-row"
              to={item.href}
              key={item.href}
              aria-label={item.label}
            >
              <span className="destination-number">{item.number}</span>
              <span className="destination-title">{item.title}</span>
              <span className="destination-status">
                {item.href === '/staff/login' ? 'Provisioned staff' : 'Role checked'}
              </span>
              <span className="destination-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="scope-note" aria-label="Safety boundary">
        <span className="scope-note-mark" aria-hidden="true">
          i
        </span>
        <p>
          <strong>For urgent help, do not use this prototype.</strong> Use the 112 alternative above
          if telephone service is available. This website does not connect to police, ambulances,
          hospitals, or emergency dispatch.
        </p>
      </section>
    </div>
  );
}
