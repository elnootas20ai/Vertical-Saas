import type { StockCount, StockCountLine } from './stockCountApi';
import type { CatalogItem } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import type { InventoryCommercialBrand } from './inventoryUtils';
import { groupStockItemsByOrganizer } from './purchaseSuggestions';

/** Misma fecha local (día de revisión diaria). */
export function isSameLocalDay(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function formatStockDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatStockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function countDiscrepancies(count: StockCount): number {
  return count.lines.filter((l) => l.countedStock !== null && l.difference !== 0).length;
}

export function groupCountsByDay(counts: StockCount[]): { dayKey: string; dayLabel: string; counts: StockCount[] }[] {
  const map = new Map<string, { dayLabel: string; counts: StockCount[] }>();
  for (const c of counts) {
    const iso = c.completedAt || c.updatedAt || c.createdAt;
    const d = new Date(iso);
    const dayKey = Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
    const dayLabel = Number.isNaN(d.getTime())
      ? 'Sin fecha'
      : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const entry = map.get(dayKey) || { dayLabel, counts: [] };
    entry.counts.push(c);
    map.set(dayKey, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, { dayLabel, counts: dayCounts }]) => ({
      dayKey,
      dayLabel,
      counts: dayCounts.sort(
        (a, b) =>
          new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime(),
      ),
    }));
}

/** Ítem mínimo para resolver organizador cuando el catálogo no trae el documento. */
export function catalogItemFromStockCountLine(
  line: Pick<StockCountLine, 'catalogItemId' | 'catalogItemName' | 'sku' | 'stockCategory' | 'unit' | 'costPrice' | 'minStock'>,
): CatalogItem {
  return {
    _id: line.catalogItemId,
    id: line.catalogItemId,
    name: line.catalogItemName || '',
    sku: line.sku || '',
    stockCategory: line.stockCategory || 'other',
    unit: line.unit || 'ud',
    costPrice: Number(line.costPrice || 0),
    minStock: Number(line.minStock || 0),
    stockQuantity: 0,
    module: 'stock',
    isStockItem: true,
    active: true,
  } as CatalogItem;
}

export type RevisionEntryGroup<T extends { line: Pick<StockCountLine, 'catalogItemId'> }> = {
  organizerId: string;
  organizerLabel: string;
  entries: T[];
};

/** Agrupa líneas de revisión con el mismo criterio que Inventario / Compras. */
export function groupRevisionEntriesByOrganizer<
  T extends {
    line: Pick<
      StockCountLine,
      'catalogItemId' | 'catalogItemName' | 'sku' | 'stockCategory' | 'unit' | 'costPrice' | 'minStock'
    >;
  },
>(
  entries: T[],
  catalogItems: CatalogItem[] = [],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): RevisionEntryGroup<T>[] {
  if (entries.length === 0) return [];

  const byId = new Map(
    catalogItems.map((item) => [String(item._id || item.id || ''), item] as const),
  );
  const uniqueItems: CatalogItem[] = [];
  const entriesByItemId = new Map<string, T[]>();

  for (const entry of entries) {
    const id = String(entry.line.catalogItemId || '').trim();
    if (!id) continue;
    if (!entriesByItemId.has(id)) {
      entriesByItemId.set(id, []);
      uniqueItems.push(byId.get(id) || catalogItemFromStockCountLine(entry.line));
    }
    entriesByItemId.get(id)!.push(entry);
  }

  const groups = groupStockItemsByOrganizer(uniqueItems, storeIngredients, commercialBrands);
  return groups
    .map((group) => ({
      organizerId: group.organizerId,
      organizerLabel: group.organizerLabel,
      entries: group.items.flatMap((item) => entriesByItemId.get(String(item._id || item.id || '')) || []),
    }))
    .filter((group) => group.entries.length > 0);
}
