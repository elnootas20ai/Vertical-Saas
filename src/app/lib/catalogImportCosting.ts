import type { CatalogItem } from './deliveryApi.ts';
import {
  resolveProductUnitCost,
  storeIngredientsById,
  withProductCosting,
  type ProductRecipeLine,
} from './catalogCosting.ts';
import { explicitProductCostingStatus } from './catalogCategoryCosting.ts';
import {
  applyVertialDefaultsToStoreIngredients,
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
  resolveLineKindForIngredient,
  resolveVertialDefaultBaseCost,
  resolveVertialDefaultRetailCost,
} from './vertialDefaultCosts.ts';
import {
  findVertialStockTemplate,
  isCatalogResaleStockProduct,
  resolveProductPackagingLines,
} from './vertialStockDefaults.ts';
import { buildInventoryLookupMaps } from './inventorySyncLogic.ts';

type CostingStoreIngredient = {
  id: string;
  name: string;
  brandIds?: string[];
  baseCost?: number;
};

type ComboSlotKind = 'main' | 'drink' | 'dessert' | 'side' | 'other';

type ComboStructureSlot = {
  slotKind: ComboSlotKind;
  label?: string;
  required?: boolean;
  expectedCount?: number;
};

type QuantityRule = { patterns: string[]; quantity: number; unit: string };

const PIZZA_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['masa', 'harina', 'base pizza', 'base'], quantity: 0.28, unit: 'kg' },
  { patterns: ['salsa', 'tomate'], quantity: 0.08, unit: 'kg' },
  { patterns: ['mozzarella', 'queso', 'fior di latte', 'bufala'], quantity: 0.15, unit: 'kg' },
  { patterns: ['aceite'], quantity: 0.01, unit: 'kg' },
  { patterns: ['albahaca', 'oregano', 'orégano'], quantity: 0.005, unit: 'kg' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
];

const BURGER_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['carne', 'burger', 'vacuno', 'ternera', 'hamburguesa', 'pollo'], quantity: 0.18, unit: 'kg' },
  { patterns: ['pan', 'bollo', 'brioche'], quantity: 1, unit: 'ud' },
  { patterns: ['queso', 'cheddar'], quantity: 1, unit: 'ud' },
  { patterns: ['bacon', 'panceta'], quantity: 2, unit: 'ud' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
  { patterns: ['salsa', 'mayonesa', 'ketchup', 'mostaza'], quantity: 0.02, unit: 'kg' },
  { patterns: ['lechuga', 'tomate', 'cebolla', 'pepinillo', 'pickle'], quantity: 0.03, unit: 'kg' },
  { patterns: ['patata', 'frita'], quantity: 0.12, unit: 'kg' },
];

const DEFAULT_TOPPING_QTY = { pizza: { quantity: 0.045, unit: 'kg' }, burger: { quantity: 0.03, unit: 'kg' } };

const COMBO_SLOT_DEFAULT_COST: Record<ComboSlotKind, number> = {
  main: 3.2,
  side: 1.15,
  drink: 0.65,
  dessert: 1.2,
  other: 1.0,
};

