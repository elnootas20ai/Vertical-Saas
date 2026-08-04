/**
 * Orden de empresas por uso (cuántas veces se abre / última vez).
 * Persistido en localStorage por usuario — no toca backend.
 */

export type BusinessUsageEntry = {
  count: number;
  lastAt: string;
};

type UsageMap = Record<string, BusinessUsageEntry>;

function storageKey(userId: string): string {
  return `vertial_business_usage:${String(userId || '').trim()}`;
}

function readMap(userId: string): UsageMap {
  const uid = String(userId || '').trim();
  if (!uid || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UsageMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(userId: string, map: UsageMap): void {
  const uid = String(userId || '').trim();
  if (!uid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export function recordBusinessOpen(userId: string | null | undefined, businessId: string | null | undefined): void {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid) return;
  const map = readMap(uid);
  const prev = map[bid] || { count: 0, lastAt: '' };
  map[bid] = {
    count: Math.max(0, Number(prev.count) || 0) + 1,
    lastAt: new Date().toISOString(),
  };
  writeMap(uid, map);
}

export function getBusinessUsage(
  userId: string | null | undefined,
  businessId: string,
): BusinessUsageEntry {
  const map = readMap(String(userId || ''));
  const e = map[String(businessId || '').trim()];
  return {
    count: Math.max(0, Number(e?.count) || 0),
    lastAt: String(e?.lastAt || ''),
  };
}

function businessKey(item: { business_id?: string; id?: string; businessId?: string }): string {
  return String(item.business_id || item.businessId || item.id || '').trim();
}

/**
 * Más usada primero (count), luego más reciente, luego nombre.
 */
export function sortByBusinessUsage<T extends { business_id?: string; id?: string; businessId?: string; name?: string }>(
  items: T[],
  userId: string | null | undefined,
): T[] {
  const uid = String(userId || '').trim();
  const map = uid ? readMap(uid) : {};
  return [...items].sort((a, b) => {
    const ka = businessKey(a);
    const kb = businessKey(b);
    const ua = map[ka] || { count: 0, lastAt: '' };
    const ub = map[kb] || { count: 0, lastAt: '' };
    if (ub.count !== ua.count) return ub.count - ua.count;
    const ta = Date.parse(ua.lastAt) || 0;
    const tb = Date.parse(ub.lastAt) || 0;
    if (tb !== ta) return tb - ta;
    return String(a.name || ka).localeCompare(String(b.name || kb), 'es');
  });
}
