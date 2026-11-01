import type { IncidentCategory, LocationSource } from '@godavari/shared';

export type QueueStatus = 'DRAFT_LOCAL' | 'SENDING' | 'RECEIVED' | 'FAILED';

export interface QueuedReport {
  clientRequestId: string;
  trackingToken: string;
  createdAt: string; // ISO string when draft/report was first created locally
  status: QueueStatus;
  category: IncidentCategory;
  summary: string;
  zoneId?: string | undefined;
  zoneName?: string | undefined;
  landmark?: string | undefined;
  callbackPhone?: string | undefined;
  locationSource: LocationSource;
  latitude?: number | undefined;
  longitude?: number | undefined;
  locationAccuracyM?: number | undefined;
  locationConfirmed: boolean;
  serverIncidentId?: string | undefined;
  reportedAt?: string | undefined;
  lastAttemptAt?: string | undefined;
  lastError?: string | undefined;
  retryCount: number;
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  DRAFT_LOCAL: 'Draft saved locally — not sent',
  SENDING: 'Sending',
  RECEIVED: 'Received by server',
  FAILED: 'Failed — not sent',
};

const DB_NAME = 'godavari_emergency_queue_v1';
const STORE_NAME = 'queued_reports';
const DB_VERSION = 1;

// In-memory fallback if IndexedDB is blocked or unavailable
const memoryStore: Map<string, QueuedReport> = new Map();

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'clientRequestId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveQueuedReport(report: QueuedReport): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memoryStore.set(report.clientRequestId, report);
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(report);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch {
      memoryStore.set(report.clientRequestId, report);
      resolve();
    }
  });
}

export async function getQueuedReport(clientRequestId: string): Promise<QueuedReport | null> {
  const db = await openDatabase();
  if (!db) {
    return memoryStore.get(clientRequestId) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(clientRequestId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(memoryStore.get(clientRequestId) ?? null);
    } catch {
      resolve(memoryStore.get(clientRequestId) ?? null);
    }
  });
}

export async function listQueuedReports(): Promise<QueuedReport[]> {
  const db = await openDatabase();
  if (!db) {
    return Array.from(memoryStore.values());
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve(Array.from(memoryStore.values()));
    } catch {
      resolve(Array.from(memoryStore.values()));
    }
  });
}

export async function deleteQueuedReport(clientRequestId: string): Promise<void> {
  memoryStore.delete(clientRequestId);
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(clientRequestId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllDrafts(): Promise<void> {
  memoryStore.clear();
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Check if a queued report is stale (default threshold 5 minutes)
 */
export function isReportStale(createdAt: string, thresholdMinutes = 5): boolean {
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return false;
  const elapsedMinutes = (Date.now() - createdTime) / (1000 * 60);
  return elapsedMinutes >= thresholdMinutes;
}

/**
 * Human-readable queue age display
 */
export function formatQueueAge(createdAt: string): string {
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 'recently';
  const elapsedMinutes = Math.floor((Date.now() - createdTime) / (1000 * 60));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}h ago`;
}

/**
 * Automatically clean up old completed or expired drafts older than maxAgeHours (default 24h)
 */
export async function cleanupExpiredReports(maxAgeHours = 24): Promise<void> {
  try {
    const all = await listQueuedReports();
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    for (const item of all) {
      const itemTime = new Date(item.createdAt).getTime();
      if (!isNaN(itemTime) && itemTime < cutoff) {
        await deleteQueuedReport(item.clientRequestId);
      }
    }
  } catch {
    // Non-blocking cleanup
  }
}
