import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import {
  ApiErrorResponseSchema,
  ConfigurationItemSchema,
  ConfigurationUpsertSchema,
  HealthResponseSchema,
  IncidentReviewInputSchema,
  OperatorCloseInputSchema,
  PaginatedIncidentListQuerySchema,
  PublicIncidentCreateInputSchema,
  PublicIncidentTrackingInputSchema,
  PublicZoneSchema,
  ResponderUpdateInputSchema,
  StaffInviteInputSchema,
  StaffMemberSchema,
  StaffProfileSchema,
  StaffProfileUpdateSchema,
  TeamAssignmentInputSchema,
  TeamMembershipUpdateSchema,
  TeamReassignmentInputSchema,
  TeamSummarySchema,
} from '@godavari/shared';
import type { ApiEnvironment } from './env.js';
import { parseApiEnvironment } from './env.js';
import { ApiError } from './http/ApiError.js';
import { createRateLimiter, type RateLimiterOptions } from './http/rate-limiter.js';
import {
  getAuthenticatedStaff,
  requireReporterContactPermission,
  requireRoles,
  requireStaff,
} from './auth/middleware.js';
import { StaffProfileIdSchema } from './auth/route-schemas.js';
import { createStaffApiService, type StaffApiService } from './services/staff-service.js';

interface CreateAppOptions {
  environment?: ApiEnvironment;
  service?: StaffApiService | null;
  rateLimiterOptions?: RateLimiterOptions;
  allowedOrigins?: string[];
}

function parseRequest<T>(
  schema: { safeParse(input: unknown): { success: boolean; data?: T } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success || result.data === undefined) {
    throw new ApiError(400, 'INVALID_REQUEST', 'The request data is invalid.');
  }
  return result.data;
}

function sendData(response: express.Response, data: unknown, statusCode = 200) {
  response.status(statusCode).json({ data, requestId: response.locals.requestId });
}

function staffSession(request: express.Request) {
  const session = getAuthenticatedStaff(request);
  if (!session) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'A valid staff access token is required.');
  }
  return session;
}

function routeUuid(value: string | string[] | undefined, message: string): string {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_IDENTIFIER', message);
  const result = StaffProfileIdSchema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_IDENTIFIER', message);
  return result.data;
}

const assignRequestId: RequestHandler = (_request, response, next) => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};

const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const requestId = response.locals.requestId as string;

  // Handle entity.too.large (Express body-parser 413)
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    const payload = ApiErrorResponseSchema.parse({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the 32KB size limit.',
        requestId,
      },
    });
    response.status(413).json(payload);
    return;
  }

  const isKnownError = error instanceof ApiError;
  const statusCode = isKnownError ? error.statusCode : 500;
  const payload = ApiErrorResponseSchema.parse({
    error: {
      code: isKnownError ? error.code : 'INTERNAL_ERROR',
      message: isKnownError ? error.message : 'An unexpected error occurred.',
      requestId,
    },
  });
  response.status(statusCode).json(payload);
};

