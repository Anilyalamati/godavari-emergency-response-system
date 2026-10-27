const url = process.argv[2] ?? 'http://127.0.0.1:4000/api/health';

try {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  const expectedKeys = ['data', 'requestId'];
  const expectedDataKeys = ['service', 'status', 'timestamp'];
  const keysMatch = (actual, expected) =>
    JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify([...expected].sort());

  if (
    !response.ok ||
    !keysMatch(payload, expectedKeys) ||
    !keysMatch(payload.data, expectedDataKeys) ||
    payload.data.status !== 'ok' ||
    payload.data.service !== 'godavari-api' ||
    !Number.isFinite(Date.parse(payload.data.timestamp)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.requestId,
    )
  ) {
    throw new Error('The health response did not match the expected secret-free contract.');
  }

  console.log(`API health check passed at ${url} (request ID ${payload.requestId}).`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown connection error.';
  console.error(`API health check failed: ${message}`);
  process.exitCode = 1;
}
