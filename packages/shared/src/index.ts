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
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    locationAccuracyM: z.number().nullable().optional(),
    locationCapturedAt: z.string().datetime({ offset: true }).nullable().optional(),
    locationIsFictional: z.boolean().optional(),
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

/* ── Stage 4: Public emergency reporting schemas ── */

export const PublicZoneSchema = z
  .object({
    id: z.string().uuid(),
    zoneCode: z.string().min(1).max(16),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    isDemo: z.boolean(),
    fictionalLocationLabel: z.string().nullable(),
  })
  .strict();

export const PublicIncidentCreateInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    category: IncidentCategorySchema,
    summary: z.string().trim().min(3, 'Provide a description of at least 3 characters.').max(4000),
    zoneId: z.string().uuid().nullable().optional(),
    landmark: z.string().trim().max(240).nullable().optional(),
    callbackPhone: z
      .string()
      .trim()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        'Enter a valid international phone number starting with + (e.g. +919876543210)',
      )
      .nullable()
      .optional()
      .or(z.literal('')),
    locationSource: LocationSourceSchema,
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    locationAccuracyM: z.number().min(0).nullable().optional(),
    reportedAt: z.string().datetime({ offset: true }).optional(),
    trackingToken: z.string().min(16).max(64).optional(),
    locationConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm the incident location before submitting.' }),
    }),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.locationSource === 'GPS' || input.locationSource === 'MAP_PIN') {
      if (
        input.latitude === null ||
        input.latitude === undefined ||
        input.longitude === null ||
        input.longitude === undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['latitude'],
          message: 'Coordinates are required when location source is GPS or MAP_PIN.',
        });
      }
    }
    const hasZone = Boolean(input.zoneId);
    const hasLandmark = Boolean(input.landmark && input.landmark.trim().length > 0);
    const hasGps = input.latitude !== null && input.latitude !== undefined;
    if (!hasZone && !hasLandmark && !hasGps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zoneId'],
        message: 'Please provide at least a zone, landmark, or GPS location.',
      });
    }
  });

export const PublicIncidentCreatedResponseSchema = z
  .object({
    incidentId: z.string().uuid(),
    trackingToken: z.string().min(16),
    status: IncidentStatusSchema,
    reportedAt: z.string().datetime({ offset: true }),
    category: IncidentCategorySchema,
    summary: z.string(),
    zoneId: z.string().uuid().nullable(),
    zoneName: z.string().nullable().optional(),
    landmark: z.string().nullable(),
    isIdempotentReplay: z.boolean(),
  })
  .strict();

/* ── Stage 10: Public tracking schemas ── */

export const PublicIncidentTrackingInputSchema = z
  .object({
    trackingToken: z
      .string()
      .trim()
      .min(16, 'Tracking token must be at least 16 characters.')
      .max(64, 'Tracking token exceeds maximum length.')
      .regex(/^[a-fA-F0-9]+$/, 'Tracking token must be a hexadecimal string.'),
  })
  .strict();

export const PublicIncidentTrackingResponseSchema = z
  .object({
    incidentId: z.string().uuid(),
    status: IncidentStatusSchema,
    statusLabel: z.string().min(1),
    category: IncidentCategorySchema,
    summary: z.string(),
    reportedAt: z.string().datetime({ offset: true }),
    receivedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    zoneName: z.string().nullable().optional(),
    landmark: z.string().nullable().optional(),
  })
  .strict();

/* ── Stage 5: Control-room incident review schemas ── */

export const IncidentEventTypeSchema = z.enum([
  'REPORT_CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_ACKNOWLEDGED',
  'ASSIGNMENT_SUPERSEDED',
  'ACKNOWLEDGEMENT_OVERDUE',
  'LOCATION_UPDATED',
  'CONTACT_UPDATED',
  'DUPLICATE_LINKED',
  'DEMO_SEEDED',
]);

