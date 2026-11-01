import { Link } from 'react-router-dom';
import type { StaffRole } from '@godavari/shared';
import { useStaffAuth } from '../auth/AuthContext.js';

const publicDestinations = [
  { href: '/report', title: 'Report an emergency', label: 'Report an emergency' },
  { href: '/track', title: 'Track a report', label: 'Track an emergency report' },
] as const;

const roleDestination: Record<StaffRole, { title: string; href: string; label: string }> = {
  OPERATOR: {
    title: 'Operator workspace',
    href: '/operator',
    label: 'Open operator workspace',
  },
  RESPONDER: {
    title: 'Responder workspace',
    href: '/responder',
    label: 'Open responder workspace',
  },
  ADMIN: {
    title: 'Administration',
    href: '/admin',
    label: 'Open administration',
  },
};

const signInDestination = {
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
          <h1 id="home-title">Godavari Safety</h1>
          <p className="hero-description">
            Emergency response coordination and incident reporting.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/report">
              Report an emergency <span aria-hidden="true">→</span>
            </Link>
            <a className="button button-secondary" href="tel:112">
              Call 112 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="destination-section" aria-labelledby="destination-title">
        <div className="section-heading">
          <h2 id="destination-title">Quick Access</h2>
        </div>
        <nav className="destination-list" aria-label="Available pages">
          {destinations.map((item) => (
            <Link
              className="destination-row"
              to={item.href}
              key={item.href}
              aria-label={item.label}
            >
              <span className="destination-title">{item.title}</span>
              <span className="destination-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="scope-note" aria-label="Safety notice">
        <span className="scope-note-mark" aria-hidden="true">
          !
        </span>
        <p>
          <strong>Test environment — not connected to emergency services.</strong> For
          life-threatening emergencies, call 112 directly.
        </p>
      </section>
    </div>
  );
}
