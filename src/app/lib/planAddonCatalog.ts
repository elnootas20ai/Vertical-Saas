/**
 * Ampliaciones de suscripción Vertial (add-ons mensuales).
 * Fuente única para UI, gates de upgrade y referencia de facturación.
 */
export type PlanAddonId =
  | 'extra_pdv'
  | 'extra_brand'
  | 'extra_business'
  | 'extra_worker'
  | 'extra_tpv_tablet';

export type PlanAddonDefinition = {
  id: PlanAddonId;
  name: string;
  shortLabel: string;
  description: string;
  /** Precio de catálogo en euros (mensual). */
  monthlyPriceEur: number;
  requiresProPlan: boolean;
};

export const PLAN_ADDON_ANNUAL_DISCOUNT = 0.2;

export const PLAN_ADDON_CATALOG: Record<PlanAddonId, PlanAddonDefinition> = {
  extra_pdv: {
    id: 'extra_pdv',
    name: 'Tienda / PDV extra',
    shortLabel: '+1 tienda',
    description: 'Punto de venta adicional con TPV, stock y operativa propia.',
    monthlyPriceEur: 49,
    requiresProPlan: true,
  },
  extra_brand: {
    id: 'extra_brand',
    name: 'Marca comercial extra',
    shortLabel: '+1 marca',
    description: 'Línea de catálogo adicional (p. ej. Pizzería, Burger). No cuenta «General».',
    monthlyPriceEur: 19,
    requiresProPlan: true,
  },
  extra_business: {
    id: 'extra_business',
    name: 'Empresa extra',
    shortLabel: '+1 empresa',
    description: 'Segundo negocio o vertical en la misma cuenta, con datos aislados.',
    monthlyPriceEur: 89,
    requiresProPlan: true,
  },
  extra_worker: {
    id: 'extra_worker',
    name: 'Trabajador extra',
    shortLabel: '+1 trabajador',
    description: 'Plaza adicional de trabajador (invitación / acceso empleado).',
    monthlyPriceEur: 5,
    requiresProPlan: false,
  },
  extra_tpv_tablet: {
    id: 'extra_tpv_tablet',
    name: 'SVA · Tablet TPV extra',
    shortLabel: '+1 tablet TPV',
    description: 'Dispositivo TPV adicional en una tienda (2 tablets incluidas por PDV).',
    monthlyPriceEur: 9.9,
    requiresProPlan: true,
  },
};

export const PLAN_ADDON_LIST: PlanAddonDefinition[] = Object.values(PLAN_ADDON_CATALOG);

export function isPlanAddonId(value: unknown): value is PlanAddonId {
  return typeof value === 'string' && value in PLAN_ADDON_CATALOG;
}

export function getAddonMonthlyPriceEur(addonId: PlanAddonId): number {
  return PLAN_ADDON_CATALOG[addonId].monthlyPriceEur;
}

export function getAddonAnnualTotalEur(addonId: PlanAddonId): number {
  return Math.round(getAddonMonthlyPriceEur(addonId) * 12 * (1 - PLAN_ADDON_ANNUAL_DISCOUNT));
}

function formatEurAmount(value: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatAddonPrice(
  addonId: PlanAddonId,
  mode: 'monthly' | 'annual' = 'monthly',
): string {
  if (mode === 'annual') {
    return `${formatEurAmount(getAddonAnnualTotalEur(addonId))}€/año`;
  }
  return `${formatEurAmount(getAddonMonthlyPriceEur(addonId))}€/mes`;
}

export function formatAddonPriceShort(addonId: PlanAddonId): string {
  return `+${formatEurAmount(getAddonMonthlyPriceEur(addonId))}€/mes`;
}

/** Precio en céntimos (MONEI / backend). */
export function getAddonMonthlyPriceCents(addonId: PlanAddonId): number {
  return Math.round(getAddonMonthlyPriceEur(addonId) * 100);
}

export function getAddonAnnualPriceCents(addonId: PlanAddonId): number {
  return Math.round(getAddonAnnualTotalEur(addonId) * 100);
}
