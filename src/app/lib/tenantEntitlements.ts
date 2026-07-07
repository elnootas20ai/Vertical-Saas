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
  clampExtraBusinessSlots,
  clampExtraCommercialBrandSlots,
  clampExtraPointOfSaleSlots,
  getBasePointOfSaleLimit,
  INCLUDED_BUSINESSES,
  INCLUDED_COMMERCIAL_BRANDS,
  PLAN_TIER_LABELS,
  resolvePlanTier,
  subscriptionHasProAccess,
  type SubscriptionPlanTier,
} from './pointOfSaleLimits';

export type { SubscriptionPlanTier };

/** Empresas por cuenta (base del plan + extras contratados/admin). */
export const INCLUDED_BUSINESSES: Record<SubscriptionPlanTier, number> = {
  basic: 1,
  normal: 1,
  pro: 2,
};

export function clampExtraBusinessSlots(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function getEffectiveBusinessLimit(
  subscription: Pick<
    BillingSubscription,
    'selectedPlanId' | 'planName' | 'extraBusinessSlots'
  > | null | undefined,
): number {
  const tier = resolvePlanTier(subscription?.selectedPlanId || '', subscription?.planName || '');
  const extra = clampExtraBusinessSlots(subscription?.extraBusinessSlots);
  return INCLUDED_BUSINESSES[tier] + extra;
}

/** Marcas comerciales (sin contar la marca por defecto «General»). */
export const INCLUDED_COMMERCIAL_BRANDS: Record<SubscriptionPlanTier, number> = {
  basic: 0,
  normal: 0,
  pro: 2,
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
  needsBusinessUpgrade: boolean;
  needsBusinessAddon: boolean;
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
  /** Modo Ilimitado (dev) o super-admin: sin tope de empresas. */
  devUnlimitedBusinesses?: boolean;
  /** Tier efectivo (Pro real, dev ilimitado, admin…) para límites y etiquetas de plan. */
  featurePlanTier?: SubscriptionPlanTier;
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
    | 'extraBusinessSlots'
  > | null | undefined,
  counts: TenantEntitlementCounts,
  options?: ResolveTenantEntitlementsOptions,
): TenantEntitlementAccess {
  const planTier =
    options?.featurePlanTier
    ?? resolvePlanTier(subscription?.selectedPlanId || '', subscription?.planName || '');
  const hasProAccess =
    subscriptionHasProAccess(subscription)
    || planTier === 'pro'
    || Boolean(options?.devUnlimitedBrands);
  const unlimitedBusinesses = Boolean(options?.devUnlimitedBusinesses);
  const extraBiz = clampExtraBusinessSlots(subscription?.extraBusinessSlots);
  const businessLimit = unlimitedBusinesses ? 999 : INCLUDED_BUSINESSES[planTier] + extraBiz;
  const extraPdv = clampExtraPointOfSaleSlots(subscription?.extraPointOfSaleSlots);
  const pdvLimit = getBasePointOfSaleLimit(planTier) + extraPdv;
  const extraBrands = clampExtraCommercialBrandSlots(subscription?.extraCommercialBrandSlots);
  const brandLimit = options?.devUnlimitedBrands
    ? 999
    : INCLUDED_COMMERCIAL_BRANDS[planTier] + extraBrands;
  const atBusinessLimit = counts.businesses >= businessLimit;

  const canCreateBusiness = unlimitedBusinesses || counts.businesses < businessLimit;
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
      (counts.pointOfSales >= pdvLimit || counts.commercialBrands >= brandLimit),
    needsBusinessUpgrade: !unlimitedBusinesses && !hasProAccess && atBusinessLimit,
    needsBusinessAddon: !unlimitedBusinesses && hasProAccess && atBusinessLimit,
    needsPointOfSaleAddon: hasProAccess && counts.pointOfSales >= pdvLimit,
    needsCommercialBrandAddon:
      !options?.devUnlimitedBrands &&
      hasProAccess &&
      counts.commercialBrands >= brandLimit,
  };
}
