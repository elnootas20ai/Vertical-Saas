/**
 * Catálogo único de planes Vertial (precios, límites, bullets).
 * Onboarding, Ajustes → Mi plan y entitlements deben alinearse aquí.
 *
 * Alertas (regla comercial):
 * - Básico → alertas positivas (lo que salió bien)
 * - Pro → alertas negativas (avisan de cosas malas: caja, dinero, operación)
 * - Mediano → puente (positivas + pack operativo básico)
 */

export type VertialPlanId = 'basic' | 'normal' | 'pro';

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
      'Alertas positivas (lo que salió bien)',
    ],
  },
  {
    id: 'normal',
    name: 'NORMAL',
    displayName: 'Mediano',
    priceMonthly: 149,
    priceAnnualMonthly: 119,
    maxUsers: 4,
    maxLocations: 1,
    maxBusinesses: 1,
    maxCommercialBrands: 1,
    features: [
      'Todo lo del plan Básico',
      '1 tienda · hasta 4 trabajadores',
      'Inventario / stock',
      'Escandallo / costing',
      'Compras con OCR (foto/subida)',
      'Sin correo automático de facturas (IMAP = Pro)',
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    displayName: 'Pro',
    priceMonthly: 349,
    priceAnnualMonthly: 279,
    maxUsers: 12,
    maxLocations: 1,
    maxBusinesses: 2,
    maxCommercialBrands: 2,
    features: [
      'Todo lo del plan Mediano',
      '1 PDV incluido · PDV extra de pago',
      '2 empresas · 2 marcas comerciales',
      'Hasta 12 trabajadores',
      'Informes completos y KPIs avanzados',
      'Finanzas avanzadas y conciliación bancaria',
      'Integraciones web, API y webhooks',
      'Multi-empresa (PDV adicionales contratables)',
      'Alertas negativas (avisan de problemas: caja, dinero, operación)',
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
