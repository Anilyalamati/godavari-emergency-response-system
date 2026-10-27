import type { RequestHandler } from 'express';
import type { StaffProfile, StaffRole } from '@godavari/shared';
import { ApiError } from '../http/ApiError.js';
import type { StaffApiService } from '../services/staff-service.js';

export type AuthenticatedStaffRequest = {
  profile: StaffProfile;
  accessToken: string;
};

type ExpressRequest = Parameters<RequestHandler>[0];
const staffContext = new WeakMap<ExpressRequest, AuthenticatedStaffRequest>();

export function getAuthenticatedStaff(
  request: ExpressRequest,
): AuthenticatedStaffRequest | undefined {
  return staffContext.get(request);
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export function requireStaff(service: StaffApiService | null): RequestHandler {
  return async (request, _response, next) => {
    const accessToken = bearerToken(request.header('authorization'));
    if (!accessToken) {
      next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'A valid staff access token is required.'));
      return;
    }

    if (!service) {
      next(
        new ApiError(
          503,
          'AUTH_PROVIDER_UNAVAILABLE',
          'Staff authentication is not configured for this application.',
        ),
      );
      return;
    }

    try {
      const profile = await service.authenticate(accessToken);
      staffContext.set(request, { profile, accessToken });
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRoles(...allowedRoles: StaffRole[]): RequestHandler {
  return (request, _response, next) => {
    const staff = getAuthenticatedStaff(request);
    if (!staff) {
      next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'A valid staff access token is required.'));
      return;
    }

    if (!allowedRoles.includes(staff.profile.role)) {
      next(
        new ApiError(403, 'ROLE_NOT_AUTHORIZED', 'This account is not authorized for this action.'),
      );
      return;
    }
    next();
  };
}

export function requireReporterContactPermission(): RequestHandler {
  return (request, _response, next) => {
    const staff = getAuthenticatedStaff(request);
    if (!staff) {
      next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'A valid staff access token is required.'));
      return;
    }

    if (!staff.profile.canAccessReporterContacts) {
      next(
        new ApiError(
          403,
          'REPORTER_CONTACT_PERMISSION_REQUIRED',
          'Explicit operational permission is required to access reporter contact details.',
        ),
      );
      return;
    }
    next();
  };
}
