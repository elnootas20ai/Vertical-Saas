/**
 * Benchmarks EBITDA % fijos por tipo de negocio (plan PRO).
 * Valores orientativos de sector; no inventados por negocio concreto.
 */

import type { BusinessType } from './businessApi';

/** Margen EBITDA típico del sector (% sobre ingresos). */
const BY_BUSINESS_TYPE: Partial<Record<BusinessType, number>> = {
  delivery: 12,
  restaurant: 10,
  butcherShop: 8,
  iceCreamShop: 14,
  carDealership: 4,
  workshop: 9,
  cleaning: 11,
  hairSalon: 15,
  gym: 18,
  clinic: 16,
  hotel: 20,
  construction: 7,
  academy: 18,
  realEstate: 15,
  lawyer: 25,
  nightclub: 12,
  scrapyard: 10,
  spareParts: 8,
  taxi: 10,
  pharmacy: 6,
  carWash: 14,
  vet: 12,
  tobaccoShop: 5,
  events: 10,
};

const BY_VERTICAL_ID: Record<string, number> = {
  delivery: 12,
  restaurant: 10,
  butcher: 8,
  heladeria: 14,
  compraventa: 4,
  realEstate: 15,
};

export function getEbitdaSectorBenchmarkPct(opts: {
  businessType?: string | null;
  verticalId?: string | null;
}): number | null {
  const bt = String(opts.businessType || '').trim() as BusinessType;
  if (bt && BY_BUSINESS_TYPE[bt] != null) return BY_BUSINESS_TYPE[bt]!;
  const vid = String(opts.verticalId || '').trim().toLowerCase();
  if (vid && BY_VERTICAL_ID[vid] != null) return BY_VERTICAL_ID[vid]!;
  return null;
}

export function ebitdaBenchmarkLabel(pct: number) {
  return `${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % sector`;
}
