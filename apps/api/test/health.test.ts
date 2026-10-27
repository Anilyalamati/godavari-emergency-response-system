import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ApiErrorResponseSchema, HealthResponseSchema } from '@godavari/shared';
import { createApp } from '../src/app.js';
import { parseApiEnvironment } from '../src/env.js';

const app = createApp();

describe('API foundation', () => {
  it('returns a secret-free, schema-valid health response with a server request ID', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(HealthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(response.body).not.toHaveProperty('apiKey');
    expect(response.body).not.toHaveProperty('environment');
  });

  it('does not trust a client-provided request ID', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'client-controlled')
      .expect(200);

    expect(response.body.requestId).not.toBe('client-controlled');
    expect(randomUUID()).not.toBe(response.body.requestId);
  });

  it('formats unknown API routes using the shared error contract', async () => {
    const response = await request(app).get('/api/not-a-route').expect(404);

    expect(ApiErrorResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  });

  it('validates API environment values and supplies local defaults', () => {
    expect(parseApiEnvironment({}).API_PORT).toBe(4000);
    expect(() => parseApiEnvironment({ API_PORT: '80' })).toThrow();
  });
});