export const IncidentEventSchema = z
  .object({
    id: z.string().uuid(),
    incidentId: z.string().uuid(),
    actorProfileId: z.string().uuid().nullable(),
    actorDisplayName: z.string().nullable().optional(),
    eventType: IncidentEventTypeSchema,
    statusBefore: IncidentStatusSchema.nullable(),
    statusAfter: IncidentStatusSchema.nullable(),
    notes: z.string().nullable().optional(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const IncidentActiveAssignmentSchema = z
  .object({
    id: z.string().uuid(),
    teamId: z.string().uuid(),
    teamCode: z.string(),
    teamName: z.string(),
    status: z.enum(['PENDING', 'ACKNOWLEDGED', 'DECLINED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED']),
    assignedAt: z.string().datetime({ offset: true }),
    acknowledgementDeadline: z.string().datetime({ offset: true }),
    isOverdue: z.boolean().default(false),
    escalatedAt: z.string().datetime({ offset: true }).nullable().optional(),
    reassignmentReason: z.string().nullable().optional(),
  })
  .strict();

export const IncidentDetailSchema = z
  .object({
    id: z.string().uuid(),
    category: IncidentCategorySchema,
    priority: IncidentPrioritySchema,
    status: IncidentStatusSchema,
    summary: z.string().min(1).max(4000),
    reportedAt: z.string().datetime({ offset: true }),
    zoneId: z.string().uuid().nullable(),
    zoneName: z.string().nullable().optional(),
    zoneCode: z.string().nullable().optional(),
    locationSource: LocationSourceSchema,
    landmark: z.string().max(240).nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    locationAccuracyM: z.number().nullable(),
    locationCapturedAt: z.string().datetime({ offset: true }).nullable(),
    locationIsFictional: z.boolean(),
    isDemo: z.boolean(),
    duplicateOfIncidentId: z.string().uuid().nullable(),
    reviewNotes: z.string().max(4000).nullable(),
    cancellationReason: z.string().max(1000).nullable(),
    reviewedByProfileId: z.string().uuid().nullable(),
    reviewedByName: z.string().nullable().optional(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    outcome: z.string().max(2000).nullable().optional(),
    events: z.array(IncidentEventSchema),
    reporterContact: ReporterContactSchema.nullable().optional(),
    activeAssignment: IncidentActiveAssignmentSchema.nullable().optional(),
  })
  .strict();

export const IncidentReviewInputSchema = z
  .object({
    status: IncidentStatusSchema.optional(),
    priority: IncidentPrioritySchema.optional(),
    reviewNotes: z.string().trim().max(4000).optional(),
    duplicateOfIncidentId: z.string().uuid().nullable().optional(),
    cancellationReason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.status === undefined &&
      input.priority === undefined &&
      input.reviewNotes === undefined &&
      input.duplicateOfIncidentId === undefined &&
      input.cancellationReason === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one review change must be provided.',
      });
    }
    if (
      input.status === 'CANCELLED' &&
      (!input.cancellationReason || input.cancellationReason.trim().length === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cancellationReason'],
        message: 'A cancellation reason is required when cancelling an incident.',
      });
    }
    if (input.status === 'DUPLICATE' && !input.duplicateOfIncidentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['duplicateOfIncidentId'],
        message: 'Target incident ID is required when marking an incident as duplicate.',
      });
    }
  });

export const PaginatedIncidentListQuerySchema = z
  .object({
    status: IncidentStatusSchema.optional(),
    category: IncidentCategorySchema.optional(),
    priority: IncidentPrioritySchema.optional(),
    zoneId: z.string().uuid().optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const PaginatedIncidentListResponseSchema = z
  .object({
    data: z.array(IncidentSummarySchema),
    pagination: z
      .object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1),
        total: z.number().int().min(0),
        totalPages: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

/* ── Stage 6: Response-team assignment schemas ── */

export const TeamDutyStatusSchema = z.enum(['ON_DUTY', 'OFF_DUTY', 'STANDBY']);

export const TeamCandidateSchema = z
  .object({
    id: z.string().uuid(),
    teamCode: z.string().min(1).max(16),
    name: z.string().min(1).max(120),
    capabilities: z.array(z.string()),
    dutyStatus: TeamDutyStatusSchema,
    serviceZones: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        zoneCode: z.string(),
      }),
    ),
    isAvailable: z.boolean(),
    activeAssignment: z
      .object({
        incidentId: z.string().uuid(),
        status: z.string(),
      })
      .nullable(),
    isEligible: z.boolean(),
    isRecommended: z.boolean(),
    suitabilityScore: z.number(),
    reasons: z.array(z.string()),
  })
  .strict();

