/**
 * Recomendación de plan y precio durante el onboarding.
 * Usa businessType, métricas de infraestructura y requestedModules (mismas claves que setupSteps).
 */

import {
  getAddonMonthlyPriceEur,
  PLAN_ADDON_ANNUAL_DISCOUNT,
} from './planAddonCatalog';
import { VERTIAL_PLANS, type VertialPlanId, type VertialPlanDefinition } from './planCatalog';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType, isStrictDeliveryBusinessType } from './deliveryOpsTypes';
import {
  emptyRestaurantNeedsForFormat,
  type RestaurantFormat,
} from '../verticals/restaurant/restaurantFormat';

export type OnboardingPlanId = 'basic' | 'normal' | 'pro';

export type RequestedModuleKey =
  | 'inventory'
  | 'sales'
  | 'crm'
  | 'documentation'
  | 'analytics'
  | 'workshop';

export type RequestedModules = Record<RequestedModuleKey, boolean>;

export interface OnboardingPlanDefinition {
  id: OnboardingPlanId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxUsers: number;
  maxLocations: number;
  maxBusinesses: number;
  maxCommercialBrands: number;
  features: string[];
}

export interface NeedsOptionDefinition {
  key: RequestedModuleKey;
  title: string;
  description: string;
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const DEFAULT_PLANS: OnboardingPlanDefinition[] = VERTIAL_PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  priceMonthly: p.priceMonthly,
  priceAnnual: p.priceAnnualMonthly,
  maxUsers: p.maxUsers,
  maxLocations: p.maxLocations,
  maxBusinesses: p.maxBusinesses,
  maxCommercialBrands: p.maxCommercialBrands,
  features: p.features,
}));

/** Cartas del paso 4 solo para vertical delivery (8 opciones → 6 claves de módulo). */
export type DeliveryNeedKey =
  | 'tpv'
  | 'catalogStock'
  | 'deliveryOrders'
  | 'autoShipping'
  | 'clients'
  | 'team'
  | 'invoicing'
  | 'reports';

export interface DeliveryNeedOption {
  key: DeliveryNeedKey;
  title: string;
  description: string;
}

export const DELIVERY_NEED_OPTIONS: DeliveryNeedOption[] = [
  { key: 'tpv', title: 'TPV y caja', description: 'Cobros en mostrador y ticket' },
  { key: 'catalogStock', title: 'Catálogo y stock', description: 'Productos, precios y existencias' },
  { key: 'deliveryOrders', title: 'Pedidos delivery', description: 'Pedidos para llevar, domicilio o recoger' },
  { key: 'autoShipping', title: 'Envíos automáticos', description: 'Reparto y estados de entrega' },
  { key: 'clients', title: 'Clientes', description: 'Base de clientes y fidelización' },
  { key: 'team', title: 'Gestión de personal', description: 'Equipo, roles y accesos' },
  { key: 'invoicing', title: 'Facturación', description: 'Facturas y documentos' },
  { key: 'reports', title: 'Informes', description: 'Ventas y métricas del negocio' },
];

export type DeliveryNeedsSelection = Record<DeliveryNeedKey, boolean>;

export const RESTAURANT_NEED_OPTIONS: DeliveryNeedOption[] = [
  { key: 'tpv', title: 'TPV y caja', description: 'Cobros en barra, sala o terraza' },
  { key: 'catalogStock', title: 'Carta y stock', description: 'Platos, bebidas y existencias' },
  { key: 'deliveryOrders', title: 'Comandas sala', description: 'Pedidos en mesa, barra o para llevar' },
  { key: 'autoShipping', title: 'Reparto a domicilio', description: 'Opcional: entrega fuera del local' },
  { key: 'clients', title: 'Clientes', description: 'Base de clientes y reservas' },
  { key: 'team', title: 'Equipo', description: 'Roles, turnos y permisos' },
  { key: 'invoicing', title: 'Facturación', description: 'Facturas y documentos' },
  { key: 'reports', title: 'Informes', description: 'Ventas y métricas del local' },
];

export function emptyRestaurantNeeds(format?: RestaurantFormat | null): DeliveryNeedsSelection {
  return emptyRestaurantNeedsForFormat(format);
}

export function getDeliveryNeedOptionsForBusinessType(businessType: string): DeliveryNeedOption[] {
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_NEED_OPTIONS;
  return DELIVERY_NEED_OPTIONS;
}

