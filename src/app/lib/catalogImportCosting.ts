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
  isCatalogResaleStockProduct,
} from './vertialStockDefaults.ts';
import { buildInventoryLookupMaps } from './inventorySyncLogic.ts';
import {
  BAR_ESCANDALLO_BASE_INGREDIENTS,
  BOCATA_QUANTITY_RULES,
  isBarBocataCategory,
  resolveBarEscandalloDefaultIngredients,
  resolveBarEscandalloFixedCost,
  resolveBarEscandalloApproxFromSalePrice,
  shouldUseBarEscandalloPresets,
} from './barEscandalloPresets.ts';

type CostingStoreIngredient = {
  id: string;
  name: string;
  brandIds?: string[];
  baseCost?: number;
  role?: string;
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
  { patterns: ['queso', 'cheddar'], quantity: 0.02, unit: 'kg' },
  { patterns: ['bacon', 'panceta'], quantity: 0.035, unit: 'kg' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
  { patterns: ['salsa', 'mayonesa', 'ketchup', 'mostaza'], quantity: 0.02, unit: 'kg' },
  { patterns: ['lechuga', 'tomate', 'cebolla', 'pepinillo', 'pickle'], quantity: 0.03, unit: 'kg' },
  { patterns: ['patata', 'frita'], quantity: 0.12, unit: 'kg' },
];

const TACO_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['tortilla', 'maiz', 'maíz', 'trigo'], quantity: 3, unit: 'ud' },
  { patterns: ['carne', 'pastor', 'carnitas', 'barbacoa', 'pollo', 'cochinita', 'vacuno'], quantity: 0.12, unit: 'kg' },
  { patterns: ['guacamole', 'aguacate'], quantity: 0.04, unit: 'kg' },
  { patterns: ['salsa', 'pico', 'verde', 'roja', 'habanero'], quantity: 0.03, unit: 'kg' },
  { patterns: ['queso', 'cotija', 'cheddar'], quantity: 0.025, unit: 'kg' },
  { patterns: ['cebolla', 'cilantro', 'col'], quantity: 0.02, unit: 'kg' },
  { patterns: ['lime', 'limon', 'limón'], quantity: 0.5, unit: 'ud' },
  { patterns: ['frijol', 'refrito'], quantity: 0.05, unit: 'kg' },
  { patterns: ['arroz', 'rice'], quantity: 0.06, unit: 'kg' },
];

const TAPAS_BAR_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['pan', 'regana', 'requena', 'picos'], quantity: 1, unit: 'ud' },
  { patterns: ['aceite', 'oliva'], quantity: 0.015, unit: 'kg' },
  { patterns: ['jamon', 'jamón', 'iberico', 'ibérico', 'serrano', 'lomo'], quantity: 0.04, unit: 'kg' },
  { patterns: ['queso', 'manchego', 'curado'], quantity: 0.035, unit: 'kg' },
  { patterns: ['patata', 'brava', 'frita'], quantity: 0.15, unit: 'kg' },
  { patterns: ['aceituna', 'oliva'], quantity: 0.05, unit: 'kg' },
  { patterns: ['pulpo', 'gallega'], quantity: 0.12, unit: 'kg' },
  { patterns: ['gamba', 'gambon', 'langostino'], quantity: 0.08, unit: 'kg' },
  { patterns: ['tortilla', 'patata'], quantity: 0.15, unit: 'kg' },
  { patterns: ['calamar', 'romana'], quantity: 0.1, unit: 'kg' },
  { patterns: ['chorizo', 'morcilla', 'salchicha'], quantity: 0.05, unit: 'kg' },
  { patterns: ['alioli', 'salsa', 'brava', 'mayonesa'], quantity: 0.025, unit: 'kg' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
  { patterns: ['anchoa', 'boqueron', 'boquerón'], quantity: 0.03, unit: 'kg' },
  { patterns: ['atun', 'atún', 'bonito'], quantity: 0.05, unit: 'kg' },
  { patterns: ['cerdo', 'solomillo'], quantity: 0.09, unit: 'kg' },
  { patterns: ['pollo', 'wings', 'alita'], quantity: 0.1, unit: 'kg' },
  { patterns: ['pimiento', 'padron', 'padrón'], quantity: 0.08, unit: 'kg' },
  { patterns: ['tomate', 'ensalada'], quantity: 0.06, unit: 'kg' },
];