const DEFAULT_COMBO_STRUCTURE: ComboStructureSlot[] = [
  { slotKind: 'main', label: 'Pizza o burger', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
];

function parseImportIngredientNames(raw: string): string[] {
  return String(raw || '')
    .split(/[,;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const CATEGORY_FIXED_FALLBACK: Record<string, number> = {
  pizzas: 3.2,
  pizza: 3.2,
  burgers: 2.6,
  burger: 2.6,
  hamburguesas: 2.6,
  combos: 5.5,
  combo: 5.5,
  complementos: 1.15,
  sides: 1.15,
  entrantes: 1.5,
};

type DeliveryBrandLineKindId =
  | 'pizza'
  | 'burger_fastfood'
  | 'mixed_restaurant'
  | 'prepared_meals'
  | 'drinks_desserts'
  | string;

function foldName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundMoney(sorted[mid]);
  return roundMoney((sorted[mid - 1] + sorted[mid]) / 2);
}

function normalizeImportCategoryLocal(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = foldName(raw);
  const aliases: Record<string, string> = {
    pizzas: 'Pizzas',
    pizza: 'Pizzas',
    burgers: 'Burgers',
    burger: 'Burgers',
    hamburguesas: 'Hamburguesas',
    combos: 'Combos',
    combo: 'Combos',
    bebidas: 'Bebidas',
    postres: 'Postres',
    complementos: 'Complementos',
    sides: 'Complementos',
    side: 'Complementos',
  };
  return aliases[key] || raw;
}

function isImportComboCategoryLocal(category: string): boolean {
  return foldName(normalizeImportCategoryLocal(category)) === 'combos';
}

export function isHalfHalfCatalogProduct(
  item: Pick<CatalogItem, 'name' | 'customFields'>,
): boolean {
  if (item.customFields?.halfHalf === true) return true;
  return /mitad\s*y\s*mitad|half\s*and\s*half|half-half/.test(foldName(item.name || ''));
}

function isComboCatalogProduct(item: Pick<CatalogItem, 'itemType' | 'category'>): boolean {
  return item.itemType === 'combo' || isImportComboCategoryLocal(item.category || '');
}

function inferComboSlotKindLocal(category: string, productName = ''): ComboSlotKind {
  const cat = foldName(normalizeImportCategoryLocal(category));
  const name = foldName(productName);
  if (/pizza|calzone|burger|hamburguesa|top burger|premium|especialidad/.test(cat)) return 'main';
  if (/pizza|calzone|burger|hamburguesa/.test(name)) return 'main';
  if (/bebida|refresco|cerveza|zumo|agua|cafe|café/.test(cat)) return 'drink';
  if (/coca|pepsi|fanta|agua|cerveza|bebida|refresco|nestea/.test(name)) return 'drink';
  if (/postre|helado|bolleria|bollería|dulce/.test(cat)) return 'dessert';
  if (/postre|tarta|helado|brownie|nutella/.test(name)) return 'dessert';
  if (/complemento|side|guarnicion|patata|entrante|extra|nugget|tequeno/.test(cat)) return 'side';
  if (/patata|nugget|tequeno|salchipapa|complement/.test(name)) return 'side';
  return 'other';
}

function comboStructureFromCustomFields(
  customFields: Record<string, unknown> | undefined,
): ComboStructureSlot[] {
  const raw = customFields?.comboStructure;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s }));
  const out: ComboStructureSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const slotKind = (row as ComboStructureSlot).slotKind;
    if (!['main', 'drink', 'dessert', 'side', 'other'].includes(slotKind)) continue;
    out.push({
      slotKind,
      label: String((row as ComboStructureSlot).label || '').trim() || undefined,
      required: Boolean((row as ComboStructureSlot).required),
      expectedCount: Math.max(1, Number((row as ComboStructureSlot).expectedCount) || 1),
    });
  }
  return out.length > 0 ? out : DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s }));
}

function matchesQuantityRule(folded: string, rule: QuantityRule): boolean {
  return rule.patterns.some((p) => {
    const key = foldName(p);
    return folded.includes(key) || key.includes(folded);
  });
}

function resolveQuantityRule(
  ingredientName: string,
  lineKind: DeliveryBrandLineKindId | 'generic',
): { quantity: number; unit: string } {
  const folded = foldName(ingredientName);
  const rules =
    lineKind === 'pizza' || /pizza|calzone/.test(folded)
      ? PIZZA_QUANTITY_RULES
      : lineKind === 'burger_fastfood' || /burger|hamburguesa/.test(folded)
        ? BURGER_QUANTITY_RULES
        : PIZZA_QUANTITY_RULES;

  for (const rule of rules) {
    if (matchesQuantityRule(folded, rule)) return { quantity: rule.quantity, unit: rule.unit };
  }

  const topping =
    lineKind === 'burger_fastfood' ? DEFAULT_TOPPING_QTY.burger : DEFAULT_TOPPING_QTY.pizza;
  return topping;
}