export function usesDeliveryNeedsOnboarding(businessType: string): boolean {
  return isDeliveryOpsBusinessType(businessType);
}

export function emptyDeliveryNeeds(): DeliveryNeedsSelection {
  return {
    tpv: false,
    catalogStock: false,
    deliveryOrders: false,
    autoShipping: false,
    clients: false,
    team: false,
    invoicing: false,
    reports: false,
  };
}

/** Convierte las 8 cartas delivery a requestedModules (setupSteps / backend). */
export function deliveryNeedsToModules(needs: Partial<DeliveryNeedsSelection>): RequestedModules {
  return {
    inventory: !!(needs.catalogStock),
    sales: !!(needs.tpv || needs.deliveryOrders || needs.autoShipping),
    crm: !!(needs.clients || needs.team),
    documentation: !!(needs.invoicing),
    analytics: !!(needs.reports),
    workshop: false,
  };
}

/** Rellena cartas delivery a partir de módulos ya guardados. */
export function modulesToDeliveryNeeds(modules: Partial<RequestedModules>): DeliveryNeedsSelection {
  return {
    tpv: !!modules.sales,
    catalogStock: !!modules.inventory,
    deliveryOrders: !!modules.sales,
    autoShipping: !!modules.sales,
    clients: !!modules.crm,
    team: !!modules.crm,
    invoicing: !!modules.documentation,
    reports: !!modules.analytics,
  };
}

export function getDeliveryNeedLabel(key: DeliveryNeedKey): string {
  return DELIVERY_NEED_OPTIONS.find((o) => o.key === key)?.title ?? key;
}

export function getSelectedDeliveryNeedLabels(needs: Partial<DeliveryNeedsSelection>): string[] {
  return DELIVERY_NEED_OPTIONS.filter((o) => needs[o.key]).map((o) => o.title);
}

const NEEDS_DEALERSHIP: NeedsOptionDefinition[] = [
  { key: 'inventory', title: 'Gestión de stock', description: 'Vehículos y ubicaciones' },
  { key: 'sales', title: 'Ventas y operaciones', description: 'Compras y ventas' },
  { key: 'crm', title: 'CRM / Clientes', description: 'Leads y seguimiento' },
  { key: 'documentation', title: 'Documentación', description: 'Contratos y facturas' },
  { key: 'analytics', title: 'Métricas y KPIs', description: 'Dashboards' },
  { key: 'workshop', title: 'Taller', description: 'Reparaciones' },
];

const NEEDS_GENERIC: NeedsOptionDefinition[] = [
  { key: 'inventory', title: 'Stock y catálogo', description: 'Productos, artículos o servicios' },
  { key: 'sales', title: 'Ventas y TPV', description: 'Cobros, tickets y operaciones' },
  { key: 'crm', title: 'Clientes', description: 'Contactos y seguimiento' },
  { key: 'documentation', title: 'Documentación', description: 'Contratos y facturas' },
  { key: 'analytics', title: 'Informes', description: 'Métricas y dashboards' },
  { key: 'workshop', title: 'Operativa avanzada', description: 'Procesos o producción' },
];

const VERTICAL_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  restaurant: 'Bar/restaurante',
  carDealership: 'Compraventa',
  workshop: 'Taller',
  events: 'Eventos',
  butcherShop: 'Carnicería',
  iceCreamShop: 'Heladería',
};

export function getVerticalLabel(businessType: string): string {
  return VERTICAL_LABELS[businessType] ?? 'Tu negocio';
}

export function getPlansForBusinessType(_businessType: string): OnboardingPlanDefinition[] {
  return DEFAULT_PLANS;
}

export function isDeliveryBusinessType(businessType: string): boolean {
  return isDeliveryOpsBusinessType(businessType);
}

export function getNeedsOptionsForBusinessType(businessType: string): NeedsOptionDefinition[] {
  if (businessType === 'carDealership' || businessType === 'workshop') return NEEDS_DEALERSHIP;
  return NEEDS_GENERIC;
}

export function getModuleLabel(businessType: string, key: RequestedModuleKey): string {
  const option = getNeedsOptionsForBusinessType(businessType).find((o) => o.key === key);
  return option?.title ?? key;
}

