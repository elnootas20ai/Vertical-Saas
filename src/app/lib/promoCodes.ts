export type PromoStatus = 'active' | 'scheduled' | 'paused' | 'expired' | 'draft';
export type PromoType = 'percentage' | 'fixed' | '2x1' | 'gift' | 'code' | 'fixed_unit_price';
/** ISO weekday: 1=Lunes … 7=Domingo */
export type PromoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PromoApplyMode = 'manual_code' | 'auto';

export interface PromoProductMatch {
  productIds?: string[];
  /** Subcadenas del nombre (sin acentos, case-insensitive). */
  nameIncludes?: string[];
}

export interface StoredPromotion {
  id: string;
  name: string;
  description?: string;
  type: PromoType;
  status: PromoStatus;
  discountValue: number;
  code?: string;
  startDate?: string;
  endDate?: string;
  maxUses?: number | null;
  currentUses?: number;
  createdAt?: string;
  /** Días activos (ISO). Vacío/undefined = todos los días. */
  weekdays?: PromoWeekday[];
  productMatch?: PromoProductMatch;
  /** Precio unitario fijo cobrado (p. ej. 11). */
  fixedUnitPrice?: number;
  /** `auto` = se aplica sola en TPV sin código. */
  applyMode?: PromoApplyMode;
}

export type AppliedPromo = {
  id: string;
  name: string;
  type: PromoType;
  code: string;
  discountValue: number;
};

export type PromoCartLine = {
  productId?: string;
  name?: string;
  unitPrice: number;
  quantity: number;
};

const STORAGE_KEY = 'vertial.promotions.v1';
const CLIENT_APPLIED_KEY = 'vertial.clientPromos.v1';

export function readStoredPromotions(): StoredPromotion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredPromotion[];
  } catch {
    return [];
  }
}

export function writeStoredPromotions(promos: StoredPromotion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(promos));
  } catch {
    // ignore storage failures
  }
}

export function normalizePromoText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** ISO weekday 1–7 (lun–dom). */
export function getIsoWeekday(date = new Date()): PromoWeekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as PromoWeekday;
}

export function isWithinPromoDates(p: Pick<StoredPromotion, 'startDate' | 'endDate'>, now = new Date()): boolean {
  const start = p.startDate ? new Date(p.startDate) : null;
  const end = p.endDate ? new Date(p.endDate) : null;
  if (start && Number.isFinite(start.getTime()) && now < start) return false;
  if (end && Number.isFinite(end.getTime()) && now > end) return false;
  return true;
}

export function isPromoWeekdayActive(
  p: Pick<StoredPromotion, 'weekdays'>,
  now = new Date(),
): boolean {
  const days = Array.isArray(p.weekdays) ? p.weekdays.filter((d) => d >= 1 && d <= 7) : [];
  if (days.length === 0) return true;
  return days.includes(getIsoWeekday(now));
}

export function isPromotionActiveNow(p: StoredPromotion, now = new Date()): boolean {
  if (String(p.status) !== 'active') return false;
  if (!isWithinPromoDates(p, now)) return false;
  if (!isPromoWeekdayActive(p, now)) return false;
  return true;
}

