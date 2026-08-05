export type PromoStatus = 'active' | 'scheduled' | 'paused' | 'expired' | 'draft';
export type PromoType = 'percentage' | 'fixed' | '2x1' | 'gift' | 'code' | 'fixed_unit_price';
/** ISO weekday: 1=Lunes … 7=Domingo */
export type PromoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PromoApplyMode = 'manual_code' | 'auto';
/** Ámbito del descuento: todo el pedido vs producto(s) concreto(s). */
export type PromoDiscountTarget = 'order' | 'product';
/**
 * Precio fijo producto:
 * - `on_top` = el fijo aplica al producto base; extras se suman aparte (pizza 11€ + extras).
 * - `include_in_fixed` = el fijo incluye extras (todo a 11€).
 */
export type PromoExtrasMode = 'on_top' | 'include_in_fixed';

export interface PromoProductMatch {
  productIds?: string[];
  /** Subcadenas / tokens del nombre (sin acentos, case-insensitive). */
  nameIncludes?: string[];
  /** Si el nombre contiene alguno de estos, no aplica (p. ej. burger vs pizza Bacon). */
  excludeNameIncludes?: string[];
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
  /**
   * Si hay ids, la promo solo aplica en esos PDV.
   * Vacío/undefined = todas las tiendas de la cuenta.
   */
  salesPointIds?: string[];
  /** Regla: descuento sobre el total del pedido o sobre 1 producto (matching). */
  discountTarget?: PromoDiscountTarget;
  /** Solo `fixed_unit_price`: extras encima del fijo o dentro del fijo. */
  extrasMode?: PromoExtrasMode;
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
  /** Precio unitario completo (base + extras). Usado si no hay baseUnitPrice. */
  unitPrice: number;
  /** Precio catálogo sin extras. */
  baseUnitPrice?: number;
  /** Suma de extras / suplementos por unidad. */
  extrasUnitPrice?: number;
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

/** Vacío = todas las tiendas. Si hay lista, el PDV (o un id relacionado) debe estar. */
export function promoAppliesToSalesPoint(
  p: Pick<StoredPromotion, 'salesPointIds'>,
  salesPointId?: string | null,
  relatedIds: Array<string | null | undefined> = [],
): boolean {
  const allowed = (Array.isArray(p.salesPointIds) ? p.salesPointIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const candidates = [salesPointId, ...relatedIds]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (candidates.length === 0) return false;
  return candidates.some((id) => allowed.includes(id));
}

/** Coincide por token/frase con límites de palabra (no substring suelto). */
function nameContainsToken(hayFold: string, needleFold: string): boolean {
  const n = String(needleFold || '').trim();
  if (!n || !hayFold) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(hayFold);
}

const BURGER_NAME_MARKERS = ['burger', 'hamburguesa', 'hamburgesa', 'top burger'];

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
  if (needles.length === 0) return false;

  const hay = normalizePromoText(line.name || '');
  if (!hay) return false;

  const excludes = (match.excludeNameIncludes || [])
    .map((n) => normalizePromoText(n))
    .filter(Boolean);
  if (excludes.some((ex) => nameContainsToken(hay, ex))) return false;

  // Promo de pizzas (needles tipo bacon/margarita) no debe caer en burgers.
  const hayLooksBurger = BURGER_NAME_MARKERS.some((m) => nameContainsToken(hay, m));
  if (hayLooksBurger) {
    const needleTargetsBurger = needles.some((n) =>
      BURGER_NAME_MARKERS.some((m) => n.includes(m)),
    );
    if (!needleTargetsBurger) return false;
  }

  return needles.some((n) => nameContainsToken(hay, n));
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

/**
 * Promos de empresa con código, activas ahora, para elegir en TPV (sin teclear).
 * Primero las “permanentes” (sin fecha fin); luego las que tienen caducidad.
 */
export function listSelectableCompanyPromoCodes(opts?: {
  salesPointId?: string | null;
  relatedSalesPointIds?: Array<string | null | undefined>;
  now?: Date;
}): AppliedPromo[] {
  const now = opts?.now || new Date();
  const salesPointId = opts?.salesPointId;
  const related = opts?.relatedSalesPointIds || [];
  const promos = readStoredPromotions().filter((p) => {
    const code = String(p.code || '').trim();
    if (!code) return false;
    if (!isPromotionActiveNow(p, now)) return false;
    // Solo auto sin código útil: si applyMode es auto y no hay código, ya filtrado.
    // Con código, se puede elegir a mano aunque también sea auto.
    if (!promoAppliesToSalesPoint(p, salesPointId, related)) return false;
    return true;
  });

  const toApplied = (p: StoredPromotion): AppliedPromo => ({
    id: p.id,
    name: p.name,
    type: p.type,
    code: String(p.code || '').trim(),
    discountValue: Number(p.discountValue || 0),
  });

  const permanent = promos.filter((p) => !String(p.endDate || '').trim());
  const dated = promos.filter((p) => String(p.endDate || '').trim());
  const sortByName = (a: StoredPromotion, b: StoredPromotion) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'es');

  return [...permanent.sort(sortByName), ...dated.sort(sortByName)].map(toApplied);
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
  options?: { salesPointId?: string | null; relatedSalesPointIds?: Array<string | null | undefined> },
): StoredPromotion[] {
  return promos.filter((p) => {
    if (p.type !== 'fixed_unit_price') return false;
    if ((p.applyMode || 'auto') !== 'auto') return false;
    if (!isPromotionActiveNow(p, now)) return false;
    if (!promoAppliesToSalesPoint(p, options?.salesPointId, options?.relatedSalesPointIds || [])) {
      return false;
    }
    const price = Number(p.fixedUnitPrice ?? p.discountValue ?? 0);
    return Number.isFinite(price) && price >= 0;
  });
}

/**
 * Descuento = suma de (precio base − precio fijo) × qty cuando el producto matchea
 * y el precio base es mayor que el fijo.
 *
 * Por defecto (`extrasMode: on_top` o vacío): los extras NO entran en el fijo
 * (pizza a 11€ + extras aparte). Con `include_in_fixed`, el fijo incluye extras.
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
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const fullUnit = Number(line.unitPrice || 0);
    const baseUnit = Number(
      line.baseUnitPrice != null && Number.isFinite(Number(line.baseUnitPrice))
        ? line.baseUnitPrice
        : fullUnit,
    );
    const extrasUnit = Number(
      line.extrasUnitPrice != null && Number.isFinite(Number(line.extrasUnitPrice))
        ? line.extrasUnitPrice
        : Math.max(0, fullUnit - baseUnit),
    );

    for (const promo of active) {
      if (!matchPromoProduct(promo.productMatch, line)) continue;
      const fixed = Number(promo.fixedUnitPrice ?? promo.discountValue ?? 0);
      if (!Number.isFinite(fixed) || fixed < 0) continue;

      const extrasMode: PromoExtrasMode =
        promo.extrasMode === 'include_in_fixed' ? 'include_in_fixed' : 'on_top';

      if (extrasMode === 'include_in_fixed') {
        const unit = Number.isFinite(fullUnit) && fullUnit > 0
          ? fullUnit
          : baseUnit + extrasUnit;
        if (!Number.isFinite(unit) || unit <= 0 || unit <= fixed) continue;
        discount += (unit - fixed) * qty;
      } else {
        // on_top: solo baja el producto base a `fixed`; extras se cobran enteros.
        if (!Number.isFinite(baseUnit) || baseUnit <= 0 || baseUnit <= fixed) continue;
        discount += (baseUnit - fixed) * qty;
      }
      matchedLineCount += 1;
      used.add(promo.id);
      break; // una promo por línea
    }
  }

  return {
    discount: Math.max(0, Math.round(discount * 100) / 100),
    applied: active.filter((p) => used.has(p.id)),
    matchedLineCount,
  };
}

/** Inferencia de ámbito según tipo (para promos antiguas sin discountTarget). */
export function resolvePromoDiscountTarget(
  p: Pick<StoredPromotion, 'type' | 'discountTarget'>,
): PromoDiscountTarget {
  if (p.discountTarget === 'order' || p.discountTarget === 'product') return p.discountTarget;
  return p.type === 'fixed_unit_price' ? 'product' : 'order';
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