const KEBAB_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['pan', 'pita', 'lavash', 'tortilla'], quantity: 1, unit: 'ud' },
  { patterns: ['carne', 'kebab', 'doner', 'döner', 'cordero'], quantity: 0.15, unit: 'kg' },
  { patterns: ['pollo', 'chicken'], quantity: 0.14, unit: 'kg' },
  { patterns: ['lechuga', 'tomate', 'cebolla'], quantity: 0.03, unit: 'kg' },
  { patterns: ['salsa', 'yogur', 'tzatziki', 'alioli'], quantity: 0.025, unit: 'kg' },
  { patterns: ['patata', 'frita'], quantity: 0.12, unit: 'kg' },
];

const PREPARED_MEAL_QUANTITY_RULES: QuantityRule[] = [
  { patterns: ['pollo', 'chicken'], quantity: 0.18, unit: 'kg' },
  { patterns: ['cerdo', 'pork', 'lomo'], quantity: 0.18, unit: 'kg' },
  { patterns: ['ternera', 'vacuno', 'carne'], quantity: 0.18, unit: 'kg' },
  { patterns: ['pescado', 'salmon', 'salmón', 'merluza'], quantity: 0.16, unit: 'kg' },
  { patterns: ['arroz', 'pasta', 'fideua', 'fideuá'], quantity: 0.12, unit: 'kg' },
  { patterns: ['verdura', 'ensalada', 'verde'], quantity: 0.08, unit: 'kg' },
  { patterns: ['salsa', 'guarnicion', 'guarnición'], quantity: 0.04, unit: 'kg' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
];

type DeliveryBrandLineKindId =
  | 'pizza'
  | 'burger_fastfood'
  | 'tacos_mexican'
  | 'kebab'
  | 'tapas_bar'
  | 'mixed_restaurant'
  | 'prepared_meals'
  | 'cafe_bakery'
  | 'drinks_desserts'
  | string;

/** Líneas con escandallo Vertial automático al importar (sin tocar delivery puro ni compraventa). */
const FOOD_RECIPE_LINE_KINDS = new Set<string>([
  'pizza',
  'burger_fastfood',
  'tacos_mexican',
  'tapas_bar',
  'kebab',
  'prepared_meals',
  'mixed_restaurant',
  'cafe_bakery',
]);

function isFoodRecipeLineKind(lineKind: DeliveryBrandLineKindId | 'generic'): boolean {
  return lineKind !== 'generic' && FOOD_RECIPE_LINE_KINDS.has(lineKind);
}

/** Máximo de toppings del Excel en escandallo auto (evita costes absurdos). */
const MAX_EXCEL_TOPPING_LINES = 8;

const DEFAULT_TOPPING_QTY = {
  pizza: { quantity: 0.045, unit: 'kg' },
  burger: { quantity: 0.03, unit: 'kg' },
  taco: { quantity: 0.025, unit: 'kg' },
  tapas: { quantity: 0.035, unit: 'kg' },
  kebab: { quantity: 0.03, unit: 'kg' },
  prepared: { quantity: 0.04, unit: 'kg' },
};

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

function hasCatalogIngredientList(item: Pick<CatalogItem, 'customFields'>): boolean {
  return parseImportIngredientNames(String(item.customFields?.ingredients || '')).length > 0;
}

const CATEGORY_FIXED_FALLBACK: Record<string, number> = {
  pizzas: 3.2,
  pizza: 3.2,
  burgers: 2.6,
  burger: 2.6,
  hamburguesas: 2.6,
  tacos: 2.4,
  taco: 2.4,
  combos: 5.5,
  combo: 5.5,
  complementos: 1.15,
  sides: 1.15,
  entrantes: 1.5,
  tapas: 2.2,
  tapa: 2.2,
  raciones: 3.5,
  racion: 3.5,
  pinchos: 2.0,
  pincho: 2.0,
  montaditos: 2.5,
  montadito: 2.5,
  kebab: 2.8,
  principales: 4.2,
  principal: 4.2,
  ensaladas: 2.4,
  ensalada: 2.4,
  carnes: 5.5,
  carne: 5.5,
  pescados: 5.2,
  pescado: 5.2,
  arroces: 4.8,
  arroz: 4.8,
  pastas: 3.6,
  pasta: 3.6,
  menus: 5.5,
  menu: 5.5,
  sopas: 2.8,
  sopa: 2.8,
};

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
    tacos: 'Tacos',
    taco: 'Tacos',
    combos: 'Combos',
    combo: 'Combos',
    bebidas: 'Bebidas',
    postres: 'Postres',
    complementos: 'Complementos',
    sides: 'Complementos',
    side: 'Complementos',
    tapas: 'Tapas',
    tapa: 'Tapas',
    raciones: 'Raciones',
    racion: 'Raciones',
    pinchos: 'Pinchos',
    pincho: 'Pinchos',
    montaditos: 'Montaditos',
    montadito: 'Montaditos',
    kebab: 'Kebab',
    principales: 'Principales',
    principal: 'Principales',
    bocadillos: 'Bocadillos',
    bocadillo: 'Bocadillos',
    bocatas: 'Bocadillos',
    bocata: 'Bocadillos',
    sandwiches: 'Bocadillos',
    sandwich: 'Bocadillos',
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
  category = '',
): { quantity: number; unit: string } {
  const folded = foldName(ingredientName);
  if (isBarBocataCategory(category) || /bocadillo|bocata|sandwich/.test(foldName(category))) {
    for (const rule of BOCATA_QUANTITY_RULES) {
      if (matchesQuantityRule(folded, rule)) return { quantity: rule.quantity, unit: rule.unit };
    }
  }
  const rules =
    lineKind === 'pizza' || /pizza|calzone/.test(folded)
      ? PIZZA_QUANTITY_RULES
      : lineKind === 'burger_fastfood' || /burger|hamburguesa/.test(folded)
        ? BURGER_QUANTITY_RULES
        : lineKind === 'tacos_mexican' || /taco|burrito|quesadilla|pastor|carnitas/.test(folded)
          ? TACO_QUANTITY_RULES
          : lineKind === 'tapas_bar' || /tapa|racion|pincho|montadito|bravas|iberico|ibérico/.test(folded)
            ? TAPAS_BAR_QUANTITY_RULES
            : lineKind === 'kebab' || /kebab|doner|döner|pita/.test(folded)
              ? KEBAB_QUANTITY_RULES
              : lineKind === 'prepared_meals' ||
                  lineKind === 'mixed_restaurant' ||
                  /principal|entrante|plato/.test(folded)
                ? PREPARED_MEAL_QUANTITY_RULES
                : PIZZA_QUANTITY_RULES;

  for (const rule of rules) {
    if (matchesQuantityRule(folded, rule)) return { quantity: rule.quantity, unit: rule.unit };
  }

  const topping =
    lineKind === 'burger_fastfood'
      ? DEFAULT_TOPPING_QTY.burger
      : lineKind === 'tacos_mexican'
        ? DEFAULT_TOPPING_QTY.taco
        : lineKind === 'tapas_bar'
          ? DEFAULT_TOPPING_QTY.tapas
          : lineKind === 'kebab'
            ? DEFAULT_TOPPING_QTY.kebab
            : lineKind === 'prepared_meals' || lineKind === 'mixed_restaurant'
              ? DEFAULT_TOPPING_QTY.prepared
              : DEFAULT_TOPPING_QTY.pizza;
  return topping;
}

