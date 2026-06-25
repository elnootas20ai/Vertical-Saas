import type { CatalogItem } from './deliveryApi';
import { listCatalogItemsRequest } from './deliveryApi';
import type { Brand } from './brandsApi';
import { listBrandsRequest } from './brandsApi';

const MEMORY_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_PREFIX = 'vertial.tpvCatalog:v3:';

export type TpvCatalogSnapshot = {
  items: CatalogItem[];
  brands: Brand[];
  fetchedAt: number;
};

const memory = new Map<string, TpvCatalogSnapshot>();
const inflight = new Map<string, Promise<TpvCatalogSnapshot>>();

function cacheKey(userId: string, businessId: string): string {
  return `${String(userId || '').trim()}:${String(businessId || '').trim() || 'no-biz'}`;
}

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

export function readTpvCatalogCache(userId: string, businessId: string): TpvCatalogSnapshot | null {
  const key = cacheKey(userId, businessId);
  const fromMemory = memory.get(key);
  if (fromMemory && Date.now() - fromMemory.fetchedAt < MEMORY_TTL_MS) {
    return fromMemory;
  }
  const fromSession = readSession(key);
  if (fromSession) {
    memory.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearTpvCatalogCache(userId?: string, businessId?: string): void {
  if (userId && businessId) {
    const key = cacheKey(userId, businessId);
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
  businessId: string,
  options?: { force?: boolean },
): Promise<TpvCatalogSnapshot> {
  const key = cacheKey(userId, businessId);
  if (!options?.force) {
    const cached = readTpvCatalogCache(userId, businessId);
    if (cached) return cached;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const [items, brands] = await Promise.all([
      // Misma amplitud que Catálogo (sin filtrar solo module=catalog).
      listCatalogItemsRequest(userId, undefined, { view: 'tpv' }),
      businessId ? listBrandsRequest(businessId).catch(() => [] as Brand[]) : Promise.resolve([] as Brand[]),
    ]);
    const snapshot: TpvCatalogSnapshot = {
      items,
      brands,
      fetchedAt: Date.now(),
    };
    memory.set(key, snapshot);
    writeSession(key, snapshot);
    return snapshot;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Precarga en segundo plano al entrar al TPV (antes de «Nuevo pedido»). */
export function prefetchTpvCatalog(userId: string, businessId: string): void {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const cached = readTpvCatalogCache(uid, businessId);
  const stale = !cached || Date.now() - cached.fetchedAt > MEMORY_TTL_MS / 2;
  if (!stale) return;
  void fetchTpvCatalog(uid, businessId).catch(() => undefined);
}
