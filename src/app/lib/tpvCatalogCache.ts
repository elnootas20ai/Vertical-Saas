import type { CatalogItem } from './deliveryApi';
import { listCatalogItemsRequest } from './deliveryApi';
import type { Brand } from './brandsApi';
import { resolveCatalogProductImage } from './catalogProductPlaceholders';
import {
  filterTpvCatalogItems,
  loadTpvCatalogBrands,
  resolveTpvCatalogLoadScope,
  tpvCatalogCacheKey,
  type TpvCatalogBusinessRef,
} from './tpvCatalogScope';

const MEMORY_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Bump al cambiar forma del snapshot (p. ej. placeholders TPV). Invalida sessionStorage antiguo. */
export const TPV_CATALOG_CACHE_SCHEMA = 'v15-exclude-stock-inventory';
const TPV_CATALOG_SCHEMA_KEY = 'vertial.tpvCatalog.schema';
const SESSION_PREFIX = `vertial.tpvCatalog:${TPV_CATALOG_CACHE_SCHEMA}:`;

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
  const halfHalfAllowed = Array.isArray(cf.halfHalfAllowedProductIds)
    ? cf.halfHalfAllowedProductIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (halfHalfAllowed.length > 0) {
    customFields.halfHalfAllowedProductIds = halfHalfAllowed;
  }
  if (cf.buildYourOwn === true) {
    customFields.buildYourOwn = true;
  }
  const buildYourOwnAllowed = Array.isArray(cf.buildYourOwnAllowedIngredientIds)
    ? cf.buildYourOwnAllowedIngredientIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (buildYourOwnAllowed.length > 0) {
    customFields.buildYourOwnAllowedIngredientIds = buildYourOwnAllowed;
  }
  return {
    ...item,
    image: resolveCatalogProductImage(item),
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

/** Aplica placeholders de producto a items del snapshot (cuentas TPV ya activas sin reimportar). */
export function hydrateTpvCatalogSnapshot(snapshot: TpvCatalogSnapshot): TpvCatalogSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map(liteCatalogItem),
  };
}

/** Una vez por versión: limpia caché TPV obsoleta en cuentas que ya tenían el PDV activo. */
export function ensureTpvCatalogCacheSchema(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(TPV_CATALOG_SCHEMA_KEY) === TPV_CATALOG_CACHE_SCHEMA) return;
    clearTpvCatalogCache();
    if (typeof sessionStorage !== 'undefined') {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('vertial.tpvCatalog:v') && !k.startsWith(SESSION_PREFIX)) {
          sessionStorage.removeItem(k);
        }
      }
    }
    localStorage.setItem(TPV_CATALOG_SCHEMA_KEY, TPV_CATALOG_CACHE_SCHEMA);
  } catch {
    /* ignore */
  }
}

function readSession(key: string): TpvCatalogSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TpvCatalogSnapshot;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > SESSION_TTL_MS) return null;
    return hydrateTpvCatalogSnapshot({
      items: parsed.items,
      brands: Array.isArray(parsed.brands) ? parsed.brands : [],
      fetchedAt: parsed.fetchedAt,
      catalogBusinessId: String(parsed.catalogBusinessId || '').trim(),
    });
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
  ensureTpvCatalogCacheSchema();
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
    return hydrateTpvCatalogSnapshot(fromMemory);
  }
  const fromSession = readSession(key);
  if (fromSession) {
    if (snapshotNeedsBrandRefetch(fromSession)) return null;
    if (fromSession.catalogBusinessId && fromSession.catalogBusinessId !== scope.catalogBusinessId) return null;
    const hydrated = hydrateTpvCatalogSnapshot(fromSession);
    memory.set(key, hydrated);
    return hydrated;
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
  ensureTpvCatalogCacheSchema();
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
    const rawItems = await listCatalogItemsRequest(userId, 'catalog', { view: 'tpv' });
    const brands = await loadTpvCatalogBrands(scope, input.businesses);
    const items = filterTpvCatalogItems(rawItems, scope, brands);
    const snapshot = hydrateTpvCatalogSnapshot({
      items,
      brands,
      fetchedAt: Date.now(),
      catalogBusinessId: scope.catalogBusinessId,
    });
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
  ensureTpvCatalogCacheSchema();
  const uid = String(userId || '').trim();
  if (!uid || !input.scopeBusinessId) return;
  const cached = readTpvCatalogCache(uid, input);
  const stale = !cached || Date.now() - cached.fetchedAt > MEMORY_TTL_MS / 2;
  if (!stale) return;
  void fetchTpvCatalog(uid, input).catch(() => undefined);
}
