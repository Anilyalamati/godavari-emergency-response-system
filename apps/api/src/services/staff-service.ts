import { createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ConfigurationItemSchema,
  EligibleTeamsResponseSchema,
  EscalationScanResultSchema,
  IncidentActiveAssignmentSchema,
  IncidentDetailSchema,
  IncidentEventSchema,
  IncidentSummarySchema,
  OperatorCloseResultSchema,
  PublicIncidentCreatedResponseSchema,
  PublicIncidentTrackingResponseSchema,
  PublicZoneSchema,
  ReporterContactSchema,
  ResponderUpdateResultSchema,
  StaffMemberSchema,
  StaffProfileSchema,
  TeamAssignmentResultSchema,
  TeamCandidateSchema,
  TeamReassignmentResultSchema,
  TeamSummarySchema,
  type ConfigurationItem,
  type ConfigurationUpsert,
  type EligibleTeamsResponse,
  type EscalationScanResult,
  type IncidentActiveAssignment,
  type IncidentDetail,
  type IncidentEvent,
  type IncidentReviewInput,
  type IncidentSummary,
  type OperatorCloseInput,
  type OperatorCloseResult,
  type PaginatedIncidentListQuery,
  type PaginatedIncidentListResponse,
  type PublicIncidentCreateInput,
  type PublicIncidentCreatedResponse,
  type PublicIncidentTrackingResponse,
  type PublicZone,
  type ReporterContact,
  type ResponderUpdateInput,
  type ResponderUpdateResult,
  type StaffInviteInput,
  type StaffMember,
  type StaffProfile,
  type StaffProfileUpdate,
  type TeamAssignmentInput,
  type TeamAssignmentResult,
  type TeamReassignmentInput,
  type TeamReassignmentResult,
  type TeamSummary,
} from '@godavari/shared';
import type { ApiEnvironment } from '../env.js';
import { ApiError } from '../http/ApiError.js';

export interface StaffApiService {
  authenticate(accessToken: string): Promise<StaffProfile>;
  listIncidents(
    accessToken: string,
    query?: PaginatedIncidentListQuery,
  ): Promise<IncidentSummary[] | PaginatedIncidentListResponse>;
  getIncidentDetail(
    accessToken: string,
    incidentId: string,
    actor: StaffProfile,
  ): Promise<IncidentDetail>;
  reviewIncident(
    accessToken: string,
    actor: StaffProfile,
    incidentId: string,
    input: IncidentReviewInput,
  ): Promise<IncidentDetail>;
  getEligibleTeams(
    accessToken: string,
    incidentId: string,
    actor: StaffProfile,
  ): Promise<EligibleTeamsResponse>;
  assignTeam(
    accessToken: string,
    actor: StaffProfile,
    incidentId: string,
    input: TeamAssignmentInput,
  ): Promise<TeamAssignmentResult>;
  responderUpdateIncident(
    accessToken: string,
    actor: StaffProfile,
    incidentId: string,
    input: ResponderUpdateInput,
  ): Promise<ResponderUpdateResult>;
  operatorCloseIncident(
    accessToken: string,
    actor: StaffProfile,
    incidentId: string,
    input?: OperatorCloseInput,
  ): Promise<OperatorCloseResult>;
  reassignTeam(
    accessToken: string,
    actor: StaffProfile,
    incidentId: string,
    input: TeamReassignmentInput,
  ): Promise<TeamReassignmentResult>;
  scanEscalations(callerAccessToken?: string): Promise<EscalationScanResult>;
  getReporterContact(accessToken: string, incidentId: string): Promise<ReporterContact | null>;
  listStaff(accessToken: string): Promise<StaffMember[]>;
  listTeams(accessToken: string): Promise<TeamSummary[]>;
  inviteStaff(
    actor: StaffProfile,
    accessToken: string,
    input: StaffInviteInput,
  ): Promise<{ profileId: string; role: StaffInviteInput['role'] }>;
  updateStaffProfile(
    accessToken: string,
    profileId: string,
    input: StaffProfileUpdate,
  ): Promise<void>;
  replaceTeamMemberships(accessToken: string, profileId: string, teamIds: string[]): Promise<void>;
  listConfiguration(accessToken: string): Promise<ConfigurationItem[]>;
  upsertConfiguration(
    accessToken: string,
    actorId: string,
    key: string,
    input: ConfigurationUpsert,
  ): Promise<ConfigurationItem>;
  submitPublicIncident(input: PublicIncidentCreateInput): Promise<PublicIncidentCreatedResponse>;
  trackPublicIncident(trackingToken: string): Promise<PublicIncidentTrackingResponse>;
  listPublicZones(): Promise<PublicZone[]>;
}

const clientAuthOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
};

const clientFieldError = () =>
  new ApiError(
    503,
    'STAFF_DATA_UNAVAILABLE',
    'Staff data is temporarily unavailable. Please try again later.',
  );

function authErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = error.status;
  return typeof status === 'number' ? status : undefined;
}

function mapAdminRpcError(error: { code?: string } | null): ApiError {
  if (error?.code === '42501') {
    return new ApiError(
      403,
      'ADMIN_ACTION_NOT_AUTHORIZED',
      'This administrator action is not allowed.',
    );
  }
  if (error?.code === 'P0002') {
    return new ApiError(
      404,
      'STAFF_PROFILE_NOT_FOUND',
      'The requested staff profile was not found.',
    );
  }
  if (error?.code === '22023' || error?.code === '23514' || error?.code === '23503') {
    return new ApiError(400, 'INVALID_STAFF_CHANGE', 'The requested staff change is not valid.');
  }
  return clientFieldError();
}

