import { HealthResponseSchema } from '@godavari/shared';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

export async function getHealth(signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { Accept: 'application/json' },
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw new Error('The local API health check failed.');
  }

  return HealthResponseSchema.parse(await response.json());
}
