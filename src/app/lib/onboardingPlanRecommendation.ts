/**
 * Recomendación de plan y precio durante el onboarding.
 * Usa businessType, métricas (usuarios/locales) y requestedModules (mismas claves que setupSteps).
 */

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
  features: string[];
}

export interface NeedsOptionDefinition {
  key: RequestedModuleKey;
  title: string;
  description: string;
}

const EXTRA_USER_MONTHLY = 5;
const EXTRA_LOCATION_MONTHLY = 25;

const DEFAULT_PLANS: OnboardingPlanDefinition[] = [
  {
    id: 'basic',
    name: 'BASIC',
    priceMonthly: 49,
    priceAnnual: 39,
    maxUsers: 2,
    maxLocations: 1,
    features: [
      'Hasta 2 usuarios',
      '1 ubicación',
      'Stock y operaciones',
      'CRM básico',
      'Documentos esenciales',
    ],
  },
  {
    id: 'normal',
    name: 'NORMAL',
    priceMonthly: 149,
    priceAnnual: 119,
    maxUsers: 5,
    maxLocations: 1,
    features: [
      'Hasta 5 usuarios',
      '1 ubicación',
      'Firma digital',
      'Gestoría integrada',
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
    features: [
      'Hasta 12 usuarios',
      'Hasta 2 ubicaciones',
      'API y webhooks',
      'Soporte prioritario',
      'Onboarding personalizado',
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

function planTierForDefault(
  userCount: number,
  locationCount: number,
  modules: Partial<RequestedModules>,
): number {
  const moduleCount = countEnabledModules(modules);
  let tier = 0;

  if (userCount > 2 || locationCount > 1) tier = Math.max(tier, 1);
  if (modules.analytics || modules.documentation) tier = Math.max(tier, 1);
  if (modules.workshop && userCount > 3) tier = Math.max(tier, 1);
  if (moduleCount >= 5) tier = Math.max(tier, 1);
  if (userCount > 8 || locationCount > 2) tier = 2;
  if (userCount > 5 && locationCount > 1) tier = Math.max(tier, 2);

  return tier;
}

const TIER_TO_PLAN: OnboardingPlanId[] = ['basic', 'normal', 'pro'];

export function recommendOnboardingPlanId(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  modules: Partial<RequestedModules>;
}): OnboardingPlanId {
  const { businessType, userCount, locationCount, modules } = params;
  const plans = getPlansForBusinessType(businessType);
  const topPlan = plans[plans.length - 1];

  if (userCount > topPlan.maxUsers || locationCount > topPlan.maxLocations) {
    return 'pro';
  }

  const tier = planTierForDefault(userCount, locationCount, modules);

  return TIER_TO_PLAN[Math.min(tier, 2)];
}

export function buildRecommendationReason(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  modules: Partial<RequestedModules>;
  plan: OnboardingPlanDefinition;
  exceedsPlanLimits: boolean;
}): string {
  const { businessType, userCount, locationCount, modules, plan, exceedsPlanLimits } = params;
  const parts: string[] = [];

  parts.push(
    `${userCount} usuario${userCount !== 1 ? 's' : ''}`,
    `${locationCount} local${locationCount !== 1 ? 'es' : ''}`,
  );

  const selected = getSelectedModuleLabels(businessType, modules);
  if (selected.length > 0) {
    parts.push(`módulos: ${selected.slice(0, 3).join(', ')}${selected.length > 3 ? '…' : ''}`);
  }

  if (isDeliveryBusinessType(businessType)) {
    if (exceedsPlanLimits) {
      return `Para ${parts.join(' y ')}, recomendamos ${plan.name}. Puedes ampliar usuarios o locales según crezca tu operación.`;
    }
    return `Precio orientativo para tu delivery: ${parts.join(' · ')}. Plan recomendado: ${plan.name}.`;
  }

  if (exceedsPlanLimits) {
    return `Con ${parts.join(' y ')}, el plan más cercano es ${plan.name}. Puedes ampliar usuarios o locales con extras.`;
  }

  return `Plan ${plan.name} según tu operativa (${parts.join(' · ')}).`;
}

export interface OnboardingPricingBreakdown {
  baseCost: number;
  extraUsers: number;
  extraLocations: number;
  extraUsersCost: number;
  extraLocationsCost: number;
  total: number;
}

export function calculateOnboardingPricing(params: {
  plan: OnboardingPlanDefinition;
  billingMode: 'monthly' | 'annual';
  userCount: number;
  locationCount: number;
}): OnboardingPricingBreakdown {
  const { plan, billingMode, userCount, locationCount } = params;
  const extraUsers = Math.max(0, userCount - plan.maxUsers);
  const extraLocations = Math.max(0, locationCount - plan.maxLocations);
  const extraUsersCost = extraUsers * EXTRA_USER_MONTHLY;
  const extraLocationsCost = extraLocations * EXTRA_LOCATION_MONTHLY;
  const baseCost = billingMode === 'monthly' ? plan.priceMonthly : plan.priceAnnual;
  const total = baseCost + extraUsersCost + extraLocationsCost;

  return { baseCost, extraUsers, extraLocations, extraUsersCost, extraLocationsCost, total };
}

export function recommendOnboardingPlan(params: {
  businessType: string;
  userCount: number;
  locationCount: number;
  modules: Partial<RequestedModules>;
}) {
  const plans = getPlansForBusinessType(params.businessType);
  const topPlan = plans[plans.length - 1];
  const exceedsPlanLimits =
    params.userCount > topPlan.maxUsers || params.locationCount > topPlan.maxLocations;

  const planId = recommendOnboardingPlanId(params);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const reason = buildRecommendationReason({
    ...params,
    plan,
    exceedsPlanLimits,
  });

  return { planId, plan, reason, exceedsPlanLimits };
}

export function estimateSubscriptionTotals(params: {
  plan: OnboardingPlanDefinition;
  userCount: number;
  locationCount: number;
}): { estimatedMonthlyTotal: number; estimatedAnnualTotal: number } {
  const monthly = calculateOnboardingPricing({
    plan: params.plan,
    billingMode: 'monthly',
    userCount: params.userCount,
    locationCount: params.locationCount,
  });
  const annual = calculateOnboardingPricing({
    plan: params.plan,
    billingMode: 'annual',
    userCount: params.userCount,
    locationCount: params.locationCount,
  });

  return {
    estimatedMonthlyTotal: monthly.total,
    estimatedAnnualTotal: annual.total,
  };
}
