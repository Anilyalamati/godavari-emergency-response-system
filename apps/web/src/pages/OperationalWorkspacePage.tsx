import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EligibleTeamsResponseSchema,
  IncidentDetailSchema,
  IncidentSummarySchema,
  TeamAssignmentResultSchema,
  TeamReassignmentResultSchema,
  type EligibleTeamsResponse,
  type IncidentDetail,
  type IncidentPriority,
  type IncidentStatus,
  type IncidentSummary,
} from '@godavari/shared';
import { StaffApiRequestError, useStaffAuth } from '../auth/AuthContext.js';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription.js';
import { OperationalMap } from '../components/OperationalMap.js';

interface OperationalWorkspacePageProps {
  role: 'OPERATOR' | 'RESPONDER';
}

const copy = {
  OPERATOR: {
    title: 'Operator workspace',
  },
  RESPONDER: {
    title: 'Responder workspace',
  },
} as const;

const priorityWeights: Record<IncidentPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

function formatRelativeAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getLocationConfidenceLabel(
  source: string,
  accuracyM: number | null,
): { label: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'APPROX' } {
  if (source === 'GPS') {
    if (accuracyM !== null && accuracyM <= 15) {
      return { label: `High confidence (±${Math.round(accuracyM)} m)`, confidence: 'HIGH' };
    }
    if (accuracyM !== null && accuracyM <= 45) {
      return { label: `Medium confidence (±${Math.round(accuracyM)} m)`, confidence: 'MEDIUM' };
    }
    return {
      label: accuracyM ? `Low confidence (±${Math.round(accuracyM)} m)` : 'GPS coordinates logged',
      confidence: 'LOW',
    };
  }
  if (source === 'MAP_PIN') {
    return { label: 'Manual map pin placement', confidence: 'APPROX' };
  }
  if (source === 'LANDMARK') {
    return { label: 'Confirmed landmark location', confidence: 'APPROX' };
  }
  return { label: 'Approximate or verbal estimate', confidence: 'LOW' };
}

