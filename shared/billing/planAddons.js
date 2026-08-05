/**
 * Catálogo de ampliaciones Vertial (precios en céntimos, alineado con src/app/lib/planAddonCatalog.ts).
 */
export const PLAN_ADDON_CATALOG = {
  extra_pdv: {
    id: 'extra_pdv',
    name: 'Tienda / PDV extra',
    monthlyPrice: 4900,
    annualPrice: 47040,
  },
  extra_brand: {
    id: 'extra_brand',
    name: 'Marca comercial extra',
    monthlyPrice: 1900,
    annualPrice: 18240,
  },
  extra_business: {
    id: 'extra_business',
    name: 'Empresa extra',
    monthlyPrice: 8900,
    annualPrice: 85440,
  },
  extra_worker: {
    id: 'extra_worker',
    name: 'Trabajador extra',
    monthlyPrice: 500,
    annualPrice: 4800,
  },
};

export function getPlanAddon(addonId) {
  return PLAN_ADDON_CATALOG[addonId] || null;
}
