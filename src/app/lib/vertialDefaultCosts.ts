import type { CatalogItem } from './deliveryApi';
import type { DeliveryBrandLineKindId } from './deliveryBrandLineKinds';
import type { StoreIngredient } from './catalogCustomization';

type CostRule = {
  patterns: string[];
  cost: number;
};

function foldCostName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function matchesCostRule(folded: string, rule: CostRule): boolean {
  return rule.patterns.some((pattern) => {
    const p = foldCostName(pattern);
    return folded.includes(p) || p.includes(folded);
  });
}

function matchCostRules(rules: CostRule[], folded: string): number | undefined {
  for (const rule of rules) {
    if (matchesCostRule(folded, rule)) return rule.cost;
  }
  return undefined;
}

/** Bebidas — mismo coste de referencia para todas las marcas (€ / unidad). */
export const VERTIAL_UNIVERSAL_DRINK_COSTS: CostRule[] = [
  { patterns: ['caña', 'cana', 'tubo', 'corto'], cost: 0.35 },
  { patterns: ['clara', 'radler', 'lemon'], cost: 0.45 },
  { patterns: ['jarra', 'litro', 'tercio'], cost: 1.05 },
  { patterns: ['cubata', 'combinado', 'gintonic', 'gin tonic', 'mojito', 'copa'], cost: 0.85 },
  { patterns: ['coca', 'cola', 'pepsi', 'refresco'], cost: 0.65 },
  { patterns: ['sprite', 'fanta', 'schweppes', 'tonica', 'tónica', 'seven up'], cost: 0.5 },
  { patterns: ['agua'], cost: 0.22 },
  { patterns: ['cerveza', 'beer', 'mahou', 'estrella', 'heineken'], cost: 0.55 },
  { patterns: ['zumo', 'juice', 'nestea', 'aquarius', 'ice tea'], cost: 0.6 },
  { patterns: ['red bull', 'monster', 'energetica', 'energética'], cost: 0.85 },
  { patterns: ['vino', 'tinto', 'blanco', 'rosado'], cost: 1.2 },
  { patterns: ['cafe solo', 'café solo', 'espresso', 'expresso'], cost: 0.12 },
  { patterns: ['cafe con leche', 'café con leche', 'capuccino', 'cappuccino', 'latte'], cost: 0.28 },
  { patterns: ['bebida'], cost: 0.55 },
];

