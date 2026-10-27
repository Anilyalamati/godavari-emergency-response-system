import { z } from 'zod';
import {
  ConfigurationUpsertSchema,
  RequestIdSchema,
  StaffInviteInputSchema,
  StaffProfileUpdateSchema,
  TeamMembershipUpdateSchema,
} from '@godavari/shared';

export const StaffProfileIdSchema = RequestIdSchema;
export const StaffInviteBodySchema = StaffInviteInputSchema;
export const StaffUpdateBodySchema = StaffProfileUpdateSchema;
export const TeamMembershipBodySchema = TeamMembershipUpdateSchema;
export const ConfigurationBodySchema = ConfigurationUpsertSchema;
export const ConfigurationKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/);
