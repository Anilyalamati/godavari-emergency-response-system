import { useEffect, useState } from 'react';
import { IncidentSummarySchema, type IncidentSummary } from '@godavari/shared';
import { StaffApiRequestError, useStaffAuth } from '../auth/AuthContext.js';

interface OperationalWorkspacePageProps {
  role: 'OPERATOR' | 'RESPONDER';
}

const copy = {
  OPERATOR: {
    eyebrow: 'Control room / verified operator',
    title: 'Operator workspace',
    summary:
      'This signed-in role can read operational incident records. Stage 3 adds no dispatch, assignment, editing, or closure controls.',
    access:
      'The API verifies your staff profile and the database applies operator-scoped row-level security.',
  },
  RESPONDER: {
    eyebrow: 'Field response / verified responder',
    title: 'Responder workspace',
    summary:
      'Only incidents assigned to one of your active teams are available. Stage 3 adds no acknowledgement, location-sharing, or response-update controls.',
    access:
      'The API verifies your staff profile; database policies restrict incident rows to your active team assignments.',
  },
} as const;

export function OperationalWorkspacePage({ role }: OperationalWorkspacePageProps) {
  const { apiRequest } = useStaffAuth();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void apiRequest<unknown[]>('/staff/incidents')
      .then((payload) => {
        const parsed = IncidentSummarySchema.array().safeParse(payload);
        if (!parsed.success) throw new Error('The incident response was invalid.');
        if (active) setIncidents(parsed.data);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof StaffApiRequestError
            ? requestError.message
            : 'Incident access could not be verified. Try again later.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiRequest]);

  const content = copy[role];
  return (
    <section className="workspace-page" aria-labelledby="workspace-title">
      <p className="eyebrow">
        <span className="eyebrow-rule" /> {content.eyebrow}
      </p>
      <h1 id="workspace-title">{content.title}</h1>
      <p className="placeholder-summary">{content.summary}</p>
      <div className="placeholder-boundary workspace-access-note" role="note">
        <span className="scope-note-mark" aria-hidden="true">
          i
        </span>
        <p>
          {content.access} Reporter contact details are kept separate and are not included in this
          list.
        </p>
      </div>

      <section className="workspace-records" aria-labelledby="records-title" aria-busy={loading}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" /> Read-only / access check
            </p>
            <h2 id="records-title">Incidents visible to this role</h2>
          </div>
          <span className="section-index">NO ACTIONS</span>
        </div>
        {loading ? (
          <p className="workspace-empty" role="status">
            Verifying authorized incident access…
          </p>
        ) : error ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : incidents.length === 0 ? (
          <p className="workspace-empty" role="status">
            No incident records are available to this role.
          </p>
        ) : (
          <ul className="workspace-record-list">
            {incidents.map((incident) => (
              <li className="workspace-record" key={incident.id}>
                <div className="workspace-record-topline">
                  <span className="workspace-record-category">
                    {incident.category.replaceAll('_', ' ')}
                  </span>
                  <span className="placeholder-badge">{incident.status.replaceAll('_', ' ')}</span>
                  {incident.isDemo && (
                    <span className="demo-record-tag">Fictional demonstration</span>
                  )}
                </div>
                <p>{incident.summary}</p>
                <span className="workspace-record-meta">
                  {incident.priority} · {new Date(incident.reportedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="form-footnote">
          This Stage 3 screen is read-only. It does not dispatch or contact responders, hospitals,
          police, or emergency services.
        </p>
      </section>
    </section>
  );
}
