/**
 * Modelo comercial Vertial (cliente final):
 *
 * - Cuenta (email) → suscripción / facturación
 * - Empresa (1 incluida, más de pago) → vertical (delivery, eventos…), datos aislados por businessId
 * - Tienda / PDV (por empresa, límite por plan) → centros + PDV caja
 * - Marca (por empresa, límite por plan) → líneas de catálogo; «General» no cuenta de cupo
 * - Módulo vertical (delivery, …) → pedidos, cocina, catálogo… solo si businessType coincide
 *
 * Replicar un vertical nuevo = nuevo businessType + menú + rutas; reutilizar cuenta, empresa, billing y Ajustes.
 */
import type { BillingSubscription } from './authApi';
import {
  getEffectivePointOfSaleLimit,
  PLAN_TIER_LABELS,
  resolvePlanTier,
  subscriptionHasProAccess,
  type SubscriptionPlanTier,
} from './pointOfSaleLimits';

export type { SubscriptionPlanTier };

/** Empresas por cuenta (sin extras de admin todavía). */
export const INCLUDED_BUSINESSES: Record<SubscriptionPlanTier, number> = {
  basic: 1,
  normal: 1,
  pro: 2,
};

/** Marcas comerciales (sin contar la marca por defecto «General»). */
export const INCLUDED_COMMERCIAL_BRANDS: Record<SubscriptionPlanTier, number> = {
  basic: 0,
  normal: 0,
  pro: 1,
};

export type TenantEntitlementCounts = {
  businesses: number;
  /** PDV tipo punto_de_venta / almacén activos en la empresa actual */
  pointOfSales: number;
  /** Marcas no default en la empresa actual */
  commercialBrands: number;
};

export type TenantEntitlementLimits = {
  planTier: SubscriptionPlanTier;
  planLabel: string;
  hasProAccess: boolean;
  businesses: number;
  pointOfSales: number;
  commercialBrands: number;
};

export type TenantEntitlementAccess = TenantEntitlementLimits & {
  canCreateBusiness: boolean;
  canCreatePointOfSale: boolean;
  canCreateCommercialBrand: boolean;
  needsProUpgrade: boolean;
  needsPointOfSaleAddon: boolean;
  needsCommercialBrandAddon: boolean;
};

export function getIncludedBusinessLimit(planTier: SubscriptionPlanTier): number {
  return INCLUDED_BUSINESSES[planTier];
}

/** Vista portfolio (Visión general) solo con plan que permite 2+ empresas y al menos 2 creadas. */
export function portfolioViewAllowed(
  planTier: SubscriptionPlanTier,
  businessCount: number,
): boolean {
  return businessCount > 1 && INCLUDED_BUSINESSES[planTier] > 1;
}

export function countCommercialBrands(brands: Array<{ isDefault?: boolean }>): number {
  return brands.filter((b) => !b.isDefault).length;
}

export function clampExtraCommercialBrandSlots(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function getBaseCommercialBrandLimit(planTier: SubscriptionPlanTier): number {
  return INCLUDED_COMMERCIAL_BRANDS[planTier];
}

export function getEffectiveCommercialBrandLimit(
  subscription: Pick<
    BillingSubscription,
    'status' | 'selectedPlanId' | 'planName' | 'extraCommercialBrandSlots'
  > | null | undefined,
): number {
  const tier = resolvePlanTier(subscription?.selectedPlanId || '', subscription?.planName || '');
  const extra = clampExtraCommercialBrandSlots(subscription?.extraCommercialBrandSlots);
  return INCLUDED_COMMERCIAL_BRANDS[tier] + extra;
}

export type ResolveTenantEntitlementsOptions = {
  /** Cuenta super-admin (dev): sin tope de marcas comerciales. */
  devUnlimitedBrands?: boolean;
};

export function resolveTenantEntitlements(
  subscription: Pick<
    BillingSubscription,
    | 'status'
    | 'selectedPlanId'
    | 'planName'
    | 'adminProAccess'
    | 'extraPointOfSaleSlots'
    | 'extraCommercialBrandSlots'
  > | null | undefined,
  counts: TenantEntitlementCounts,
  options?: ResolveTenantEntitlementsOptions,
): TenantEntitlementAccess {
  const planTier = resolvePlanTier(subscription?.selectedPlanId || '', subscription?.planName || '');
  const hasProAccess = subscriptionHasProAccess(subscription);
  const businessLimit = INCLUDED_BUSINESSES[planTier];
  const pdvLimit = getEffectivePointOfSaleLimit(subscription);
  const brandLimit = options?.devUnlimitedBrands
    ? 999
    : getEffectiveCommercialBrandLimit(subscription);

  const canCreateBusiness = counts.businesses < businessLimit;
  const canCreatePointOfSale = counts.pointOfSales < pdvLimit;
  const canCreateCommercialBrand =
    options?.devUnlimitedBrands || counts.commercialBrands < brandLimit;

  return {
    planTier,
    planLabel: PLAN_TIER_LABELS[planTier],
    hasProAccess: hasProAccess || Boolean(options?.devUnlimitedBrands),
    businesses: businessLimit,
    pointOfSales: pdvLimit,
    commercialBrands: brandLimit,
    canCreateBusiness,
    canCreatePointOfSale,
    canCreateCommercialBrand,
    needsProUpgrade:
      !options?.devUnlimitedBrands &&
      !hasProAccess &&
      (counts.pointOfSales >= pdvLimit || counts.commercialBrands >= getEffectiveCommercialBrandLimit(subscription)),
    needsPointOfSaleAddon: hasProAccess && counts.pointOfSales >= pdvLimit,
    needsCommercialBrandAddon:
      !options?.devUnlimitedBrands &&
      hasProAccess &&
      counts.commercialBrands >= getEffectiveCommercialBrandLimit(subscription),
  };
}
