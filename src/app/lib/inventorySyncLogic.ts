import type { CatalogItem, StockCategory } from './deliveryApi';
import {
  isIngredientMetaLabel,
  parseIngredientsBulkText,
  type StoreIngredient,
} from './catalogCustomization';
import {
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
  effectiveStoreIngredientBaseCost,
  resolveVertialDefaultBaseCost,
} from './vertialDefaultCosts';
import {
  inferResaleStockCategory,
  isCatalogResaleStockProduct,
  VERTIAL_DELIVERY_STOCK_TEMPLATES,
  type VertialStockTemplate,
} from './vertialStockDefaults';

export type InventoryCandidateSource =
  | 'store_ingredient'
  | 'catalog_text'
  | 'vertial_template'
  | 'catalog_resale';

export type InventoryCandidate = {
  name: string;
  storeIngredientId?: string;
  templateId?: string;
  linkedCatalogItemId?: string;
  baseCost?: number;
  stockCategory: StockCategory;
  unit?: string;
  source: InventoryCandidateSource;
};

export function foldIngredientKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function slugInventorySku(name: string): string {
  const base = foldIngredientKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return base ? `INV-${base}` : `INV-${Date.now()}`;
}

export function inferInventoryStockCategory(name: string): StockCategory {
  const folded = foldIngredientKey(name);
  if (/bebida|refresco|cerveza|agua|zumo|cola|nestea|pepsi|fanta/.test(folded)) return 'beverage';
  if (/envase|bolsa|caja|packaging|film|aluminio/.test(folded)) return 'packaging';
  if (/limpieza|deterg|desinfect|papel secamanos/.test(folded)) return 'cleaning';
  if (/servilleta|vaso|cubiert|palillo/.test(folded)) return 'consumable';
  return 'ingredient';
}

export function defaultUnitForIngredient(name: string, stockCategory?: StockCategory): string {
  if (stockCategory === 'beverage' || stockCategory === 'finished_product' || stockCategory === 'packaging') {
    return 'ud';
  }
  const folded = foldIngredientKey(name);
  if (/huevo|loncha|pan\b|bollo|brioche|tequeño|nugget|ud\b/.test(folded)) return 'ud';
  if (/agua|leche|zumo|aceite|litro|ml\b|bebida|refresco/.test(folded)) return 'L';
  return 'kg';
}

export function resolveCandidateCost(
  candidate: InventoryCandidate,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  if (candidate.baseCost != null && Number.isFinite(candidate.baseCost) && candidate.baseCost >= 0) {
    return Math.round(candidate.baseCost * 100) / 100;
  }
  const lineKind = brands?.[0]?.deliveryLineKind;
  const fallback = resolveVertialDefaultBaseCost(candidate.name, lineKind);
  return fallback ?? 0;
}

export function inventoryCandidateExclusionKey(
  candidate: Pick<InventoryCandidate, 'name' | 'templateId' | 'storeIngredientId' | 'linkedCatalogItemId'>,
): string {
  if (candidate.templateId) return `tpl:${candidate.templateId}`;
  if (candidate.linkedCatalogItemId) return `cat:${candidate.linkedCatalogItemId}`;
  if (candidate.storeIngredientId) return `id:${candidate.storeIngredientId}`;
  return `name:${foldIngredientKey(candidate.name)}`;
}

export function inventoryItemKey(item: Pick<CatalogItem, 'name' | 'customFields'>): string {
  const templateId = String(item.customFields?.vertialStockTemplateId || '').trim();
  if (templateId) return `tpl:${templateId}`;
  const linkedCatalog = String(item.customFields?.linkedCatalogItemId || '').trim();
  if (linkedCatalog) return `cat:${linkedCatalog}`;
  const linked = String(item.customFields?.storeIngredientId || '').trim();
  if (linked) return `id:${linked}`;
  return `name:${foldIngredientKey(item.name)}`;
}