export function createApp(options: CreateAppOptions = {}): Express {
  const environment = options.environment ?? parseApiEnvironment(process.env);
  const service =
    options.service === undefined ? createStaffApiService(environment) : options.service;
  const requireAuth = requireStaff(service);

  const allowedOrigins = options.allowedOrigins ?? [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const app = express();
  app.disable('x-powered-by');
  app.use(assignRequestId);

  // Stage 11: CORS restriction
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Request-Id, Accept',
      );
      response.setHeader('Access-Control-Max-Age', '86400');
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '32kb' }));

  // Stage 11: Public intake rate limiter
  const publicRateLimiter = createRateLimiter(options.rateLimiterOptions);

  app.get('/api/health', (_request, response) => {
    const health = HealthResponseSchema.parse({
      data: {
        status: 'ok',
        service: 'godavari-api',
        timestamp: new Date().toISOString(),
      },
      requestId: response.locals.requestId,
    });
    response.status(200).json(health);
  });

  app.get('/api/zones', async (_request, response) => {
    if (!service) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Zone catalogue is unavailable.');
    const zones = await service.listPublicZones();
    sendData(
      response,
      zones.map((zone) => PublicZoneSchema.parse(zone)),
    );
  });

  app.post('/api/incidents', publicRateLimiter, async (request, response) => {
    if (!service)
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Incident reporting is unavailable.');
    const input = parseRequest(PublicIncidentCreateInputSchema, request.body);
    const result = await service.submitPublicIncident(input);
    sendData(response, result, result.isIdempotentReplay ? 200 : 201);
  });

  app.post('/api/incidents/track', publicRateLimiter, async (request, response) => {
    if (!service)
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Incident tracking is unavailable.');
    const input = parseRequest(PublicIncidentTrackingInputSchema, request.body);
    const result = await service.trackPublicIncident(input.trackingToken);
    sendData(response, result, 200);
  });

  app.get('/api/auth/me', requireAuth, (request, response) => {
    sendData(response, StaffProfileSchema.parse(staffSession(request).profile));
  });

  app.get(
    '/api/staff/incidents',
    requireAuth,
    requireRoles('OPERATOR', 'RESPONDER'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');

      const hasQuery =
        request.query.status !== undefined ||
        request.query.category !== undefined ||
        request.query.priority !== undefined ||
        request.query.zoneId !== undefined ||
        request.query.search !== undefined ||
        request.query.page !== undefined ||
        request.query.limit !== undefined;

      const query = hasQuery
        ? parseRequest(PaginatedIncidentListQuerySchema, request.query)
        : undefined;

      const incidents = query
        ? await service.listIncidents(session.accessToken, query)
        : await service.listIncidents(session.accessToken);
      sendData(response, incidents);
    },
  );

  app.get(
    '/api/staff/incidents/:incidentId',
    requireAuth,
    requireRoles('OPERATOR', 'RESPONDER'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const detail = await service.getIncidentDetail(
        session.accessToken,
        incidentId,
        session.profile,
      );
      sendData(response, detail);
    },
  );

  app.patch(
    '/api/staff/incidents/:incidentId/review',
    requireAuth,
    requireRoles('OPERATOR'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const input = parseRequest(IncidentReviewInputSchema, request.body);
      const updated = await service.reviewIncident(
        session.accessToken,
        session.profile,
        incidentId,
        input,
      );
      sendData(response, updated);
    },
  );

  app.get(
    '/api/staff/incidents/:incidentId/eligible-teams',
    requireAuth,
    requireRoles('OPERATOR'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const eligible = await service.getEligibleTeams(
        session.accessToken,
        incidentId,
        session.profile,
      );
      sendData(response, eligible);
    },
  );

  app.post(
    '/api/staff/incidents/:incidentId/assignments',
    requireAuth,
    requireRoles('OPERATOR'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const input = parseRequest(TeamAssignmentInputSchema, request.body);
      const assignment = await service.assignTeam(
        session.accessToken,
        session.profile,
        incidentId,
        input,
      );
      sendData(response, assignment, 201);
    },
  );

  app.post(
    '/api/staff/incidents/:incidentId/reassign',
    requireAuth,
    requireRoles('OPERATOR'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const input = parseRequest(TeamReassignmentInputSchema, request.body);
      const reassignment = await service.reassignTeam(
        session.accessToken,
        session.profile,
        incidentId,
        input,
      );
      sendData(response, reassignment, 201);
    },
  );

  app.post(
    '/api/staff/escalations/scan',
    requireAuth,
    requireRoles('OPERATOR', 'ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const result = await service.scanEscalations(session.accessToken);
      sendData(response, result);
    },
  );

  app.post(
    '/api/staff/incidents/:incidentId/responder-actions',
    requireAuth,
    requireRoles('RESPONDER'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const input = parseRequest(ResponderUpdateInputSchema, request.body);
      const result = await service.responderUpdateIncident(
        session.accessToken,
        session.profile,
        incidentId,
        input,
      );
      sendData(response, result);
    },
  );

  app.post(
    '/api/staff/incidents/:incidentId/close',
    requireAuth,
    requireRoles('OPERATOR', 'ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const input = parseRequest(OperatorCloseInputSchema, request.body ?? {});
      const result = await service.operatorCloseIncident(
        session.accessToken,
        session.profile,
        incidentId,
        input,
      );
      sendData(response, result);
    },
  );

  app.get(
    '/api/staff/incidents/:incidentId/reporter-contact',
    requireAuth,
    requireRoles('OPERATOR', 'RESPONDER'),
    requireReporterContactPermission(),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const incidentId = routeUuid(request.params.incidentId, 'A valid incident ID is required.');
      const contact = await service.getReporterContact(session.accessToken, incidentId);
      if (!contact)
        throw new ApiError(404, 'CONTACT_NOT_FOUND', 'No accessible contact record was found.');
      sendData(response, contact);
    },
  );

  app.get('/api/admin/staff', requireAuth, requireRoles('ADMIN'), async (request, response) => {
    const session = staffSession(request);
    if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
    sendData(
      response,
      (await service.listStaff(session.accessToken)).map((member) =>
        StaffMemberSchema.parse(member),
      ),
    );
  });

  app.post(
    '/api/admin/staff/invitations',
    requireAuth,
    requireRoles('ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service)
        throw new ApiError(
          503,
          'STAFF_INVITATIONS_NOT_CONFIGURED',
          'Staff invitations are not configured.',
        );
      const input = parseRequest(StaffInviteInputSchema, request.body);
      const result = await service.inviteStaff(session.profile, session.accessToken, input);
      sendData(response, result, 202);
    },
  );

  app.patch(
    '/api/admin/staff/:profileId',
    requireAuth,
    requireRoles('ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const profileId = routeUuid(
        request.params.profileId,
        'A valid staff profile ID is required.',
      );
      if (profileId === session.profile.id) {
        throw new ApiError(
          403,
          'SELF_MANAGEMENT_NOT_ALLOWED',
          'Administrators cannot change their own profile.',
        );
      }
      const input = parseRequest(StaffProfileUpdateSchema, request.body);
      await service.updateStaffProfile(session.accessToken, profileId, input);
      sendData(response, { updated: true });
    },
  );

  app.put(
    '/api/admin/staff/:profileId/teams',
    requireAuth,
    requireRoles('ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const profileId = routeUuid(
        request.params.profileId,
        'A valid staff profile ID is required.',
      );
      if (profileId === session.profile.id) {
        throw new ApiError(
          403,
          'SELF_MANAGEMENT_NOT_ALLOWED',
          'Administrators cannot change their own team membership.',
        );
      }
      const input = parseRequest(TeamMembershipUpdateSchema, request.body);
      await service.replaceTeamMemberships(session.accessToken, profileId, input.teamIds);
      sendData(response, { updated: true });
    },
  );

  app.get('/api/admin/teams', requireAuth, requireRoles('ADMIN'), async (request, response) => {
    const session = staffSession(request);
    if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
    sendData(
      response,
      (await service.listTeams(session.accessToken)).map((team) => TeamSummarySchema.parse(team)),
    );
  });

  app.get(
    '/api/admin/configuration',
    requireAuth,
    requireRoles('ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      sendData(
        response,
        (await service.listConfiguration(session.accessToken)).map((item) =>
          ConfigurationItemSchema.parse(item),
        ),
      );
    },
  );

  app.put(
    '/api/admin/configuration/:key',
    requireAuth,
    requireRoles('ADMIN'),
    async (request, response) => {
      const session = staffSession(request);
      if (!service) throw new ApiError(503, 'STAFF_DATA_UNAVAILABLE', 'Staff data is unavailable.');
      const key = routeUuidOrConfigurationKey(request.params.key);
      const input = parseRequest(ConfigurationUpsertSchema, request.body);
      const saved = await service.upsertConfiguration(
        session.accessToken,
        session.profile.id,
        key,
        input,
      );
      sendData(response, ConfigurationItemSchema.parse(saved));
    },
  );

  app.use((_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'The requested API route was not found.'));
  });
  app.use(handleError);

  return app;
}

function routeUuidOrConfigurationKey(value: string | string[] | undefined): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_CONFIGURATION_KEY', 'The configuration key is invalid.');
  }
  const result = ConfigurationUpsertKeySchema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'INVALID_CONFIGURATION_KEY', 'The configuration key is invalid.');
  return result.data;
}

const ConfigurationUpsertKeySchema = ConfigurationItemSchema.shape.key;