export function inferImportCostingLineKind(
  item: Pick<CatalogItem, 'category' | 'brandIds' | 'name'>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): DeliveryBrandLineKindId | 'generic' {
  const brandId = item.brandIds?.[0];
  const brand = brandId ? brands.find((b) => b._id === brandId) : undefined;
  if (brand?.deliveryLineKind) return brand.deliveryLineKind as DeliveryBrandLineKindId;

  const cat = foldName(normalizeImportCategoryLocal(item.category || ''));
  const name = foldName(item.name || '');
  if (/pizza|calzone|especialidad|premium/.test(cat) || /pizza|calzone/.test(name)) return 'pizza';
  if (/burger|hamburguesa|top burger/.test(cat) || /burger|hamburguesa/.test(name)) {
    return 'burger_fastfood';
  }
  return 'generic';
}

function brandScopeMatch(ing: CostingStoreIngredient, brandIds: string[]): boolean {
  const ingBrands = ing.brandIds ?? [];
  if (brandIds.length === 0 || ingBrands.length === 0) return true;
  return brandIds.some((id) => ingBrands.includes(id));
}

function pickBestIngredientNameMatch(
  name: string,
  candidates: CostingStoreIngredient[],
  brandIds: string[],
): CostingStoreIngredient | undefined {
  const folded = foldName(name);
  if (!folded || candidates.length === 0) return undefined;

  const exact = candidates.filter((ing) => foldName(ing.name) === folded);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return (
      exact.find((ing) => brandScopeMatch(ing, brandIds)) ??
      exact.sort((a, b) => foldName(a.name).length - foldName(b.name).length)[0]
    );
  }

  const partial = candidates.filter((ing) => {
    const f = foldName(ing.name);
    return f.includes(folded) || folded.includes(f);
  });
  if (partial.length === 0) return undefined;
  if (partial.length === 1) return partial[0];

  const ranked = [...partial].sort((a, b) => {
    const aFold = foldName(a.name);
    const bFold = foldName(b.name);
    const aBrand = brandIds.length > 0 && brandScopeMatch(a, brandIds) ? 0 : 1;
    const bBrand = brandIds.length > 0 && brandScopeMatch(b, brandIds) ? 0 : 1;
    if (aBrand !== bBrand) return aBrand - bBrand;
    const aExactish = aFold === folded ? 0 : 1;
    const bExactish = bFold === folded ? 0 : 1;
    if (aExactish !== bExactish) return aExactish - bExactish;
    return aFold.length - bFold.length;
  });
  return ranked[0];
}

export function findStoreIngredientForCosting(
  name: string,
  ingredients: CostingStoreIngredient[],
  brandIds: string[],
): CostingStoreIngredient | undefined {
  const folded = foldName(name);
  if (!folded) return undefined;

  const scoped = ingredients.filter((ing) => brandScopeMatch(ing, brandIds));
  const hit = pickBestIngredientNameMatch(name, scoped, brandIds);
  if (hit) return hit;
  if (brandIds.length === 0) return undefined;
  return pickBestIngredientNameMatch(
    name,
    ingredients.filter((ing) => brandScopeMatch(ing, [])),
    [],
  );
}

/** Pizza/burger con ingredientes en Excel pero sin líneas de escandallo guardadas. */
export function needsVertialFoodEscandalloRepair(
  item: CatalogItem,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): boolean {
  const lk = inferImportCostingLineKind(item, brands);
  if (lk !== 'pizza' && lk !== 'burger_fastfood') return false;
  return explicitProductCostingStatus(item) !== 'recipe';
}

function enrichRecipeIngredientNames(
  names: string[],
  lineKind: DeliveryBrandLineKindId | 'generic',
): string[] {
  const out = [...names];
  const folded = names.map(foldName);

  if (lineKind === 'pizza') {
    if (!folded.some((f) => /masa|harina|base/.test(f))) out.unshift('Masa');
    if (!folded.some((f) => /salsa|tomate/.test(f))) out.unshift('Salsa tomate');
    if (!folded.some((f) => /mozzarella|queso/.test(f))) out.push('Mozzarella');
  } else if (lineKind === 'burger_fastfood') {
    if (!folded.some((f) => /pan|bollo|brioche/.test(f))) out.unshift('Pan brioche');
    if (!folded.some((f) => /carne|burger|vacuno|ternera|pollo/.test(f))) out.unshift('Carne burger');
  }

  return [...new Set(out.map((n) => n.trim()).filter(Boolean))];
}

