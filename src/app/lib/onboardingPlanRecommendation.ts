/**
 * Recomendación de plan y precio durante el onboarding.
 * Usa businessType, métricas de infraestructura y requestedModules (mismas claves que setupSteps).
 */

import {
  getAddonMonthlyPriceEur,
  PLAN_ADDON_ANNUAL_DISCOUNT,
} from './planAddonCatalog';

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

const EXTRA_USER_MONTHLY = 5;

function addonUnitMonthlyPrice(baseEur: number, billingMode: 'monthly' | 'annual'): number {
  if (billingMode === 'monthly') return baseEur;
  return Math.round(baseEur * (1 - PLAN_ADDON_ANNUAL_DISCOUNT));
}

const DEFAULT_PLANS: OnboardingPlanDefinition[] = [
  {
    id: 'basic',
    name: 'BASIC',
    priceMonthly: 49,
    priceAnnual: 39,
    maxUsers: 2,
    maxLocations: 1,
    maxBusinesses: 1,
    maxCommercialBrands: 0,
    features: [
      '1 empresa · 1 PDV',
      'Marca principal incluida (General)',
      'Hasta 2 trabajadores',
      'Stock y operaciones',
      'CRM básico',
    ],
  },
  {
    id: 'normal',
    name: 'NORMAL',
    priceMonthly: 149,
    priceAnnual: 119,
    maxUsers: 5,
    maxLocations: 1,
    maxBusinesses: 1,
    maxCommercialBrands: 0,
    features: [
      '1 empresa · 1 PDV',
      'Marca principal incluida (General)',
      'Hasta 5 trabajadores',
      'Firma digital',
      'KPIs avanzados',
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    priceMonthly: 349,
    priceAnnual: 279,
    maxUsers: 12,
    maxLocations: 2,
    maxBusinesses: 3,
    maxCommercialBrands: 1,
    features: [
      'Hasta 3 empresas · 2 PDV',
      '1 línea comercial extra (p. ej. Pizzería)',
      'Hasta 12 trabajadores',
      'API y webhooks',
      'Soporte prioritario',
    ],
  },
];

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
    analytics: !!modules.analytics,
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
  carDealership: 'Compraventa',
  workshop: 'Taller',
  events: 'Eventos',
};

export function getVerticalLabel(businessType: string): string {
  return VERTICAL_LABELS[businessType] ?? 'Tu negocio';
}

export function getPlansForBusinessType(_businessType: string): OnboardingPlanDefinition[] {
  return DEFAULT_PLANS;
}

export function isDeliveryBusinessType(businessType: string): boolean {
  return businessType === 'delivery';
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
  if (businessType === 'delivery') {
    return getSelectedDeliveryNeedLabels(modulesToDeliveryNeeds(modules));
  }
  return getNeedsOptionsForBusinessType(businessType)
    .filter((o) => modules[o.key] === true)
    .map((o) => o.title);
}

export function countEnabledModules(modules: Partial<RequestedModules>): number {
  return Object.values(modules).filter(Boolean).length;
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
  if (moduleCount >= 5) tier = Math.max(tier, 1);

  // PRO: varias empresas, varios PDV o líneas comerciales extra (Pizzería, Burger…)
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

const TIER_TO_PLAN: OnboardingPlanId[] = ['basic', 'normal', 'pro'];

export function recommendOnboardingPlanId(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
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

  return TIER_TO_PLAN[Math.min(tier, 2)];
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
      `${metrics.commercialBrandCount} línea${metrics.commercialBrandCount !== 1 ? 's' : ''} comercial${metrics.commercialBrandCount !== 1 ? 'es' : ''} extra`,
    );
  }

  const selected = getSelectedModuleLabels(businessType, modules);
  if (selected.length > 0) {
    parts.push(`módulos: ${selected.slice(0, 3).join(', ')}${selected.length > 3 ? '…' : ''}`);
  }

  if (metrics.commercialBrandCount > 0 && plan.maxCommercialBrands === 0) {
    return `Con líneas comerciales extra necesitas al menos el plan PRO. Tu operativa: ${parts.join(' · ')}.`;
  }

  if (isDeliveryBusinessType(businessType)) {
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

  const pdvUnit = addonUnitMonthlyPrice(getAddonMonthlyPriceEur('extra_pdv'), billingMode);
  const brandUnit = addonUnitMonthlyPrice(getAddonMonthlyPriceEur('extra_brand'), billingMode);
  const businessUnit = addonUnitMonthlyPrice(getAddonMonthlyPriceEur('extra_business'), billingMode);
  const userUnit = billingMode === 'annual'
    ? Math.round(EXTRA_USER_MONTHLY * (1 - PLAN_ADDON_ANNUAL_DISCOUNT))
    : EXTRA_USER_MONTHLY;

  const extraUsersCost = extraUsers * userUnit;
  const extraPdvCost = extraPdv * pdvUnit;
  const extraBusinessesCost = extraBusinesses * businessUnit;
  const extraBrandsCost = extraBrands * brandUnit;
  const baseCost = billingMode === 'monthly' ? plan.priceMonthly : plan.priceAnnual;
  const total = baseCost + extraUsersCost + extraPdvCost + extraBusinessesCost + extraBrandsCost;

  return {
    baseCost,
    extraUsers,
    extraPdv,
    extraBusinesses,
    extraBrands,
    extraUsersCost,
    extraPdvCost,
    extraBusinessesCost,
    extraBrandsCost,
    total,
  };
}

export function recommendOnboardingPlan(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  businessCount?: number;
  commercialBrandCount?: number;
  modules: Partial<RequestedModules>;
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