function mapReviewRpcError(error: { code?: string; message?: string } | null): ApiError {
  if (error?.code === '42501') {
    return new ApiError(
      403,
      'OPERATOR_ROLE_REQUIRED',
      'Only operators can review or update emergency incidents.',
    );
  }
  if (error?.code === 'P0002') {
    return new ApiError(404, 'INCIDENT_NOT_FOUND', 'The requested incident record was not found.');
  }
  if (error?.code === '22023' || error?.code === '23514' || error?.code === '23503') {
    return new ApiError(
      400,
      'INVALID_REVIEW_CHANGE',
      error.message || 'The requested incident review change is not valid.',
    );
  }
  return clientFieldError();
}

function mapAssignmentRpcError(error: { code?: string; message?: string } | null): ApiError {
  if (error?.code === '42501') {
    return new ApiError(
      403,
      'OPERATOR_ROLE_REQUIRED',
      'Only operators can assign response teams to emergency incidents.',
    );
  }
  if (error?.code === 'P0002') {
    return new ApiError(
      404,
      'INCIDENT_OR_TEAM_NOT_FOUND',
      'The requested incident or team record was not found.',
    );
  }
  if (error?.code === '23505') {
    return new ApiError(
      409,
      'ASSIGNMENT_CONFLICT',
      error.message ||
        'Assignment conflict: team or incident already has an active assignment (double-booking prevented).',
    );
  }
  if (error?.code === '22023' || error?.code === '23514' || error?.code === '23503') {
    return new ApiError(
      400,
      'INVALID_ASSIGNMENT',
      error.message || 'The requested team assignment is not valid.',
    );
  }
  return clientFieldError();
}

function matchesCategoryCapability(capabilities: string[], category: string): string[] {
  const normCaps = capabilities.map((c) => c.toLowerCase());
  const categoryRequirements: Record<string, string[]> = {
    MEDICAL_ASSISTANCE: [
      'first_aid',
      'medical_response',
      'medical',
      'triage',
      'welfare_check',
      'paramedic',
      'accessibility_support',
    ],
    CROWD_SAFETY: [
      'crowd_observation',
      'crowd_guidance',
      'crowd_control',
      'public_guidance',
      'evacuation',
    ],
    LOST_PERSON: [
      'wayfinding',
      'public_guidance',
      'welfare_check',
      'search_and_rescue',
      'reunification',
      'lost_and_found',
    ],
    INFRASTRUCTURE: [
      'hazard_containment',
      'infrastructure_repair',
      'safety_inspection',
      'fire_safety',
    ],
    OTHER: [],
  };

  if (category === 'OTHER') return normCaps;
  const targets = categoryRequirements[category] ?? [];
  return normCaps.filter((cap) => targets.includes(cap));
}

