import {
  PublicIncidentCreatedResponseSchema,
  PublicIncidentTrackingResponseSchema,
  PublicZoneSchema,
  type PublicIncidentCreateInput,
  type PublicIncidentCreatedResponse,
  type PublicIncidentTrackingResponse,
  type PublicZone,
} from '@godavari/shared';

const apiBaseUrl = (import.meta.env.VITE_PUBLIC_API_BASE_URL || '/api').replace(/\/$/, '');

export class IncidentSubmissionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IncidentSubmissionError';
  }
}

export async function getPublicZones(signal?: AbortSignal): Promise<PublicZone[]> {
  const response = await fetch(`${apiBaseUrl}/zones`, {
    headers: { Accept: 'application/json' },
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw new Error('Could not load the zones catalogue.');
  }

  const payload = await response.json();
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : payload;
  return PublicZoneSchema.array().parse(data);
}

export async function submitIncident(
  input: PublicIncidentCreateInput,
): Promise<PublicIncidentCreatedResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new IncidentSubmissionError(
      'NETWORK_FAILURE',
      'Could not reach the emergency reporting service. Check your connection or call 112 immediately.',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let message = 'Your report could not be submitted. Please retry or call 112.';
    let code = 'SUBMISSION_FAILED';

    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const err = (payload as { error?: { code?: unknown; message?: unknown } }).error;
      if (typeof err?.message === 'string') message = err.message;
      if (typeof err?.code === 'string') code = err.code;
    }

    throw new IncidentSubmissionError(code, message);
  }

  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : payload;
  return PublicIncidentCreatedResponseSchema.parse(data);
}

export class IncidentTrackingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IncidentTrackingError';
  }
}

export async function trackIncident(
  trackingToken: string,
  signal?: AbortSignal,
): Promise<PublicIncidentTrackingResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/incidents/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ trackingToken }),
      signal: signal ?? null,
    });
  } catch {
    throw new IncidentTrackingError(
      'NETWORK_FAILURE',
      'Could not connect to the tracking service. Please check your connection and retry.',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let message = 'No incident report was found matching this tracking token.';
    let code = 'TRACKING_FAILED';
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const err = (payload as { error?: { code?: unknown; message?: unknown } }).error;
      if (typeof err?.message === 'string') message = err.message;
      if (typeof err?.code === 'string') code = err.code;
    }
    throw new IncidentTrackingError(code, message);
  }

  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : payload;
  return PublicIncidentTrackingResponseSchema.parse(data);
}
