import type { CatalogItem, StaffConsumptionConfig } from './deliveryApi';

export const DEFAULT_STAFF_CONSUMPTION_CONFIG: StaffConsumptionConfig = {
  enabled: true,
  pricingMode: 'staff_price_field',
  defaultDiscountPercent: 0,
  eligibleCategories: [],
  excludedCatalogItemIds: [],
};

export function normalizeStaffConsumptionConfig(
  raw?: Partial<StaffConsumptionConfig> | null,
): StaffConsumptionConfig {
  return {
    ...DEFAULT_STAFF_CONSUMPTION_CONFIG,
    ...(raw || {}),
    eligibleCategories: Array.isArray(raw?.eligibleCategories)
      ? raw!.eligibleCategories.map((c) => String(c || '').trim()).filter(Boolean)
      : [],
    excludedCatalogItemIds: Array.isArray(raw?.excludedCatalogItemIds)
      ? [...new Set(raw!.excludedCatalogItemIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
  };
}

export function resolveStaffUnitPrice(
  item: Pick<CatalogItem, 'unitPrice' | 'staffPrice'>,
  config?: Partial<StaffConsumptionConfig> | null,
): number {
  const publicPrice = Number(item.unitPrice || 0);
  // Precio empleado explícito (organizador / producto) manda siempre en el TPV.
  const rawStaff = item.staffPrice;
  if (rawStaff !== undefined && rawStaff !== null && rawStaff !== '') {
    const staffPrice = Number(rawStaff);
    if (Number.isFinite(staffPrice) && staffPrice >= 0) {
      return roundMoney(staffPrice);
    }
  }
  const cfg = normalizeStaffConsumptionConfig(config);
  if (cfg.pricingMode === 'same_as_public') return roundMoney(publicPrice);
  if (cfg.pricingMode === 'percent_discount') {
    const pct = Math.max(0, Math.min(100, Number(cfg.defaultDiscountPercent || 0)));
    return roundMoney(publicPrice * (1 - pct / 100));
  }
  return roundMoney(publicPrice);
}

export function isCatalogItemEligibleForStaffConsumption(
  item: Pick<CatalogItem, '_id' | 'id' | 'category' | 'active' | 'available'>,
  config?: Partial<StaffConsumptionConfig> | null,
): boolean {
  if (item.active === false || item.available === false) return false;
  const cfg = normalizeStaffConsumptionConfig(config);
  if (!cfg.enabled) return false;
  const itemId = String(item._id || item.id || '').trim();
  if (itemId && cfg.excludedCatalogItemIds.some((id) => id === itemId)) return false;
  const category = String(item.category || '').trim();
  if (!cfg.eligibleCategories.length) return true;
  const folded = category.toLowerCase();
  return cfg.eligibleCategories.some((c) => String(c).trim().toLowerCase() === folded);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Precio empleado a partir del precio público y un % de descuento (0–100). */
export function staffPriceFromDiscount(publicPrice: number, discountPercent: number): number {
  const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return roundMoney(Number(publicPrice || 0) * (1 - pct / 100));
}

export function formatStaffConsumptionPaymentLabel(mode: 'cash_now' | 'payroll_deduction'): string {
  return mode === 'cash_now' ? 'Pago ahora' : 'Descontar de nómina';
}
