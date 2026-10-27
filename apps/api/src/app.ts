import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import {
  ApiErrorResponseSchema,
  ConfigurationItemSchema,
  ConfigurationUpsertSchema,
  HealthResponseSchema,
  StaffInviteInputSchema,
  StaffMemberSchema,
  StaffProfileSchema,
  StaffProfileUpdateSchema,
  TeamMembershipUpdateSchema,
  TeamSummarySchema,
} from '@godavari/shared';
import type { ApiEnvironment } from './env.js';
import { parseApiEnvironment } from './env.js';
import { ApiError } from './http/ApiError.js';
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

  const isKnownError = error instanceof ApiError;
  const statusCode = isKnownError ? error.statusCode : 500;
  const requestId = response.locals.requestId as string;
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

  const app = express();
  app.disable('x-powered-by');
  app.use(assignRequestId);
  app.use(express.json({ limit: '32kb' }));

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
      sendData(response, await service.listIncidents(session.accessToken));
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