export const EligibleTeamsResponseSchema = z
  .object({
    incidentId: z.string().uuid(),
    incidentCategory: IncidentCategorySchema,
    incidentZoneId: z.string().uuid().nullable(),
    incidentZoneName: z.string().nullable().optional(),
    teams: z.array(TeamCandidateSchema),
  })
  .strict();

export const TeamAssignmentInputSchema = z
  .object({
    teamId: z.string().uuid(),
    acknowledgementDeadlineMinutes: z.number().int().min(1).max(120).default(15),
    acknowledgementDeadlineSeconds: z.number().int().min(30).max(7200).optional(),
  })
  .strict();

export const TeamAssignmentResultSchema = z
  .object({
    assignmentId: z.string().uuid(),
    incidentId: z.string().uuid(),
    teamId: z.string().uuid(),
    teamCode: z.string(),
    teamName: z.string(),
    status: z.enum(['PENDING', 'ACKNOWLEDGED', 'DECLINED', 'COMPLETED', 'CANCELLED']),
    assignedAt: z.string().datetime({ offset: true }),
    acknowledgementDeadline: z.string().datetime({ offset: true }),
    incidentStatus: IncidentStatusSchema,
  })
  .strict();

/* ── Stage 7: Responder workflow schemas ── */

export const ResponderActionSchema = z.enum([
  'ACKNOWLEDGE',
  'EN_ROUTE',
  'ON_SCENE',
  'REQUEST_SUPPORT',
  'RESOLVE',
]);

export const ResponderUpdateInputSchema = z
  .object({
    action: ResponderActionSchema,
    notes: z.string().trim().max(1000).optional(),
    outcome: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === 'RESOLVE' && (!input.outcome || input.outcome.trim().length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'A short resolution outcome description is required.',
      });
    }
    if (input.action === 'REQUEST_SUPPORT' && (!input.notes || input.notes.trim().length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Please provide notes explaining the additional support required.',
      });
    }
  });

export const ResponderUpdateResultSchema = z
  .object({
    incidentId: z.string().uuid(),
    incidentStatus: IncidentStatusSchema,
    assignmentId: z.string().uuid(),
    assignmentStatus: z.string(),
    action: z.string().optional(),
    supportRequested: z.boolean().optional(),
    notes: z.string().optional(),
    isRepeat: z.boolean().optional(),
  })
  .strict();

export const OperatorCloseInputSchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const OperatorCloseResultSchema = z
  .object({
    incidentId: z.string().uuid(),
    incidentStatus: z.literal('CLOSED'),
    closedAt: z.string().datetime({ offset: true }).optional(),
    isRepeat: z.boolean().optional(),
  })
  .strict();

/* ── Stage 8: Missed-acknowledgement escalation schemas ── */

export const TeamReassignmentInputSchema = z
  .object({
    newTeamId: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(3, 'A reason for reassignment is required (minimum 3 characters).')
      .max(1000),
    acknowledgementDeadlineMinutes: z.number().int().min(1).max(120).optional(),
    acknowledgementDeadlineSeconds: z.number().int().min(30).max(7200).optional(),
  })
  .strict();

export const TeamReassignmentResultSchema = z
  .object({
    incidentId: z.string().uuid(),
    supersededAssignmentId: z.string().uuid(),
    supersededTeamCode: z.string().optional(),
    newAssignmentId: z.string().uuid(),
    newTeamId: z.string().uuid(),
    newTeamCode: z.string(),
    newTeamName: z.string(),
    status: z.string(),
    assignedAt: z.string().datetime({ offset: true }),
    acknowledgementDeadline: z.string().datetime({ offset: true }),
    incidentStatus: IncidentStatusSchema,
    reassignmentReason: z.string(),
  })
  .strict();