export function getSelectedModuleLabels(
  businessType: string,
  modules: Partial<RequestedModules>,
): string[] {
  if (isDeliveryOpsBusinessType(businessType)) {
    return getSelectedDeliveryNeedLabels(modulesToDeliveryNeeds(modules));
  }
  return getNeedsOptionsForBusinessType(businessType)
    .filter((o) => modules[o.key] === true)
    .map((o) => o.title);
}

export function countEnabledModules(modules: Partial<RequestedModules>): number {
  return Object.values(modules).filter(Boolean).length;
}

export function countSelectedDeliveryNeeds(needs: Partial<DeliveryNeedsSelection>): number {
  return DELIVERY_NEED_OPTIONS.filter((o) => needs[o.key]).length;
}

export const ONBOARDING_PLAN_RANK: Record<OnboardingPlanId, number> = {
  basic: 0,
  normal: 1,
  pro: 2,
};

const TIER_TO_PLAN: OnboardingPlanId[] = ['basic', 'normal', 'pro'];

/** Plan mínimo obligatorio según infraestructura y módulos (no se puede bajar en el comparador). */
export function minimumOnboardingPlanId(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
  deliveryNeeds?: Partial<DeliveryNeedsSelection>;
}): OnboardingPlanId {
  const metrics = normalizeInfrastructureMetrics(params);
  const moduleCount = countEnabledModules(params.modules);
  const deliveryCount = isDeliveryBusinessType(params.businessType)
    ? countSelectedDeliveryNeeds(params.deliveryNeeds ?? modulesToDeliveryNeeds(params.modules))
    : 0;

  let rank = 0;

  if (metrics.userCount > 2 || moduleCount >= 3) {
    rank = Math.max(rank, 1);
  }

  if (
    metrics.commercialBrandCount > 0 ||
    metrics.businessCount > 1 ||
    metrics.locationCount > 1 ||
    metrics.userCount > 5 ||
    moduleCount >= 5 ||
    deliveryCount >= 6 ||
    (moduleCount >= 4 && metrics.userCount > 3)
  ) {
    rank = Math.max(rank, 2);
  }

  return TIER_TO_PLAN[rank];
}

export function isOnboardingPlanAllowed(
  planId: OnboardingPlanId,
  params: Parameters<typeof minimumOnboardingPlanId>[0],
): boolean {
  return ONBOARDING_PLAN_RANK[ planId] >= ONBOARDING_PLAN_RANK[minimumOnboardingPlanId(params)];
}

export function clampOnboardingPlanId(
  planId: OnboardingPlanId,
  params: Parameters<typeof minimumOnboardingPlanId>[0],
): OnboardingPlanId {
  const min = minimumOnboardingPlanId(params);
  return ONBOARDING_PLAN_RANK[ planId] >= ONBOARDING_PLAN_RANK[min] ? planId : min;
}

export type OnboardingInfrastructureMetrics = {
  userCount: number;
  locationCount: number;
  businessCount: number;
  commercialBrandCount: number;
};

export function normalizeInfrastructureMetrics(
  metrics: Partial<OnboardingInfrastructureMetrics>,
): OnboardingInfrastructureMetrics {
  return {
    userCount: Math.max(1, Math.floor(Number(metrics.userCount) || 1)),
    locationCount: Math.max(1, Math.floor(Number(metrics.locationCount) || 1)),
    businessCount: Math.max(1, Math.floor(Number(metrics.businessCount) || 1)),
    commercialBrandCount: Math.max(0, Math.floor(Number(metrics.commercialBrandCount) || 0)),
  };
}

function planTierForInfrastructure(
  metrics: OnboardingInfrastructureMetrics,
  modules: Partial<RequestedModules>,
): number {
  const { userCount, locationCount, businessCount, commercialBrandCount } = metrics;
  const moduleCount = countEnabledModules(modules);
  let tier = 0;

  if (userCount > 2) tier = Math.max(tier, 1);
  if (modules.analytics || modules.documentation) tier = Math.max(tier, 1);
  if (modules.workshop && userCount > 3) tier = Math.max(tier, 1);
  if (moduleCount >= 5) tier = Math.max(tier, 2);

  // PRO: varias empresas, varios PDV o marcas extra (Pizzería, Burger…)
  if (commercialBrandCount > 0 || businessCount > 1 || locationCount > 1) {
    tier = 2;
  }
  if (userCount > 8 || (userCount > 5 && locationCount > 1)) {
    tier = Math.max(tier, 2);
  }

  return tier;
}