export function createStaffApiService(environment: ApiEnvironment): StaffApiService | null {
  const projectUrl = environment.SUPABASE_URL;
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return null;

  const createUserClient = (accessToken: string): SupabaseClient =>
    createClient(projectUrl, publishableKey, {
      auth: clientAuthOptions,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

  const createAdminClient = (): SupabaseClient => {
    if (!environment.SUPABASE_SECRET_KEY) {
      throw new ApiError(
        503,
        'STAFF_INVITATIONS_NOT_CONFIGURED',
        'Administrator invitations are not configured on this server.',
      );
    }
    return createClient(projectUrl, environment.SUPABASE_SECRET_KEY, {
      auth: clientAuthOptions,
    });
  };

  const callUser = (accessToken: string) => createUserClient(accessToken);

  return {
    async authenticate(accessToken) {
      const client = callUser(accessToken);
      let authData;
      try {
        authData = await client.auth.getUser(accessToken);
      } catch {
        throw new ApiError(
          503,
          'AUTH_PROVIDER_UNAVAILABLE',
          'Staff authentication is temporarily unavailable.',
        );
      }

      if (authData.error) {
        const status = authErrorStatus(authData.error);
        if (status === 400 || status === 401 || status === 403) {
          throw new ApiError(
            401,
            'INVALID_OR_EXPIRED_TOKEN',
            'The staff session is invalid or has expired. Sign in again.',
          );
        }
        throw new ApiError(
          503,
          'AUTH_PROVIDER_UNAVAILABLE',
          'Staff authentication is temporarily unavailable.',
        );
      }

      const user = authData.data.user;
      if (!user) {
        throw new ApiError(
          401,
          'INVALID_OR_EXPIRED_TOKEN',
          'The staff session is invalid or has expired. Sign in again.',
        );
      }

      let profileResult;
      try {
        profileResult = await client
          .from('profiles')
          .select('id,display_name,role,is_active,can_access_reporter_contacts')
          .eq('id', user.id)
          .maybeSingle();
      } catch {
        throw clientFieldError();
      }

      if (profileResult.error) throw clientFieldError();
      if (!profileResult.data || !profileResult.data.is_active) {
        throw new ApiError(
          403,
          'STAFF_ACCESS_DENIED',
          'This account is not an active staff account.',
        );
      }

      const parsed = StaffProfileSchema.safeParse({
        id: profileResult.data.id,
        email: user.email ?? null,
        displayName: profileResult.data.display_name,
        role: profileResult.data.role,
        isActive: profileResult.data.is_active,
        canAccessReporterContacts: profileResult.data.can_access_reporter_contacts,
      });
      if (!parsed.success) {
        throw new ApiError(
          503,
          'STAFF_DATA_UNAVAILABLE',
          'The staff profile could not be verified.',
        );
      }
      return parsed.data;
    },

    async listIncidents(accessToken, query) {
      const selectOptions = query?.page ? ({ count: 'exact' } as const) : undefined;
      let queryBuilder = callUser(accessToken)
        .from('incidents')
        .select(
          'id,category,priority,status,summary,reported_at,zone_id,location_source,landmark,latitude,longitude,location_accuracy_m,location_captured_at,location_is_fictional,is_demo',
          selectOptions,
        );

      if (query?.status) {
        queryBuilder = queryBuilder.eq('status', query.status);
      }
      if (query?.category) {
        queryBuilder = queryBuilder.eq('category', query.category);
      }
      if (query?.priority) {
        queryBuilder = queryBuilder.eq('priority', query.priority);
      }
      if (query?.zoneId) {
        queryBuilder = queryBuilder.eq('zone_id', query.zoneId);
      }
      if (query?.search) {
        queryBuilder = queryBuilder.or(
          `summary.ilike.%${query.search}%,landmark.ilike.%${query.search}%`,
        );
      }

      queryBuilder = queryBuilder.order('reported_at', { ascending: false });

      if (query?.page && query?.limit) {
        const from = (query.page - 1) * query.limit;
        const to = from + query.limit - 1;
        queryBuilder = queryBuilder.range(from, to);
      } else {
        queryBuilder = queryBuilder.limit(100);
      }

      let result;
      try {
        result = await queryBuilder;
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw clientFieldError();

      const items = result.data.map((row) =>
        IncidentSummarySchema.parse({
          id: row.id,
          category: row.category,
          priority: row.priority,
          status: row.status,
          summary: row.summary,
          reportedAt: row.reported_at,
          zoneId: row.zone_id,
          locationSource: row.location_source,
          landmark: row.landmark,
          latitude: row.latitude,
          longitude: row.longitude,
          locationAccuracyM: row.location_accuracy_m,
          locationCapturedAt: row.location_captured_at,
          locationIsFictional: row.location_is_fictional,
          isDemo: row.is_demo,
        }),
      );

      if (query?.page && query?.limit) {
        const total = result.count ?? items.length;
        const totalPages = Math.ceil(total / query.limit);
        return {
          data: items,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages,
          },
        };
      }

      return items;
    },

    async getIncidentDetail(accessToken, incidentId, actor) {
      const client = callUser(accessToken);

      let incidentResult;
      try {
        incidentResult = await client
          .from('incidents')
          .select(
            'id,category,priority,status,summary,reported_at,zone_id,location_source,latitude,longitude,location_accuracy_m,landmark,location_captured_at,location_is_fictional,is_demo,duplicate_of_incident_id,review_notes,cancellation_reason,reviewed_by_profile_id,reviewed_at',
          )
          .eq('id', incidentId)
          .maybeSingle();
      } catch {
        throw clientFieldError();
      }

      if (incidentResult.error) throw clientFieldError();
      if (!incidentResult.data) {
        throw new ApiError(
          404,
          'INCIDENT_NOT_FOUND',
          'The requested incident record was not found.',
        );
      }

      const row = incidentResult.data;

      // Fetch zone if zone_id is present
      let zoneName: string | null = null;
      let zoneCode: string | null = null;
      if (row.zone_id) {
        try {
          const zoneRes = await client
            .from('zones')
            .select('name,zone_code')
            .eq('id', row.zone_id)
            .maybeSingle();
          if (zoneRes.data) {
            zoneName = zoneRes.data.name;
            zoneCode = zoneRes.data.zone_code;
          }
        } catch {
          // Non-fatal
        }
      }

      // Fetch reviewer name if reviewed_by_profile_id is present
      let reviewedByName: string | null = null;
      if (row.reviewed_by_profile_id) {
        try {
          const revRes = await client
            .from('profiles')
            .select('display_name')
            .eq('id', row.reviewed_by_profile_id)
            .maybeSingle();
          if (revRes.data) {
            reviewedByName = revRes.data.display_name;
          }
        } catch {
          // Non-fatal
        }
      }

      // Fetch audit events
      let eventsResult;
      try {
        eventsResult = await client
          .from('incident_events')
          .select(
            'id,incident_id,actor_profile_id,event_type,status_before,status_after,notes,occurred_at',
          )
          .eq('incident_id', incidentId)
          .order('occurred_at', { ascending: true });
      } catch {
        throw clientFieldError();
      }

      if (eventsResult.error) throw clientFieldError();

      const actorIds = [
        ...new Set(eventsResult.data.map((e) => e.actor_profile_id).filter(Boolean)),
      ];
      const actorNameMap = new Map<string, string>();
      if (actorIds.length > 0) {
        try {
          const actorsRes = await client
            .from('profiles')
            .select('id,display_name')
            .in('id', actorIds);
          if (actorsRes.data) {
            for (const a of actorsRes.data) {
              actorNameMap.set(a.id, a.display_name);
            }
          }
        } catch {
          // Non-fatal
        }
      }

      const events: IncidentEvent[] = eventsResult.data.map((e) =>
        IncidentEventSchema.parse({
          id: e.id,
          incidentId: e.incident_id,
          actorProfileId: e.actor_profile_id,
          actorDisplayName: e.actor_profile_id
            ? (actorNameMap.get(e.actor_profile_id) ?? null)
            : null,
          eventType: e.event_type,
          statusBefore: e.status_before,
          statusAfter: e.status_after,
          notes: e.notes ?? null,
          occurredAt: e.occurred_at,
        }),
      );

      // Contact details: only if actor has explicit canAccessReporterContacts permission
      let reporterContact: ReporterContact | null = null;
      if (actor.canAccessReporterContacts) {
        try {
          reporterContact = await this.getReporterContact(accessToken, incidentId);
        } catch {
          reporterContact = null;
        }
      }

      // Active assignment check
      let activeAssignment: IncidentActiveAssignment | null = null;
      try {
        const assignRes = await client
          .from('assignments')
          .select(
            'id,team_id,status,assigned_at,acknowledgement_deadline,escalated_at,reassignment_reason',
          )
          .eq('incident_id', incidentId)
          .in('status', ['PENDING', 'ACKNOWLEDGED'])
          .maybeSingle();

        if (assignRes.data) {
          const teamRes = await client
            .from('teams')
            .select('team_code,name')
            .eq('id', assignRes.data.team_id)
            .maybeSingle();

          const deadlineMs = new Date(assignRes.data.acknowledgement_deadline).getTime();
          const isOverdue =
            assignRes.data.status === 'PENDING' &&
            (Boolean(assignRes.data.escalated_at) || deadlineMs < Date.now());

          activeAssignment = IncidentActiveAssignmentSchema.parse({
            id: assignRes.data.id,
            teamId: assignRes.data.team_id,
            teamCode: teamRes.data?.team_code ?? 'UNKNOWN',
            teamName: teamRes.data?.name ?? 'Unknown Team',
            status: assignRes.data.status,
            assignedAt: assignRes.data.assigned_at,
            acknowledgementDeadline: assignRes.data.acknowledgement_deadline,
            isOverdue,
            escalatedAt: assignRes.data.escalated_at ?? null,
            reassignmentReason: assignRes.data.reassignment_reason ?? null,
          });
        }
      } catch {
        // Non-fatal
      }

      return IncidentDetailSchema.parse({
        id: row.id,
        category: row.category,
        priority: row.priority,
        status: row.status,
        summary: row.summary,
        reportedAt: row.reported_at,
        zoneId: row.zone_id,
        zoneName,
        zoneCode,
        locationSource: row.location_source,
        landmark: row.landmark,
        latitude: row.latitude !== null ? Number(row.latitude) : null,
        longitude: row.longitude !== null ? Number(row.longitude) : null,
        locationAccuracyM:
          row.location_accuracy_m !== null ? Number(row.location_accuracy_m) : null,
        locationCapturedAt: row.location_captured_at,
        locationIsFictional: row.location_is_fictional,
        isDemo: row.is_demo,
        duplicateOfIncidentId: row.duplicate_of_incident_id,
        reviewNotes: row.review_notes,
        cancellationReason: row.cancellation_reason,
        reviewedByProfileId: row.reviewed_by_profile_id,
        reviewedByName,
        reviewedAt: row.reviewed_at,
        events,
        reporterContact,
        activeAssignment,
      });
    },

    async reviewIncident(accessToken, actor, incidentId, input) {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(
          403,
          'OPERATOR_ROLE_REQUIRED',
          'Only operators can review or update emergency incidents.',
        );
      }

      const client = callUser(accessToken);
      let rpcResult;
      try {
        rpcResult = await client.rpc('operator_review_incident', {
          p_incident_id: incidentId,
          p_actor_profile_id: actor.id,
          p_status: input.status ?? null,
          p_priority: input.priority ?? null,
          p_review_notes: input.reviewNotes ?? null,
          p_duplicate_of_incident_id: input.duplicateOfIncidentId ?? null,
          p_cancellation_reason: input.cancellationReason ?? null,
        });
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        throw mapReviewRpcError(rpcResult.error);
      }

      return this.getIncidentDetail(accessToken, incidentId, actor);
    },

    async getEligibleTeams(accessToken, incidentId, actor) {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(
          403,
          'OPERATOR_ROLE_REQUIRED',
          'Only operators can view team recommendations and eligibility.',
        );
      }

      const client = callUser(accessToken);

      // 1. Fetch incident
      let incidentRes;
      try {
        incidentRes = await client
          .from('incidents')
          .select('id,category,status,zone_id')
          .eq('id', incidentId)
          .maybeSingle();
      } catch {
        throw clientFieldError();
      }

      if (incidentRes.error) throw clientFieldError();
      if (!incidentRes.data) {
        throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
      }

      const incident = incidentRes.data;

      // 2. Fetch zone name if zone_id is present
      let incidentZoneName: string | null = null;
      if (incident.zone_id) {
        try {
          const zRes = await client
            .from('zones')
            .select('name')
            .eq('id', incident.zone_id)
            .maybeSingle();
          if (zRes.data) incidentZoneName = zRes.data.name;
        } catch {
          // Non-fatal
        }
      }

      // 3. Fetch all teams
      let teamsRes;
      try {
        teamsRes = await client
          .from('teams')
          .select('id,team_code,name,capabilities,duty_status')
          .order('name');
      } catch {
        throw clientFieldError();
      }
      if (teamsRes.error) throw clientFieldError();

      // 4. Fetch all active assignments across all teams to detect double-booking
      let activeAssignRes;
      try {
        activeAssignRes = await client
          .from('assignments')
          .select('id,incident_id,team_id,status')
          .in('status', ['PENDING', 'ACKNOWLEDGED']);
      } catch {
        throw clientFieldError();
      }
      if (activeAssignRes.error) throw clientFieldError();

      const activeAssignmentsByTeam = new Map<string, { incidentId: string; status: string }>();
      for (const a of activeAssignRes.data) {
        activeAssignmentsByTeam.set(a.team_id, { incidentId: a.incident_id, status: a.status });
      }

      // 5. Fetch team zone coverage
      let coverageRes;
      try {
        coverageRes = await client
          .from('team_zone_coverage')
          .select('team_id,zone_id,zones(id,name,zone_code)');
      } catch {
        throw clientFieldError();
      }
      if (coverageRes.error) throw clientFieldError();

      const coverageByTeam = new Map<
        string,
        Array<{ id: string; name: string; zoneCode: string }>
      >();
      for (const cov of (coverageRes.data ?? []) as unknown as Array<{
        team_id: string;
        zone_id: string;
        zones:
          | { id: string; name: string; zone_code: string }
          | Array<{ id: string; name: string; zone_code: string }>
          | null;
      }>) {
        if (!coverageByTeam.has(cov.team_id)) coverageByTeam.set(cov.team_id, []);
        const zoneObj = Array.isArray(cov.zones) ? cov.zones[0] : cov.zones;
        if (zoneObj) {
          coverageByTeam.get(cov.team_id)!.push({
            id: zoneObj.id,
            name: zoneObj.name,
            zoneCode: zoneObj.zone_code,
          });
        }
      }

      // 6. Transparent eligibility evaluation
      const candidates = teamsRes.data.map((team) => {
        const reasons: string[] = [];
        let isEligible = true;
        let suitabilityScore = 0;

        // Duty status check
        const isOnDuty = team.duty_status === 'ON_DUTY';
        if (!isOnDuty) {
          isEligible = false;
          reasons.push(
            `Ineligible: Team is currently ${team.duty_status.toLowerCase().replace('_', ' ')}`,
          );
        } else {
          reasons.push('Team is on active duty');
          suitabilityScore += 20;
        }

        // Availability check (double booking)
        const activeAssignment = activeAssignmentsByTeam.get(team.id) ?? null;
        const isAvailable = activeAssignment === null;
        if (!isAvailable) {
          isEligible = false;
          reasons.push(
            `Ineligible: Already committed to active incident #${activeAssignment.incidentId.slice(0, 8)} (${activeAssignment.status})`,
          );
        } else {
          reasons.push('Team is available (no conflicting assignments)');
          suitabilityScore += 30;
        }

        // Capability check
        const matchedCaps = matchesCategoryCapability(team.capabilities ?? [], incident.category);
        const hasCapabilityMatch = matchedCaps.length > 0;
        if (!hasCapabilityMatch) {
          isEligible = false;
          reasons.push(
            `Ineligible: Lacks suitable capability for ${incident.category.toLowerCase().replace('_', ' ')}`,
          );
        } else {
          reasons.push(`Verified capability match: ${matchedCaps.join(', ')}`);
          suitabilityScore += 30;
        }

        // Zone suitability check
        const serviceZones = coverageByTeam.get(team.id) ?? [];
        const coversIncidentZone = incident.zone_id
          ? serviceZones.some((z) => z.id === incident.zone_id)
          : false;

        if (coversIncidentZone) {
          reasons.push(`Primary service zone match: covers ${incidentZoneName || 'incident area'}`);
          suitabilityScore += 20;
        } else if (incident.zone_id) {
          reasons.push(
            `Secondary / auxiliary: does not cover incident primary zone (${incidentZoneName || 'tagged zone'})`,
          );
        } else {
          reasons.push('General coverage: incident has no specific zone constraint');
          suitabilityScore += 10;
        }

        const isRecommended =
          isEligible && (coversIncidentZone || !incident.zone_id) && hasCapabilityMatch;

        return TeamCandidateSchema.parse({
          id: team.id,
          teamCode: team.team_code,
          name: team.name,
          capabilities: team.capabilities ?? [],
          dutyStatus: team.duty_status,
          serviceZones,
          isAvailable,
          activeAssignment,
          isEligible,
          isRecommended,
          suitabilityScore: isEligible ? suitabilityScore : 0,
          reasons,
        });
      });

      // Sort: Recommended first, then highest suitability score, then by name
      candidates.sort((a, b) => {
        if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
        if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
        if (b.suitabilityScore !== a.suitabilityScore)
          return b.suitabilityScore - a.suitabilityScore;
        return a.name.localeCompare(b.name);
      });

      return EligibleTeamsResponseSchema.parse({
        incidentId,
        incidentCategory: incident.category,
        incidentZoneId: incident.zone_id,
        incidentZoneName,
        teams: candidates,
      });
    },

    async assignTeam(accessToken, actor, incidentId, input) {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(
          403,
          'OPERATOR_ROLE_REQUIRED',
          'Only operators can assign response teams to emergency incidents.',
        );
      }

      const client = callUser(accessToken);
      let rpcResult;
      try {
        rpcResult = await client.rpc('operator_assign_team', {
          p_incident_id: incidentId,
          p_team_id: input.teamId,
          p_actor_profile_id: actor.id,
          p_deadline_minutes: input.acknowledgementDeadlineMinutes ?? 15,
          p_deadline_seconds: input.acknowledgementDeadlineSeconds ?? null,
        });
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        throw mapAssignmentRpcError(rpcResult.error);
      }

      const res = rpcResult.data as Record<string, unknown>;
      return TeamAssignmentResultSchema.parse({
        assignmentId: res.assignment_id,
        incidentId: res.incident_id,
        teamId: res.team_id,
        teamCode: res.team_code,
        teamName: res.team_name,
        status: res.status,
        assignedAt: res.assigned_at,
        acknowledgementDeadline: res.acknowledgement_deadline,
        incidentStatus: res.incident_status,
      });
    },

    async responderUpdateIncident(accessToken, actor, incidentId, input) {
      if (actor.role !== 'RESPONDER') {
        throw new ApiError(
          403,
          'RESPONDER_ROLE_REQUIRED',
          'Only assigned field responders can perform response lifecycle updates.',
        );
      }

      const client = callUser(accessToken);
      let rpcResult;
      try {
        rpcResult = await client.rpc('responder_update_incident', {
          p_incident_id: incidentId,
          p_actor_profile_id: actor.id,
          p_action: input.action,
          p_notes: input.notes ?? null,
          p_outcome: input.outcome ?? null,
        });
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        if (rpcResult.error.code === '42501') {
          throw new ApiError(
            403,
            'ACCESS_DENIED',
            rpcResult.error.message ||
              'You are not authorized to update this incident or are not an active member of the assigned team.',
          );
        }
        if (rpcResult.error.code === '22023') {
          throw new ApiError(
            400,
            'INVALID_STATUS_TRANSITION',
            rpcResult.error.message || 'Invalid responder state transition or missing parameters.',
          );
        }
        if (rpcResult.error.code === 'P0002') {
          throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
        }
        throw clientFieldError();
      }

      const res = rpcResult.data as Record<string, unknown>;
      return ResponderUpdateResultSchema.parse({
        incidentId: res.incident_id,
        incidentStatus: res.incident_status,
        assignmentId: res.assignment_id,
        assignmentStatus: res.assignment_status,
        action: typeof res.action === 'string' ? res.action : undefined,
        supportRequested: Boolean(res.support_requested),
        notes: typeof res.notes === 'string' ? res.notes : undefined,
        isRepeat: Boolean(res.is_repeat),
      });
    },

    async operatorCloseIncident(accessToken, actor, incidentId, input) {
      if (actor.role !== 'OPERATOR' && actor.role !== 'ADMIN') {
        throw new ApiError(
          403,
          'OPERATOR_ROLE_REQUIRED',
          'Only operators or administrators can perform final incident closure.',
        );
      }

      const client = callUser(accessToken);
      let rpcResult;
      try {
        rpcResult = await client.rpc('operator_close_incident', {
          p_incident_id: incidentId,
          p_actor_profile_id: actor.id,
          p_notes: input?.notes ?? null,
        });
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        if (rpcResult.error.code === '42501') {
          throw new ApiError(
            403,
            'ACCESS_DENIED',
            rpcResult.error.message || 'Unauthorized to close incident.',
          );
        }
        if (rpcResult.error.code === '22023') {
          throw new ApiError(
            400,
            'INVALID_STATUS_TRANSITION',
            rpcResult.error.message || 'Only RESOLVED incidents can be closed.',
          );
        }
        if (rpcResult.error.code === 'P0002') {
          throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
        }
        throw clientFieldError();
      }

      const res = rpcResult.data as Record<string, unknown>;
      return OperatorCloseResultSchema.parse({
        incidentId: res.incident_id,
        incidentStatus: 'CLOSED',
        closedAt: typeof res.closed_at === 'string' ? res.closed_at : undefined,
        isRepeat: Boolean(res.is_repeat),
      });
    },

    async reassignTeam(accessToken, actor, incidentId, input) {
      if (actor.role !== 'OPERATOR') {
        throw new ApiError(
          403,
          'OPERATOR_ROLE_REQUIRED',
          'Only operators can reassign response teams to emergency incidents.',
        );
      }

      const client = callUser(accessToken);
      const deadlineSeconds =
        input.acknowledgementDeadlineSeconds ??
        (input.acknowledgementDeadlineMinutes ? input.acknowledgementDeadlineMinutes * 60 : 900);

      let rpcResult;
      try {
        rpcResult = await client.rpc('operator_reassign_team', {
          p_incident_id: incidentId,
          p_new_team_id: input.newTeamId,
          p_actor_profile_id: actor.id,
          p_reason: input.reason,
          p_deadline_seconds: deadlineSeconds,
        });
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        throw mapAssignmentRpcError(rpcResult.error);
      }

      const res = rpcResult.data as Record<string, unknown>;
      return TeamReassignmentResultSchema.parse({
        incidentId: res.incident_id,
        supersededAssignmentId: res.superseded_assignment_id,
        supersededTeamCode: res.superseded_team_code,
        newAssignmentId: res.new_assignment_id,
        newTeamId: res.new_team_id,
        newTeamCode: res.new_team_code,
        newTeamName: res.new_team_name,
        status: res.status,
        assignedAt: res.assigned_at,
        acknowledgementDeadline: res.acknowledgement_deadline,
        incidentStatus: res.incident_status,
        reassignmentReason: res.reassignment_reason,
      });
    },

    async scanEscalations(callerAccessToken?: string) {
      const client = callerAccessToken ? callUser(callerAccessToken) : createAdminClient();
      let rpcResult;
      try {
        rpcResult = await client.rpc('scan_and_escalate_overdue_assignments');
      } catch {
        throw clientFieldError();
      }

      if (rpcResult.error) {
        throw mapAdminRpcError(rpcResult.error);
      }

      const res = rpcResult.data as {
        escalated_count: number;
        escalated: Array<{ assignment_id: string }>;
      };

      return EscalationScanResultSchema.parse({
        scannedAt: new Date().toISOString(),
        escalatedCount: res?.escalated_count ?? 0,
        escalatedAssignmentIds: (res?.escalated ?? []).map((e) => e.assignment_id),
      });
    },

    async getReporterContact(accessToken, incidentId) {
      let result;
      try {
        result = await callUser(accessToken)
          .from('reporter_contacts')
          .select('contact_name,phone_e164,email_address,preferred_contact_method')
          .eq('incident_id', incidentId)
          .maybeSingle();
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw clientFieldError();
      if (!result.data) return null;

      return ReporterContactSchema.parse({
        contactName: result.data.contact_name,
        phoneE164: result.data.phone_e164,
        emailAddress: result.data.email_address,
        preferredContactMethod: result.data.preferred_contact_method,
      });
    },

    async listStaff(accessToken) {
      const client = callUser(accessToken);
      let profiles;
      let memberships;
      try {
        [profiles, memberships] = await Promise.all([
          client
            .from('profiles')
            .select('id,display_name,role,is_active,can_access_reporter_contacts,created_at')
            .order('created_at', { ascending: true }),
          client.from('team_memberships').select('profile_id,team_id,active'),
        ]);
      } catch {
        throw clientFieldError();
      }
      if (profiles.error || memberships.error) throw clientFieldError();

      const teamIdsByProfile = new Map<string, string[]>();
      for (const membership of memberships.data) {
        if (!membership.active) continue;
        const current = teamIdsByProfile.get(membership.profile_id) ?? [];
        current.push(membership.team_id);
        teamIdsByProfile.set(membership.profile_id, current);
      }

      return profiles.data.map((profile) =>
        StaffMemberSchema.parse({
          id: profile.id,
          displayName: profile.display_name,
          role: profile.role,
          isActive: profile.is_active,
          canAccessReporterContacts: profile.can_access_reporter_contacts,
          teamIds: teamIdsByProfile.get(profile.id) ?? [],
          createdAt: profile.created_at,
        }),
      );
    },

    async listTeams(accessToken) {
      let result;
      try {
        result = await callUser(accessToken)
          .from('teams')
          .select('id,team_code,name,is_demo')
          .order('team_code', { ascending: true });
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw clientFieldError();

      return result.data.map((team) =>
        TeamSummarySchema.parse({
          id: team.id,
          code: team.team_code,
          name: team.name,
          isDemo: team.is_demo,
        }),
      );
    },

    async inviteStaff(actor, accessToken, input) {
      if (actor.email && actor.email.toLowerCase() === input.email.toLowerCase()) {
        throw new ApiError(
          403,
          'SELF_INVITATION_NOT_ALLOWED',
          'You cannot invite your own account.',
        );
      }

      const admin = createAdminClient();
      const inviteRedirectUrl = environment.SUPABASE_INVITE_REDIRECT_URL;
      if (!inviteRedirectUrl) {
        throw new ApiError(
          503,
          'STAFF_INVITATIONS_NOT_CONFIGURED',
          'Administrator invitations are not configured on this server.',
        );
      }
      const inviteOptions = { redirectTo: inviteRedirectUrl };
      let inviteResult;
      try {
        inviteResult = await admin.auth.admin.inviteUserByEmail(input.email, inviteOptions);
      } catch {
        throw new ApiError(
          503,
          'STAFF_INVITATION_FAILED',
          'The staff invitation could not be completed.',
        );
      }
      if (inviteResult.error || !inviteResult.data.user) {
        throw new ApiError(
          503,
          'STAFF_INVITATION_FAILED',
          'The staff invitation could not be completed.',
        );
      }

      const userId = inviteResult.data.user.id;
      const profileClient = admin;
      let profileInsert;
      try {
        profileInsert = await profileClient.from('profiles').insert({
          id: userId,
          display_name: input.displayName,
          role: input.role,
          is_active: true,
          can_access_reporter_contacts: input.canAccessReporterContacts,
        });
      } catch {
        await admin.auth.admin.deleteUser(userId);
        throw new ApiError(
          503,
          'STAFF_INVITATION_FAILED',
          'The staff invitation could not be completed.',
        );
      }
      if (profileInsert.error) {
        await admin.auth.admin.deleteUser(userId);
        throw new ApiError(
          503,
          'STAFF_INVITATION_FAILED',
          'The staff invitation could not be completed.',
        );
      }

      if (input.teamIds.length > 0) {
        let membershipResult;
        try {
          membershipResult = await callUser(accessToken).rpc('admin_replace_team_memberships', {
            p_profile_id: userId,
            p_team_ids: input.teamIds,
          });
        } catch {
          await admin.auth.admin.deleteUser(userId);
          throw new ApiError(
            503,
            'STAFF_INVITATION_FAILED',
            'The staff invitation could not be completed.',
          );
        }
        if (membershipResult.error) {
          await admin.auth.admin.deleteUser(userId);
          throw mapAdminRpcError(membershipResult.error);
        }
      }

      return { profileId: userId, role: input.role };
    },

    async updateStaffProfile(accessToken, profileId, input) {
      let result;
      try {
        result = await callUser(accessToken).rpc('admin_update_staff_profile', {
          p_profile_id: profileId,
          p_display_name: input.displayName ?? null,
          p_role: input.role ?? null,
          p_is_active: input.isActive ?? null,
          p_can_access_reporter_contacts: input.canAccessReporterContacts ?? null,
        });
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw mapAdminRpcError(result.error);
    },

    async replaceTeamMemberships(accessToken, profileId, teamIds) {
      let result;
      try {
        result = await callUser(accessToken).rpc('admin_replace_team_memberships', {
          p_profile_id: profileId,
          p_team_ids: teamIds,
        });
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw mapAdminRpcError(result.error);
    },

    async listConfiguration(accessToken) {
      let result;
      try {
        result = await callUser(accessToken)
          .from('configuration')
          .select('configuration_key,value,description,updated_at')
          .order('configuration_key', { ascending: true });
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw clientFieldError();

      return result.data.map((item) =>
        ConfigurationItemSchema.parse({
          key: item.configuration_key,
          value: item.value,
          description: item.description,
          updatedAt: item.updated_at,
        }),
      );
    },

    async upsertConfiguration(accessToken, actorId, key, input) {
      let result;
      try {
        result = await callUser(accessToken)
          .from('configuration')
          .upsert(
            {
              configuration_key: key,
              value: input.value,
              description: input.description,
              updated_by_profile_id: actorId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'configuration_key' },
          )
          .select('configuration_key,value,description,updated_at')
          .single();
      } catch {
        throw clientFieldError();
      }
      if (result.error || !result.data) throw clientFieldError();

      return ConfigurationItemSchema.parse({
        key: result.data.configuration_key,
        value: result.data.value,
        description: result.data.description,
        updatedAt: result.data.updated_at,
      });
    },

    async listPublicZones() {
      const client = environment.SUPABASE_SECRET_KEY
        ? createAdminClient()
        : createClient(projectUrl, publishableKey, { auth: clientAuthOptions });
      let result;
      try {
        result = await client
          .from('zones')
          .select('id,zone_code,name,description,is_demo,fictional_location_label')
          .order('name', { ascending: true });
      } catch {
        throw clientFieldError();
      }
      if (result.error || !result.data) throw clientFieldError();

      return result.data.map((row) =>
        PublicZoneSchema.parse({
          id: row.id,
          zoneCode: row.zone_code,
          name: row.name,
          description: row.description,
          isDemo: row.is_demo,
          fictionalLocationLabel: row.fictional_location_label ?? null,
        }),
      );
    },

    async submitPublicIncident(input) {
      const client = environment.SUPABASE_SECRET_KEY
        ? createAdminClient()
        : createClient(projectUrl, publishableKey, { auth: clientAuthOptions });

      const rawTrackingToken = input.trackingToken || randomBytes(16).toString('hex');
      const trackingTokenHash = createHash('sha256').update(rawTrackingToken).digest('hex');
      const idempotencyKeyHash = createHash('sha256').update(input.clientRequestId).digest('hex');

      let result;
      try {
        result = await client.rpc('submit_public_incident', {
          p_idempotency_key_sha256: `\\x${idempotencyKeyHash}`,
          p_tracking_token_sha256: `\\x${trackingTokenHash}`,
          p_category: input.category,
          p_summary: input.summary,
          p_zone_id: input.zoneId ?? null,
          p_landmark: input.landmark ?? null,
          p_location_source: input.locationSource,
          p_latitude: input.latitude ?? null,
          p_longitude: input.longitude ?? null,
          p_location_accuracy_m: input.locationAccuracyM ?? null,
          p_phone_e164:
            input.callbackPhone && input.callbackPhone.trim().length > 0
              ? input.callbackPhone.trim()
              : null,
          p_reported_at: input.reportedAt ? input.reportedAt : null,
        });
      } catch {
        throw clientFieldError();
      }

      if (result.error) {
        if (result.error.code === '23503') {
          throw new ApiError(400, 'INVALID_ZONE', 'The selected zone does not exist.');
        }
        throw clientFieldError();
      }

      const data = result.data as {
        incident_id: string;
        status: string;
        reported_at: string;
        category: string;
        summary: string;
        zone_id: string | null;
        zone_name?: string | null;
        landmark: string | null;
        is_idempotent_replay: boolean;
      };
      if (!data || !data.incident_id) throw clientFieldError();

      return PublicIncidentCreatedResponseSchema.parse({
        incidentId: data.incident_id,
        trackingToken: rawTrackingToken,
        status: data.status,
        reportedAt: data.reported_at,
        category: data.category,
        summary: data.summary,
        zoneId: data.zone_id ?? null,
        zoneName: data.zone_name ?? null,
        landmark: data.landmark ?? null,
        isIdempotentReplay: Boolean(data.is_idempotent_replay),
      });
    },

    async trackPublicIncident(trackingToken) {
      const client = environment.SUPABASE_SECRET_KEY
        ? createAdminClient()
        : createClient(projectUrl, publishableKey, { auth: clientAuthOptions });

      const trackingTokenHash = createHash('sha256').update(trackingToken).digest('hex');

      let result;
      try {
        result = await client.rpc('get_public_incident_tracking', {
          p_tracking_token_sha256: `\\x${trackingTokenHash}`,
        });
      } catch {
        throw clientFieldError();
      }

      if (result.error) {
        throw clientFieldError();
      }

      if (!result.data || typeof result.data !== 'object') {
        throw new ApiError(
          404,
          'INCIDENT_NOT_FOUND',
          'No incident found matching this tracking token. Please verify the code and try again.',
        );
      }

      const data = result.data as {
        incident_id: string;
        status: string;
        status_label: string;
        category: string;
        summary: string;
        reported_at: string;
        received_at: string;
        updated_at: string;
        zone_name?: string | null;
        landmark?: string | null;
      };

      return PublicIncidentTrackingResponseSchema.parse({
        incidentId: data.incident_id,
        status: data.status,
        statusLabel: data.status_label,
        category: data.category,
        summary: data.summary,
        reportedAt: data.reported_at,
        receivedAt: data.received_at,
        updatedAt: data.updated_at,
        zoneName: data.zone_name ?? null,
        landmark: data.landmark ?? null,
      });
    },
  };
}