function templateToCandidate(template: VertialStockTemplate): InventoryCandidate {
  return {
    name: template.name,
    templateId: template.templateId,
    baseCost: template.costPrice,
    stockCategory: template.stockCategory,
    unit: template.unit,
    source: 'vertial_template',
  };
}

export function collectInventoryCandidates(
  storeIngredients: StoreIngredient[],
  catalogItems: Array<
    Pick<CatalogItem, '_id' | 'name' | 'category' | 'customFields' | 'module' | 'itemType' | 'stockCategory' | 'costPrice'>
  >,
  options?: { includeVertialTemplates?: boolean; includeCatalogResale?: boolean },
): InventoryCandidate[] {
  const includeVertialTemplates = options?.includeVertialTemplates !== false;
  const includeCatalogResale = options?.includeCatalogResale !== false;
  const byKey = new Map<string, InventoryCandidate>();

  const add = (candidate: InventoryCandidate) => {
    const name = String(candidate.name || '').trim();
    if (!name || isIngredientMetaLabel(name)) return;
    const key = candidate.templateId
      ? `tpl:${candidate.templateId}`
      : candidate.linkedCatalogItemId
        ? `cat:${candidate.linkedCatalogItemId}`
        : foldIngredientKey(name);
    if (!key || key.length < 2) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, candidate);
      return;
    }
    if (!prev.storeIngredientId && candidate.storeIngredientId) {
      byKey.set(key, { ...candidate, name: prev.name.length >= name.length ? prev.name : name });
    }
  };

  if (includeVertialTemplates) {
    for (const template of VERTIAL_DELIVERY_STOCK_TEMPLATES) {
      add(templateToCandidate(template));
    }
  }

  for (const ing of storeIngredients) {
    const name = String(ing.name || '').trim();
    if (!name) continue;
    const baseCost = effectiveStoreIngredientBaseCost(ing);
    add({
      name,
      storeIngredientId: ing.id,
      baseCost: baseCost > 0 ? baseCost : undefined,
      stockCategory: inferInventoryStockCategory(name),
      source: 'store_ingredient',
    });
  }

  for (const item of catalogItems) {
    if (item.module === 'stock') continue;
    if (item.itemType && item.itemType !== 'product') continue;

    if (includeCatalogResale && isCatalogResaleStockProduct(item)) {
      const stockCategory = inferResaleStockCategory(item);
      add({
        name: String(item.name || '').trim(),
        linkedCatalogItemId: String(item._id || '').trim(),
        baseCost: Number(item.costPrice) > 0 ? Number(item.costPrice) : undefined,
        stockCategory,
        unit: 'ud',
        source: 'catalog_resale',
      });
      continue;
    }

    if (isDrinkCatalogProduct(item) || isDessertCatalogProduct(item)) continue;
    const text = String(item.customFields?.ingredients || '').trim();
    if (!text) continue;
    for (const rawName of parseIngredientsBulkText(text)) {
      add({
        name: rawName,
        stockCategory: inferInventoryStockCategory(rawName),
        source: 'catalog_text',
      });
    }
  }

  return [...byKey.values()];
}

export function buildInventoryLookupMaps(items: CatalogItem[]) {
  const byStoreIngredientId = new Map<string, CatalogItem>();
  const byTemplateId = new Map<string, CatalogItem>();
  const byLinkedCatalogId = new Map<string, CatalogItem>();
  const byName = new Map<string, CatalogItem>();

  for (const item of items) {
    const ingId = String(item.customFields?.storeIngredientId || '').trim();
    if (ingId) byStoreIngredientId.set(ingId, item);
    const tpl = String(item.customFields?.vertialStockTemplateId || '').trim();
    if (tpl) byTemplateId.set(tpl, item);
    const linked = String(item.customFields?.linkedCatalogItemId || '').trim();
    if (linked) byLinkedCatalogId.set(linked, item);
    byName.set(foldIngredientKey(item.name), item);
  }

  return { byStoreIngredientId, byTemplateId, byLinkedCatalogId, byName };
}
