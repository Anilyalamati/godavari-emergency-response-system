import { z } from 'zod';

export const RequestIdSchema = z.string().uuid();

export const HealthResponseSchema = z
  .object({
    data: z
      .object({
        status: z.literal('ok'),
        service: z.literal('godavari-api'),
        timestamp: z.string().datetime(),
      })
      .strict(),
    requestId: RequestIdSchema,
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: RequestIdSchema,
      })
      .strict(),
  })
  .strict();

export const StaffRoleSchema = z.enum(['ADMIN', 'OPERATOR', 'RESPONDER']);

export const StaffProfileSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    displayName: z.string().min(1).max(120),
    role: StaffRoleSchema,
    isActive: z.boolean(),
    canAccessReporterContacts: z.boolean(),
  })
  .strict();

const optionalBrowserEnvironmentValue = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const BrowserSupabaseConfigSchema = z
  .object({
    url: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().url().optional(),
    ),
    publishableKey: optionalBrowserEnvironmentValue,
  })
  .superRefine((environment, context) => {
    if (Boolean(environment.url) !== Boolean(environment.publishableKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'The Supabase URL and publishable key must be configured together.',
      });
    }
  });

export const IncidentCategorySchema = z.enum([
  'MEDICAL_ASSISTANCE',
  'CROWD_SAFETY',
  'LOST_PERSON',
  'INFRASTRUCTURE',
  'OTHER',
]);
export const IncidentPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const IncidentStatusSchema = z.enum([
  'REPORTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'EN_ROUTE',
  'ON_SCENE',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
  'CANCELLED',
]);
export const LocationSourceSchema = z.enum([
  'GPS',
  'MAP_PIN',
  'LANDMARK',
  'VERBAL',
  'NOT_PROVIDED',
]);

export const IncidentSummarySchema = z
  .object({
    id: z.string().uuid(),
    category: IncidentCategorySchema,
    priority: IncidentPrioritySchema,
    status: IncidentStatusSchema,
    summary: z.string().min(1).max(4000),
    reportedAt: z.string().datetime({ offset: true }),
    zoneId: z.string().uuid().nullable(),
    locationSource: LocationSourceSchema,
    landmark: z.string().max(240).nullable(),
    isDemo: z.boolean(),
  })
  .strict();

export const ReporterContactSchema = z
  .object({
    contactName: z.string().max(160).nullable(),
    phoneE164: z.string().nullable(),
    emailAddress: z.string().email().nullable(),
    preferredContactMethod: z.enum(['PHONE', 'SMS', 'EMAIL', 'NONE']),
  })
  .strict();

export const StaffMemberSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().min(1).max(120),
    role: StaffRoleSchema,
    isActive: z.boolean(),
    canAccessReporterContacts: z.boolean(),
    teamIds: z.array(z.string().uuid()),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const StaffInviteInputSchema = z
  .object({
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
    role: StaffRoleSchema,
    canAccessReporterContacts: z.boolean().default(false),
    teamIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamIds'],
        message: 'Team IDs must be unique.',
      });
    }
  });

export const StaffProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: StaffRoleSchema.optional(),
    isActive: z.boolean().optional(),
    canAccessReporterContacts: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one profile field must be supplied.',
  });

export const TeamMembershipUpdateSchema = z
  .object({
    teamIds: z.array(z.string().uuid()).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamIds'],
        message: 'Team IDs must be unique.',
      });
    }
  });

export const TeamSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().min(1).max(16),
    name: z.string().min(1).max(120),
    isDemo: z.boolean(),
  })
  .strict();

export const ConfigurationItemSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
    value: z.record(z.string(), z.unknown()),
    description: z.string().trim().min(1).max(500),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const ConfigurationUpsertSchema = z
  .object({
    value: z.record(z.string(), z.unknown()),
    description: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((input, context) => {
    try {
      if (new TextEncoder().encode(JSON.stringify(input.value)).byteLength > 16_384) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Configuration value is too large.',
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Configuration value must be JSON serializable.',
      });
    }
  });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type StaffRole = z.infer<typeof StaffRoleSchema>;
export type StaffProfile = z.infer<typeof StaffProfileSchema>;
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
export type ReporterContact = z.infer<typeof ReporterContactSchema>;
export type StaffMember = z.infer<typeof StaffMemberSchema>;
export type StaffInviteInput = z.infer<typeof StaffInviteInputSchema>;
export type StaffProfileUpdate = z.infer<typeof StaffProfileUpdateSchema>;
export type TeamMembershipUpdate = z.infer<typeof TeamMembershipUpdateSchema>;
export type TeamSummary = z.infer<typeof TeamSummarySchema>;
export type ConfigurationItem = z.infer<typeof ConfigurationItemSchema>;
export type ConfigurationUpsert = z.infer<typeof ConfigurationUpsertSchema>;
