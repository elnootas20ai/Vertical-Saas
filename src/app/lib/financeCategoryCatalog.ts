export type FinanceEbitdaBucket = 'income' | 'cogs' | 'opex' | 'non_operating';

export interface FinanceCategoryDef {
  slug: string;
  label: string;
  icon: string;
  movementType: 'cobro' | 'pago';
  ebitdaBucket: FinanceEbitdaBucket;
}

/** Catálogo único de categorías financieras (core multi-vertical). */
export const FINANCE_CATEGORY_CATALOG: FinanceCategoryDef[] = [
  { slug: 'ventas', label: 'Ventas', icon: '🛒', movementType: 'cobro', ebitdaBucket: 'income' },
  { slug: 'venta_vehiculo', label: 'Venta vehículo', icon: '🚗', movementType: 'cobro', ebitdaBucket: 'income' },
  { slug: 'servicios', label: 'Servicios', icon: '🔧', movementType: 'cobro', ebitdaBucket: 'income' },
  { slug: 'comisiones', label: 'Comisiones', icon: '🤝', movementType: 'cobro', ebitdaBucket: 'income' },
  { slug: 'otros_ingresos', label: 'Otros ingresos', icon: '📦', movementType: 'cobro', ebitdaBucket: 'income' },
  { slug: 'compras_stock', label: 'Compra stock', icon: '📦', movementType: 'pago', ebitdaBucket: 'cogs' },
  { slug: 'materiales', label: 'Materiales', icon: '🧱', movementType: 'pago', ebitdaBucket: 'cogs' },
  { slug: 'proveedores', label: 'Proveedores', icon: '🏭', movementType: 'pago', ebitdaBucket: 'cogs' },
  { slug: 'personal', label: 'Personal', icon: '👥', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'alquiler', label: 'Alquiler', icon: '🏠', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'suministros', label: 'Suministros', icon: '💡', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'seguros', label: 'Seguros', icon: '🛡️', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'marketing', label: 'Marketing', icon: '📣', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'transporte', label: 'Transporte', icon: '🚛', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'mantenimiento', label: 'Mantenimiento', icon: '🔩', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'software', label: 'Software', icon: '💻', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'asesoria', label: 'Asesoría', icon: '📋', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'comisiones_gasto', label: 'Comisiones (gasto)', icon: '🤝', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'otros_gastos', label: 'Otros gastos', icon: '📦', movementType: 'pago', ebitdaBucket: 'opex' },
  { slug: 'impuestos', label: 'Impuestos', icon: '🏛️', movementType: 'pago', ebitdaBucket: 'non_operating' },
  { slug: 'intereses', label: 'Intereses', icon: '🏦', movementType: 'pago', ebitdaBucket: 'non_operating' },
];

const ALIAS_TO_SLUG: Record<string, string> = {
  venta: 'ventas',
  'venta vehiculo': 'venta_vehiculo',
  'venta vehículo': 'venta_vehiculo',
  'compra stock': 'compras_stock',
  compra_stock: 'compras_stock',
  'compras stock': 'compras_stock',
  compras_proveedor: 'proveedores',
  'compras proveedor': 'proveedores',
  financiero: 'intereses',
  financiacion: 'intereses',
  financiación: 'intereses',
  'comisiones bancarias': 'intereses',
  asesoría: 'asesoria',
};

function normKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

const SLUG_MAP = new Map<string, FinanceCategoryDef>();
for (const cat of FINANCE_CATEGORY_CATALOG) {
  SLUG_MAP.set(cat.slug, cat);
  SLUG_MAP.set(normKey(cat.label), cat);
}
for (const [alias, slug] of Object.entries(ALIAS_TO_SLUG)) {
  const def = SLUG_MAP.get(slug);
  if (def) SLUG_MAP.set(normKey(alias), def);
}

export function normalizeCategorySlug(category: string): string {
  const raw = String(category || '').trim();
  if (!raw) return '';
  const key = normKey(raw);
  return SLUG_MAP.get(key)?.slug || key;
}

export function getCategoryDef(
  category: string,
  movementType?: 'cobro' | 'pago',
): FinanceCategoryDef | null {
  const slug = normalizeCategorySlug(category);
  const bySlug = FINANCE_CATEGORY_CATALOG.filter((c) => c.slug === slug);
  if (bySlug.length === 1) return bySlug[0];
  if (bySlug.length > 1 && movementType) {
    return bySlug.find((c) => c.movementType === movementType) || bySlug[0];
  }
  const key = normKey(category);
  return SLUG_MAP.get(key) || null;
}

export function getCategoryLabel(category: string, movementType?: 'cobro' | 'pago'): string {
  return getCategoryDef(category, movementType)?.label || category;
}

export function getCategoryEbitdaBucket(
  category: string,
  movementType: 'cobro' | 'pago',
): FinanceEbitdaBucket {
  if (movementType === 'cobro') {
    const def = getCategoryDef(category, 'cobro');
    if (def?.ebitdaBucket === 'non_operating') return 'non_operating';
    return 'income';
  }
  const def = getCategoryDef(category, 'pago');
  if (def) return def.ebitdaBucket;
  const n = normKey(category);
  if (n.includes('compra') && (n.includes('stock') || n.includes('proveedor') || n.includes('material'))) {
    return 'cogs';
  }
  if (n.includes('impuesto') || n.includes('interes') || n.includes('financ')) {
    return 'non_operating';
  }
  return 'opex';
}

export const FINANCE_INCOME_CATEGORIES = FINANCE_CATEGORY_CATALOG.filter((c) => c.movementType === 'cobro');
export const FINANCE_EXPENSE_CATEGORIES = FINANCE_CATEGORY_CATALOG.filter((c) => c.movementType === 'pago');
