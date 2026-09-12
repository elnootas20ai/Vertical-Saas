export type MasterDataDeleteKind = 'carta' | 'almacen' | 'ingrediente' | 'subreceta';

export type MasterDataDeleteEntry = {
  id: string;
  userId: string;
  businessId: string;
  kind: MasterDataDeleteKind;
  targetId: string;
  requestedAt: string;
};

type QueueScope = {
  userId: string;
  businessId?: string;
  kinds?: MasterDataDeleteKind[];
};

const STORAGE_KEY = 'vertial_master_data_delete_queue_v1';
const CHANGE_EVENT = 'vertial:master-data-delete-queue-changed';
const activeFlushes = new Map<string, Promise<unknown>>();

function clean(value: unknown): string {
  return String(value || '').trim();
}

function entryId(input: Pick<MasterDataDeleteEntry, 'userId' | 'businessId' | 'kind' | 'targetId'>): string {
  return [input.userId, input.businessId || '-', input.kind, input.targetId].join(':');
}

function isKind(value: unknown): value is MasterDataDeleteKind {
  return value === 'carta' || value === 'almacen' || value === 'ingrediente' || value === 'subreceta';
}

function readRaw(): MasterDataDeleteEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const rows: MasterDataDeleteEntry[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Partial<MasterDataDeleteEntry>;
      const userId = clean(row.userId);
      const businessId = clean(row.businessId);
      const targetId = clean(row.targetId);
      if (!userId || !targetId || !isKind(row.kind)) continue;
      const id = entryId({ userId, businessId, kind: row.kind, targetId });
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        userId,
        businessId,
        kind: row.kind,
        targetId,
        requestedAt: clean(row.requestedAt) || new Date().toISOString(),
      });
    }
    return rows;
  } catch {
    return [];
  }
}

function emitChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function writeRaw(rows: MasterDataDeleteEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  emitChanged();
}

function inScope(row: MasterDataDeleteEntry, scope: QueueScope): boolean {
  if (row.userId !== clean(scope.userId)) return false;
  const businessId = clean(scope.businessId);
  if (businessId && row.businessId !== businessId) return false;
  if (scope.kinds?.length && !scope.kinds.includes(row.kind)) return false;
  return true;
}

export function listMasterDataDeleteQueue(scope: QueueScope): MasterDataDeleteEntry[] {
  return readRaw().filter((row) => inScope(row, scope));
}

export function enqueueMasterDataDeletes(
  entries: Array<{
    userId: string;
    businessId?: string;
    kind: MasterDataDeleteKind;
    targetId: string;
  }>,
): MasterDataDeleteEntry[] {
  const rows = readRaw();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const added: MasterDataDeleteEntry[] = [];
  const requestedAt = new Date().toISOString();
  for (const input of entries) {
    const userId = clean(input.userId);
    const businessId = clean(input.businessId);
    const targetId = clean(input.targetId);
    if (!userId || !targetId || !isKind(input.kind)) continue;
    const id = entryId({ userId, businessId, kind: input.kind, targetId });
    const row = byId.get(id) || {
      id,
      userId,
      businessId,
      kind: input.kind,
      targetId,
      requestedAt,
    };
    byId.set(id, row);
    added.push(row);
  }
  writeRaw([...byId.values()]);
  return added;
}

export function completeMasterDataDeletes(ids: Iterable<string>): void {
  const completed = new Set([...ids].map(clean).filter(Boolean));
  if (completed.size === 0) return;
  writeRaw(readRaw().filter((row) => !completed.has(row.id)));
}

export function subscribeMasterDataDeleteQueue(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Un único flush por ámbito; sin polling y sin trabajo cuando la cola está vacía. */
export function withMasterDataDeleteFlushLock<T>(
  lockKey: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = clean(lockKey);
  const active = activeFlushes.get(key) as Promise<T> | undefined;
  if (active) return active;
  const task = run().finally(() => {
    if (activeFlushes.get(key) === task) activeFlushes.delete(key);
  });
  activeFlushes.set(key, task);
  return task;
}

export const MASTER_DATA_DELETE_QUEUE_STORAGE_KEY = STORAGE_KEY;
