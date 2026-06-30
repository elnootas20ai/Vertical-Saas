/** Defaults Vertial de stock — espejo backend de src/app/lib/vertialStockDefaults.ts */

export const VERTIAL_DELIVERY_STOCK_TEMPLATES = [
  { templateId: 'box-pizza-m', name: 'Caja pizza M', unit: 'ud', costPrice: 0.32 },
  { templateId: 'box-pizza-l', name: 'Caja pizza L', unit: 'ud', costPrice: 0.38 },
  { templateId: 'box-pizza-xl', name: 'Caja pizza XL', unit: 'ud', costPrice: 0.45 },
  { templateId: 'box-burger', name: 'Caja burger', unit: 'ud', costPrice: 0.18 },
  { templateId: 'bag-delivery', name: 'Bolsa delivery', unit: 'ud', costPrice: 0.08 },
  { templateId: 'film-aluminio', name: 'Film aluminio', unit: 'ud', costPrice: 2.5 },
  { templateId: 'servilletas-pack', name: 'Servilletas (pack)', unit: 'ud', costPrice: 1.2 },
];

export const VERTIAL_ORDER_CHANNEL_STOCK_RULES = [
  { deliveryType: 'domicilio', templateId: 'bag-delivery', quantity: 1 },
];

export function findVertialStockTemplate(templateId) {
  return VERTIAL_DELIVERY_STOCK_TEMPLATES.find((t) => t.templateId === templateId);
}

export function resolveOrderChannelStockRules(deliveryType) {
  const dt = String(deliveryType || 'domicilio');
  return VERTIAL_ORDER_CHANNEL_STOCK_RULES.filter((r) => r.deliveryType === dt);
}