/** Ingredientes por línea comercial (€ por unidad de medida usada en escandallo: kg o ud). */
export const VERTIAL_LINE_INGREDIENT_COSTS: Partial<Record<DeliveryBrandLineKindId, CostRule[]>> = {
  pizza: [
    { patterns: ['masa', 'harina', 'base pizza'], cost: 1.8 },
    { patterns: ['salsa', 'tomate'], cost: 3.0 },
    { patterns: ['mozzarella', 'queso', 'fior di latte', 'bufala'], cost: 5.5 },
    { patterns: ['pepperoni', 'salami', 'chorizo'], cost: 14.0 },
    { patterns: ['jamon', 'jamón', 'prosciutto'], cost: 16.0 },
    { patterns: ['champi', 'seta', 'champignon'], cost: 8.0 },
    { patterns: ['cebolla'], cost: 2.5 },
    { patterns: ['pimiento', 'pimenton'], cost: 3.5 },
    { patterns: ['aceituna', 'oliva'], cost: 6.0 },
    { patterns: ['bacon', 'panceta'], cost: 12.0 },
    { patterns: ['anchoa', 'atun', 'atún'], cost: 12.0 },
    { patterns: ['piña', 'pina'], cost: 4.0 },
    { patterns: ['albahaca', 'oregano', 'orégano'], cost: 20.0 },
    { patterns: ['aceite'], cost: 8.0 },
  ],
  burger_fastfood: [
    { patterns: ['carne', 'burger', 'vacuno', 'ternera', 'picada', 'hamburguesa'], cost: 8.5 },
    { patterns: ['pan', 'bollo', 'brioche', 'hamburguesa pan'], cost: 0.45 },
    { patterns: ['queso', 'cheddar', 'loncha'], cost: 0.2 },
    { patterns: ['lechuga'], cost: 4.0 },
    { patterns: ['tomate'], cost: 2.5 },
    { patterns: ['cebolla'], cost: 2.5 },
    { patterns: ['pepinillo', 'pickle'], cost: 6.0 },
    { patterns: ['salsa', 'mayonesa', 'ketchup', 'mostaza'], cost: 6.0 },
    { patterns: ['bacon', 'panceta'], cost: 12.0 },
    { patterns: ['huevo'], cost: 0.25 },
    { patterns: ['patata', 'frita'], cost: 2.0 },
  ],
  tacos_mexican: [
    { patterns: ['tortilla', 'maiz', 'maíz'], cost: 0.18 },
    { patterns: ['carne', 'pastor', 'carnitas', 'barbacoa', 'cochinita'], cost: 9.0 },
    { patterns: ['pollo', 'chicken'], cost: 7.5 },
    { patterns: ['guacamole', 'aguacate'], cost: 8.0 },
    { patterns: ['salsa', 'pico', 'verde', 'roja'], cost: 5.0 },
    { patterns: ['queso', 'cotija', 'cheddar'], cost: 7.0 },
    { patterns: ['cebolla', 'cilantro'], cost: 3.0 },
    { patterns: ['lime', 'limon', 'limón'], cost: 0.15 },
    { patterns: ['frijol', 'refrito'], cost: 4.0 },
    { patterns: ['arroz'], cost: 3.0 },
  ],
  tapas_bar: [
    { patterns: ['pan', 'regana', 'requena', 'picos'], cost: 0.25 },
    { patterns: ['aceite', 'oliva'], cost: 8.0 },
    { patterns: ['jamon', 'jamón', 'iberico', 'ibérico', 'serrano'], cost: 28.0 },
    { patterns: ['queso', 'manchego', 'curado'], cost: 14.0 },
    { patterns: ['patata', 'brava', 'frita'], cost: 2.0 },
    { patterns: ['aceituna', 'oliva'], cost: 6.0 },
    { patterns: ['pulpo', 'gallega'], cost: 16.0 },
    { patterns: ['gamba', 'gambon', 'langostino'], cost: 18.0 },
    { patterns: ['tortilla', 'patata'], cost: 3.5 },
    { patterns: ['calamar', 'romana'], cost: 12.0 },
    { patterns: ['chorizo', 'morcilla', 'salchicha'], cost: 10.0 },
    { patterns: ['alioli', 'salsa', 'brava', 'mayonesa'], cost: 6.0 },
    { patterns: ['anchoa', 'boqueron', 'boquerón'], cost: 14.0 },
    { patterns: ['atun', 'atún', 'bonito'], cost: 12.0 },
    { patterns: ['cerdo', 'lomo', 'solomillo'], cost: 9.0 },
    { patterns: ['pollo', 'wings', 'alita'], cost: 7.5 },
    { patterns: ['pimiento', 'padron', 'padrón'], cost: 4.0 },
    { patterns: ['tomate', 'ensalada'], cost: 2.5 },
    { patterns: ['huevo'], cost: 0.25 },
    { patterns: ['pan barra', 'baguette'], cost: 0.35 },
    { patterns: ['lomo', 'ternera'], cost: 9.0 },
    { patterns: ['atun', 'atún'], cost: 12.0 },
    { patterns: ['bechamel'], cost: 4.0 },
    { patterns: ['pan rallado'], cost: 2.0 },
    { patterns: ['limon', 'limón'], cost: 2.5 },
  ],
  kebab: [
    { patterns: ['pan', 'pita', 'lavash'], cost: 0.35 },
    { patterns: ['carne', 'kebab', 'doner', 'döner', 'cordero'], cost: 8.5 },
    { patterns: ['pollo', 'chicken'], cost: 7.5 },
    { patterns: ['lechuga', 'tomate', 'cebolla'], cost: 2.5 },
    { patterns: ['salsa', 'yogur', 'tzatziki', 'alioli'], cost: 6.0 },
    { patterns: ['patata', 'frita'], cost: 2.0 },
  ],
  cafe_bakery: [
    { patterns: ['cafe', 'café', 'cafeina'], cost: 12.0 },
    { patterns: ['leche', 'lactea', 'láctea'], cost: 1.2 },
    { patterns: ['harina', 'masa'], cost: 1.5 },
    { patterns: ['mantequilla', 'margarina'], cost: 6.0 },
    { patterns: ['huevo'], cost: 0.25 },
    { patterns: ['azucar', 'azúcar', 'chocolate'], cost: 3.0 },
    { patterns: ['bolleria', 'bollería', 'croissant', 'napolitana'], cost: 0.55 },
  ],
  mixed_restaurant: [
    { patterns: ['pollo', 'chicken'], cost: 7.5 },
    { patterns: ['cerdo', 'pork'], cost: 8.0 },
    { patterns: ['pescado', 'salmon', 'salmón'], cost: 12.0 },
    { patterns: ['arroz', 'pasta'], cost: 3.0 },
    { patterns: ['verdura', 'ensalada'], cost: 4.0 },
  ],
  prepared_meals: [
    { patterns: ['pollo', 'chicken'], cost: 7.5 },
    { patterns: ['arroz', 'pasta'], cost: 3.0 },
    { patterns: ['verdura'], cost: 4.0 },
  ],
  drinks_desserts: [
    { patterns: ['helado', 'tarta', 'postre', 'brownie', 'coulant'], cost: 1.2 },
    { patterns: ['cafe', 'café', 'capuccino', 'cappuccino'], cost: 0.35 },
    { patterns: ['bolleria', 'bollería', 'croissant'], cost: 0.45 },
  ],
};