export function matchPromoProduct(
  match: PromoProductMatch | undefined,
  line: Pick<PromoCartLine, 'productId' | 'name'>,
): boolean {
  if (!match) return false;
  const ids = (match.productIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const productId = String(line.productId || '').trim();
  if (productId && ids.includes(productId)) return true;

  const needles = (match.nameIncludes || [])
    .map((n) => normalizePromoText(n))
    .filter(Boolean);
  if (needles.length === 0) return ids.length > 0 ? false : false;
  const hay = normalizePromoText(line.name || '');
  if (!hay) return false;
  return needles.some((n) => hay.includes(n));
}

export function findActivePromotionByCode(codeRaw: string): AppliedPromo | null {
  const code = String(codeRaw || '').trim();
  if (!code) return null;
  const upper = code.toUpperCase();
  const now = new Date();
  const promos = readStoredPromotions();
  const match = promos.find((p) => {
    const c = String(p.code || '').trim();
    if (!c) return false;
    if (!isPromotionActiveNow(p, now)) return false;
    return c.toUpperCase() === upper;
  });
  if (!match?.code) return null;
  return {
    id: match.id,
    name: match.name,
    type: match.type,
    code: match.code,
    discountValue: Number(match.discountValue || 0),
  };
}

export function computePromoDiscount(total: number, promo: AppliedPromo | null): { discount: number; finalTotal: number } {
  const base = Number.isFinite(total) ? Math.max(0, total) : 0;
  if (!promo) return { discount: 0, finalTotal: base };

  // percentage + fixed + code. 2x1/gift/fixed_unit_price need line rules → skip here.
  const t = promo.type;
  let discount = 0;

  if (t === 'percentage') {
    const pct = Math.min(100, Math.max(0, promo.discountValue));
    discount = (base * pct) / 100;
  } else if (t === 'fixed' || t === 'code') {
    discount = Math.max(0, promo.discountValue);
  } else {
    discount = 0;
  }

  discount = Math.min(base, discount);
  const finalTotal = Math.max(0, base - discount);
  return { discount, finalTotal };
}

/** Promos de precio fijo por producto que se aplican solas en TPV. */
export function listAutoFixedUnitPricePromotions(
  promos: StoredPromotion[] = readStoredPromotions(),
  now = new Date(),
): StoredPromotion[] {
  return promos.filter((p) => {
    if (p.type !== 'fixed_unit_price') return false;
    if ((p.applyMode || 'auto') !== 'auto') return false;
    if (!isPromotionActiveNow(p, now)) return false;
    const price = Number(p.fixedUnitPrice ?? p.discountValue ?? 0);
    return Number.isFinite(price) && price >= 0;
  });
}

/**
 * Descuento = suma de (precio línea − precio fijo) × qty cuando el producto matchea
 * y el precio de catálogo es mayor que el fijo.
 */
export function computeFixedUnitPriceDiscount(
  lines: PromoCartLine[],
  promos: StoredPromotion[] = listAutoFixedUnitPricePromotions(),
  now = new Date(),
): { discount: number; applied: StoredPromotion[]; matchedLineCount: number } {
  const active = promos.filter((p) => isPromotionActiveNow(p, now) && p.type === 'fixed_unit_price');
  if (active.length === 0 || lines.length === 0) {
    return { discount: 0, applied: [], matchedLineCount: 0 };
  }

  let discount = 0;
  let matchedLineCount = 0;
  const used = new Set<string>();

  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity || 0));
    const unit = Number(line.unitPrice || 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit <= 0) continue;

    for (const promo of active) {
      if (!matchPromoProduct(promo.productMatch, line)) continue;
      const fixed = Number(promo.fixedUnitPrice ?? promo.discountValue ?? 0);
      if (!Number.isFinite(fixed) || fixed < 0) continue;
      if (unit <= fixed) continue;
      discount += (unit - fixed) * qty;
      matchedLineCount += 1;
      used.add(promo.id);
      break; // una promo por línea
    }
  }

  return {
    discount: Math.max(0, discount),
    applied: active.filter((p) => used.has(p.id)),
    matchedLineCount,
  };
}

type ClientPromoMap = Record<string, AppliedPromo>;

function readClientPromoMap(): ClientPromoMap {
  try {
    const raw = localStorage.getItem(CLIENT_APPLIED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ClientPromoMap;
  } catch {
    return {};
  }
}

function writeClientPromoMap(map: ClientPromoMap): void {
  try {
    localStorage.setItem(CLIENT_APPLIED_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function setClientAppliedPromo(clientIdRaw: string, promo: AppliedPromo | null): void {
  const clientId = String(clientIdRaw || '').trim();
  if (!clientId) return;
  const map = readClientPromoMap();
  if (!promo) {
    delete map[clientId];
    writeClientPromoMap(map);
    return;
  }
  map[clientId] = promo;
  writeClientPromoMap(map);
}

export function getClientAppliedPromo(clientIdRaw: string): AppliedPromo | null {
  const clientId = String(clientIdRaw || '').trim();
  if (!clientId) return null;
  const map = readClientPromoMap();
  const v = map[clientId];
  if (!v || !v.code) return null;
  const active = findActivePromotionByCode(v.code);
  return active;
}
