import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, Link } from 'react-router-dom';
import type { PublicIncidentTrackingResponse } from '@godavari/shared';
import { trackIncident, IncidentTrackingError } from '../api/incidents.js';
import { useLanguage } from '../i18n/LanguageContext.js';

export function TrackIncidentPage() {
  const { t } = useLanguage();
  const location = useLocation();
  const stateToken = (location.state as { trackingToken?: string } | null)?.trackingToken ?? '';

  const [tokenInput, setTokenInput] = useState(stateToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<PublicIncidentTrackingResponse | null>(null);

  async function performLookup(tokenToTrack: string) {
    const trimmed = tokenToTrack.trim();
    if (!trimmed || trimmed.length < 16) {
      setError('Please enter a valid tracking token of at least 16 hexadecimal characters.');
      return;
    }

    setLoading(true);
    setError(null);
    setTrackingData(null);

    try {
      const result = await trackIncident(trimmed);
      setTrackingData(result);
    } catch (err) {
      if (err instanceof IncidentTrackingError) {
        setError(err.message);
      } else {
        setError('Could not retrieve tracking details. Please check your token or try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Pre-load if token was passed via in-memory router state from successful report submission
  useEffect(() => {
    if (stateToken) {
      void performLookup(stateToken);
    }
  }, [stateToken]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void performLookup(tokenInput);
  }

  return (
    <article className="track-page" aria-labelledby="track-page-title">
      <p className="eyebrow">
        <span className="eyebrow-rule" /> {t.trackEyebrow}
      </p>
      <div className="track-heading-row">
        <h1 id="track-page-title">{t.trackHeading}</h1>
        <span className="prototype-badge">Live lookup</span>
      </div>
      <p className="placeholder-summary">{t.trackSummary}</p>

      {/* Tracking Input Form */}
      <section className="track-input-section" aria-label="Tracking token search">
        <form onSubmit={handleSubmit} className="track-form" noValidate>
          <div className="form-group">
            <label htmlFor="trackingTokenInput">{t.trackTokenLabel}</label>
            <div className="track-input-row">
              <input
                id="trackingTokenInput"
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={t.trackTokenPlaceholder}
                className="track-input font-mono"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="tracking-token-hint"
                aria-invalid={Boolean(error)}
                required
              />
              <button
                type="submit"
                disabled={loading || !tokenInput.trim()}
                className="button button-primary track-submit-btn"
                style={{ minHeight: '44px' }}
              >
                {loading ? t.checkingStatusBtn : t.checkStatusBtn}
              </button>
            </div>
            <p id="tracking-token-hint" className="field-hint">
              Tracking tokens are cryptographic digests issued upon report intake. Tokens are never
              exposed in URL parameters or server access logs.
            </p>
          </div>
        </form>

        {error && (
          <div className="form-alert track-alert" role="alert">
            <strong>Tracking lookup failed:</strong> {error}
          </div>
        )}
      </section>

      {/* Tracking Results Card */}
      {trackingData && (
        <section className="track-result-card" aria-label="Incident status report">
          <div className="track-card-header">
            <div>
              <span className="track-id-badge">
                Reference <code>{trackingData.incidentId.slice(0, 8)}</code>
              </span>
              <h2 className="track-status-title">{trackingData.statusLabel}</h2>
            </div>
            <span className={`track-status-pill status-${trackingData.status.toLowerCase()}`}>
              {trackingData.status}
            </span>
          </div>

          <div className="track-details-grid">
            <div className="track-detail-item">
              <span className="detail-label">Incident Category</span>
              <span className="detail-value">{trackingData.category}</span>
            </div>

            <div className="track-detail-item">
              <span className="detail-label">Reported Location</span>
              <span className="detail-value">
                {trackingData.zoneName ? trackingData.zoneName : 'General riverfront area'}
                {trackingData.landmark ? ` (${trackingData.landmark})` : ''}
              </span>
            </div>

            <div className="track-detail-item">
              <span className="detail-label">Reported Time</span>
              <span className="detail-value">
                {new Date(trackingData.reportedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {new Date(trackingData.reportedAt).toLocaleDateString()}
              </span>
            </div>

            <div className="track-detail-item">
              <span className="detail-label">Latest Operational Update</span>
              <span className="detail-value">
                {new Date(trackingData.updatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="track-summary-box">
            <span className="detail-label">Report Summary</span>
            <p className="track-summary-text">{trackingData.summary}</p>
          </div>

          <div className="track-privacy-notice" role="note">
            <span className="scope-note-mark" aria-hidden="true">
              i
            </span>
            <p>{t.trackPrivacyNotice}</p>
          </div>

          <div className="track-escalation-reminder">
            <p>{t.trackEscalationReminder}</p>
          </div>
        </section>
      )}

      <div className="track-footer-links">
        <Link className="text-link" to="/report">
          ← Submit a new emergency report
        </Link>
        <Link className="text-link" to="/">
          Return to overview →
        </Link>
      </div>
    </article>
  );
}
