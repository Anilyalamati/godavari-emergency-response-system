import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type {
  IncidentCategory,
  LocationSource,
  PublicIncidentCreatedResponse,
  PublicZone,
} from '@godavari/shared';
import { getPublicZones, submitIncident, IncidentSubmissionError } from '../api/incidents.js';
import { useLanguage } from '../i18n/LanguageContext.js';
import {
  saveQueuedReport,
  deleteQueuedReport,
  isReportStale,
  formatQueueAge,
  cleanupExpiredReports,
  type QueueStatus,
} from '../utils/localQueue.js';

type GeoState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'acquired'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied'; message: string };

function generateClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateLocalTrackingToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function ReportEmergencyPage() {
  const [searchParams] = useSearchParams();
  const formId = useId();
  const { t } = useLanguage();

  const categoryOptions: { value: IncidentCategory; label: string; description: string }[] = [
    {
      value: 'MEDICAL_ASSISTANCE',
      label: t.catMedical,
      description: t.catMedicalDesc,
    },
    {
      value: 'INFRASTRUCTURE',
      label: t.catInfra,
      description: t.catInfraDesc,
    },
    {
      value: 'CROWD_SAFETY',
      label: t.catCrowd,
      description: t.catCrowdDesc,
    },
    {
      value: 'LOST_PERSON',
      label: t.catLost,
      description: t.catLostDesc,
    },
    {
      value: 'OTHER',
      label: t.catOther,
      description: t.catOtherDesc,
    },
  ];

  const queueStatusLabels: Record<QueueStatus, string> = {
    DRAFT_LOCAL: t.queueDraftLocal,
    SENDING: t.queueSending,
    RECEIVED: t.queueReceived,
    FAILED: t.queueFailed,
  };

  // Form state
  const [category, setCategory] = useState<IncidentCategory>('MEDICAL_ASSISTANCE');
  const [summary, setSummary] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [landmark, setLandmark] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>({ status: 'idle' });

  // Catalogue & network state
  const [zones, setZones] = useState<PublicZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  // Client request ID & tracking token generated locally and preserved across retries
  const [clientRequestId, setClientRequestId] = useState(generateClientRequestId);
  const [draftTrackingToken, setDraftTrackingToken] = useState(generateLocalTrackingToken);
  const [draftCreatedAt, setDraftCreatedAt] = useState(() => new Date().toISOString());

  // Stage 10: Connectivity & Local Queue State
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('DRAFT_LOCAL');
  const [stalePromptNeeded, setStalePromptNeeded] = useState(false);
  const [staleConfirmed, setStaleConfirmed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<PublicIncidentCreatedResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Detect QR pre-selection
  const qrZoneParam = searchParams.get('zone') || searchParams.get('zoneId');
  const [isQrPreselected, setIsQrPreselected] = useState(false);

  // 1. Monitor online/offline state
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Initial load: run cleanup on expired reports
  useEffect(() => {
    void cleanupExpiredReports(24);
  }, []);

  // 3. Fetch zones catalogue
  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    setZonesLoading(true);
    setZonesError(null);

    getPublicZones(controller.signal)
      .then((data) => {
        if (!isCurrent) return;
        setZones(data);
        setZonesLoading(false);

        // Pre-select zone from QR/URL query param if matched
        if (qrZoneParam) {
          const matched = data.find(
            (z) =>
              z.id.toLowerCase() === qrZoneParam.toLowerCase() ||
              z.zoneCode.toLowerCase() === qrZoneParam.toLowerCase(),
          );
          if (matched) {
            setZoneId(matched.id);
            setIsQrPreselected(true);
          }
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setZonesLoading(false);
        setZonesError(
          'Could not load the zones directory. You can still describe your location below.',
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [qrZoneParam]);

  // 4. Geolocation: ONLY requested on explicit user action
  function handleRequestLocation() {
    if (!('geolocation' in navigator)) {
      setGeoState({
        status: 'denied',
        message: 'Geolocation is not supported by your browser. Please select your zone manually.',
      });
      return;
    }

    setGeoState({ status: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState({
          status: 'acquired',
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (error) => {
        let msg = 'Location access was not granted. Please select your zone and landmark manually.';
        if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please enter your location manually.';
        }
        setGeoState({ status: 'denied', message: msg });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function handleClearLocation() {
    setGeoState({ status: 'idle' });
  }

  // 5. Save draft into IndexedDB as user edits
  useEffect(() => {
    if (successReport) return;
    if (!summary && !landmark && !callbackPhone && !zoneId) return;

    let locationSource: LocationSource = 'NOT_PROVIDED';
    let lat: number | undefined;
    let lon: number | undefined;
    let accuracy: number | undefined;

    if (geoState.status === 'acquired') {
      locationSource = 'GPS';
      lat = geoState.latitude;
      lon = geoState.longitude;
      accuracy = geoState.accuracy;
    } else if (landmark.trim().length > 0) {
      locationSource = 'LANDMARK';
    }

    void saveQueuedReport({
      clientRequestId,
      trackingToken: draftTrackingToken,
      createdAt: draftCreatedAt,
      status:
        queueStatus === 'RECEIVED'
          ? 'RECEIVED'
          : queueStatus === 'FAILED'
            ? 'FAILED'
            : 'DRAFT_LOCAL',
      category,
      summary: summary.trim(),
      zoneId: zoneId || undefined,
      landmark: landmark.trim() || undefined,
      callbackPhone: callbackPhone.trim() || undefined,
      locationSource,
      latitude: lat,
      longitude: lon,
      locationAccuracyM: accuracy,
      locationConfirmed,
      retryCount,
    });
  }, [
    clientRequestId,
    draftTrackingToken,
    draftCreatedAt,
    queueStatus,
    category,
    summary,
    zoneId,
    landmark,
    callbackPhone,
    geoState,
    locationConfirmed,
    retryCount,
    successReport,
  ]);

  // 6. Transmit report implementation
  const transmitReport = useCallback(
    async (options?: { bypassStaleCheck?: boolean }) => {
      setFormError(null);

      if (!locationConfirmed) {
        setFormError('You must confirm the incident location before submitting.');
        return;
      }

      const trimmedSummary = summary.trim();
      if (trimmedSummary.length < 3) {
        setFormError('Please provide a short description of the incident (at least 3 characters).');
        return;
      }

      const trimmedPhone = callbackPhone.trim();
      if (trimmedPhone.length > 0 && !/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
        setFormError(
          'Callback number must be in international E.164 format starting with + (e.g. +919876543210).',
        );
        return;
      }

      // Check for stale draft (> 5 minutes) unless explicitly bypassed/confirmed
      if (!options?.bypassStaleCheck && !staleConfirmed && isReportStale(draftCreatedAt, 5)) {
        setStalePromptNeeded(true);
        return;
      }

      let locationSource: LocationSource = 'NOT_PROVIDED';
      let lat: number | undefined;
      let lon: number | undefined;
      let accuracy: number | undefined;

      if (geoState.status === 'acquired') {
        locationSource = 'GPS';
        lat = geoState.latitude;
        lon = geoState.longitude;
        accuracy = geoState.accuracy;
      } else if (landmark.trim().length > 0) {
        locationSource = 'LANDMARK';
      }

      setIsSubmitting(true);
      setQueueStatus('SENDING');

      // Offline check: never show server success if offline!
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsSubmitting(false);
        setQueueStatus('FAILED');
        setRetryCount((prev) => prev + 1);
        setFormError(
          'Device is currently offline. Your report has been safely queued in local storage (IndexedDB) and will attempt transmission once network connectivity returns.',
        );
        void saveQueuedReport({
          clientRequestId,
          trackingToken: draftTrackingToken,
          createdAt: draftCreatedAt,
          status: 'FAILED',
          category,
          summary: trimmedSummary,
          zoneId: zoneId || undefined,
          landmark: landmark.trim() || undefined,
          callbackPhone: trimmedPhone || undefined,
          locationSource,
          latitude: lat,
          longitude: lon,
          locationAccuracyM: accuracy,
          locationConfirmed,
          retryCount: retryCount + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: 'Network offline',
        });
        return;
      }

      try {
        const result = await submitIncident({
          clientRequestId,
          trackingToken: draftTrackingToken,
          reportedAt: draftCreatedAt, // Preserves original reported time separately from receipt time
          category,
          summary: trimmedSummary,
          zoneId: zoneId || undefined,
          landmark: landmark.trim() || undefined,
          callbackPhone: trimmedPhone || undefined,
          locationSource,
          latitude: lat,
          longitude: lon,
          locationAccuracyM: accuracy,
          locationConfirmed: true,
        });

        setQueueStatus('RECEIVED');
        setSuccessReport(result);
        void deleteQueuedReport(clientRequestId);
      } catch (err) {
        setQueueStatus('FAILED');
        setRetryCount((prev) => prev + 1);
        if (err instanceof IncidentSubmissionError) {
          setFormError(err.message);
        } else {
          setFormError(
            'A transmission failure occurred. Your report remains saved in the local queue — retry when connectivity returns or call 112.',
          );
        }
        void saveQueuedReport({
          clientRequestId,
          trackingToken: draftTrackingToken,
          createdAt: draftCreatedAt,
          status: 'FAILED',
          category,
          summary: trimmedSummary,
          zoneId: zoneId || undefined,
          landmark: landmark.trim() || undefined,
          callbackPhone: trimmedPhone || undefined,
          locationSource,
          latitude: lat,
          longitude: lon,
          locationAccuracyM: accuracy,
          locationConfirmed,
          retryCount: retryCount + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: err instanceof Error ? err.message : 'Transmission failure',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      callbackPhone,
      category,
      clientRequestId,
      draftCreatedAt,
      draftTrackingToken,
      geoState,
      landmark,
      locationConfirmed,
      retryCount,
      staleConfirmed,
      summary,
      zoneId,
    ],
  );

  // 7. Auto-retry when connectivity returns and app is active in foreground
  useEffect(() => {
    if (!isOnline || isSubmitting || successReport) return;
    if (summary.trim().length >= 3 && locationConfirmed && queueStatus === 'FAILED') {
      if (!isReportStale(draftCreatedAt, 5) || staleConfirmed) {
        void transmitReport();
      }
    }
  }, [
    isOnline,
    isSubmitting,
    successReport,
    summary,
    locationConfirmed,
    queueStatus,
    draftCreatedAt,
    staleConfirmed,
    transmitReport,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await transmitReport();
  }

  function handleConfirmStaleAndSend() {
    setStaleConfirmed(true);
    setStalePromptNeeded(false);
    void transmitReport({ bypassStaleCheck: true });
  }

  async function handleClearDraft() {
    await deleteQueuedReport(clientRequestId);
    setSummary('');
    setLandmark('');
    setCallbackPhone('');
    setLocationConfirmed(false);
    setGeoState({ status: 'idle' });
    setClientRequestId(generateClientRequestId());
    setDraftTrackingToken(generateLocalTrackingToken());
    setDraftCreatedAt(new Date().toISOString());
    setQueueStatus('DRAFT_LOCAL');
    setStalePromptNeeded(false);
    setStaleConfirmed(false);
    setFormError(null);
  }

  function handleCopyToken() {
    if (successReport?.trackingToken) {
      void navigator.clipboard.writeText(successReport.trackingToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 3000);
    }
  }

  function handleStartNewReport() {
    setSuccessReport(null);
    void handleClearDraft();
  }

  const selectedZone = zones.find((z) => z.id === zoneId);

  // Success view
  if (successReport) {
    return (
      <section className="report-success-view" aria-labelledby="report-success-title">
        <h1 id="report-success-title">{t.successTitle}</h1>

        {successReport.isIdempotentReplay && (
          <div className="form-alert" role="status" style={{ marginTop: '16px' }}>
            <strong>Reconciled:</strong> This report matches an earlier submission. No duplicate was
            created.
          </div>
        )}

        <div className="report-success-card">
          <div className="success-card-row">
            <span className="success-label">{t.incidentIdLabel}</span>
            <code className="success-value">{successReport.incidentId}</code>
          </div>
          <div className="success-card-row">
            <span className="success-label">Queue Status</span>
            <span className="queue-pill queue-received">{queueStatusLabels.RECEIVED}</span>
          </div>
          <div className="success-card-row">
            <span className="success-label">Operational Status</span>
            <span className="placeholder-badge">{successReport.status}</span>
          </div>
          <div className="success-card-row">
            <span className="success-label">Category</span>
            <span className="workspace-record-category">
              {successReport.category.replaceAll('_', ' ')}
            </span>
          </div>
          <div className="success-card-row">
            <span className="success-label">Reported At</span>
            <span>{new Date(successReport.reportedAt).toLocaleString()}</span>
          </div>
          {successReport.zoneName && (
            <div className="success-card-row">
              <span className="success-label">{t.zoneLabel}</span>
              <span>{successReport.zoneName}</span>
            </div>
          )}
          {successReport.landmark && (
            <div className="success-card-row">
              <span className="success-label">{t.landmarkLabel}</span>
              <span>{successReport.landmark}</span>
            </div>
          )}

          <div className="tracking-token-box">
            <p className="tracking-token-title">{t.trackingTokenTitle}</p>
            <div className="tracking-token-display">
              <code>{successReport.trackingToken}</code>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCopyToken}
                style={{ minHeight: '44px', padding: '6px 14px' }}
              >
                {tokenCopied ? t.tokenCopied : t.copyTokenBtn}
              </button>
            </div>
          </div>
        </div>

        <div className="hero-actions" style={{ marginTop: '28px' }}>
          <Link
            className="button button-primary"
            to="/track"
            state={{ trackingToken: successReport.trackingToken }}
          >
            {t.trackIncidentBtn}
          </Link>
          <button type="button" className="button button-secondary" onClick={handleStartNewReport}>
            {t.submitAnotherBtn}
          </button>
          <Link className="button button-secondary" to="/">
            Overview
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="report-page-layout">
      <section className="report-intro" aria-labelledby="report-page-title">
        <h1 id="report-page-title">{t.reportHeading}</h1>

        {/* Local Queue & Connectivity Banner */}
        <div className="local-queue-status-bar" role="status" aria-live="polite">
          <div className="queue-status-pill-group">
            <span className={`queue-pill queue-${queueStatus.toLowerCase()}`}>
              <span className="queue-dot" aria-hidden="true" />
              {queueStatusLabels[queueStatus]}
            </span>
            <span className={`connectivity-tag ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? `🟢 ${t.queueOnline}` : `🔴 ${t.queueOffline}`}
            </span>
          </div>

          {(summary.length > 0 || landmark.length > 0) && (
            <button
              type="button"
              className="btn-clear-draft"
              onClick={handleClearDraft}
              title="Delete local draft"
            >
              🗑️ {t.queueClearDraft}
            </button>
          )}
        </div>

        {/* Stale Report Prompt Modal / Alert */}
        {stalePromptNeeded && (
          <div className="stale-report-modal" role="dialog" aria-labelledby="stale-modal-title">
            <h3 id="stale-modal-title">Confirm Active Emergency Status</h3>
            <p>
              This draft is <strong>{formatQueueAge(draftCreatedAt)}</strong> old.
            </p>
            <p>
              <strong>Is this emergency still active and unresolved?</strong>
            </p>
            <div className="stale-modal-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={handleConfirmStaleAndSend}
              >
                Yes, Emergency is Active — Send Now
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setStalePromptNeeded(false)}
              >
                Review Report
              </button>
              <button type="button" className="btn-link text-danger" onClick={handleClearDraft}>
                Discard Draft
              </button>
            </div>
          </div>
        )}

        <div
          className="emergency-call-banner"
          role="region"
          aria-label="Urgent telephone alternative"
        >
          <div className="call-banner-copy">
            <strong>{t.emergencyCallBannerTitle}</strong>
          </div>
          <a className="button button-primary call-112-btn" href="tel:112">
            Call 112 now <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="report-form-container" aria-labelledby="report-form-heading">
        <form className="staff-form report-form" onSubmit={handleSubmit} noValidate>
          <h2 id="report-form-heading" className="report-form-title">
            Incident Details
          </h2>

          {/* 1. Category */}
          <fieldset className="team-membership-fieldset" style={{ border: 'none', padding: 0 }}>
            <legend className="form-legend">{t.categoryLegend} *</legend>
            <div className="category-options-grid">
              {categoryOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`category-option-card ${category === opt.value ? 'category-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="incident-category"
                    value={opt.value}
                    checked={category === opt.value}
                    onChange={() => setCategory(opt.value)}
                    disabled={isSubmitting}
                  />
                  <div className="category-option-content">
                    <strong>{opt.label}</strong>
                    <span>{opt.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 2. Short Description */}
          <label htmlFor={`${formId}-summary`}>
            {t.shortDescLabel} *
            <span id={`${formId}-summary-hint`} className="field-hint">
              {t.shortDescHint}
            </span>
          </label>
          <textarea
            id={`${formId}-summary`}
            name="summary"
            rows={4}
            required
            aria-describedby={`${formId}-summary-hint`}
            aria-invalid={Boolean(formError && summary.trim().length < 3)}
            placeholder={t.shortDescPlaceholder}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={isSubmitting}
            maxLength={4000}
          />
          <span className="char-count">{summary.length} / 4000 characters</span>

          {/* 3. Location Section */}
          <fieldset className="location-fieldset">
            <legend className="form-legend">{t.locationLegend} *</legend>
            <p className="field-hint">{t.locationHint}</p>

            {/* QR notice */}
            {isQrPreselected && (
              <div className="qr-preselect-banner" role="status">
                <strong>Location preselected from link / QR code:</strong> Zone{' '}
                <em>{selectedZone?.name}</em> was pre-selected from your scanned code. Please verify
                this matches your current location below.
              </div>
            )}

            {/* Zone dropdown */}
            <label htmlFor={`${formId}-zone`}>
              {t.zoneLabel}
              <span id={`${formId}-zone-hint`} className="field-hint">
                {t.zoneHint}
              </span>
            </label>
            <select
              id={`${formId}-zone`}
              name="zoneId"
              value={zoneId}
              aria-describedby={`${formId}-zone-hint`}
              onChange={(e) => {
                setZoneId(e.target.value);
                setIsQrPreselected(false);
              }}
              disabled={isSubmitting || zonesLoading}
            >
              <option value="">{t.zonePlaceholder}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.zoneCode})
                </option>
              ))}
            </select>
            {zonesError && <span className="field-hint text-warning">{zonesError}</span>}

            {/* Landmark text */}
            <label htmlFor={`${formId}-landmark`}>
              {t.landmarkLabel} *
              <span id={`${formId}-landmark-hint`} className="field-hint">
                {t.landmarkHint}
              </span>
            </label>
            <input
              id={`${formId}-landmark`}
              name="landmark"
              type="text"
              aria-describedby={`${formId}-landmark-hint`}
              aria-invalid={Boolean(formError && landmark.trim().length === 0)}
              placeholder={t.landmarkPlaceholder}
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              disabled={isSubmitting}
              maxLength={240}
            />

            {/* GPS coordinates */}
            <div className="gps-section">
              <span className="gps-label">GPS Device Location (Optional)</span>

              {geoState.status === 'idle' && (
                <button
                  type="button"
                  className="button button-secondary gps-btn"
                  onClick={handleRequestLocation}
                  disabled={isSubmitting}
                  style={{ minHeight: '44px' }}
                >
                  📍 {t.gpsButton}
                </button>
              )}

              {geoState.status === 'requesting' && (
                <div className="gps-status requesting" role="status">
                  <span className="loading-spinner" aria-hidden="true" />
                  <span>{t.gpsAcquiring}</span>
                </div>
              )}

              {geoState.status === 'acquired' && (
                <div className="gps-status acquired" role="status">
                  <div>
                    <strong>GPS Coordinates Acquired</strong>
                    <br />
                    <span>
                      {geoState.latitude.toFixed(6)}° N, {geoState.longitude.toFixed(6)}° E (±
                      {geoState.accuracy}m accuracy)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleClearLocation}
                    disabled={isSubmitting}
                    style={{ minHeight: '44px', padding: '4px 10px', fontSize: '13px' }}
                  >
                    {t.gpsClear}
                  </button>
                </div>
              )}

              {geoState.status === 'denied' && (
                <div className="gps-status denied" role="alert">
                  <span>{geoState.message}</span>
                </div>
              )}
            </div>

            {/* Location Confirmation (MANDATORY) */}
            <div className="location-confirmation-box">
              <label className="checkbox-label" htmlFor={`${formId}-confirm-location`}>
                <input
                  id={`${formId}-confirm-location`}
                  name="locationConfirmed"
                  type="checkbox"
                  checked={locationConfirmed}
                  onChange={(e) => setLocationConfirmed(e.target.checked)}
                  disabled={isSubmitting}
                  required
                />
                <span>
                  <strong>{t.confirmLocationLabel}</strong>
                  <br />
                  <span className="field-hint" style={{ color: 'inherit' }}>
                    {t.confirmLocationHint}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {/* 4. Optional Callback Number */}
          <label htmlFor={`${formId}-phone`}>
            {t.callbackLabel}
            <span id={`${formId}-phone-hint`} className="field-hint">
              {t.callbackHint}
            </span>
          </label>
          <input
            id={`${formId}-phone`}
            name="callbackPhone"
            type="tel"
            autoComplete="tel"
            aria-describedby={`${formId}-phone-hint`}
            placeholder="+919876543210"
            value={callbackPhone}
            onChange={(e) => setCallbackPhone(e.target.value)}
            disabled={isSubmitting}
          />

          {/* Error display */}
          {formError && (
            <div id={`${formId}-form-error`} className="form-alert" role="alert">
              <strong>Notice:</strong> {formError}
            </div>
          )}

          {/* Test Environment Notice near submission */}
          <p className="submission-safety-notice" role="note">
            Test environment — not connected to emergency services.
          </p>

          {/* Submit Action */}
          <div className="form-actions-bar">
            <button
              type="submit"
              className="button button-primary"
              disabled={isSubmitting || !locationConfirmed}
              style={{ minHeight: '44px' }}
            >
              {isSubmitting ? t.transmittingBtn : t.submitReportBtn}
              {!isSubmitting && <span aria-hidden="true">→</span>}
            </button>
            <Link to="/" className="text-link" style={{ marginTop: 0 }}>
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
