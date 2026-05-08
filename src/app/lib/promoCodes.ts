export type PromoStatus = 'active' | 'scheduled' | 'paused' | 'expired' | 'draft';
export type PromoType = 'percentage' | 'fixed' | '2x1' | 'gift' | 'code';

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
}

export type AppliedPromo = {
  id: string;
  name: string;
  type: PromoType;
  code: string;
  discountValue: number;
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

function isWithinDates(p: StoredPromotion, now = new Date()): boolean {
  const start = p.startDate ? new Date(p.startDate) : null;
  const end = p.endDate ? new Date(p.endDate) : null;
  if (start && Number.isFinite(start.getTime()) && now < start) return false;
  if (end && Number.isFinite(end.getTime()) && now > end) return false;
  return true;
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
    if (String(p.status) !== 'active') return false;
    if (!isWithinDates(p, now)) return false;
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

  // For now: support percentage + fixed + code as fixed/percentage (same behavior).
  // 2x1/gift needs line-level rules → skip discount to avoid wrong totals.
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
  // Ensure it's still active (status/dates) based on current promotions list
  const active = findActivePromotionByCode(v.code);
  return active;
}