export function OperationalWorkspacePage({ role }: OperationalWorkspacePageProps) {
  const { apiRequest, profile, session } = useStaffAuth();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Layout Modes (Stage 9)
  const [operatorViewMode, setOperatorViewMode] = useState<'SPLIT' | 'QUEUE' | 'MAP'>('SPLIT');
  const [responderShowMap, setResponderShowMap] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected incident & detail
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<IncidentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Operator review form state
  const [reviewPriority, setReviewPriority] = useState<IncidentPriority>('NORMAL');
  const [reviewStatus, setReviewStatus] = useState<IncidentStatus>('REPORTED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [duplicateTargetId, setDuplicateTargetId] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [showDuplicateInput, setShowDuplicateInput] = useState(false);
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewActionMessage, setReviewActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Stage 6 Team Assignment State
  const [eligibleTeamsData, setEligibleTeamsData] = useState<EligibleTeamsResponse | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [deadlineMinutes, setDeadlineMinutes] = useState(15);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Stage 7: Responder Workflow State
  const [responderActionLoading, setResponderActionLoading] = useState(false);
  const [responderMessage, setResponderMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [supportNotes, setSupportNotes] = useState('');
  const [showSupportDrawer, setShowSupportDrawer] = useState(false);
  const [resolutionOutcome, setResolutionOutcome] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolveDrawer, setShowResolveDrawer] = useState(false);

  // Operator Final Closure State
  const [closingIncident, setClosingIncident] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [closeMessage, setCloseMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Stage 8: Reassignment & Escalation State
  const [showReassignDrawer, setShowReassignDrawer] = useState(false);
  const [reassignTeamId, setReassignTeamId] = useState<string | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [reassignDeadlineSeconds, setReassignDeadlineSeconds] = useState(60);
  const [submittingReassignment, setSubmittingReassignment] = useState(false);
  const [reassignmentMessage, setReassignmentMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [scanningEscalations, setScanningEscalations] = useState(false);
  const [escalationScanMessage, setEscalationScanMessage] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    try {
      const payload = await apiRequest<unknown>('/staff/incidents');
      const items = Array.isArray(payload) ? payload : (payload as { data: unknown[] })?.data;
      const parsed = IncidentSummarySchema.array().safeParse(items);
      if (!parsed.success) throw new Error('The incident response was invalid.');
      setIncidents(parsed.data);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof StaffApiRequestError
          ? requestError.message
          : 'Incident access could not be verified. Try again later.',
      );
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  const loadIncidentDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      setDetailError(null);
      setReviewActionMessage(null);
      try {
        const payload = await apiRequest<unknown>(`/staff/incidents/${id}`);
        const candidate =
          typeof payload === 'object' && payload !== null && 'data' in payload
            ? (payload as { data: unknown }).data
            : payload;
        const parsed = IncidentDetailSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new Error('Could not parse incident detail response.');
        }
        setIncidentDetail(parsed.data);
        setReviewPriority(parsed.data.priority);
        setReviewStatus(parsed.data.status);
        setReviewNotes(parsed.data.reviewNotes ?? '');
        setDuplicateTargetId(parsed.data.duplicateOfIncidentId ?? '');
        setCancellationReason(parsed.data.cancellationReason ?? '');
        setShowDuplicateInput(parsed.data.status === 'DUPLICATE');
        setShowCancelInput(parsed.data.status === 'CANCELLED');
      } catch (err: unknown) {
        setDetailError(
          err instanceof StaffApiRequestError ? err.message : 'Failed to load incident detail.',
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [apiRequest],
  );

  // Stage 9: Supabase Realtime Subscription
  const { connectionStatus, reconnect } = useRealtimeSubscription({
    enabled: Boolean(profile?.isActive),
    sessionToken: session?.accessToken ?? null,
    onUpdate: () => {
      void loadIncidents();
      if (selectedIncidentId && role === 'OPERATOR') {
        void loadIncidentDetail(selectedIncidentId);
      }
    },
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    void loadIncidents();
  }, [loadIncidents]);

  // Load details when an incident is selected
  useEffect(() => {
    if (!selectedIncidentId || role !== 'OPERATOR') {
      setIncidentDetail(null);
      return;
    }
    void loadIncidentDetail(selectedIncidentId);
  }, [selectedIncidentId, loadIncidentDetail, role]);

  const loadEligibleTeams = useCallback(
    async (id: string) => {
      setLoadingTeams(true);
      setTeamsError(null);
      try {
        const payload = await apiRequest<unknown>(`/staff/incidents/${id}/eligible-teams`);
        const candidate =
          typeof payload === 'object' && payload !== null && 'data' in payload
            ? (payload as { data: unknown }).data
            : payload;
        const parsed = EligibleTeamsResponseSchema.parse(candidate);
        setEligibleTeamsData(parsed);
        const firstChoice =
          parsed.teams.find((t) => t.isRecommended) ?? parsed.teams.find((t) => t.isEligible);
        if (firstChoice) setSelectedTeamId(firstChoice.id);
      } catch (err: unknown) {
        setTeamsError(
          err instanceof StaffApiRequestError
            ? err.message
            : 'Could not fetch team recommendations.',
        );
      } finally {
        setLoadingTeams(false);
      }
    },
    [apiRequest],
  );

  useEffect(() => {
    if (selectedIncidentId && role === 'OPERATOR') {
      void loadEligibleTeams(selectedIncidentId);
    } else {
      setEligibleTeamsData(null);
      setSelectedTeamId(null);
    }
  }, [selectedIncidentId, role, loadEligibleTeams]);

  // Sort queue by urgency then oldest report first
  const sortedAndFilteredIncidents = useMemo(() => {
    return incidents
      .filter((inc) => {
        if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
        if (priorityFilter !== 'ALL' && inc.priority !== priorityFilter) return false;
        if (categoryFilter !== 'ALL' && inc.category !== categoryFilter) return false;
        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase();
          const matchesSummary = inc.summary.toLowerCase().includes(q);
          const matchesLandmark = inc.landmark?.toLowerCase().includes(q) ?? false;
          const matchesId = inc.id.toLowerCase().includes(q);
          if (!matchesSummary && !matchesLandmark && !matchesId) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const weightDiff = (priorityWeights[b.priority] ?? 0) - (priorityWeights[a.priority] ?? 0);
        if (weightDiff !== 0) return weightDiff;
        // Oldest report first within same priority
        return new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime();
      });
  }, [incidents, statusFilter, priorityFilter, categoryFilter, searchQuery]);

  const urgentIncomingCount = useMemo(() => {
    return incidents.filter(
      (inc) =>
        inc.priority === 'URGENT' &&
        inc.status !== 'RESOLVED' &&
        inc.status !== 'CLOSED' &&
        inc.status !== 'CANCELLED',
    ).length;
  }, [incidents]);

  const handleBeginReview = async () => {
    if (!selectedIncidentId) return;
    setSubmittingReview(true);
    setReviewActionMessage(null);
    try {
      const updated = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'UNDER_REVIEW',
          reviewNotes: reviewNotes.trim() || 'Control room initiated review.',
        }),
      });
      const candidate =
        typeof updated === 'object' && updated !== null && 'data' in updated
          ? (updated as { data: unknown }).data
          : updated;
      const parsed = IncidentDetailSchema.parse(candidate);
      setIncidentDetail(parsed);
      setReviewStatus(parsed.status);
      setReviewActionMessage({ type: 'success', text: 'Incident placed UNDER REVIEW.' });
      void loadIncidents();
    } catch (err: unknown) {
      setReviewActionMessage({
        type: 'error',
        text: err instanceof StaffApiRequestError ? err.message : 'Failed to update review status.',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId) return;

    if (showCancelInput && !cancellationReason.trim()) {
      setReviewActionMessage({
        type: 'error',
        text: 'A cancellation reason is required to cancel an incident.',
      });
      return;
    }

    if (showDuplicateInput && !duplicateTargetId.trim()) {
      setReviewActionMessage({
        type: 'error',
        text: 'Please specify the target incident ID to link as duplicate.',
      });
      return;
    }

    setSubmittingReview(true);
    setReviewActionMessage(null);

    const payload: Record<string, unknown> = {};
    if (reviewPriority !== incidentDetail?.priority) payload.priority = reviewPriority;
    if (reviewNotes !== (incidentDetail?.reviewNotes ?? ''))
      payload.reviewNotes = reviewNotes.trim();

    if (showCancelInput) {
      payload.status = 'CANCELLED';
      payload.cancellationReason = cancellationReason.trim();
    } else if (showDuplicateInput) {
      payload.status = 'DUPLICATE';
      payload.duplicateOfIncidentId = duplicateTargetId.trim();
    } else if (reviewStatus !== incidentDetail?.status) {
      payload.status = reviewStatus;
    }

    if (Object.keys(payload).length === 0) {
      setReviewActionMessage({ type: 'error', text: 'No changes to save.' });
      setSubmittingReview(false);
      return;
    }

    try {
      const updated = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const candidate =
        typeof updated === 'object' && updated !== null && 'data' in updated
          ? (updated as { data: unknown }).data
          : updated;
      const parsed = IncidentDetailSchema.parse(candidate);
      setIncidentDetail(parsed);
      setReviewPriority(parsed.priority);
      setReviewStatus(parsed.status);
      setReviewNotes(parsed.reviewNotes ?? '');
      setReviewActionMessage({ type: 'success', text: 'Incident review saved and audited.' });
      void loadIncidents();
    } catch (err: unknown) {
      setReviewActionMessage({
        type: 'error',
        text: err instanceof StaffApiRequestError ? err.message : 'Review update failed.',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAssignTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId || !selectedTeamId) return;

    setSubmittingAssignment(true);
    setAssignmentMessage(null);
    try {
      const payload = await apiRequest<unknown>(
        `/staff/incidents/${selectedIncidentId}/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: selectedTeamId,
            acknowledgementDeadlineMinutes: deadlineMinutes,
            acknowledgementDeadlineSeconds: deadlineMinutes === 1 ? 60 : undefined,
          }),
        },
      );
      const candidate =
        typeof payload === 'object' && payload !== null && 'data' in payload
          ? (payload as { data: unknown }).data
          : payload;
      const parsed = TeamAssignmentResultSchema.parse(candidate);
      setAssignmentMessage({
        type: 'success',
        text: `Team ${parsed.teamCode} (${parsed.teamName}) successfully assigned! Acknowledgement deadline set.`,
      });

      // Reload incident detail and queue
      const updatedDetail = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}`);
      const detailCandidate =
        typeof updatedDetail === 'object' && updatedDetail !== null && 'data' in updatedDetail
          ? (updatedDetail as { data: unknown }).data
          : updatedDetail;
      setIncidentDetail(IncidentDetailSchema.parse(detailCandidate));
      void loadIncidents();
      void loadEligibleTeams(selectedIncidentId);
    } catch (err: unknown) {
      setAssignmentMessage({
        type: 'error',
        text: err instanceof StaffApiRequestError ? err.message : 'Failed to assign team.',
      });
    } finally {
      setSubmittingAssignment(false);
    }
  };

  const handleReassignTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId || !reassignTeamId) return;
    if (!reassignReason.trim() || reassignReason.trim().length < 3) {
      setReassignmentMessage({
        type: 'error',
        text: 'A reason for reassignment is required (minimum 3 characters).',
      });
      return;
    }

    setSubmittingReassignment(true);
    setReassignmentMessage(null);
    try {
      const payload = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newTeamId: reassignTeamId,
          reason: reassignReason.trim(),
          acknowledgementDeadlineSeconds: reassignDeadlineSeconds,
        }),
      });
      const candidate =
        typeof payload === 'object' && payload !== null && 'data' in payload
          ? (payload as { data: unknown }).data
          : payload;
      const parsed = TeamReassignmentResultSchema.parse(candidate);
      setReassignmentMessage({
        type: 'success',
        text: `Incident reassigned to ${parsed.newTeamCode} (${parsed.newTeamName}). Previous team assignment superseded and released to duty.`,
      });
      setShowReassignDrawer(false);
      setReassignReason('');
      setReassignTeamId(null);

      // Reload incident detail and queue
      const updatedDetail = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}`);
      const detailCandidate =
        typeof updatedDetail === 'object' && updatedDetail !== null && 'data' in updatedDetail
          ? (updatedDetail as { data: unknown }).data
          : updatedDetail;
      setIncidentDetail(IncidentDetailSchema.parse(detailCandidate));
      void loadIncidents();
      void loadEligibleTeams(selectedIncidentId);
    } catch (err: unknown) {
      setReassignmentMessage({
        type: 'error',
        text:
          err instanceof StaffApiRequestError
            ? err.message
            : 'Reassignment failed. Please try again.',
      });
    } finally {
      setSubmittingReassignment(false);
    }
  };

  const handleManualEscalationScan = async () => {
    setScanningEscalations(true);
    setEscalationScanMessage(null);
    try {
      const payload = await apiRequest<unknown>('/staff/escalations/scan', {
        method: 'POST',
      });
      const data =
        typeof payload === 'object' && payload !== null && 'data' in payload
          ? (payload as { data: { escalatedCount: number } }).data
          : (payload as { escalatedCount: number });
      const count = data?.escalatedCount ?? 0;
      setEscalationScanMessage(
        count > 0
          ? `Escalation check complete: ${count} unacknowledged assignment(s) flagged overdue.`
          : 'Escalation check complete: No overdue active assignments found.',
      );
      void loadIncidents();
      if (selectedIncidentId) {
        const detailRes = await apiRequest<unknown>(`/staff/incidents/${selectedIncidentId}`);
        const c =
          typeof detailRes === 'object' && detailRes !== null && 'data' in detailRes
            ? (detailRes as { data: unknown }).data
            : detailRes;
        const p = IncidentDetailSchema.safeParse(c);
        if (p.success) setIncidentDetail(p.data);
      }
    } catch (err: unknown) {
      setEscalationScanMessage(
        err instanceof StaffApiRequestError ? err.message : 'Escalation scan failed.',
      );
    } finally {
      setScanningEscalations(false);
    }
  };

  const handleResponderAction = async (
    incidentId: string,
    action: 'ACKNOWLEDGE' | 'EN_ROUTE' | 'ON_SCENE' | 'REQUEST_SUPPORT' | 'RESOLVE',
    notes?: string,
    outcome?: string,
  ) => {
    setResponderActionLoading(true);
    setResponderMessage(null);
    try {
      await apiRequest<unknown>(`/staff/incidents/${incidentId}/responder-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes, outcome }),
      });
      const actionLabels: Record<string, string> = {
        ACKNOWLEDGE: 'Assignment acknowledged.',
        EN_ROUTE: 'Status updated to EN_ROUTE.',
        ON_SCENE: 'Status updated to ON_SCENE.',
        REQUEST_SUPPORT: 'Support request recorded and transmitted to control room.',
        RESOLVE: 'Incident marked RESOLVED with outcome. Unit availability released.',
      };
      setResponderMessage({ type: 'success', text: actionLabels[action] || 'Action completed.' });
      if (action === 'REQUEST_SUPPORT') {
        setShowSupportDrawer(false);
        setSupportNotes('');
      }
      if (action === 'RESOLVE') {
        setShowResolveDrawer(false);
        setResolutionOutcome('');
        setResolutionNotes('');
      }
      void loadIncidents();
      if (selectedIncidentId === incidentId) {
        const detail = await apiRequest<unknown>(`/staff/incidents/${incidentId}`);
        const candidate =
          typeof detail === 'object' && detail !== null && 'data' in detail
            ? (detail as { data: unknown }).data
            : detail;
        setIncidentDetail(IncidentDetailSchema.parse(candidate));
      }
    } catch (err: unknown) {
      setResponderMessage({
        type: 'error',
        text:
          err instanceof StaffApiRequestError ? err.message : 'Failed to update response state.',
      });
    } finally {
      setResponderActionLoading(false);
    }
  };

  const handleOperatorClose = async (incidentId: string) => {
    setClosingIncident(true);
    setCloseMessage(null);
    try {
      await apiRequest<unknown>(`/staff/incidents/${incidentId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: closeNotes.trim() || undefined }),
      });
      setCloseMessage({ type: 'success', text: 'Incident officially CLOSED.' });
      setCloseNotes('');
      void loadIncidents();
      const detail = await apiRequest<unknown>(`/staff/incidents/${incidentId}`);
      const candidate =
        typeof detail === 'object' && detail !== null && 'data' in detail
          ? (detail as { data: unknown }).data
          : detail;
      setIncidentDetail(IncidentDetailSchema.parse(candidate));
    } catch (err: unknown) {
      setCloseMessage({
        type: 'error',
        text: err instanceof StaffApiRequestError ? err.message : 'Failed to close incident.',
      });
    } finally {
      setClosingIncident(false);
    }
  };

  const content = copy[role];

  return (
    <section className="workspace-page" aria-labelledby="workspace-title">
      <h1 id="workspace-title">{content.title}</h1>

      {/* Realtime Live Status Indicator */}
      <div className="realtime-status-bar" role="status" aria-live="polite">
        <div className="realtime-status-pill-group">
          <span className={`realtime-pill realtime-${connectionStatus.toLowerCase()}`}>
            <span className="realtime-dot" aria-hidden="true" />
            {connectionStatus === 'CONNECTED' && '🟢 Live (Realtime Connected)'}
            {connectionStatus === 'CONNECTING' && '🟡 Connecting to Realtime…'}
            {connectionStatus === 'DISCONNECTED' && '🔴 Realtime Disconnected'}
          </span>
          {connectionStatus === 'DISCONNECTED' && (
            <button
              type="button"
              className="btn-retry-realtime"
              onClick={reconnect}
              aria-label="Reconnect Realtime"
            >
              Reconnect & Refetch
            </button>
          )}
        </div>
        <span className="realtime-disclaimer">
          Realtime updates authorized UI states; socket connection does not substitute for human
          acknowledgement.
        </span>
      </div>

      {/* Operator Urgent Beacon */}
      {role === 'OPERATOR' && urgentIncomingCount > 0 && (
        <div className="urgent-banner" role="alert">
          <span className="urgent-beacon" aria-hidden="true" />
          <p>
            <strong>URGENT INCIDENTS ACTIVE:</strong> {urgentIncomingCount} high-priority report(s)
            in the queue require immediate review and triage.
          </p>
        </div>
      )}

      {/* View Mode Controls for Operator */}
      {role === 'OPERATOR' && (
        <div className="workspace-view-controls">
          <div className="workspace-view-toggle" role="group" aria-label="Control room view">
            <button
              type="button"
              className={`view-toggle-btn ${operatorViewMode === 'SPLIT' ? 'active' : ''}`}
              onClick={() => setOperatorViewMode('SPLIT')}
            >
              ◫ Split View (Queue + Map)
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${operatorViewMode === 'QUEUE' ? 'active' : ''}`}
              onClick={() => setOperatorViewMode('QUEUE')}
            >
              📋 Incident Queue Only
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${operatorViewMode === 'MAP' ? 'active' : ''}`}
              onClick={() => setOperatorViewMode('MAP')}
            >
              🗺️ Operational Map View
            </button>
          </div>
        </div>
      )}

      {role === 'OPERATOR' ? (
        /* ── Operator Control Room Master-Detail Interface ── */
        <div className={`control-room-layout layout-${operatorViewMode.toLowerCase()}`}>
          {/* Operational Map (Full View Mode) */}
          {operatorViewMode === 'MAP' && (
            <div className="control-room-map-full-panel" aria-label="Operational Map (Full View)">
              <div className="map-section-header">
                <h3 className="map-section-title">
                  Operational Riverfront Map (Fictional Demo Sector)
                </h3>
                <span className="map-source-legend">
                  <span className="legend-tag legend-gps">📍 GPS (±Accuracy Circle)</span>
                  <span className="legend-tag legend-manual">📌 Manual / Landmark</span>
                  <span className="legend-tag legend-fictional">⚠️ Fictional Demo Zones</span>
                </span>
              </div>
              <OperationalMap
                incidents={sortedAndFilteredIncidents}
                selectedIncidentId={selectedIncidentId}
                onSelectIncident={setSelectedIncidentId}
              />
            </div>
          )}

          {/* Left Column: Filterable Incident Queue */}
          {operatorViewMode !== 'MAP' && (
            <div className="control-room-queue-panel">
              <div className="queue-controls">
                <div className="queue-search">
                  <input
                    type="search"
                    placeholder="Filter by keyword, landmark, or UUID…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="queue-search-input"
                    aria-label="Filter incidents"
                  />
                </div>
                <div className="queue-filter-row">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                    className="filter-select"
                  >
                    <option value="ALL">All Statuses ({incidents.length})</option>
                    <option value="REPORTED">Reported (Incoming)</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="DUPLICATE">Duplicates</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    aria-label="Filter by priority"
                    className="filter-select"
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter by category"
                    className="filter-select"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="MEDICAL_ASSISTANCE">Medical Assistance</option>
                    <option value="CROWD_SAFETY">Crowd Safety</option>
                    <option value="LOST_PERSON">Lost Person</option>
                    <option value="INFRASTRUCTURE">Infrastructure</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="queue-header">
                <div>
                  <h3>Incoming Incidents Queue ({sortedAndFilteredIncidents.length})</h3>
                  <span className="queue-order-hint">Sorted by urgency & age</span>
                </div>
                <button
                  type="button"
                  onClick={handleManualEscalationScan}
                  disabled={scanningEscalations}
                  className="button button-secondary scan-escalations-button"
                  title="Scan for assignments past acknowledgement deadline"
                >
                  {scanningEscalations ? 'Scanning…' : '⚡ Check Escalations'}
                </button>
              </div>

              {escalationScanMessage && (
                <div className="success-banner" style={{ margin: '8px 0' }} role="status">
                  {escalationScanMessage}
                </div>
              )}

              {loading ? (
                <p className="workspace-empty" role="status">
                  Loading incidents queue…
                </p>
              ) : error ? (
                <p className="form-alert" role="alert">
                  {error}
                </p>
              ) : sortedAndFilteredIncidents.length === 0 ? (
                <p className="workspace-empty" role="status">
                  No incidents match the active filters.
                </p>
              ) : (
                <ul className="workspace-record-list queue-list" role="list">
                  {sortedAndFilteredIncidents.map((incident) => {
                    const isSelected = incident.id === selectedIncidentId;
                    const isUrgent = incident.priority === 'URGENT';
                    const isIncoming = incident.status === 'REPORTED';
                    return (
                      <li
                        key={incident.id}
                        className={`workspace-record queue-item ${isSelected ? 'selected' : ''} ${isUrgent ? 'urgent-item' : ''} ${isIncoming ? 'incoming-item' : ''}`}
                        onClick={() => setSelectedIncidentId(incident.id)}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedIncidentId(incident.id);
                          }
                        }}
                      >
                        <div className="workspace-record-topline">
                          {isUrgent && <span className="urgent-badge-pill">URGENT</span>}
                          <span
                            className={`priority-badge priority-${incident.priority.toLowerCase()}`}
                          >
                            {incident.priority}
                          </span>
                          <span className="workspace-record-category">
                            {incident.category.replaceAll('_', ' ')}
                          </span>
                          <span className={`status-badge status-${incident.status.toLowerCase()}`}>
                            {incident.status.replaceAll('_', ' ')}
                          </span>
                          <span className="incident-age">
                            {formatRelativeAge(incident.reportedAt)}
                          </span>
                        </div>

                        <p className="queue-item-summary">{incident.summary}</p>

                        <div className="queue-item-footer">
                          {incident.landmark ? (
                            <span className="queue-landmark">📍 {incident.landmark}</span>
                          ) : (
                            <span className="queue-landmark-none">No landmark</span>
                          )}
                          {incident.isDemo && (
                            <span className="demo-record-tag">Fictional Demo</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Right Area: Map (in SPLIT view) + Inspection Detail Panel */}
          <div className="control-room-operational-panel">
            {operatorViewMode === 'SPLIT' && (
              <div className="control-room-map-section" aria-label="Incident Locations Map">
                <div className="map-section-header">
                  <h3 className="map-section-title">
                    Operational Riverfront Map (Fictional Demo Sector)
                  </h3>
                  <span className="map-source-legend">
                    <span className="legend-tag legend-gps">📍 GPS (±Accuracy Circle)</span>
                    <span className="legend-tag legend-manual">📌 Manual / Landmark</span>
                    <span className="legend-tag legend-fictional">⚠️ Fictional Demo Zones</span>
                  </span>
                </div>
                <OperationalMap
                  incidents={sortedAndFilteredIncidents}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={setSelectedIncidentId}
                />
              </div>
            )}

            {/* Right Column: Incident Review & Inspection Details */}
            <div className="control-room-detail-panel">
              {!selectedIncidentId ? (
                <div className="detail-placeholder">
                  <div className="detail-placeholder-graphic">📋</div>
                  <h3>Select an Incident to Inspect</h3>
                  <p>
                    Choose any report from the incoming queue to view detailed coordinates, inspect
                    confidence levels, review caller details, verify priority, and record operator
                    notes.
                  </p>
                </div>
              ) : loadingDetail ? (
                <p className="workspace-empty" role="status">
                  Loading incident details…
                </p>
              ) : detailError ? (
                <div className="form-alert" role="alert">
                  <p>{detailError}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedIncidentId(null)}
                    className="button button-secondary"
                    style={{ marginTop: '12px' }}
                  >
                    Return to Queue
                  </button>
                </div>
              ) : incidentDetail ? (
                <div className="detail-view">
                  {/* Header with Quick Action */}
                  <div className="detail-header">
                    <div>
                      <span className="detail-id-label">Incident ID: {incidentDetail.id}</span>
                      <h2 className="detail-category-heading">
                        {incidentDetail.category.replaceAll('_', ' ')}
                      </h2>
                    </div>
                    <div className="detail-header-badges">
                      <span
                        className={`priority-badge priority-${incidentDetail.priority.toLowerCase()}`}
                      >
                        {incidentDetail.priority}
                      </span>
                      <span
                        className={`status-badge status-${incidentDetail.status.toLowerCase()}`}
                      >
                        {incidentDetail.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Quick Intake Button */}
                  {incidentDetail.status === 'REPORTED' && (
                    <div className="quick-intake-banner">
                      <div>
                        <strong>New Incoming Emergency Report</strong>
                        <p>Acknowledge and transition status to begin formal investigation.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleBeginReview}
                        disabled={submittingReview}
                        className="button button-primary intake-button"
                      >
                        {submittingReview ? 'Beginning Review…' : 'Begin Review (Under Review)'}
                      </button>
                    </div>
                  )}

                  {/* Notification message */}
                  {reviewActionMessage && (
                    <div
                      className={
                        reviewActionMessage.type === 'success' ? 'success-banner' : 'form-alert'
                      }
                      role="status"
                    >
                      {reviewActionMessage.text}
                    </div>
                  )}

                  {/* Summary Section */}
                  <section className="detail-card">
                    <h4 className="detail-card-title">Incident Summary & Report Time</h4>
                    <p className="detail-summary-text">{incidentDetail.summary}</p>
                    <div className="detail-meta-grid">
                      <div>
                        <span className="meta-label">Reported At</span>
                        <span className="meta-value">
                          {new Date(incidentDetail.reportedAt).toLocaleString()} (
                          {formatRelativeAge(incidentDetail.reportedAt)})
                        </span>
                      </div>
                      <div>
                        <span className="meta-label">Zone</span>
                        <span className="meta-value">
                          {incidentDetail.zoneName || 'No specific zone tagged'}
                          {incidentDetail.zoneCode ? ` (${incidentDetail.zoneCode})` : ''}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Location Inspection Section */}
                  <section className="detail-card">
                    <h4 className="detail-card-title">Location Inspection & Confidence</h4>
                    <div className="detail-location-grid">
                      <div>
                        <span className="meta-label">Location Source</span>
                        <span className="source-pill">{incidentDetail.locationSource}</span>
                      </div>
                      <div>
                        <span className="meta-label">Confidence Assessment</span>
                        <span
                          className={`confidence-indicator confidence-${getLocationConfidenceLabel(incidentDetail.locationSource, incidentDetail.locationAccuracyM).confidence.toLowerCase()}`}
                        >
                          {
                            getLocationConfidenceLabel(
                              incidentDetail.locationSource,
                              incidentDetail.locationAccuracyM,
                            ).label
                          }
                        </span>
                      </div>
                      {incidentDetail.landmark && (
                        <div className="grid-full-width">
                          <span className="meta-label">Confirmed Landmark</span>
                          <span className="meta-value landmark-highlight">
                            📍 {incidentDetail.landmark}
                          </span>
                        </div>
                      )}
                      {incidentDetail.latitude !== null && incidentDetail.longitude !== null && (
                        <div className="grid-full-width">
                          <span className="meta-label">Coordinates</span>
                          <code className="coords-code">
                            {incidentDetail.latitude.toFixed(6)}° N,{' '}
                            {incidentDetail.longitude.toFixed(6)}° E
                          </code>
                        </div>
                      )}
                      {incidentDetail.locationIsFictional && (
                        <div className="grid-full-width">
                          <span className="demo-record-tag">
                            Notice: Location coordinates are simulated for demonstration.
                          </span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Callback & Reporter Contact Section */}
                  <section className="detail-card">
                    <h4 className="detail-card-title">Reporter Callback Details</h4>
                    {profile?.canAccessReporterContacts ? (
                      incidentDetail.reporterContact ? (
                        <div className="contact-details-box">
                          <div className="contact-row">
                            <span className="meta-label">Reporter Name</span>
                            <span className="meta-value">
                              {incidentDetail.reporterContact.contactName ||
                                'Anonymous / Unspecified'}
                            </span>
                          </div>
                          <div className="contact-row">
                            <span className="meta-label">Phone Number</span>
                            <span className="meta-value contact-phone">
                              {incidentDetail.reporterContact.phoneE164 ? (
                                <a
                                  href={`tel:${incidentDetail.reporterContact.phoneE164}`}
                                  className="phone-link"
                                >
                                  📞 {incidentDetail.reporterContact.phoneE164}
                                </a>
                              ) : (
                                'None provided'
                              )}
                            </span>
                          </div>
                          <div className="contact-row">
                            <span className="meta-label">Preferred Method</span>
                            <span className="meta-value">
                              {incidentDetail.reporterContact.preferredContactMethod}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="contact-empty">
                          No callback details were left with this report.
                        </p>
                      )
                    ) : (
                      <div className="contact-protected-box">
                        <span className="lock-icon" aria-hidden="true">
                          🔒
                        </span>
                        <p>
                          <strong>Callback Details Protected:</strong> Contact phone and name are
                          safeguarded under operational privacy rules. An administrator must grant
                          explicit contact access to view callback information.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Active Primary Team Assignment Card */}
                  {incidentDetail.activeAssignment &&
                    (() => {
                      const isOverdue =
                        incidentDetail.activeAssignment.isOverdue ||
                        (incidentDetail.activeAssignment.status === 'PENDING' &&
                          new Date(
                            incidentDetail.activeAssignment.acknowledgementDeadline,
                          ).getTime() < Date.now());

                      return (
                        <section
                          className={`detail-card active-assignment-card ${isOverdue ? 'assignment-overdue-card' : ''}`}
                        >
                          {/* Notification message */}
                          {reassignmentMessage && (
                            <div
                              className={
                                reassignmentMessage.type === 'success'
                                  ? 'success-banner'
                                  : 'form-alert'
                              }
                              role="status"
                            >
                              {reassignmentMessage.text}
                            </div>
                          )}

                          {/* Overdue Alert Banner */}
                          {isOverdue && (
                            <div className="overdue-alert-banner" role="alert">
                              <span className="overdue-alert-icon" aria-hidden="true">
                                ⚠️
                              </span>
                              <div className="overdue-alert-content">
                                <strong>Dispatch Acknowledgement Overdue</strong>
                                <p>
                                  Primary unit {incidentDetail.activeAssignment.teamCode} did not
                                  acknowledge within the deadline. An escalation event was audited.
                                  Reassign this incident below if the team remains uncontactable.
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="active-assignment-header">
                            <div>
                              <span className="meta-label">Primary Response Unit (Dispatched)</span>
                              <h4 className="active-assignment-title">
                                {incidentDetail.activeAssignment.teamCode} —{' '}
                                {incidentDetail.activeAssignment.teamName}
                              </h4>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {isOverdue && (
                                <span className="badge-overdue-pulse">
                                  ⏰ ACKNOWLEDGEMENT OVERDUE
                                </span>
                              )}
                              <span
                                className={`status-badge status-${incidentDetail.activeAssignment.status.toLowerCase()}`}
                              >
                                {incidentDetail.activeAssignment.status}
                              </span>
                            </div>
                          </div>

                          <div className="detail-meta-grid" style={{ marginTop: '14px' }}>
                            <div>
                              <span className="meta-label">Dispatched At</span>
                              <span className="meta-value">
                                {new Date(
                                  incidentDetail.activeAssignment.assignedAt,
                                ).toLocaleTimeString()}{' '}
                                ({formatRelativeAge(incidentDetail.activeAssignment.assignedAt)})
                              </span>
                            </div>
                            <div>
                              <span className="meta-label">Acknowledgement Deadline</span>
                              <span className="meta-value deadline-time">
                                ⏰{' '}
                                {new Date(
                                  incidentDetail.activeAssignment.acknowledgementDeadline,
                                ).toLocaleTimeString()}{' '}
                                (
                                {formatRelativeAge(
                                  incidentDetail.activeAssignment.acknowledgementDeadline,
                                )}
                                )
                              </span>
                            </div>
                          </div>

                          {incidentDetail.activeAssignment.reassignmentReason && (
                            <div
                              className="resolution-outcome-banner"
                              style={{
                                marginTop: '12px',
                                background: 'rgba(89, 9, 7, 0.05)',
                                borderColor: 'var(--maroon)',
                              }}
                            >
                              <p className="outcome-title" style={{ color: 'var(--maroon)' }}>
                                Reassignment Context
                              </p>
                              <p className="outcome-text">
                                “{incidentDetail.activeAssignment.reassignmentReason}”
                              </p>
                            </div>
                          )}

                          <p className="active-assignment-note">
                            Concurrency Guard: Exactly one active primary team per incident.
                          </p>

                          {/* Stage 8 Operator Reassignment Workflow */}
                          {role === 'OPERATOR' &&
                            ['PENDING', 'ACKNOWLEDGED'].includes(
                              incidentDetail.activeAssignment.status,
                            ) &&
                            !['RESOLVED', 'CLOSED', 'CANCELLED', 'DUPLICATE'].includes(
                              incidentDetail.status,
                            ) && (
                              <div className="reassignment-trigger-area">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowReassignDrawer(!showReassignDrawer);
                                    setReassignmentMessage(null);
                                    if (!reassignTeamId && eligibleTeamsData) {
                                      const eligible = eligibleTeamsData.teams.find(
                                        (t) =>
                                          t.isEligible &&
                                          t.id !== incidentDetail.activeAssignment?.teamId,
                                      );
                                      if (eligible) setReassignTeamId(eligible.id);
                                    }
                                  }}
                                  className={`button ${
                                    isOverdue ? 'button-danger' : 'button-secondary'
                                  } reassign-toggle-button`}
                                >
                                  {showReassignDrawer
                                    ? 'Close Reassignment Form'
                                    : isOverdue
                                      ? '⚠️ Reassign Overdue Incident to Alternative Team'
                                      : 'Reassign Incident to Alternative Team'}
                                </button>

                                {showReassignDrawer && (
                                  <form
                                    onSubmit={handleReassignTeam}
                                    className="reassignment-drawer"
                                  >
                                    <h5 className="reassignment-drawer-title">
                                      Operator-Controlled Reassignment Workflow
                                    </h5>
                                    <p className="reassignment-drawer-desc">
                                      Atomically supersedes the current assignment, logs the
                                      documented reason, releases the previous team to ON_DUTY, and
                                      locks the replacement team.
                                    </p>

                                    {reassignmentMessage && (
                                      <div
                                        className={
                                          reassignmentMessage.type === 'success'
                                            ? 'success-banner'
                                            : 'form-alert'
                                        }
                                        role="status"
                                      >
                                        {reassignmentMessage.text}
                                      </div>
                                    )}

                                    <div className="form-group">
                                      <label htmlFor="reassign-team-select">
                                        Select Replacement Team
                                      </label>
                                      {eligibleTeamsData &&
                                      eligibleTeamsData.teams.filter(
                                        (t) =>
                                          t.id !== incidentDetail.activeAssignment?.teamId &&
                                          t.isEligible,
                                      ).length > 0 ? (
                                        <select
                                          id="reassign-team-select"
                                          value={reassignTeamId ?? ''}
                                          onChange={(e) => setReassignTeamId(e.target.value)}
                                          className="form-input"
                                          required
                                        >
                                          <option value="" disabled>
                                            -- Select eligible response team --
                                          </option>
                                          {eligibleTeamsData.teams
                                            .filter(
                                              (t) =>
                                                t.id !== incidentDetail.activeAssignment?.teamId &&
                                                t.isEligible,
                                            )
                                            .map((team) => (
                                              <option key={team.id} value={team.id}>
                                                {team.teamCode} — {team.name} (
                                                {team.capabilities.join(', ')})
                                              </option>
                                            ))}
                                        </select>
                                      ) : (
                                        <p className="form-subnote">
                                          No other eligible response teams currently available.
                                        </p>
                                      )}
                                    </div>

                                    <div className="form-group">
                                      <label htmlFor="reassign-reason">
                                        Reassignment Reason <span className="required-star">*</span>
                                      </label>
                                      <textarea
                                        id="reassign-reason"
                                        value={reassignReason}
                                        onChange={(e) => setReassignReason(e.target.value)}
                                        placeholder="Reason for reassignment…"
                                        rows={3}
                                        className="form-input form-textarea"
                                        required
                                      />
                                    </div>

                                    <div className="form-group">
                                      <label htmlFor="reassign-deadline">
                                        Replacement Acknowledgement Deadline
                                      </label>
                                      <select
                                        id="reassign-deadline"
                                        value={reassignDeadlineSeconds}
                                        onChange={(e) =>
                                          setReassignDeadlineSeconds(Number(e.target.value))
                                        }
                                        className="form-input"
                                      >
                                        <option value={60}>60 seconds (Short deadline)</option>
                                        <option value={300}>5 minutes (Urgent Escalation)</option>
                                        <option value={600}>10 minutes (Rapid Response)</option>
                                        <option value={900}>15 minutes (Standard Deadline)</option>
                                        <option value={1800}>30 minutes (Extended)</option>
                                      </select>
                                    </div>

                                    <div className="reassignment-actions">
                                      <button
                                        type="submit"
                                        disabled={
                                          submittingReassignment ||
                                          !reassignTeamId ||
                                          !reassignReason.trim()
                                        }
                                        className="button button-danger"
                                      >
                                        {submittingReassignment
                                          ? 'Reassigning Team…'
                                          : 'Confirm & Reassign Team'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setShowReassignDrawer(false)}
                                        className="button button-secondary"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </div>
                            )}
                        </section>
                      );
                    })()}

                  {/* Stage 6: Response-Team Recommendation & Assignment Section */}
                  {!incidentDetail.activeAssignment &&
                    !['CANCELLED', 'CLOSED', 'RESOLVED', 'DUPLICATE'].includes(
                      incidentDetail.status,
                    ) && (
                      <section className="detail-card team-assignment-card">
                        <h4 className="detail-card-title">
                          Response-Team Recommendation & Dispatch
                        </h4>
                        <p className="team-assignment-subtitle">
                          Zone-based suitability matching. Straight-line distance approximations are
                          never presented as travel times.
                        </p>

                        {assignmentMessage && (
                          <div
                            className={
                              assignmentMessage.type === 'success' ? 'success-banner' : 'form-alert'
                            }
                            role="status"
                          >
                            {assignmentMessage.text}
                          </div>
                        )}

                        {loadingTeams ? (
                          <p className="workspace-empty">
                            Evaluating team capabilities and zone coverage…
                          </p>
                        ) : teamsError ? (
                          <p className="form-alert">{teamsError}</p>
                        ) : eligibleTeamsData && eligibleTeamsData.teams.length > 0 ? (
                          <form onSubmit={handleAssignTeam} className="team-assignment-form">
                            <div
                              className="teams-candidate-list"
                              role="radiogroup"
                              aria-label="Select response team"
                            >
                              {eligibleTeamsData.teams.map((team) => {
                                const isSelected = selectedTeamId === team.id;
                                return (
                                  <div
                                    key={team.id}
                                    className={`team-candidate-card ${isSelected ? 'selected' : ''} ${team.isRecommended ? 'recommended' : ''} ${!team.isEligible ? 'ineligible' : ''}`}
                                    onClick={() => {
                                      if (team.isEligible) setSelectedTeamId(team.id);
                                    }}
                                  >
                                    <div className="team-candidate-topline">
                                      <label className="team-radio-label">
                                        <input
                                          type="radio"
                                          name="teamSelection"
                                          value={team.id}
                                          checked={isSelected}
                                          disabled={!team.isEligible}
                                          onChange={() => setSelectedTeamId(team.id)}
                                        />
                                        <strong className="team-code">{team.teamCode}</strong>
                                        <span className="team-name">{team.name}</span>
                                      </label>
                                      <div className="team-badges">
                                        {team.isRecommended && (
                                          <span className="badge-recommended">
                                            ⭐ Recommended Match
                                          </span>
                                        )}
                                        <span
                                          className={`duty-badge duty-${team.dutyStatus.toLowerCase()}`}
                                        >
                                          {team.dutyStatus.replace('_', ' ')}
                                        </span>
                                        <span
                                          className={`availability-badge ${team.isAvailable ? 'available' : 'busy'}`}
                                        >
                                          {team.isAvailable ? 'Available' : 'Busy (Double-Booked)'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="team-capabilities-row">
                                      <span className="meta-label">Capabilities:</span>
                                      <div className="caps-tags">
                                        {team.capabilities.map((c) => (
                                          <span key={c} className="cap-pill">
                                            {c.replace('_', ' ')}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="team-reasons-box">
                                      <span className="meta-label">
                                        Transparent Suitability Reasons:
                                      </span>
                                      <ul className="team-reasons-list">
                                        {team.reasons.map((reason, idx) => (
                                          <li
                                            key={idx}
                                            className={
                                              reason.startsWith('Ineligible')
                                                ? 'reason-ineligible'
                                                : 'reason-eligible'
                                            }
                                          >
                                            {reason.startsWith('Ineligible') ? '✗ ' : '✓ '}
                                            {reason}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="assignment-deadline-bar">
                              <label htmlFor="deadline-select">Acknowledgement Deadline:</label>
                              <select
                                id="deadline-select"
                                value={deadlineMinutes}
                                onChange={(e) => setDeadlineMinutes(Number(e.target.value))}
                                className="form-input"
                                style={{ maxWidth: '240px' }}
                              >
                                <option value={1}>60 seconds (Short deadline)</option>
                                <option value={10}>10 minutes (Urgent Response)</option>
                                <option value={15}>15 minutes (Standard Deadline)</option>
                                <option value={30}>30 minutes (Extended Deadline)</option>
                              </select>
                            </div>

                            <div className="assignment-actions-footer">
                              <button
                                type="submit"
                                disabled={!selectedTeamId || submittingAssignment}
                                className="button button-primary dispatch-button"
                              >
                                {submittingAssignment
                                  ? 'Dispatching & Locking Allocation…'
                                  : 'Confirm Dispatch & Assign Team'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className="workspace-empty">No response teams found in catalogue.</p>
                        )}
                      </section>
                    )}

                  {/* Operator Review & Prioritization Controls */}
                  <section className="detail-card review-actions-card">
                    <h4 className="detail-card-title">Operator Review & Triage Controls</h4>
                    <form onSubmit={handleSaveReview} className="review-form">
                      <div className="form-group-row">
                        <div className="form-group">
                          <label htmlFor="review-priority">Set Incident Priority</label>
                          <select
                            id="review-priority"
                            value={reviewPriority}
                            onChange={(e) => setReviewPriority(e.target.value as IncidentPriority)}
                            className="form-input"
                          >
                            <option value="LOW">Low (Monitor)</option>
                            <option value="NORMAL">Normal</option>
                            <option value="HIGH">High (Urgent Attention)</option>
                            <option value="URGENT">Urgent (Immediate Life Safety)</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label htmlFor="review-status">Operational Status</label>
                          <select
                            id="review-status"
                            value={reviewStatus}
                            onChange={(e) => {
                              const val = e.target.value as IncidentStatus;
                              setReviewStatus(val);
                              if (val === 'DUPLICATE') setShowDuplicateInput(true);
                              if (val === 'CANCELLED') setShowCancelInput(true);
                            }}
                            className="form-input"
                            disabled={showCancelInput || showDuplicateInput}
                          >
                            <option value="REPORTED">Reported</option>
                            <option value="UNDER_REVIEW">Under Review</option>
                            <option value="ASSIGNED">Assigned</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="CLOSED">Closed</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="review-notes">Human Review Notes</label>
                        <textarea
                          id="review-notes"
                          rows={3}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Add operator notes, cross-references, or ground verification details…"
                          className="form-input"
                        />
                      </div>

                      {/* Duplicate Linking Section */}
                      <div className="workflow-sub-section">
                        <div className="workflow-toggle-row">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={showDuplicateInput}
                              onChange={(e) => {
                                setShowDuplicateInput(e.target.checked);
                                if (e.target.checked) setShowCancelInput(false);
                              }}
                            />
                            <span>Mark as duplicate of another incident</span>
                          </label>
                        </div>
                        {showDuplicateInput && (
                          <div className="workflow-detail-box">
                            <p className="workflow-hint">
                              Duplicate incidents remain in the audit record and are never
                              automatically hidden. The original report is linked to the primary
                              incident for tracking.
                            </p>
                            <label htmlFor="duplicate-target-id">Primary Incident ID (UUID)</label>
                            <input
                              id="duplicate-target-id"
                              type="text"
                              placeholder="e.g. 00000000-0000-4000-8000-000000000201"
                              value={duplicateTargetId}
                              onChange={(e) => setDuplicateTargetId(e.target.value)}
                              className="form-input"
                              required
                            />
                          </div>
                        )}
                      </div>

                      {/* Incident Cancellation Section */}
                      <div className="workflow-sub-section">
                        <div className="workflow-toggle-row">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={showCancelInput}
                              onChange={(e) => {
                                setShowCancelInput(e.target.checked);
                                if (e.target.checked) setShowDuplicateInput(false);
                              }}
                            />
                            <span>Cancel this incident</span>
                          </label>
                        </div>
                        {showCancelInput && (
                          <div className="workflow-detail-box">
                            <p className="workflow-hint">
                              Cancellation requires an explicit reason and records an immutable
                              audit log entry. Cancelled incidents cannot be modified later.
                            </p>
                            <label htmlFor="cancel-reason">Cancellation Reason (Mandatory)</label>
                            <input
                              id="cancel-reason"
                              type="text"
                              placeholder="Reason for cancellation (e.g. False alarm confirmed on CCTV)"
                              value={cancellationReason}
                              onChange={(e) => setCancellationReason(e.target.value)}
                              className="form-input"
                              required
                            />
                          </div>
                        )}
                      </div>

                      <div className="review-actions-footer">
                        <button
                          type="submit"
                          disabled={submittingReview}
                          className="button button-primary"
                        >
                          {submittingReview ? 'Recording Review…' : 'Save Review & Audit'}
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Stage 7: Operator Closure Section for RESOLVED incidents */}
                  {incidentDetail.status === 'RESOLVED' && (
                    <section className="detail-card operator-close-card">
                      <h4 className="detail-card-title">Final Incident Closure</h4>
                      <p className="workflow-hint">
                        This incident has been resolved by field responders. Confirm final
                        verification to transition to CLOSED.
                      </p>
                      {closeMessage && (
                        <div
                          className={
                            closeMessage.type === 'success' ? 'success-banner' : 'form-alert'
                          }
                          role="status"
                        >
                          {closeMessage.text}
                        </div>
                      )}
                      <div className="form-group">
                        <label htmlFor="close-notes">Closure Verification Notes (Optional)</label>
                        <input
                          id="close-notes"
                          type="text"
                          placeholder="e.g. Verified with Ghat Commander, perimeter secured."
                          value={closeNotes}
                          onChange={(e) => setCloseNotes(e.target.value)}
                          className="form-input"
                        />
                      </div>
                      <div
                        style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}
                      >
                        <button
                          type="button"
                          onClick={() => handleOperatorClose(incidentDetail.id)}
                          disabled={closingIncident}
                          className="close-btn"
                        >
                          {closingIncident
                            ? 'Closing Incident…'
                            : 'Officially Close Incident (CLOSED)'}
                        </button>
                      </div>
                    </section>
                  )}

                  {/* Audit History & Timeline */}
                  <section className="detail-card">
                    <h4 className="detail-card-title">
                      Audit Event History ({incidentDetail.events.length})
                    </h4>
                    {incidentDetail.events.length === 0 ? (
                      <p className="workspace-empty">No audit events recorded yet.</p>
                    ) : (
                      <ol className="audit-timeline" role="list">
                        {incidentDetail.events.map((evt) => (
                          <li key={evt.id} className="audit-timeline-item">
                            <div className="timeline-dot" aria-hidden="true" />
                            <div className="timeline-content">
                              <div className="timeline-topline">
                                <span className="timeline-event-type">
                                  {evt.eventType.replaceAll('_', ' ')}
                                </span>
                                <span className="timeline-time">
                                  {new Date(evt.occurredAt).toLocaleTimeString()} ·{' '}
                                  {formatRelativeAge(evt.occurredAt)}
                                </span>
                              </div>
                              <p className="timeline-actor">
                                Actor:{' '}
                                <strong>
                                  {evt.actorDisplayName ||
                                    (evt.actorProfileId
                                      ? 'Staff Operator'
                                      : 'Public System Intake')}
                                </strong>
                              </p>
                              {evt.statusBefore && evt.statusAfter && (
                                <p className="timeline-transition">
                                  Transitioned: <code>{evt.statusBefore}</code> →{' '}
                                  <code>{evt.statusAfter}</code>
                                </p>
                              )}
                              {evt.notes && <p className="timeline-notes">“{evt.notes}”</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* ── Responder View (Stage 7: Mobile-First Interactive Workflow) ── */
        <section
          className="workspace-records responder-container"
          aria-labelledby="records-title"
          aria-busy={loading}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-rule" /> Verified Field Responder
              </p>
              <h2 id="records-title">Assigned Emergency Incidents</h2>
            </div>
            <div className="responder-actions-row">
              <button
                type="button"
                className="btn-toggle-responder-map"
                onClick={() => setResponderShowMap((prev) => !prev)}
                aria-expanded={responderShowMap}
              >
                {responderShowMap ? '📋 Show List Only' : '🗺️ View Map & Landmarks'}
              </button>
            </div>
          </div>

          {responderShowMap && incidents.length > 0 && (
            <div className="responder-map-panel" aria-label="Responder Assigned Incident Locations">
              <div className="map-section-header">
                <h3 className="map-section-title">
                  Assigned Incident Locations & Fictional Sectors
                </h3>
                <span className="map-source-legend">
                  <span className="legend-tag legend-gps">📍 GPS Location</span>
                  <span className="legend-tag legend-manual">📌 Manual Landmark</span>
                  <span className="legend-tag legend-fictional">⚠️ Fictional Demo Zones</span>
                </span>
              </div>
              <OperationalMap
                incidents={incidents}
                selectedIncidentId={incidents[0]?.id ?? null}
                onSelectIncident={() => {}}
              />
            </div>
          )}

          {responderMessage && (
            <div
              className={responderMessage.type === 'success' ? 'success-banner' : 'form-alert'}
              role="status"
            >
              {responderMessage.text}
            </div>
          )}

          {loading ? (
            <p className="workspace-empty" role="status">
              Loading…
            </p>
          ) : error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : incidents.length === 0 ? (
            <div className="responder-empty-state">
              <span className="responder-empty-icon" aria-hidden="true">
                ✓
              </span>
              <h3>No Active Dispatches</h3>
              <p className="workspace-empty">No active assignments.</p>
            </div>
          ) : (
            <ul className="workspace-record-list" role="list">
              {incidents.map((incident) => {
                const isAssigned = incident.status === 'ASSIGNED';
                const isAck = incident.status === 'ACKNOWLEDGED';
                const isEnRoute = incident.status === 'EN_ROUTE';
                const isOnScene = incident.status === 'ON_SCENE';
                const isResolved = incident.status === 'RESOLVED';
                const isClosed = incident.status === 'CLOSED';
                const isTerminal =
                  isResolved ||
                  isClosed ||
                  incident.status === 'CANCELLED' ||
                  incident.status === 'DUPLICATE';

                return (
                  <li className="responder-incident-card" key={incident.id}>
                    <div className="responder-card-header">
                      <div className="workspace-record-topline">
                        <span
                          className={`priority-badge priority-${incident.priority.toLowerCase()}`}
                        >
                          {incident.priority}
                        </span>
                        <span className="workspace-record-category">
                          {incident.category.replaceAll('_', ' ')}
                        </span>
                        <span className={`status-badge status-${incident.status.toLowerCase()}`}>
                          {incident.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <span className="incident-age">
                        Reported {formatRelativeAge(incident.reportedAt)}
                      </span>
                    </div>

                    <div className="responder-summary-box">
                      <p className="responder-summary-text">{incident.summary}</p>
                    </div>

                    <div className="responder-detail-grid">
                      <div>
                        <span className="meta-label">Location</span>
                        <span className="meta-value">
                          {incident.landmark ? `📍 ${incident.landmark}` : 'No specific landmark'}
                        </span>
                      </div>
                      <div>
                        <span className="meta-label">Location Source</span>
                        <span className="meta-value">{incident.locationSource}</span>
                      </div>
                    </div>

                    {/* Interactive Responder Controls */}
                    {!isTerminal && (
                      <div className="responder-control-panel">
                        <div className="responder-action-btn-row">
                          {isAssigned && (
                            <button
                              type="button"
                              onClick={() => handleResponderAction(incident.id, 'ACKNOWLEDGE')}
                              disabled={responderActionLoading}
                              className="action-btn-primary"
                            >
                              {responderActionLoading ? 'Acknowledging…' : 'Acknowledge Assignment'}
                            </button>
                          )}

                          {isAck && (
                            <button
                              type="button"
                              onClick={() => handleResponderAction(incident.id, 'EN_ROUTE')}
                              disabled={responderActionLoading}
                              className="action-btn-primary"
                            >
                              {responderActionLoading ? 'Updating…' : 'Mark EN ROUTE'}
                            </button>
                          )}

                          {isEnRoute && (
                            <button
                              type="button"
                              onClick={() => handleResponderAction(incident.id, 'ON_SCENE')}
                              disabled={responderActionLoading}
                              className="action-btn-primary"
                            >
                              {responderActionLoading ? 'Updating…' : 'Mark ON SCENE'}
                            </button>
                          )}

                          {(isAck || isEnRoute || isOnScene) && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowResolveDrawer((prev) => !prev);
                                  setShowSupportDrawer(false);
                                }}
                                disabled={responderActionLoading}
                                className="action-btn-secondary"
                              >
                                {showResolveDrawer ? 'Cancel Resolution Form' : 'Mark RESOLVED'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setShowSupportDrawer((prev) => !prev);
                                  setShowResolveDrawer(false);
                                }}
                                disabled={responderActionLoading}
                                className="action-btn-support"
                              >
                                {showSupportDrawer
                                  ? 'Cancel Support Form'
                                  : 'Request Additional Support'}
                              </button>
                            </>
                          )}
                        </div>

                        {/* Request Support Drawer */}
                        {showSupportDrawer && (
                          <div className="responder-drawer">
                            <h4 className="responder-drawer-title">Request Additional Support</h4>
                            <p className="workflow-hint">
                              Send an urgent assistance notice to the control room operator without
                              changing the primary team assignment.
                            </p>
                            <label htmlFor="support-notes">Support Details (Required)</label>
                            <textarea
                              id="support-notes"
                              rows={2}
                              placeholder="e.g. Need second stretcher team and water supply at Ghat 4 entrance"
                              value={supportNotes}
                              onChange={(e) => setSupportNotes(e.target.value)}
                              className="form-input"
                            />
                            <div
                              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleResponderAction(
                                    incident.id,
                                    'REQUEST_SUPPORT',
                                    supportNotes,
                                  )
                                }
                                disabled={responderActionLoading || !supportNotes.trim()}
                                className="action-btn-primary"
                              >
                                {responderActionLoading
                                  ? 'Transmitting…'
                                  : 'Transmit Support Request'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Resolve Drawer */}
                        {showResolveDrawer && (
                          <div className="responder-drawer">
                            <h4 className="responder-drawer-title">Mark Incident RESOLVED</h4>
                            <p className="workflow-hint">
                              Document the field outcome. Resolving completes the active assignment
                              and releases your team for new assignments.
                            </p>
                            <label htmlFor="resolve-outcome">Resolution Outcome (Required)</label>
                            <input
                              id="resolve-outcome"
                              type="text"
                              placeholder="e.g. Patient stabilized with first aid and reunited with family."
                              value={resolutionOutcome}
                              onChange={(e) => setResolutionOutcome(e.target.value)}
                              className="form-input"
                              required
                            />
                            <label htmlFor="resolve-notes">Additional Field Notes (Optional)</label>
                            <textarea
                              id="resolve-notes"
                              rows={2}
                              placeholder="Optional operational observations or handover notes…"
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              className="form-input"
                            />
                            <div
                              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleResponderAction(
                                    incident.id,
                                    'RESOLVE',
                                    resolutionNotes,
                                    resolutionOutcome,
                                  )
                                }
                                disabled={responderActionLoading || !resolutionOutcome.trim()}
                                className="action-btn-primary"
                              >
                                {responderActionLoading ? 'Resolving…' : 'Confirm Resolution'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isResolved && (
                      <div className="resolution-outcome-banner">
                        <p className="outcome-title">
                          Status: RESOLVED (Pending Final Operator Closure)
                        </p>
                        <p className="outcome-text">
                          Unit assignment completed. Team availability released under standard
                          operational release rules.
                        </p>
                      </div>
                    )}

                    {isClosed && (
                      <div
                        className="resolution-outcome-banner"
                        style={{
                          borderColor: 'var(--line)',
                          background: 'rgba(165, 167, 155, 0.1)',
                        }}
                      >
                        <p className="outcome-title" style={{ color: 'var(--muted)' }}>
                          Status: CLOSED
                        </p>
                        <p className="outcome-text" style={{ fontStyle: 'normal' }}>
                          Verified and officially closed by the control room operator.
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="form-footnote">
            Field Responder Workspace — Actions recorded here are audited in real time and
            immediately visible in the control room.
          </p>
        </section>
      )}
    </section>
  );
}
