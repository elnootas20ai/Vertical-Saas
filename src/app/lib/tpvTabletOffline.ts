/** Cola local mínima para operaciones TPV sin conexión (fichajes, ventas). */

export type TpvOfflineQueueItem = {
  id: string;
  type: 'clock_in' | 'clock_out' | 'sale';
  payload: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = 'vertial_tpv_offline_queue';

function readQueue(): TpvOfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TpvOfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: TpvOfflineQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueTpvOfflineItem(
  type: TpvOfflineQueueItem['type'],
  payload: Record<string, unknown>,
): TpvOfflineQueueItem {
  const item: TpvOfflineQueueItem = {
    id: `offline:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  writeQueue([...readQueue(), item]);
  return item;
}

export function listTpvOfflineQueue(): TpvOfflineQueueItem[] {
  return readQueue();
}

export function clearTpvOfflineQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
