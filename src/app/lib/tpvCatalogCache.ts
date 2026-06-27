import type { CatalogItem } from './deliveryApi';
import { listCatalogItemsRequest } from './deliveryApi';
import type { Brand } from './brandsApi';
import {
  filterTpvCatalogItems,
  loadTpvCatalogBrands,
  resolveTpvCatalogLoadScope,
  tpvCatalogCacheKey,
  type TpvCatalogBusinessRef,
} from './tpvCatalogScope';

const MEMORY_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_PREFIX = 'vertial.tpvCatalog:v9:';

export type TpvCatalogSnapshot = {
  items: CatalogItem[];
  brands: Brand[];
  fetchedAt: number;
  catalogBusinessId: string;
};

export type TpvCatalogFetchInput = {
  scopeBusinessId: string;
  businesses: TpvCatalogBusinessRef[];
  accountBusinessCount?: number;
};

const memory = new Map<string, TpvCatalogSnapshot>();
const inflight = new Map<string, Promise<TpvCatalogSnapshot>>();

/** Sin imágenes ni campos pesados para sessionStorage (límite ~5 MB). */
function liteCatalogItem(item: CatalogItem): CatalogItem {
  const cf = item.customFields && typeof item.customFields === 'object' ? item.customFields : {};
  const customFields: Record<string, unknown> = {};
  if (typeof cf.ingredients === 'string' && cf.ingredients.trim()) {
    customFields.ingredients = cf.ingredients.trim();
  }
  if (Array.isArray(cf.supplements) && cf.supplements.length > 0) {
    customFields.supplements = cf.supplements;
  }
  if (Array.isArray(cf.comboStructure) && cf.comboStructure.length > 0) {
    customFields.comboStructure = cf.comboStructure;
  }
  if (cf.comboStructureConfirmed === true) {
    customFields.comboStructureConfirmed = true;
  }
  if (cf.halfHalf === true) {
    customFields.halfHalf = true;
  }
  if (cf.buildYourOwn === true) {
    customFields.buildYourOwn = true;
  }
  return {
    ...item,
    image: '',
    images: [],
    description: '',
    notes: '',
    customFields,
    articles: [],
    comboItems: Array.isArray(item.comboItems)
      ? item.comboItems.map((c) => ({
          productId: c.productId,
          productName: c.productName,
          quantity: c.quantity,
          ...(c.slotKind ? { slotKind: c.slotKind } : {}),
        }))
      : [],
  };
}

function readSession(key: string): TpvCatalogSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TpvCatalogSnapshot;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > SESSION_TTL_MS) return null;
    return {
      items: parsed.items,
      brands: Array.isArray(parsed.brands) ? parsed.brands : [],
      fetchedAt: parsed.fetchedAt,
      catalogBusinessId: String(parsed.catalogBusinessId || '').trim(),
    };
  } catch {
    return null;
  }
}

function writeSession(key: string, snapshot: TpvCatalogSnapshot): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const lite: TpvCatalogSnapshot = {
      ...snapshot,
      items: snapshot.items.map(liteCatalogItem),
    };
    sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(lite));
  } catch {
    // quota u otro error de almacenamiento
  }
}

function catalogHasBrandIds(items: CatalogItem[]): boolean {
  return items.some((item) => Array.isArray(item.brandIds) && item.brandIds.length > 0);
}

export function tpvCatalogSnapshotNeedsBrandRefetch(snapshot: TpvCatalogSnapshot): boolean {
  if (!snapshot.items.length) return true;
  if (snapshot.brands.length > 0) return false;
  return catalogHasBrandIds(snapshot.items);
}

function snapshotNeedsBrandRefetch(snapshot: TpvCatalogSnapshot): boolean {
  return tpvCatalogSnapshotNeedsBrandRefetch(snapshot);
}

export function readTpvCatalogCache(userId: string, input: TpvCatalogFetchInput): TpvCatalogSnapshot | null {
  const scope = resolveTpvCatalogLoadScope(
    input.scopeBusinessId,
    input.businesses,
    input.accountBusinessCount,
  );
  const key = tpvCatalogCacheKey(userId, scope);
  const fromMemory = memory.get(key);
  if (fromMemory && Date.now() - fromMemory.fetchedAt < MEMORY_TTL_MS) {
    if (snapshotNeedsBrandRefetch(fromMemory)) return null;
    if (fromMemory.catalogBusinessId && fromMemory.catalogBusinessId !== scope.catalogBusinessId) return null;
    return fromMemory;
  }
  const fromSession = readSession(key);
  if (fromSession) {
    if (snapshotNeedsBrandRefetch(fromSession)) return null;
    if (fromSession.catalogBusinessId && fromSession.catalogBusinessId !== scope.catalogBusinessId) return null;
    memory.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearTpvCatalogCache(userId?: string, catalogBusinessId?: string): void {
  if (userId && catalogBusinessId) {
    const key = `${String(userId).trim()}:${String(catalogBusinessId).trim()}`;
    memory.delete(key);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (userId) {
    const prefix = `${String(userId).trim()}:`;
    for (const key of [...memory.keys()]) {
      if (key.startsWith(prefix)) memory.delete(key);
    }
    if (typeof sessionStorage !== 'undefined') {
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
          const k = sessionStorage.key(i);
          if (k?.startsWith(`${SESSION_PREFIX}${prefix}`)) sessionStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
    }
    return;
  }
  memory.clear();
  if (typeof sessionStorage === 'undefined') return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export async function fetchTpvCatalog(
  userId: string,
  input: TpvCatalogFetchInput,
  options?: { force?: boolean },
): Promise<TpvCatalogSnapshot> {
  const scope = resolveTpvCatalogLoadScope(
    input.scopeBusinessId,
    input.businesses,
    input.accountBusinessCount,
  );
  const key = tpvCatalogCacheKey(userId, scope);

  if (!options?.force) {
    const cached = readTpvCatalogCache(userId, input);
    if (cached) return cached;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const rawItems = await listCatalogItemsRequest(userId, undefined, { view: 'tpv' });
    const brands = await loadTpvCatalogBrands(scope, input.businesses);
    const items = filterTpvCatalogItems(rawItems, scope, brands);
    const snapshot: TpvCatalogSnapshot = {
      items,
      brands,
      fetchedAt: Date.now(),
      catalogBusinessId: scope.catalogBusinessId,
    };
    const filteredAwayAll = rawItems.length > 0 && items.length === 0;
    if (!filteredAwayAll) {
      memory.set(key, snapshot);
      writeSession(key, snapshot);
    } else {
      memory.delete(key);
    }
    return snapshot;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Precarga en segundo plano al entrar al TPV (antes de «Nuevo pedido»). */
export function prefetchTpvCatalog(userId: string, input: TpvCatalogFetchInput): void {
  const uid = String(userId || '').trim();
  if (!uid || !input.scopeBusinessId) return;
  const cached = readTpvCatalogCache(uid, input);
  const stale = !cached || Date.now() - cached.fetchedAt > MEMORY_TTL_MS / 2;
  if (!stale) return;
  void fetchTpvCatalog(uid, input).catch(() => undefined);
}
