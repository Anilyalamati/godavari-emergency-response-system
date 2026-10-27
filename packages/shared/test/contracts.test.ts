import { describe, expect, it } from 'vitest';
import { ApiErrorResponseSchema, HealthResponseSchema } from '../src/index.js';

const requestId = '3c2c4511-22b9-4bcb-a548-5e9c125b8a04';

describe('shared API contracts', () => {
  it('accepts a health response with a server-generated timestamp and request ID', () => {
    expect(
      HealthResponseSchema.safeParse({
        data: {
          status: 'ok',
          service: 'godavari-api',
          timestamp: '2026-10-26T12:00:00.000Z',
        },
        requestId,
      }).success,
    ).toBe(true);
  });

  it('rejects a health response that includes a secret-bearing field', () => {
    expect(
      HealthResponseSchema.safeParse({
        data: {
          status: 'ok',
          service: 'godavari-api',
          timestamp: '2026-10-26T12:00:00.000Z',
          apiKey: 'must-not-be-returned',
        },
        requestId,
      }).success,
    ).toBe(false);
  });

  it('requires a valid request ID in a common error response', () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found', requestId },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'client-value' },
      }).success,
    ).toBe(false);
  });
});