function infrastructureExceedsPlan(
  plan: OnboardingPlanDefinition,
  metrics: OnboardingInfrastructureMetrics,
): boolean {
  return (
    metrics.userCount > plan.maxUsers ||
    metrics.locationCount > plan.maxLocations ||
    metrics.businessCount > plan.maxBusinesses ||
    metrics.commercialBrandCount > plan.maxCommercialBrands
  );
}

export function recommendOnboardingPlanId(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
  deliveryNeeds?: Partial<DeliveryNeedsSelection>;
}): OnboardingPlanId {
  const metrics = normalizeInfrastructureMetrics(params);
  const { modules } = params;
  const plans = getPlansForBusinessType(params.businessType);
  const topPlan = plans[plans.length - 1];

  if (
    metrics.userCount > topPlan.maxUsers ||
    metrics.locationCount > topPlan.maxLocations ||
    metrics.businessCount > topPlan.maxBusinesses ||
    metrics.commercialBrandCount > topPlan.maxCommercialBrands
  ) {
    return 'pro';
  }

  const tier = planTierForInfrastructure(metrics, modules);
  const tierPlan = TIER_TO_PLAN[Math.min(tier, 2)];
  const floor = minimumOnboardingPlanId(params);

  return ONBOARDING_PLAN_RANK[tierPlan] >= ONBOARDING_PLAN_RANK[floor] ? tierPlan : floor;
}

export function buildRecommendationReason(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
  plan: OnboardingPlanDefinition;
  exceedsPlanLimits: boolean;
}): string {
  const metrics = normalizeInfrastructureMetrics(params);
  const { businessType, modules, plan, exceedsPlanLimits } = params;
  const parts: string[] = [];

  parts.push(
    `${metrics.businessCount} empresa${metrics.businessCount !== 1 ? 's' : ''}`,
    `${metrics.locationCount} PDV`,
    `${metrics.userCount} trabajador${metrics.userCount !== 1 ? 'es' : ''}`,
  );
  if (metrics.commercialBrandCount > 0) {
    parts.push(
      `${metrics.commercialBrandCount} marca${metrics.commercialBrandCount !== 1 ? 's' : ''} extra`,
    );
  }

  const selected = getSelectedModuleLabels(businessType, modules);
  if (selected.length > 0) {
    parts.push(`módulos: ${selected.slice(0, 3).join(', ')}${selected.length > 3 ? '…' : ''}`);
  }

  if (metrics.commercialBrandCount > 0 && plan.maxCommercialBrands === 0) {
    return `Con marcas extra necesitas al menos el plan PRO. Tu operativa: ${parts.join(' · ')}.`;
  }

  if (isRestaurantBusinessType(params.businessType)) {
    return `Precio orientativo para tu restaurante: ${parts.join(' · ')}. Plan recomendado: ${plan.name}.`;
  }

  if (isStrictDeliveryBusinessType(params.businessType)) {
    if (exceedsPlanLimits) {
      return `Para ${parts.join(' · ')}, recomendamos ${plan.name}. Puedes ampliar cupos en Facturación si creces.`;
    }
    return `Precio orientativo para tu delivery: ${parts.join(' · ')}. Plan recomendado: ${plan.name}.`;
  }

  if (exceedsPlanLimits) {
    return `Con ${parts.join(' · ')}, el plan más cercano es ${plan.name}. Puedes ampliar cupos con extras.`;
  }

  return `Plan ${plan.name} según tu infraestructura (${parts.join(' · ')}).`;
}

export interface OnboardingPricingBreakdown {
  baseCost: number;
  extraUsers: number;
  extraPdv: number;
  extraBusinesses: number;
  extraBrands: number;
  extraUsersCost: number;
  extraPdvCost: number;
  extraBusinessesCost: number;
  extraBrandsCost: number;
  total: number;
}

/**
 * Misma fórmula que shared/billing/subscriptionQuote.js:
 * lista mensual (plan + extras a precio mes) → si anual, ×12×0,8.
 * `total` = cuota mensual a mostrar (ya con descuento prorrateado si es anual).
 */