const VERTIAL_GENERIC_INGREDIENT_COST = 5.0;
const VERTIAL_GENERIC_DRINK_COST = 0.55;

export function resolveVertialDefaultDrinkCost(
  item: Pick<CatalogItem, 'name' | 'category' | 'stockCategory'>,
): number {
  const folded = `${foldCostName(item.category)} ${foldCostName(item.name)}`;
  return matchCostRules(VERTIAL_UNIVERSAL_DRINK_COSTS, folded) ?? VERTIAL_GENERIC_DRINK_COST;
}

export function isDrinkCatalogProduct(
  item: Pick<CatalogItem, 'name' | 'category' | 'stockCategory'>,
): boolean {
  const cat = foldCostName(item.category);
  const name = foldCostName(item.name);
  if (item.stockCategory === 'beverage') return true;
  if (/bebida|refresco|cerveza|agua|zumo|cola|drink|combinado|cubata|vino|wine/.test(cat)) return true;
  // caña/cana/clara/jarra: palabra completa (evita «americana» → bebida)
  if (
    /bebida|refresco|cerveza|agua|zumo|cola|coca|fanta|sprite|nestea|pepsi|combinado|vino|wine|lambrusco|sangria/.test(
      name,
    )
  ) {
    return true;
  }
  if (/(?:^|\s)(caña|cana|clara|jarra)(?:\s|$)/.test(` ${name} `)) return true;
  return false;
}

export function isDessertCatalogProduct(
  item: Pick<CatalogItem, 'name' | 'category'>,
): boolean {
  const cat = foldCostName(item.category);
  const name = foldCostName(item.name);
  return /postre|dessert|helado|tarta|bolleria|bollería/.test(cat) || /postre|tarta|helado|brownie/.test(name);
}

export function resolveVertialDefaultBaseCost(
  ingredientName: string,
  lineKind?: string | null,
): number | undefined {
  const folded = foldCostName(ingredientName);
  if (!folded) return undefined;

  const kind = String(lineKind || '').trim() as DeliveryBrandLineKindId;
  const lineRules = VERTIAL_LINE_INGREDIENT_COSTS[kind];
  if (lineRules) {
    const lineCost = matchCostRules(lineRules, folded);
    if (lineCost != null) return lineCost;
  }

  for (const rules of Object.values(VERTIAL_LINE_INGREDIENT_COSTS)) {
    if (!rules) continue;
    const cost = matchCostRules(rules, folded);
    if (cost != null) return cost;
  }

  const drinkCost = matchCostRules(VERTIAL_UNIVERSAL_DRINK_COSTS, folded);
  if (drinkCost != null) return drinkCost;

  return VERTIAL_GENERIC_INGREDIENT_COST;
}

export function resolveLineKindForIngredient(
  ing: Pick<StoreIngredient, 'brandIds'>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): string | undefined {
  const brandId = ing.brandIds?.[0];
  if (!brandId) return brands[0]?.deliveryLineKind;
  return brands.find((b) => b._id === brandId)?.deliveryLineKind;
}

export function withVertialDefaultBaseCost(
  ing: StoreIngredient,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): StoreIngredient {
  const stored = Number(ing.baseCost);
  if (Number.isFinite(stored) && stored >= 0) return ing;
  const lineKind = resolveLineKindForIngredient(ing, brands);
  const cost = resolveVertialDefaultBaseCost(ing.name, lineKind);
  if (cost == null) return ing;
  return { ...ing, baseCost: cost };
}

export function applyVertialDefaultsToStoreIngredients(
  ingredients: StoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
): { items: StoreIngredient[]; appliedCount: number } {
  let appliedCount = 0;
  const items = ingredients.map((ing) => {
    const stored = Number(ing.baseCost);
    if (Number.isFinite(stored) && stored >= 0) return ing;
    const next = withVertialDefaultBaseCost(ing, brands);
    if (next.baseCost !== ing.baseCost) appliedCount += 1;
    return next;
  });
  return { items, appliedCount };
}

export function resolveVertialDefaultRetailCost(
  item: Pick<CatalogItem, 'name' | 'category' | 'stockCategory'>,
): number {
  if (isDessertCatalogProduct(item)) {
    return resolveVertialDefaultBaseCost(item.name, 'drinks_desserts') ?? 1.2;
  }
  if (isDrinkCatalogProduct(item)) {
    return resolveVertialDefaultDrinkCost(item);
  }
  return 0;
}

export function effectiveStoreIngredientBaseCost(
  ing: Pick<StoreIngredient, 'baseCost' | 'name' | 'brandIds'>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const stored = Number(ing.baseCost);
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored * 100) / 100;
  const lineKind = brands ? resolveLineKindForIngredient(ing, brands) : undefined;
  const fallback = resolveVertialDefaultBaseCost(ing.name, lineKind);
  return fallback ?? 0;
}