function buildRecipeLinesFromIngredients(
  item: Pick<CatalogItem, 'customFields' | 'brandIds'>,
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  lineKind: DeliveryBrandLineKindId | 'generic',
): ProductRecipeLine[] {
  const text = String(item.customFields?.ingredients || '').trim();
  const parsed = text ? parseImportIngredientNames(text) : [];
  const useVertialDefaults =
    parsed.length === 0 && (lineKind === 'pizza' || lineKind === 'burger_fastfood');
  if (parsed.length === 0 && !useVertialDefaults) return [];

  const brandIds = (item.brandIds ?? []).map((id) => String(id || '').trim()).filter(Boolean);
  const names = enrichRecipeIngredientNames(parsed, lineKind);
  const lines: ProductRecipeLine[] = [];
  const usedIds = new Set<string>();

  for (const rawName of names) {
    const ing =
      findStoreIngredientForCosting(rawName, storeIngredients, brandIds) ??
      findStoreIngredientForCosting(rawName, storeIngredients, []);
    if (!ing || usedIds.has(ing.id)) continue;
    usedIds.add(ing.id);
    const qty = resolveQuantityRule(rawName, lineKind);
    lines.push({
      storeIngredientId: ing.id,
      name: ing.name,
      quantity: qty.quantity,
      unit: qty.unit,
    });
  }

  return lines;
}

type CostingInventoryContext = {
  byTemplateId: Map<string, CatalogItem>;
  byLinkedCatalogId: Map<string, CatalogItem>;
  costByCatalogId: Map<string, number>;
};

function buildCostingInventoryContext(inventoryItems: CatalogItem[]): CostingInventoryContext {
  const maps = buildInventoryLookupMaps(inventoryItems);
  const costByCatalogId = new Map<string, number>();
  for (const item of inventoryItems) {
    costByCatalogId.set(item._id, Number(item.costPrice) || 0);
  }
  return {
    byTemplateId: maps.byTemplateId,
    byLinkedCatalogId: maps.byLinkedCatalogId,
    costByCatalogId,
  };
}

function buildPackagingRecipeLines(
  item: Pick<CatalogItem, 'name' | 'category'>,
  lineKind: DeliveryBrandLineKindId | 'generic',
  byTemplateId: Map<string, CatalogItem>,
): ProductRecipeLine[] {
  const lines: ProductRecipeLine[] = [];
  for (const rule of resolveProductPackagingLines(item, lineKind)) {
    const stock = byTemplateId.get(rule.templateId);
    if (!stock) continue;
    const tpl = findVertialStockTemplate(rule.templateId);
    lines.push({
      catalogItemId: stock._id,
      name: stock.name,
      quantity: rule.quantity,
      unit: tpl?.unit || 'ud',
      stockCategory: 'packaging',
    });
  }
  return lines;
}

function buildResaleConsumptionRecipe(
  catalogItem: CatalogItem,
  byLinkedCatalogId: Map<string, CatalogItem>,
): ProductRecipeLine[] | null {
  const stock = byLinkedCatalogId.get(catalogItem._id);
  if (!stock) return null;
  return [
    {
      catalogItemId: stock._id,
      name: stock.name,
      quantity: 1,
      unit: stock.unit || 'ud',
      stockCategory: stock.stockCategory,
    },
  ];
}

function buildFullRecipeLines(
  item: CatalogItem,
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  lineKind: DeliveryBrandLineKindId | 'generic',
  inventoryContext?: CostingInventoryContext,
): ProductRecipeLine[] {
  const base = buildRecipeLinesFromIngredients(item, storeIngredients, brands, lineKind);
  if (!inventoryContext) return base;
  const packaging = buildPackagingRecipeLines(item, lineKind, inventoryContext.byTemplateId);
  return [...base, ...packaging];
}