export function calculateOnboardingPricing(params: {
  plan: OnboardingPlanDefinition;
  billingMode: 'monthly' | 'annual';
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
}): OnboardingPricingBreakdown {
  const metrics = normalizeInfrastructureMetrics(params);
  const { plan, billingMode } = params;

  const extraUsers = Math.max(0, metrics.userCount - plan.maxUsers);
  const extraPdv = Math.max(0, metrics.locationCount - plan.maxLocations);
  const extraBusinesses = Math.max(0, metrics.businessCount - plan.maxBusinesses);
  const extraBrands = Math.max(0, metrics.commercialBrandCount - plan.maxCommercialBrands);

  const pdvUnit = getAddonMonthlyPriceEur('extra_pdv');
  const brandUnit = getAddonMonthlyPriceEur('extra_brand');
  const businessUnit = getAddonMonthlyPriceEur('extra_business');
  const userUnit = getAddonMonthlyPriceEur('extra_worker');

  const extraUsersCostList = extraUsers * userUnit;
  const extraPdvCostList = extraPdv * pdvUnit;
  const extraBusinessesCostList = extraBusinesses * businessUnit;
  const extraBrandsCostList = extraBrands * brandUnit;
  const baseCostList = plan.priceMonthly;
  const listMonthly = roundMoney(
    baseCostList + extraUsersCostList + extraPdvCostList + extraBusinessesCostList + extraBrandsCostList,
  );

  const amountDue =
    billingMode === 'annual'
      ? roundMoney(listMonthly * 12 * (1 - PLAN_ADDON_ANNUAL_DISCOUNT))
      : listMonthly;
  const total = billingMode === 'annual' ? roundMoney(amountDue / 12) : listMonthly;
  const ratio = listMonthly > 0 ? total / listMonthly : 1;

  return {
    baseCost: roundMoney(baseCostList * ratio),
    extraUsers,
    extraPdv,
    extraBusinesses,
    extraBrands,
    extraUsersCost: roundMoney(extraUsersCostList * ratio),
    extraPdvCost: roundMoney(extraPdvCostList * ratio),
    extraBusinessesCost: roundMoney(extraBusinessesCostList * ratio),
    extraBrandsCost: roundMoney(extraBrandsCostList * ratio),
    total,
  };
}

/** Importe a pagar ahora (1 mes o 1 año) con la misma fórmula. */
export function calculateOnboardingAmountDue(params: Parameters<typeof calculateOnboardingPricing>[0]): number {
  const metrics = normalizeInfrastructureMetrics(params);
  const listMonthly = roundMoney(
    params.plan.priceMonthly +
      Math.max(0, metrics.userCount - params.plan.maxUsers) * getAddonMonthlyPriceEur('extra_worker') +
      Math.max(0, metrics.locationCount - params.plan.maxLocations) * getAddonMonthlyPriceEur('extra_pdv') +
      Math.max(0, metrics.businessCount - params.plan.maxBusinesses) * getAddonMonthlyPriceEur('extra_business') +
      Math.max(0, metrics.commercialBrandCount - params.plan.maxCommercialBrands) *
        getAddonMonthlyPriceEur('extra_brand'),
  );
  if (params.billingMode === 'annual') {
    return roundMoney(listMonthly * 12 * (1 - PLAN_ADDON_ANNUAL_DISCOUNT));
  }
  return listMonthly;
}

export function recommendOnboardingPlan(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
  deliveryNeeds?: Partial<DeliveryNeedsSelection>;
}) {
  const metrics = normalizeInfrastructureMetrics(params);
  const plans = getPlansForBusinessType(params.businessType);
  const topPlan = plans[plans.length - 1];

  const planId = recommendOnboardingPlanId(params);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const exceedsPlanLimits = infrastructureExceedsPlan(topPlan, metrics);
  const reason = buildRecommendationReason({
    ...params,
    plan,
    exceedsPlanLimits,
  });

  return { planId, plan, reason, exceedsPlanLimits, metrics };
}

export function estimateSubscriptionTotals(params: {
  plan: OnboardingPlanDefinition;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
}): { estimatedMonthlyTotal: number; estimatedAnnualTotal: number } {
  const monthly = calculateOnboardingPricing({
    plan: params.plan,
    billingMode: 'monthly',
    userCount: params.userCount,
    locationCount: params.locationCount,
    businessCount: params.businessCount,
    commercialBrandCount: params.commercialBrandCount,
  });
  const annual = calculateOnboardingPricing({
    plan: params.plan,
    billingMode: 'annual',
    userCount: params.userCount,
    locationCount: params.locationCount,
    businessCount: params.businessCount,
    commercialBrandCount: params.commercialBrandCount,
  });

  return {
    estimatedMonthlyTotal: monthly.total,
    estimatedAnnualTotal: annual.total,
  };
}