export const EscalationScanResultSchema = z
  .object({
    scannedAt: z.string().datetime({ offset: true }),
    escalatedCount: z.number().int().min(0),
    escalatedAssignmentIds: z.array(z.string().uuid()),
  })
  .strict();

export const MapTileConfigSchema = z
  .object({
    tileUrl: z.string().min(1),
    attribution: z.string().min(1),
    maxZoom: z.number().int().min(1).max(22).default(19),
    defaultCenter: z.tuple([z.number(), z.number()]).default([17.001, 81.78]),
    defaultZoom: z.number().int().min(1).max(22).default(15),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type StaffRole = z.infer<typeof StaffRoleSchema>;
export type StaffProfile = z.infer<typeof StaffProfileSchema>;
export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;
export type IncidentPriority = z.infer<typeof IncidentPrioritySchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type LocationSource = z.infer<typeof LocationSourceSchema>;
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
export type ReporterContact = z.infer<typeof ReporterContactSchema>;
export type StaffMember = z.infer<typeof StaffMemberSchema>;
export type StaffInviteInput = z.infer<typeof StaffInviteInputSchema>;
export type StaffProfileUpdate = z.infer<typeof StaffProfileUpdateSchema>;
export type TeamMembershipUpdate = z.infer<typeof TeamMembershipUpdateSchema>;
export type TeamSummary = z.infer<typeof TeamSummarySchema>;
export type ConfigurationItem = z.infer<typeof ConfigurationItemSchema>;
export type ConfigurationUpsert = z.infer<typeof ConfigurationUpsertSchema>;
export type PublicZone = z.infer<typeof PublicZoneSchema>;
export type PublicIncidentCreateInput = z.infer<typeof PublicIncidentCreateInputSchema>;
export type PublicIncidentCreatedResponse = z.infer<typeof PublicIncidentCreatedResponseSchema>;
export type IncidentEventType = z.infer<typeof IncidentEventTypeSchema>;
export type IncidentEvent = z.infer<typeof IncidentEventSchema>;
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>;
export type IncidentActiveAssignment = z.infer<typeof IncidentActiveAssignmentSchema>;
export type IncidentReviewInput = z.infer<typeof IncidentReviewInputSchema>;
export type PaginatedIncidentListQuery = z.infer<typeof PaginatedIncidentListQuerySchema>;
export type PaginatedIncidentListResponse = z.infer<typeof PaginatedIncidentListResponseSchema>;
export type TeamDutyStatus = z.infer<typeof TeamDutyStatusSchema>;
export type TeamCandidate = z.infer<typeof TeamCandidateSchema>;
export type EligibleTeamsResponse = z.infer<typeof EligibleTeamsResponseSchema>;
export type TeamAssignmentInput = z.infer<typeof TeamAssignmentInputSchema>;
export type TeamAssignmentResult = z.infer<typeof TeamAssignmentResultSchema>;
export type ResponderAction = z.infer<typeof ResponderActionSchema>;
export type ResponderUpdateInput = z.infer<typeof ResponderUpdateInputSchema>;
export type ResponderUpdateResult = z.infer<typeof ResponderUpdateResultSchema>;
export type OperatorCloseInput = z.infer<typeof OperatorCloseInputSchema>;
export type OperatorCloseResult = z.infer<typeof OperatorCloseResultSchema>;
export type TeamReassignmentInput = z.infer<typeof TeamReassignmentInputSchema>;
export type TeamReassignmentResult = z.infer<typeof TeamReassignmentResultSchema>;
export type EscalationScanResult = z.infer<typeof EscalationScanResultSchema>;
export type MapTileConfig = z.infer<typeof MapTileConfigSchema>;
export type PublicIncidentTrackingInput = z.infer<typeof PublicIncidentTrackingInputSchema>;
export type PublicIncidentTrackingResponse = z.infer<typeof PublicIncidentTrackingResponseSchema>;