function resolveCategoryFixedFallback(
  item: Pick<CatalogItem, 'category' | 'name'>,
  lineKind: DeliveryBrandLineKindId | 'generic',
): number | null {
  const cat = foldName(normalizeImportCategoryLocal(item.category || ''));
  if (CATEGORY_FIXED_FALLBACK[cat] != null) return CATEGORY_FIXED_FALLBACK[cat];

  if (/complemento|side|guarnicion|patata|nugget|tequeno|chicken ball|salchipapa/.test(cat)) {
    return CATEGORY_FIXED_FALLBACK.complementos;
  }
  if (/complemento|side|patata|nugget|tequeno|salchipapa/.test(foldName(item.name || ''))) {
    return CATEGORY_FIXED_FALLBACK.complementos;
  }
  if (lineKind === 'pizza') return CATEGORY_FIXED_FALLBACK.pizzas;
  if (lineKind === 'burger_fastfood') return CATEGORY_FIXED_FALLBACK.burgers;
  return null;
}

function resolveReferencePizzaCost(
  catalog: CatalogItem[],
  ingredientsById: Map<string, CostingStoreIngredient>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const pizzaCosts = catalog
    .filter(
      (c) =>
        !isComboCatalogProduct(c) &&
        !isHalfHalfCatalogProduct(c) &&
        !isDrinkCatalogProduct(c) &&
        !isDessertCatalogProduct(c) &&
        inferImportCostingLineKind(c, brands) === 'pizza',
    )
    .map((c) => resolveProductUnitCost(c, ingredientsById, brands))
    .filter((cost) => cost > 0);
  return median(pizzaCosts) ?? CATEGORY_FIXED_FALLBACK.pizzas;
}

function resolveComboSlotReferenceCost(
  slotKind: ComboSlotKind,
  catalog: CatalogItem[],
  ingredientsById: Map<string, CostingStoreIngredient>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const candidates = catalog.filter(
    (c) =>
      c.active !== false &&
      !isComboCatalogProduct(c) &&
      !isHalfHalfCatalogProduct(c) &&
      c.itemType !== 'service' &&
      inferComboSlotKindLocal(c.category || '', c.name) === slotKind,
  );
  const costs = candidates
    .map((c) => resolveProductUnitCost(c, ingredientsById, brands))
    .filter((cost) => cost > 0);
  const med = median(costs);
  if (med != null) return med;
  return COMBO_SLOT_DEFAULT_COST[slotKind] ?? COMBO_SLOT_DEFAULT_COST.other;
}

export function computeComboCostFromStructure(
  item: Pick<CatalogItem, 'customFields'>,
  catalog: CatalogItem[],
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const structure = comboStructureFromCustomFields(item.customFields);
  const ingredientsById = storeIngredientsById(storeIngredients);
  let total = 0;
  for (const slot of structure) {
    const count = Math.max(1, slot.expectedCount ?? 1);
    total += resolveComboSlotReferenceCost(slot.slotKind, catalog, ingredientsById, brands) * count;
  }
  return roundMoney(total > 0 ? total : CATEGORY_FIXED_FALLBACK.combos);
}

function applyHalfHalfCosting(
  item: CatalogItem,
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  catalog: CatalogItem[],
  inventoryContext?: CostingInventoryContext,
): AutoCostingApplyResult {
  const lineKind: DeliveryBrandLineKindId = 'pizza';
  const recipeLines = buildFullRecipeLines(item, storeIngredients, brands, lineKind, inventoryContext);
  const ingredientsById = storeIngredientsById(storeIngredients);

  if (recipeLines.length > 0) {
    return {
      item: withProductCosting(
        item,
        { costingType: 'recipe', recipeLines },
        ingredientsById,
        brands,
        inventoryContext?.costByCatalogId,
      ),
      mode: 'recipe',
    };
  }

  const fixedCost = resolveReferencePizzaCost(catalog, ingredientsById, brands);
  return {
    item: withProductCosting(item, { costingType: 'fixed', fixedCost }, ingredientsById, brands),
    mode: 'fixed',
  };
}