export function inferImportCostingLineKind(
  item: Pick<CatalogItem, 'category' | 'brandIds' | 'name'>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): DeliveryBrandLineKindId | 'generic' {
  const brandId = item.brandIds?.[0];
  const brand = brandId ? brands.find((b) => b._id === brandId) : undefined;
  const brandKind = brand?.deliveryLineKind
    ? (brand.deliveryLineKind as DeliveryBrandLineKindId)
    : null;

  const fromCategoryAndName = (): DeliveryBrandLineKindId | 'generic' => {
    const cat = foldName(normalizeImportCategoryLocal(item.category || ''));
    const name = foldName(item.name || '');
    if (/pizza|calzone|especialidad|premium/.test(cat) || /pizza|calzone/.test(name)) return 'pizza';
    if (/burger|hamburguesa|top burger/.test(cat) || /burger|hamburguesa/.test(name)) {
      return 'burger_fastfood';
    }
    if (/taco|burrito|quesadilla|mexican|pastor|carnitas/.test(cat) || /taco|burrito|quesadilla/.test(name)) {
      return 'tacos_mexican';
    }
    if (
      /tapa|racion|raciones|pincho|montadito|bocadillo|bocata|sandwich|taberna|cerveceria|cervecería|para picar|picoteo/.test(cat) ||
      /tapa|pincho|racion|montadito|bocadillo|bocata|bravas|iberico|ibérico/.test(name)
    ) {
      return 'tapas_bar';
    }
    if (/complemento|bebida|postre/.test(cat)) {
      return 'tapas_bar';
    }
    if (/kebab|doner|döner|wrap|durum/.test(cat) || /kebab|doner|döner|durum/.test(name)) {
      return 'kebab';
    }
    if (
      /cafe|café|bolleria|bollería|desayuno|panaderia|panadería/.test(cat) ||
      /cafe|café|croissant|capuccino|cappuccino/.test(name)
    ) {
      return 'cafe_bakery';
    }
    if (
      /entrante|principal|plato|cocina|carte|ensalada|carne|pescado|arroz|pasta|sopa|guiso|menu|menú/.test(cat) ||
      /plato|menu del dia|menú del día/.test(name)
    ) {
      return 'prepared_meals';
    }
    return 'generic';
  };

  const inferred = fromCategoryAndName();

  // «other» / vacío no es un tipo de cocina: no debe anular la inferencia por categoría
  // (BeStrong en GALLETITASoreo llegó con deliveryLineKind=other y el escandallo auto no cuadraba).
  const effectiveBrandKind =
    brandKind && brandKind !== 'other' ? brandKind : null;

  // Marca paraguas bar/restaurante: la categoría manda (Tapas ≠ Principales ≠ Bebidas).
  if (
    effectiveBrandKind === 'mixed_restaurant' ||
    effectiveBrandKind === 'prepared_meals' ||
    effectiveBrandKind === 'tapas_bar'
  ) {
    if (inferred !== 'generic') return inferred;
    return effectiveBrandKind;
  }

  if (effectiveBrandKind) return effectiveBrandKind;
  return inferred;
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
    const byBrand = exact.filter((ing) => brandScopeMatch(ing, brandIds));
    const pool = byBrand.length > 0 ? byBrand : exact;
    return (
      pool.find((ing) => String(ing.role || '').trim() !== 'extra') ??
      pool.sort((a, b) => foldName(a.name).length - foldName(b.name).length)[0]
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
    const aExtra = String(a.role || '').trim() === 'extra' ? 1 : 0;
    const bExtra = String(b.role || '').trim() === 'extra' ? 1 : 0;
    if (aExtra !== bExtra) return aExtra - bExtra;
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
  if (!isFoodRecipeLineKind(lk)) return false;
  return explicitProductCostingStatus(item) !== 'recipe';
}

function enrichRecipeIngredientNames(
  names: string[],
  lineKind: DeliveryBrandLineKindId | 'generic',
  category = '',
  productName = '',
): string[] {
  const out = [...names];
  const folded = names.map(foldName);

  if (out.length === 0 && shouldUseBarEscandalloPresets(lineKind, category)) {
    out.push(...resolveBarEscandalloDefaultIngredients(category, productName));
  }

  if (lineKind === 'pizza') {
    if (!folded.some((f) => /masa|harina|base/.test(f))) out.unshift('Masa');
    if (!folded.some((f) => /salsa|tomate/.test(f))) out.unshift('Salsa tomate');
    if (!folded.some((f) => /mozzarella|queso/.test(f))) out.push('Mozzarella');
  } else if (lineKind === 'burger_fastfood') {
    if (!folded.some((f) => /pan|bollo|brioche/.test(f))) out.unshift('Pan brioche');
    if (!folded.some((f) => /carne|burger|vacuno|ternera|pollo/.test(f))) out.unshift('Carne burger');
  } else if (lineKind === 'tacos_mexican') {
    if (!folded.some((f) => /tortilla|maiz|maíz/.test(f))) out.unshift('Tortilla maíz');
    if (!folded.some((f) => /carne|pastor|carnitas|pollo|barbacoa/.test(f))) out.unshift('Carne al pastor');
    if (!folded.some((f) => /cebolla|cilantro/.test(f))) out.push('Cebolla y cilantro');
  } else if (lineKind === 'tapas_bar') {
    if (!folded.some((f) => /aceite|oliva/.test(f))) out.unshift('Aceite de oliva');
    if (!folded.some((f) => /pan|regana|requena|picos/.test(f))) out.push('Pan');
    if (!folded.some((f) => /sal/.test(f))) out.push('Sal');
  } else if (lineKind === 'kebab') {
    if (!folded.some((f) => /pan|pita|lavash/.test(f))) out.unshift('Pan pita');
    if (!folded.some((f) => /carne|kebab|doner|döner|pollo/.test(f))) out.unshift('Carne kebab');
  } else if (lineKind === 'prepared_meals' || lineKind === 'mixed_restaurant') {
    if (!folded.some((f) => /aceite|oliva/.test(f))) out.unshift('Aceite de oliva');
    if (!folded.some((f) => /sal/.test(f))) out.push('Sal');
  } else if (lineKind === 'cafe_bakery') {
    if (!folded.some((f) => /cafe|café/.test(f))) out.unshift('Café');
    if (!folded.some((f) => /leche/.test(f))) out.push('Leche');
  }

  return [...new Set(out.map((n) => n.trim()).filter(Boolean))];
}

function buildRecipeLinesFromIngredients(
  item: Pick<CatalogItem, 'customFields' | 'brandIds' | 'category' | 'name'>,
  storeIngredients: CostingStoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  lineKind: DeliveryBrandLineKindId | 'generic',
): ProductRecipeLine[] {
  const text = String(item.customFields?.ingredients || '').trim();
  let parsed = text ? parseImportIngredientNames(text) : [];
  const category = String(item.category || '');
  const productName = String(item.name || '');
  const useVertialDefaults =
    parsed.length === 0 &&
    (isFoodRecipeLineKind(lineKind) || shouldUseBarEscandalloPresets(lineKind, category));
  if (parsed.length === 0 && useVertialDefaults) {
    parsed = resolveBarEscandalloDefaultIngredients(category, productName);
  }
  if (parsed.length === 0 && !useVertialDefaults) return [];

  const brandIds = (item.brandIds ?? []).map((id) => String(id || '').trim()).filter(Boolean);
  const names = limitRecipeIngredientNames(
    enrichRecipeIngredientNames(parsed, lineKind, category, productName),
    lineKind,
  );
  const lines: ProductRecipeLine[] = [];
  const usedIds = new Set<string>();

  for (const rawName of names) {
    const ing =
      findStoreIngredientForCosting(rawName, storeIngredients, brandIds) ??
      findStoreIngredientForCosting(rawName, storeIngredients, []);
    if (!ing || usedIds.has(ing.id)) continue;
    usedIds.add(ing.id);
    const qty = resolveQuantityRule(rawName, lineKind, category);
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
  _inventoryContext?: CostingInventoryContext,
): ProductRecipeLine[] {
  // Envases: solo los que el usuario elige al crear/editar el producto (no reglas automáticas).
  void _inventoryContext;
  return buildRecipeLinesFromIngredients(item, storeIngredients, brands, lineKind);
}

function isBaseRecipeIngredientName(name: string, lineKind: DeliveryBrandLineKindId | 'generic'): boolean {
  const folded = foldName(name);
  if (lineKind === 'pizza' || lineKind === 'generic') {
    return /masa|harina|base|salsa|tomate|mozzarella|queso/.test(folded);
  }
  if (lineKind === 'burger_fastfood') {
    return /pan|bollo|brioche|carne|burger|vacuno|ternera|pollo/.test(folded);
  }
  if (lineKind === 'tacos_mexican') {
    return /tortilla|maiz|maíz|carne|pastor|carnitas|pollo|barbacoa/.test(folded);
  }
  if (lineKind === 'tapas_bar') {
    return /pan|aceite|oliva|jamon|jamón|queso|patata|aceituna|pulpo|gamba|tortilla|calamar|chorizo|alioli|salsa/.test(
      folded,
    );
  }
  if (lineKind === 'kebab') {
    return /pan|pita|carne|kebab|doner|döner|pollo/.test(folded);
  }
  if (lineKind === 'prepared_meals' || lineKind === 'mixed_restaurant' || lineKind === 'cafe_bakery') {
    return /aceite|oliva|sal|pollo|carne|pescado|arroz|pasta|cafe|café|leche|harina/.test(folded);
  }
  return false;
}

function limitRecipeIngredientNames(
  names: string[],
  lineKind: DeliveryBrandLineKindId | 'generic',
): string[] {
  const bases: string[] = [];
  const toppings: string[] = [];
  for (const name of names) {
    if (isBaseRecipeIngredientName(name, lineKind)) bases.push(name);
    else toppings.push(name);
  }
  return [...bases, ...toppings.slice(0, MAX_EXCEL_TOPPING_LINES)];
}

/** Techo de coste auto: no superar ~42% del PVP ni mucho el fallback de categoría. */
export function capVertialAutoCostEstimate(
  item: Pick<CatalogItem, 'unitPrice' | 'category' | 'name'>,
  computedCost: number,
  lineKind: DeliveryBrandLineKindId | 'generic',
): number {
  const sale = Number(item.unitPrice) || 0;
  const fallback = resolveCategoryFixedFallback(item, lineKind) ?? computedCost;
  if (!(computedCost > 0)) return fallback;

  const ceiling =
    sale > 0
      ? Math.min(sale * 0.42, Math.max(fallback, sale * 0.12) * 1.35)
      : fallback * 1.35;

  if (computedCost <= ceiling) return roundMoney(computedCost);
  return roundMoney(Math.max(fallback, Math.min(ceiling, computedCost * 0.65)));
}

function resolveCategoryFixedFallback(
  item: Pick<CatalogItem, 'category' | 'name'>,
  lineKind: DeliveryBrandLineKindId | 'generic',
): number | null {
  const barCost = resolveBarEscandalloFixedCost(item.category || '', item.name || '');
  if (barCost != null) return barCost;

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
  if (lineKind === 'tacos_mexican') return CATEGORY_FIXED_FALLBACK.tacos;
  if (lineKind === 'tapas_bar') return CATEGORY_FIXED_FALLBACK.tapas;
  if (lineKind === 'kebab') return CATEGORY_FIXED_FALLBACK.kebab;
  if (lineKind === 'prepared_meals' || lineKind === 'mixed_restaurant') {
    return CATEGORY_FIXED_FALLBACK.principales;
  }
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
    const draft = withProductCosting(
      item,
      { costingType: 'recipe', recipeLines },
      ingredientsById,
      brands,
      inventoryContext?.costByCatalogId,
    );
    const cappedCost = capVertialAutoCostEstimate(item, Number(draft.costPrice) || 0, lineKind);
    const next =
      cappedCost !== draft.costPrice ? { ...draft, costPrice: cappedCost } : draft;
    return { item: next, mode: 'recipe' };
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
  tacos_mexican: ['Tortilla maíz', 'Carne al pastor', 'Cebolla y cilantro'],
  tapas_bar: ['Aceite de oliva', 'Sal', 'Pan', 'Pan barra', 'Tomate', 'Jamón serrano'],
  kebab: ['Pan pita', 'Carne kebab', 'Salsa yogur'],
  prepared_meals: ['Aceite de oliva', 'Sal'],
  mixed_restaurant: ['Aceite de oliva', 'Sal'],
  cafe_bakery: ['Café', 'Leche'],
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
  addForKind('tacos_mexican', VERTIAL_ESCANDALLO_BASE_NAMES.tacos_mexican ?? []);
  addForKind('tapas_bar', VERTIAL_ESCANDALLO_BASE_NAMES.tapas_bar ?? []);
  addForKind('kebab', VERTIAL_ESCANDALLO_BASE_NAMES.kebab ?? []);
  addForKind('prepared_meals', VERTIAL_ESCANDALLO_BASE_NAMES.prepared_meals ?? []);
  addForKind('mixed_restaurant', VERTIAL_ESCANDALLO_BASE_NAMES.mixed_restaurant ?? []);
  addForKind('cafe_bakery', VERTIAL_ESCANDALLO_BASE_NAMES.cafe_bakery ?? []);

  const restaurantKinds = new Set([
    'tapas_bar',
    'mixed_restaurant',
    'prepared_meals',
    'cafe_bakery',
  ]);
  const restaurantBrandIds = brands
    .filter((b) => restaurantKinds.has(String(b.deliveryLineKind || '').trim()))
    .map((b) => b._id);
  // Bar/restaurante: bases de escandallo aunque la marca sea «mixed_restaurant» (no solo tapas_bar).
  if (restaurantBrandIds.length > 0 || brands.length === 0) {
    const scopeIds = restaurantBrandIds;
    for (const name of BAR_ESCANDALLO_BASE_INGREDIENTS) {
      const exists =
        findStoreIngredientForCosting(name, merged, scopeIds) ??
        findStoreIngredientForCosting(name, merged, []);
      if (exists) continue;
      merged.push({
        id: `ing-vertial-bar-${foldName(name)}`,
        name,
        role: 'escandallo',
        ...(scopeIds.length > 0 ? { brandIds: scopeIds } : {}),
        baseCost: resolveVertialDefaultBaseCost(name, 'tapas_bar'),
      });
      added += 1;
    }
  }

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

  if (isDrinkCatalogProduct(item) || isDessertCatalogProduct(item)) {
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
    let drinkFixed = resolveBarEscandalloFixedCost(item.category || '', item.name || '');
    if (drinkFixed == null) drinkFixed = resolveVertialDefaultRetailCost(item);
    if (!(drinkFixed > 0)) {
      drinkFixed =
        resolveCategoryFixedFallback(item, inferImportCostingLineKind(item, brands)) ?? 0;
    }
    return {
      item: withProductCosting(
        item,
        { costingType: 'fixed', fixedCost: drinkFixed },
        new Map(),
        brands,
        inventoryContext?.costByCatalogId,
      ),
      mode: 'fixed',
    };
  }

  // Reventa envasada: 1 ud del artículo de almacén. Si la ficha trae ingredientes
  // (bocadillo, tapa…), la receta sale de esos nombres con cantidades, no del clon.
  if (isCatalogResaleStockProduct(item) && !hasCatalogIngredientList(item)) {
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
    let fixedCost = resolveBarEscandalloFixedCost(item.category || '', item.name || '');
    if (fixedCost == null) fixedCost = resolveVertialDefaultRetailCost(item);
    if (!(fixedCost > 0)) {
      fixedCost =
        resolveCategoryFixedFallback(item, inferImportCostingLineKind(item, brands)) ?? 0;
    }
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
    const draft = withProductCosting(
      item,
      { costingType: 'recipe', recipeLines },
      ingredientsById,
      brands,
      inventoryContext?.costByCatalogId,
    );
    const cappedCost = capVertialAutoCostEstimate(item, Number(draft.costPrice) || 0, lineKind);
    const next =
      cappedCost !== draft.costPrice
        ? { ...draft, costPrice: cappedCost }
        : draft;
    return { item: next, mode: 'recipe' };
  }

  const fallback = resolveCategoryFixedFallback(item, lineKind);
  if (fallback != null) {
    return {
      item: withProductCosting(item, { costingType: 'fixed', fixedCost: fallback }, new Map(), brands),
      mode: 'fixed',
    };
  }

  // Bar/restaurante: nunca dejar comida sin coste aprox al importar Excel (las bebidas ya
  // muestran referencia Vertial; la comida sin costingType aparece como «Sin escandallo»).
  if (shouldUseBarEscandalloPresets(lineKind, item.category || '')) {
    const approx =
      resolveBarEscandalloApproxFromSalePrice(Number(item.unitPrice) || 0) ??
      resolveVertialDefaultBaseCost(item.name, lineKind === 'generic' ? undefined : lineKind);
    if (approx != null && approx > 0) {
      return {
        item: withProductCosting(
          item,
          { costingType: 'fixed', fixedCost: approx },
          new Map(),
          brands,
        ),
        mode: 'fixed',
      };
    }
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
