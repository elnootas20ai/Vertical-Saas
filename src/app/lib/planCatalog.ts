/**
 * Catálogo único de planes Vertial (precios, límites, bullets).
 * Onboarding, Ajustes → Facturación y entitlements deben alinearse aquí.
 */

export type VertialPlanId = 'basic' | 'normal' | 'pro';

/** Cupos Pro ampliados durante el lanzamiento; el Pro estándar futuro será 1 PDV · 1 empresa. */
export const PRO_LAUNCH_OFFER = {
  badge: 'Oferta lanzamiento',
  footnote:
    'Incluye 2 marcas, 2 PDV y 2 empresas. El Pro estándar incluirá 1 PDV y 1 empresa.',
} as const;

export interface VertialPlanDefinition {
  id: VertialPlanId;
  name: string;
  displayName: string;
  priceMonthly: number;
  /** Precio mensual equivalente en facturación anual (−20 %). */
  priceAnnualMonthly: number;
  maxUsers: number;
  maxLocations: number;
  maxBusinesses: number;
  maxCommercialBrands: number;
  features: string[];
  launchOffer?: typeof PRO_LAUNCH_OFFER;
}

export const VERTIAL_PLANS: VertialPlanDefinition[] = [
  {
    id: 'basic',
    name: 'BASIC',
    displayName: 'Básico',
    priceMonthly: 49,
    priceAnnualMonthly: 39,
    maxUsers: 2,
    maxLocations: 1,
    maxBusinesses: 1,
    maxCommercialBrands: 1,
    features: [
      '1 empresa · 1 PDV · 1 marca comercial',
      'Operativa del vertical + TPV',
      'Hasta 2 trabajadores',
      'CRM básico (solo clientes)',
      'Calendario y chat de equipo',
      'Dashboard operativo',
    ],
  },
  {
    id: 'normal',
    name: 'NORMAL',
    displayName: 'Mediano',
    priceMonthly: 149,
    priceAnnualMonthly: 119,
    maxUsers: 6,
    maxLocations: 1,
    maxBusinesses: 1,
    maxCommercialBrands: 1,
    features: [
      'Todo lo del plan Básico',
      'Hasta 6 trabajadores',
      'Fichajes',
      'CRM avanzado',
      'RRHH (equipo, horarios, comisiones, nóminas)',
      'Escandallo / costing',
      'Finanzas básicas',
      'Alertas básicas',
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    displayName: 'Pro',
    priceMonthly: 349,
    priceAnnualMonthly: 279,
    maxUsers: 12,
    maxLocations: 2,
    maxBusinesses: 2,
    maxCommercialBrands: 2,
    launchOffer: PRO_LAUNCH_OFFER,
    features: [
      'Todo lo del plan Mediano',
      'Oferta lanzamiento: 2 empresas · 2 PDV · 2 marcas comerciales',
      'Hasta 12 trabajadores',
      'Informes completos y KPIs avanzados',
      'Finanzas avanzadas y conciliación bancaria',
      'Integraciones web, API y webhooks',
      'Multi-empresa / multi-PDV',
      'Soporte prioritario',
    ],
  },
];

export const PLAN_TIER_RANK: Record<VertialPlanId, number> = {
  basic: 0,
  normal: 1,
  pro: 2,
};

export function getVertialPlanById(planId: string): VertialPlanDefinition | undefined {
  const id = String(planId || '').toLowerCase() as VertialPlanId;
  return VERTIAL_PLANS.find((p) => p.id === id);
}

export function resolveVertialPlanId(planId?: string, planName?: string): VertialPlanId {
  const id = String(planId || '').toLowerCase();
  const name = String(planName || '').toLowerCase();
  if (id === 'pro' || name.includes('pro')) return 'pro';
  if (id === 'normal' || name.includes('normal') || name.includes('mediano')) return 'normal';
  return 'basic';
}

/** Plan efectivo cumple mínimo requerido (acumulativo: pro ≥ normal ≥ basic). */
export function planMeetsMinTier(
  userPlan: VertialPlanId,
  minPlan: VertialPlanId,
): boolean {
  return PLAN_TIER_RANK[userPlan] >= PLAN_TIER_RANK[minPlan];
}

export function vertialPlanToPricingFeatures(plan: VertialPlanDefinition) {
  return plan.features.map((text) => ({ text, included: true }));
}