export type AutoCostingApplyOptions = {
  overwrite?: boolean;
  /** Sustituye coste fijo auto (import antiguo) por escandallo Vertial en pizza/burger. */
  upgradeAutoFixedFood?: boolean;
  catalog?: CatalogItem[];
  inventoryItems?: CatalogItem[];
};

function shouldRunAutoCosting(
  item: CatalogItem,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  options?: AutoCostingApplyOptions,
): boolean {
  if (options?.overwrite) return true;
  const status = explicitProductCostingStatus(item);
  if (status === 'none') return true;
  if (options?.upgradeAutoFixedFood) {
    return needsVertialFoodEscandalloRepair(item, brands);
  }
  return false;
}

/** Bases Vertial (Masa, mozzarella…) que deben existir en ingredientes para el escandallo. */
const VERTIAL_ESCANDALLO_BASE_NAMES: Partial<Record<DeliveryBrandLineKindId, string[]>> = {
  pizza: ['Masa', 'Salsa tomate', 'Mozzarella'],
  burger_fastfood: ['Pan brioche', 'Carne burger'],
};

export function ensureVertialEscandalloBaseStoreIngredients(
  existing: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): { items: CostingStoreIngredient[]; added: number } {
  let merged = [...existing];
  let added = 0;

  const addForKind = (lineKind: DeliveryBrandLineKindId, names: string[]) => {
    const brandIds = brands.filter((b) => b.deliveryLineKind === lineKind).map((b) => b._id);
    const scopeIds = brandIds.length > 0 ? brandIds : [];
    for (const name of names) {
      const exists =
        findStoreIngredientForCosting(name, merged, scopeIds) ??
        findStoreIngredientForCosting(name, merged, []);
      if (exists) continue;
      const baseCost = resolveVertialDefaultBaseCost(name, lineKind);
      merged.push({
        id: `ing-vertial-${foldName(name)}-${lineKind}`,
        name,
        role: 'escandallo',
        ...(scopeIds.length > 0 ? { brandIds: scopeIds } : {}),
        ...(baseCost != null ? { baseCost } : {}),
      });
      added += 1;
    }
  };

  addForKind('pizza', VERTIAL_ESCANDALLO_BASE_NAMES.pizza ?? []);
  addForKind('burger_fastfood', VERTIAL_ESCANDALLO_BASE_NAMES.burger_fastfood ?? []);

  const prepared = applyVertialDefaultsToStoreIngredients(merged, brands);
  return { items: prepared.items, added };
}

export type AutoCostingApplyResult = {
  item: CatalogItem;
  mode: 'recipe' | 'fixed' | 'skipped';
};

