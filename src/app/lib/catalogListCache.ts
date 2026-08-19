type CatalogModule = 'stock' | 'catalog' | undefined;
type CatalogView = 'tpv' | undefined;

type CacheEntry<T> = {
  items: T[];
  fetchedAt: number;
};

const TTL_MS = 45_000;
const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown[]>>();

function cacheKey(userId: string, module?: CatalogModule, view?: CatalogView): string {
  return `${String(userId || '').trim()}|${module || '*'}|${view || ''}`;
}

export function invalidateCatalogListCache(userId?: string): void {
  const uid = String(userId || '').trim();
  if (!uid) {
    memory.clear();
    return;
  }
  for (const key of [...memory.keys()]) {
    if (key.startsWith(`${uid}|`)) memory.delete(key);
  }
}

/** Lista de catálogo con dedupe concurrente + TTL corto. */
export async function listCatalogItemsCached<T>(
  userId: string,
  fetcher: () => Promise<T[]>,
  module?: CatalogModule,
  view?: CatalogView,
): Promise<T[]> {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const key = cacheKey(uid, module, view);
  const hit = memory.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return hit.items;
  }

  const pending = inflight.get(key) as Promise<T[]> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((items) => {
      memory.set(key, { items, fetchedAt: Date.now() });
      return items;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
