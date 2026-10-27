import { useEffect, useState } from 'react';
import { getHealth } from '../api/health.js';

type ConnectionState = 'checking' | 'reachable' | 'unavailable';

export function ApiStatus() {
  const [connection, setConnection] = useState<ConnectionState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    getHealth(controller.signal)
      .then(() => {
        if (isCurrent) setConnection('reachable');
      })
      .catch(() => {
        if (isCurrent) setConnection('unavailable');
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  const message = {
    checking: 'Checking local API',
    reachable: 'Local API reachable',
    unavailable: 'Local API unavailable',
  }[connection];

  return (
    <div className={`api-status api-status-${connection}`} role="status" aria-live="polite">
      <span className="api-status-dot" aria-hidden="true" />
      <span>{message}</span>
      <span className="api-status-context">Prototype connection only</span>
    </div>
  );
}