/** Aplica coste Vertial aproximado si el producto aún no tiene escandallo guardado. */
export function applyVertialAutoCostingToCatalogItem(
  item: CatalogItem,
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  options?: AutoCostingApplyOptions,
): AutoCostingApplyResult {
  if (!shouldRunAutoCosting(item, brands, options)) {
    return { item, mode: 'skipped' };
  }

  const catalog = options?.catalog ?? [item];
  const inventoryContext = options?.inventoryItems?.length
    ? buildCostingInventoryContext(options.inventoryItems)
    : undefined;

  if (isComboCatalogProduct(item)) {
    const comboCost = computeComboCostFromStructure(item, catalog, storeIngredients, brands);
    const ingredientsById = storeIngredientsById(storeIngredients);
    return {
      item: withProductCosting(
        item,
        { costingType: 'fixed', fixedCost: comboCost },
        ingredientsById,
        brands,
        inventoryContext?.costByCatalogId,
      ),
      mode: 'fixed',
    };
  }

  if (isHalfHalfCatalogProduct(item)) {
    return applyHalfHalfCosting(item, storeIngredients, brands, catalog, inventoryContext);
  }

  if (
    isDrinkCatalogProduct(item) ||
    isDessertCatalogProduct(item) ||
    isCatalogResaleStockProduct(item)
  ) {
    const resaleLines = inventoryContext
      ? buildResaleConsumptionRecipe(item, inventoryContext.byLinkedCatalogId)
      : null;
    if (resaleLines?.length) {
      const ingredientsById = storeIngredientsById(storeIngredients);
      return {
        item: withProductCosting(
          item,
          { costingType: 'recipe', recipeLines: resaleLines },
          ingredientsById,
          brands,
          inventoryContext?.costByCatalogId,
        ),
        mode: 'recipe',
      };
    }
    const fixedCost = resolveVertialDefaultRetailCost(item);
    return {
      item: withProductCosting(
        item,
        { costingType: 'fixed', fixedCost },
        new Map(),
        brands,
        inventoryContext?.costByCatalogId,
      ),
      mode: 'fixed',
    };
  }

  const lineKind = inferImportCostingLineKind(item, brands);
  const recipeLines = buildFullRecipeLines(
    item,
    storeIngredients,
    brands,
    lineKind,
    inventoryContext,
  );

  if (recipeLines.length > 0) {
    const ingredientsById = storeIngredientsById(storeIngredients);
    return {
      item: withProductCosting(
        item,
        { costingType: 'recipe', recipeLines },
        ingredientsById,
        brands,
        inventoryContext?.costByCatalogId,
      ),
      mode: 'recipe',
    };
  }

  const fallback = resolveCategoryFixedFallback(item, lineKind);
  if (fallback != null) {
    return {
      item: withProductCosting(item, { costingType: 'fixed', fixedCost: fallback }, new Map(), brands),
      mode: 'fixed',
    };
  }

  const nameCost = resolveVertialDefaultBaseCost(item.name, lineKind === 'generic' ? undefined : lineKind);
  if (nameCost != null && nameCost > 0) {
    return {
      item: withProductCosting(item, { costingType: 'fixed', fixedCost: nameCost }, new Map(), brands),
      mode: 'fixed',
    };
  }

  return { item, mode: 'skipped' };
}

/**
 * Costea un lote importado en dos pasadas: primero productos sueltos, luego combos
 * (suma pizza + bebida + postre… según comboStructure).
 */
export function applyVertialAutoCostingBatch(
  targets: CatalogItem[],
  allCatalog: CatalogItem[],
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  options?: Pick<AutoCostingApplyOptions, 'overwrite' | 'upgradeAutoFixedFood' | 'inventoryItems'>,
): AutoCostingApplyResult[] {
  const working = new Map(allCatalog.map((item) => [item._id, { ...item }]));
  const results: AutoCostingApplyResult[] = [];
  const sharedOptions = {
    overwrite: options?.overwrite,
    upgradeAutoFixedFood: options?.upgradeAutoFixedFood,
    inventoryItems: options?.inventoryItems,
  };

  for (const item of targets) {
    if (isComboCatalogProduct(item)) continue;
    const result = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands, {
      ...sharedOptions,
      catalog: [...working.values()],
    });
    working.set(result.item._id, result.item);
    results.push(result);
  }

  for (const item of targets) {
    if (!isComboCatalogProduct(item)) continue;
    const result = applyVertialAutoCostingToCatalogItem(item, storeIngredients, brands, {
      ...sharedOptions,
      catalog: [...working.values()],
    });
    working.set(result.item._id, result.item);
    results.push(result);
  }

  return results;
}

export function prepareStoreIngredientsForImportCosting(
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): CostingStoreIngredient[] {
  return applyVertialDefaultsToStoreIngredients(storeIngredients, brands).items.map((ing) => {
    if (Number.isFinite(Number(ing.baseCost)) && Number(ing.baseCost) >= 0) return ing;
    const lineKind = resolveLineKindForIngredient(ing, brands);
    const baseCost = resolveVertialDefaultBaseCost(ing.name, lineKind);
    return baseCost != null ? { ...ing, baseCost } : ing;
  });
}

export function summarizeAutoCostingResults(results: AutoCostingApplyResult[]): {
  recipe: number;
  fixed: number;
  skipped: number;
} {
  let recipe = 0;
  let fixed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.mode === 'recipe') recipe += 1;
    else if (r.mode === 'fixed') fixed += 1;
    else skipped += 1;
  }
  return { recipe, fixed, skipped };
}
