import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ConfigurationItemSchema,
  IncidentSummarySchema,
  ReporterContactSchema,
  StaffMemberSchema,
  StaffProfileSchema,
  TeamSummarySchema,
  type ConfigurationItem,
  type ConfigurationUpsert,
  type IncidentSummary,
  type ReporterContact,
  type StaffInviteInput,
  type StaffMember,
  type StaffProfile,
  type StaffProfileUpdate,
  type TeamSummary,
} from '@godavari/shared';
import type { ApiEnvironment } from '../env.js';
import { ApiError } from '../http/ApiError.js';

export interface StaffApiService {
  authenticate(accessToken: string): Promise<StaffProfile>;
  listIncidents(accessToken: string): Promise<IncidentSummary[]>;
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

    async listIncidents(accessToken) {
      let result;
      try {
        result = await callUser(accessToken)
          .from('incidents')
          .select(
            'id,category,priority,status,summary,reported_at,zone_id,location_source,landmark,is_demo',
          )
          .order('reported_at', { ascending: false })
          .limit(100);
      } catch {
        throw clientFieldError();
      }
      if (result.error) throw clientFieldError();

      return result.data.map((row) =>
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
          isDemo: row.is_demo,
        }),
      );
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
  };
}
