import type { CatalogItem, StockCategory } from './deliveryApi';
import type { MovementType } from './stockMovementApi';

export type InventoryStatus = 'ok' | 'low' | 'out' | 'negative';

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  ingredient: 'Ingrediente',
  beverage: 'Bebida',
  packaging: 'Envase',
  cleaning: 'Limpieza',
  consumable: 'Consumible',
  finished_product: 'Producto terminado',
  other: 'Otro',
};

export function readInventoryProductBrand(item: Pick<CatalogItem, 'customFields' | 'supplierName'>): string {
  const fromCustom = String(item.customFields?.productBrand || '').trim();
  if (fromCustom) return fromCustom;
  return String(item.supplierName || '').trim();
}

export function readInventoryCategoryLabel(item: Pick<CatalogItem, 'category' | 'stockCategory'>): string {
  if (item.stockCategory && STOCK_CATEGORY_LABELS[item.stockCategory]) {
    return STOCK_CATEGORY_LABELS[item.stockCategory];
  }
  return String(item.category || '').trim() || '—';
}

export function inventoryStatus(item: Pick<CatalogItem, 'stockQuantity' | 'minStock'>): InventoryStatus {
  const qty = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

export function inventoryStatusLabel(status: InventoryStatus): string {
  if (status === 'ok') return 'Correcto';
  if (status === 'low') return 'Bajo';
  if (status === 'out') return 'Sin stock';
  return 'Negativo';
}

export function inventoryStatusClass(status: InventoryStatus): string {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'low') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (status === 'out') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  return 'bg-gray-900 text-white dark:bg-white dark:text-gray-900';
}

export function computeInventoryStats(items: CatalogItem[]) {
  let ok = 0;
  let low = 0;
  let out = 0;
  let negative = 0;
  let value = 0;
  for (const item of items) {
    const status = inventoryStatus(item);
    if (status === 'ok') ok += 1;
    else if (status === 'low') low += 1;
    else if (status === 'out') out += 1;
    else negative += 1;
    value += Number(item.stockQuantity || 0) * Number(item.costPrice || 0);
  }
  return {
    total: items.length,
    ok,
    low,
    out,
    negative,
    estimatedValue: Math.round(value * 100) / 100,
  };
}

export type InventoryOrganizerGroup = {
  id: string;
  label: string;
  stockCategory?: StockCategory;
  ok: number;
  low: number;
  out: number;
  negative: number;
  total: number;
};

const ORGANIZER_STOCK_CATEGORIES: StockCategory[] = [
  'ingredient',
  'beverage',
  'packaging',
  'finished_product',
  'consumable',
  'cleaning',
  'other',
];

function countStatusForItems(items: CatalogItem[]) {
  let ok = 0;
  let low = 0;
  let out = 0;
  let negative = 0;
  for (const item of items) {
    const s = inventoryStatus(item);
    if (s === 'ok') ok += 1;
    else if (s === 'low') low += 1;
    else if (s === 'out') out += 1;
    else negative += 1;
  }
  return { ok, low, out, negative, total: items.length };
}

/** Agrupa inventario por tipo de almacén con conteos de semáforo. */
export function buildInventoryOrganizerGroups(items: CatalogItem[]): InventoryOrganizerGroup[] {
  const all = countStatusForItems(items);
  const groups: InventoryOrganizerGroup[] = [
    { id: 'all', label: 'Todo', ...all },
  ];

  for (const cat of ORGANIZER_STOCK_CATEGORIES) {
    const subset = items.filter((item) => (item.stockCategory || 'other') === cat);
    if (subset.length === 0) continue;
    groups.push({
      id: cat,
      label: STOCK_CATEGORY_LABELS[cat],
      stockCategory: cat,
      ...countStatusForItems(subset),
    });
  }

  return groups;
}

export function filterItemsByOrganizer(
  items: CatalogItem[],
  organizerId: string,
): CatalogItem[] {
  if (!organizerId || organizerId === 'all') return items;
  return items.filter((item) => (item.stockCategory || 'other') === organizerId);
}

export function movementTypeLabel(type: MovementType | string): string {
  const map: Record<string, string> = {
    purchase_reception: 'Entrada compra',
    sale: 'Venta',
    internal_consumption: 'Consumo interno',
    adjustment_in: 'Entrada',
    adjustment_out: 'Salida',
    transfer: 'Transferencia',
    return_supplier: 'Devolución proveedor',
    return_customer: 'Devolución cliente',
    initial: 'Stock inicial',
  };
  return map[String(type)] || String(type);
}

export function formatInventoryMoney(value: number): string {
  return `${value.toFixed(2)} €`;
}

export type PurchaseSuggestion = {
  quantity: number;
  stockAfter: number;
};

/** Cantidad sugerida para reponer stock bajo o agotado. */
export function computePurchaseSuggestion(
  item: Pick<CatalogItem, 'stockQuantity' | 'minStock' | 'reorderQuantity'>,
): PurchaseSuggestion {
  const current = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  const reorder = Number(item.reorderQuantity || 0);

  let quantity = 0;

  if (min > 0 && current < min) {
    quantity = Math.ceil(min - current);
  } else if (current <= 0) {
    quantity = Math.max(reorder || min || 1, 1);
  } else {
    quantity = Math.max(reorder || 1, 1);
  }

  if (current <= 0 && reorder > 0) {
    quantity = Math.max(quantity, reorder);
  }

  quantity = Math.ceil(Math.max(quantity, 1));
  return { quantity, stockAfter: current + quantity };
}
