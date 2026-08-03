import type { CatalogItem } from './deliveryApi';
import { isTpvComboCatalogItem } from './catalogComboSlots';

export interface CatalogSupplement {
  id: string;
  name: string;
  price: number;
}

export interface CartLineCustomization {
  removedIngredients: string[];
  addedSupplements: CatalogSupplement[];
  notes: string;
  /** Productos elegidos al vender un menú/combo en TPV. */
  comboSelections?: import('./deliveryApi').CatalogComboRef[];
  /** Pizza mitad y mitad: 2 sabores elegidos en TPV (producto suelto). */
  halfHalfPizza?: HalfHalfPizzaSelection;
  /** Pizza al gusto: ingredientes base elegidos en TPV (sin receta fija). */
  addedBaseIngredients?: string[];
}

export type HalfHalfPizzaSelection = {
  firstProductId: string;
  firstProductName: string;
  secondProductId: string;
  secondProductName: string;
};

export const EMPTY_CART_CUSTOMIZATION: CartLineCustomization = {
  removedIngredients: [],
  addedSupplements: [],
  notes: '',
};

export type TpvCategoryTemplateKey = 'pizzas' | 'hamburguesas';

export interface TpvCategoryTemplate {
  ingredients: string;
  supplements: CatalogSupplement[];
}

export type TpvCategoryTemplates = Partial<Record<TpvCategoryTemplateKey, TpvCategoryTemplate>>;

/** Suplementos de pago por marca (legacy: anidado por pizzas/hamburguesas). */
export type TpvBrandCategorySupplements = Record<
  string,
  Partial<Record<TpvCategoryTemplateKey, { supplements: CatalogSupplement[] }>>
>;

/** Selección de ingredientes de la lista maestra por marca (ids de storeIngredients). */
export type TpvBrandIngredientSelection = Record<string, string[]>;

/** Suplementos de pago por marca/línea comercial. */
export type TpvBrandSupplements = Record<string, CatalogSupplement[]>;

/** @deprecated Usar TpvBrandIngredientSelection */
export type TpvBrandCategoryIngredients = Record<
  string,
  Partial<Record<TpvCategoryTemplateKey, { ingredients: StoreIngredient[] }>>
>;

export type StoreIngredientRole = 'escandallo' | 'base' | 'extra';

export interface StoreIngredient {
  id: string;
  name: string;
  /** Interno: escandallo = no TPV · base = TPV quitar · extra = TPV cobrar */
  role?: StoreIngredientRole;
  /** Líneas/marcas comerciales a las que aplica. */
  brandIds?: string[];
  /** Dónde se usa: pizzas, hamburguesas… Vacío = en todas las partes. */
  productParts?: TpvCategoryTemplateKey[];
  /** Precio del extra (legacy por ingrediente; preferir tpvDefaultExtraPrice en config). */
  extraPrice?: number;
  /** @deprecated Usar tpvDefaultExtraPrice en delivery config. */
  extraPrices?: Record<string, number>;
  /** @deprecated Usar role === 'escandallo' */
  escandalloOnly?: boolean;
  /** Puede añadirse como extra de pago en TPV (persistido; role sigue siendo la fuente para el TPV). */
  tpvChargeExtra?: boolean;
  /** Puede quitarse del producto en TPV (persistido; role sigue siendo la fuente para el TPV). */
  tpvAllowRemove?: boolean;
  /** Coste base por unidad para escandallos (€). */
  baseCost?: number;
}

const CUSTOMIZABLE_KEYS = ['pizza', 'pizzas', 'hamburguesa', 'hamburguesas', 'burger', 'burgers'];

type TpvBrandHint = { _id: string; deliveryLineKind?: string; catalogCategories?: string[] };

export function productBrandIdsFromItem(item: Pick<CatalogItem, 'brandIds'>): string[] {
  return Array.isArray(item.brandIds)
    ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
}

function resolveTpvCategoryFromBrands(
  brandIds: string[],
  brands?: TpvBrandHint[],
): TpvCategoryTemplateKey | null {
  if (!brands?.length || brandIds.length === 0) return null;
  const keys = new Set<TpvCategoryTemplateKey>();
  for (const brandId of brandIds) {
    const brand = brands.find((b) => b._id === brandId);
    if (!brand) continue;
    for (const key of resolveBrandTpvCategoryKeys(brand)) keys.add(key);
  }
  if (keys.size === 1) return [...keys][0];
  if (keys.has('pizzas') && !keys.has('hamburguesas')) return 'pizzas';
  if (keys.has('hamburguesas') && !keys.has('pizzas')) return 'hamburguesas';
  return null;
}

export function resolveTpvCategoryTemplateKey(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds'>,
  brands?: TpvBrandHint[],
  resolveOptions?: Pick<ParseCatalogResolveOptions, 'comboSelections' | 'catalogItems'>,
): TpvCategoryTemplateKey | null {
  if (resolveOptions?.comboSelections?.length && resolveOptions.catalogItems?.length) {
    const fromSale = inferTemplateKeyFromComboSelections(
      resolveOptions.comboSelections,
      resolveOptions.catalogItems,
    );
    if (fromSale) return fromSale;
  }
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (/hamburguesa|burger/.test(cat) || /hamburguesa|burger/.test(name)) return 'hamburguesas';
  if (/pizza/.test(cat) || /pizza/.test(name)) return 'pizzas';
  const fromCatalogCategory = resolveTpvCategoryFromItemCatalogCategory(
    String(item.category || ''),
    productBrandIdsFromItem(item),
    brands,
  );
  if (fromCatalogCategory) return fromCatalogCategory;
  if (/bebida|postre|complemento|entrante|ensalada|bebidas|postres/.test(cat)) return null;
  if (/combo/.test(cat)) {
    const fromBrand = resolveTpvCategoryFromBrands(productBrandIdsFromItem(item), brands);
    if (fromBrand) return fromBrand;
  }
  return resolveTpvCategoryFromBrands(productBrandIdsFromItem(item), brands);
}

/** Categoría del catálogo (p. ej. «Al Dulce») → pizza/burger según la línea comercial. */
function resolveTpvCategoryFromItemCatalogCategory(
  category: string,
  productBrandIds: string[],
  brands?: TpvBrandHint[],
): TpvCategoryTemplateKey | null {
  if (!brands?.length || !String(category || '').trim()) return null;
  const folded = foldCategoryKey(category);
  const keys = new Set<TpvCategoryTemplateKey>();
  const brandScope =
    productBrandIds.length > 0
      ? brands.filter((b) => productBrandIds.includes(b._id))
      : brands;
  for (const brand of brandScope) {
    const brandCats = (brand.catalogCategories ?? []).map((c) => foldCategoryKey(c));
    if (!brandCats.includes(folded)) continue;
    for (const key of resolveBrandTpvCategoryKeys(brand)) keys.add(key);
  }
  if (keys.size === 1) return [...keys][0];
  if (keys.has('pizzas') && !keys.has('hamburguesas')) return 'pizzas';
  if (keys.has('hamburguesas') && !keys.has('pizzas')) return 'hamburguesas';
  return null;
}

function hasProductTpvIngredients(item: Pick<CatalogItem, 'customFields'>): boolean {
  return (
    parseIngredientsText(
      typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '',
    ).length > 0
  );
}

function foldCatalogCategoryLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function foldCatalogProductName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Producto de catálogo «Mitad y mitad»: un precio, 2 sabores de pizza en TPV. */
export function isTpvHalfHalfCatalogItem(
  item: Pick<CatalogItem, 'itemType' | 'category' | 'name' | 'customFields'>,
): boolean {
  if (item.itemType === 'combo') return false;
  const name = foldCatalogProductName(item.name || '');
  // Carta: «Premium mitad y mitad (al gusto)» = elegir 2 pizzas, NO ingredientes.
  if (/mitad\s*y\s*mitad|half\s*and\s*half|half-half/.test(name)) return true;
  if (item.customFields?.halfHalf === true) return true;
  if (item.customFields?.buildYourOwn === true) return false;
  return false;
}

/** Pizza al gusto: el cliente elige ingredientes base en TPV (sin receta fija en ficha). */
export function isTpvBuildYourOwnCatalogItem(
  item: Pick<CatalogItem, 'itemType' | 'category' | 'name' | 'customFields'>,
): boolean {
  const name = foldCatalogProductName(item.name || '');
  if (/mitad\s*y\s*mitad|half\s*and\s*half|half-half/.test(name)) return false;
  if (item.customFields?.halfHalf === true) return false;
  if (item.customFields?.buildYourOwn === true) return true;
  if (item.itemType === 'combo') return false;
  if (/al\s*gusto|a\s*gusto|build\s*your\s*own/.test(name)) return true;
  // Modos Excel: «3 Ingredientes», «5 Ingredientes a elegir», etc.
  if (/\d+\s*ingredientes?/.test(name)) return true;
  // Carta: pizza al gusto Modommio / Modomio (nunca menús «Combo …»).
  if (/^combo\b/.test(name)) return false;
  if (/^(pizza\s+)?modommio(premium)?$/.test(name) || /^premium\s+modommio$/.test(name)) return true;
  if (/^(pizza\s+)?modomio(premium)?$/.test(name) || /^premium\s+modomio$/.test(name)) return true;
  return false;
}

/**
 * Tope de ingredientes base en pizza al gusto (3 / 5).
 * null = sin tope (elige los que quiera).
 * Carta Pau: Modomio (Pizzas) = 3; Premium Modomio = 5. Mitad y mitad NO usa esto (elige 2 pizzas).
 */
export function resolveBuildYourOwnMaxIngredients(
  item: Pick<CatalogItem, 'name' | 'category' | 'customFields'>,
): number | null {
  const rawCf = Number(item.customFields?.buildYourOwnMaxIngredients);
  if (Number.isFinite(rawCf) && rawCf > 0) return Math.min(20, Math.floor(rawCf));

  const name = foldCatalogProductName(item.name || '');
  const cat = foldIngredientLabel(String(item.category || ''));
  if (/mitad\s*y\s*mitad|half\s*and\s*half/.test(name)) return null;
  // Menú «Combo …»: no es pizza al gusto.
  if (/^combo\b/.test(name)) return null;

  const isPremiumModomio =
    /premium\s*modommio|modommio\s*premium|modommiopremium/.test(name) ||
    /premium\s*modomio|modomio\s*premium|modomiopremium/.test(name) ||
    (/(modommio|modomio)/.test(name) && /premium/.test(cat)) ||
    (/(modommio|modomio)/.test(name) && /\b5\s*ingredientes?\b/.test(name));
  if (isPremiumModomio) return 5;

  const isPlainModomio =
    /^(pizza\s+)?modommio$/.test(name) ||
    /^(pizza\s+)?modomio$/.test(name) ||
    (/(modommio|modomio)/.test(name) && /\b3\s*ingredientes?\b/.test(name));
  if (isPlainModomio) return 3;

  const blobs = [
    name,
    foldIngredientLabel(
      typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '',
    ),
  ];
  for (const text of blobs) {
    if (!text) continue;
    const m =
      text.match(/(\d+)\s*ingredientes?\s*(a\s*elegir)?/) ||
      text.match(/\+\s*(\d+)\s*ingredientes?/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return Math.min(20, Math.floor(n));
    }
  }
  return null;
}

/** Ingredientes base que el cliente puede elegir en TPV (pizza al gusto). */
export function normalizeBuildYourOwnAllowedIngredientIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
}

function foldIngredientLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Etiquetas de menú del Excel (p. ej. «0», «3 Ingredientes a elegir»), no ingredientes reales.
 * Suele venir de la columna ingredientes en filas de pizza al gusto / menús por niveles.
 */
/**
 * Nombres compuestos con «y» que SÍ son un solo ingrediente (no partir).
 * Ej.: «salsa miel y mostaza». «Queso di mare» no lleva «y» → no aplica.
 */
const INGREDIENT_Y_COMPOUND_RES: RegExp[] = [
  /\bmiel\s+y\s+mostaza\b/,
  /\baceite\s+y\s+vinagre\b/,
  /\bsal\s+y\s+pimienta\b/,
  /\bmacarrones\s+y\s+queso\b/,
];

/** Etiquetas de producto / prosa de carta, no un ingrediente real. */
export function isLikelyInvalidIngredientLabel(name: string): boolean {
  if (isCatalogIngredientPlaceholder(name)) return true;
  const folded = foldIngredientLabel(name);
  if (!folded) return true;
  if (/^\d+$/.test(folded)) return true;
  if (/^\+\s*\d+/.test(folded)) return true;
  if (/ingredientes?\s+a\s+elegir/.test(folded)) return true;
  if (/\d+\s+ingredientes?/.test(folded)) return true;
  if (/^elegir\s+\d+/.test(folded)) return true;
  if (/^dos\s+sabores\b/.test(folded)) return true;
  // Productos / mitades / menús colados en lista maestra
  if (/mitad\s+y\s+mitad/.test(folded)) return true;
  if (/al\s+gusto/.test(folded)) return true;
  if (/\d+\s*pizzas?\b/.test(folded)) return true;
  if (/\b(complementos?|refrescos?)\b/.test(folded)) return true;
  if (/\+/.test(folded) && /\b(pizza|complemento|refresco|bebida)\b/.test(folded)) return true;
  // Postres / no-topping pizza
  if (/\bhelado\b/.test(folded)) return true;
  if (/\bml\b/.test(folded) && /\b(125|250|500)\b/.test(folded)) return true;
  // Prosa de carta
  if (/\bun\s+toque\s+de\b/.test(folded)) return true;
  if (/\bbase\s+blanca\s+(con|de)\b/.test(folded)) return true;
  if (/^\d+\s*(x|×)?\s*(hamburgues|smash|chicken|burger|ud|uds)\b/.test(folded)) return true;
  if (/\b\d+\s*(g|gr|gramos)\b/.test(folded)) return true;
  if (/^2\s+hamburgues/.test(folded)) return true;
  // «A y B» pegados (salvo compuestos reales): no es un solo ingrediente
  if (/\s+y\s+/.test(folded) || /\s+e\s+/.test(folded)) {
    const isCompound = INGREDIENT_Y_COMPOUND_RES.some((re) => re.test(folded));
    if (!isCompound) return true;
  }
  const words = folded.split(/\s+/).filter(Boolean);
  // Ingredientes reales suelen ser cortos: «queso di mare», «tomate deshidratado».
  if (words.length > 4) return true;
  if (words.length >= 4 && !/\b(salsa|queso|jamon|tomate|cebolla|patatas)\b/.test(folded)) return true;
  return false;
}

export function isIngredientMetaLabel(name: string): boolean {
  return isLikelyInvalidIngredientLabel(name);
}

/** Bebidas que no deben salir como topping en pizza al gusto (van en Extras o catálogo bebidas). */
export function isLikelyBeverageIngredient(name: string): boolean {
  const folded = foldIngredientLabel(name);
  if (!folded) return false;
  return /\b(agua|coca|pepsi|fanta|aquarius|nestea|cerveza|refresco|bebida|zumo|juice|cola|sprite|seven\s*up|7up|red\s*bull)\b/.test(
    folded,
  );
}

function isBuildYourOwnSelectableIngredient(
  ing: StoreIngredient,
  templateKey: TpvCategoryTemplateKey | null,
): boolean {
  if (!ingredientShowsInTpv(ing)) return false;
  if (isIngredientMetaLabel(ing.name)) return false;
  if (isLikelyInvalidIngredientLabel(ing.name)) return false;
  if (templateKey === 'pizzas' && isLikelyBeverageIngredient(ing.name)) return false;
  return true;
}

/** Ingredientes base configurables en catálogo / TPV para pizza al gusto. */
export function resolveStoreIngredientsFromBrandSelection(
  storeIngredients: StoreIngredient[],
  brandIngredientSelection: TpvBrandIngredientSelection,
  brandIds: string[],
): StoreIngredient[] {
  const byId = storeIngredientsById(storeIngredients);
  const byName = new Map<string, StoreIngredient>();
  for (const ing of storeIngredients) {
    byName.set(ingredientNameKey(ing.name), ing);
  }
  const out: StoreIngredient[] = [];
  const seen = new Set<string>();
  for (const brandId of brandIds) {
    for (const raw of brandIngredientSelection[brandId] || []) {
      const token = String(raw || '').trim();
      if (!token) continue;
      const ing = byId.get(token) || byName.get(ingredientNameKey(token));
      if (!ing) continue;
      const key = ingredientNameKey(ing.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ing);
    }
  }
  return out;
}

function scopeStoreIngredientsToProductBrands(
  list: StoreIngredient[],
  productBrandIds: string[],
  allBrandIds: string[],
): StoreIngredient[] {
  if (!list.length) return [];
  if (productBrandIds.length === 0 || allBrandIds.length <= 1) return list;
  const seen = new Set<string>();
  const out: StoreIngredient[] = [];
  for (const brandId of productBrandIds) {
    for (const ing of filterStoreIngredientsByBrand(list, brandId, allBrandIds)) {
      const key = ingredientNameKey(ing.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ing);
    }
  }
  return out.length > 0 ? out : list;
}

function catalogBuildYourOwnIngredientPool(
  pool: StoreIngredient[],
  productBrandIds: string[],
  templateKey: TpvCategoryTemplateKey | null,
): StoreIngredient[] {
  const selectable = pool.filter((ing) => isBuildYourOwnSelectableIngredient(ing, templateKey));
  const seen = new Set<string>();
  const out: StoreIngredient[] = [];
  const push = (ing: StoreIngredient) => {
    const key = ingredientNameKey(ing.name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ing);
  };

  for (const ing of tpvBaseStoreIngredients(selectable, productBrandIds, templateKey)) {
    push(ing);
  }

  for (const ing of selectable) {
    if (!ingredientChargesExtra(ing)) continue;
    if (!storeIngredientAppliesToProductPart(ing, templateKey)) continue;
    if (
      productBrandIds.length > 0 &&
      !storeIngredientAppliesToBrands(ing, productBrandIds) &&
      normalizeBrandIds(ing.brandIds).length > 0
    ) {
      continue;
    }
    push(ing);
  }

  if (out.length > 0) return out;

  for (const ing of selectable.filter((row) => !ingredientChargesExtra(row))) {
    push(ing);
  }
  return out;
}

/** Ingredientes base configurables en catálogo / TPV para pizza al gusto. */
export function catalogBuildYourOwnIngredientOptions(
  item: Pick<CatalogItem, 'brandIds' | 'category' | 'name' | 'customFields'>,
  storeIngredients: StoreIngredient[] | undefined,
  brandIngredientSelection?: TpvBrandIngredientSelection,
  brands?: TpvBrandHint[],
): StoreIngredient[] {
  const templateKey = resolveTpvCategoryTemplateKey(item, brands) ?? 'pizzas';
  const productBrandIds = productBrandIdsFromItem(item);
  const allBrandIds = (brands || []).map((b) => b._id);
  const master = storeIngredients || [];
  const scoped = scopeStoreIngredientsToProductBrands(master, productBrandIds, allBrandIds);
  const sortByName = (rows: StoreIngredient[]) =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // TPV: mostrar TODOS los ingredientes de pizza del catálogo (no un subconjunto de la línea).
  // La lista blanca por producto (`buildYourOwnAllowedIngredientIds`) se aplica en candidates().
  void brandIngredientSelection;
  const fromScoped = catalogBuildYourOwnIngredientPool(scoped, productBrandIds, templateKey);
  if (fromScoped.length > 0) return sortByName(fromScoped);

  const fromMaster = catalogBuildYourOwnIngredientPool(master, productBrandIds, templateKey);
  return sortByName(fromMaster);
}

export function catalogBuildYourOwnIngredientCandidates(
  item: Pick<CatalogItem, 'brandIds' | 'category' | 'name' | 'customFields'>,
  storeIngredients: StoreIngredient[] | undefined,
  brandIngredientSelection?: TpvBrandIngredientSelection,
  brands?: TpvBrandHint[],
): StoreIngredient[] {
  const all = catalogBuildYourOwnIngredientOptions(
    item,
    storeIngredients,
    brandIngredientSelection,
    brands,
  );
  const allowed = normalizeBuildYourOwnAllowedIngredientIds(item.customFields?.buildYourOwnAllowedIngredientIds);
  if (allowed.length > 0) {
    const allowedSet = new Set(allowed);
    return all.filter((ing) => allowedSet.has(ing.id));
  }
  return all;
}

function isPizzaFamilyCatalogProductForIngredients(
  item: Pick<CatalogItem, 'category' | 'name' | 'customFields'>,
  brands?: TpvBrandHint[],
): boolean {
  if (isTpvBuildYourOwnCatalogItem(item)) return false;
  if (isTpvHalfHalfCatalogItem(item)) return false;
  const key = resolveTpvCategoryTemplateKey(item, brands);
  if (key === 'pizzas') return true;
  const cat = foldIngredientLabel(String(item.category || ''));
  return /premium|especialidad|pizzas?/.test(cat);
}

/**
 * Unión de ingredientes reales de pizzas + Premium (+ especialidad) del catálogo.
 * Fuente para Mitad/Modomio al gusto: no usa basura de la lista maestra (combos, helados, «A y B»).
 */
export function collectPizzaIngredientNamesFromCatalog(
  catalogItems: Array<Pick<CatalogItem, 'category' | 'name' | 'customFields' | 'brandIds' | 'active'>> | undefined,
  opts?: {
    brandIds?: string[];
    brands?: TpvBrandHint[];
  },
): string[] {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  const brandFilter = (opts?.brandIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const byKey = new Map<string, string>();
  for (const product of items) {
    if (product.active === false) continue;
    if (!isPizzaFamilyCatalogProductForIngredients(product, opts?.brands)) continue;
    if (brandFilter.length > 0 && !catalogPizzaMatchesBrandFilter(product, brandFilter)) continue;
    const raw =
      typeof product.customFields?.ingredients === 'string'
        ? product.customFields.ingredients
        : '';
    for (const part of parseIngredientsBulkText(raw)) {
      if (isLikelyInvalidIngredientLabel(part)) continue;
      if (isLikelyBeverageIngredient(part)) continue;
      const key = ingredientNameKey(part);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, part.trim());
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export function tpvBuildYourOwnIngredientPool(
  item: Pick<CatalogItem, 'brandIds' | 'category' | 'name' | 'customFields'>,
  storeIngredients?: StoreIngredient[],
  brandIngredientSelection?: TpvBrandIngredientSelection,
  brands?: TpvBrandHint[],
  catalogItems?: Array<Pick<CatalogItem, 'category' | 'name' | 'customFields' | 'brandIds' | 'active'>>,
): string[] {
  const fromCarta = collectPizzaIngredientNamesFromCatalog(catalogItems, {
    brandIds: productBrandIdsFromItem(item),
    brands,
  });
  if (fromCarta.length > 0) return fromCarta;

  return catalogBuildYourOwnIngredientCandidates(
    item,
    storeIngredients,
    brandIngredientSelection,
    brands,
  ).map((ing) => ing.name);
}

/** Sin ingredientes base configurados en Ingredientes TPV. */
export function isBuildYourOwnIngredientSelectionInvalid(
  allowedIngredientIds: string[],
  candidateCount: number,
): boolean {
  void allowedIngredientIds;
  return candidateCount === 0;
}

/** IDs de pizzas permitidas como sabores en mitad y mitad (vacío = todas las pizzas del catálogo). */
export function normalizeHalfHalfAllowedProductIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
}

/** Selección inválida: exactamente 1 pizza marcada (0 = todas, ≥2 = ok). */
export function isHalfHalfFlavorSelectionInvalid(allowedProductIds: string[]): boolean {
  return allowedProductIds.length === 1;
}

function catalogPizzaMatchesBrandFilter(
  item: Pick<CatalogItem, 'brandIds'>,
  brandIds: string[],
): boolean {
  if (brandIds.length === 0) return true;
  const itemBrandIds = Array.isArray(item.brandIds)
    ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (itemBrandIds.length === 0) return true;
  return itemBrandIds.some((id) => brandIds.includes(id));
}

function isPizzaLineBrandId(brandId: string, brands?: TpvBrandHint[]): boolean {
  if (!brands?.length) return false;
  const brand = brands.find((b) => b._id === brandId);
  return brand?.deliveryLineKind === 'pizza';
}

function isPizzaLikeCatalogProduct(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds'>,
  scopeBrandIds: string[],
  brands?: TpvBrandHint[],
): boolean {
  const cat = foldCatalogCategoryLabel(item.category || '');
  const name = foldCatalogCategoryLabel(item.name || '');
  if (/combo|menu|menú/.test(cat)) return false;
  if (cat.includes('pizza') || name.includes('pizza')) return true;
  if (/premium|especialidad|calzone/.test(cat)) return true;
  if (!scopeBrandIds.length || !brands?.length) return false;
  const itemBrandIds = Array.isArray(item.brandIds)
    ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  return scopeBrandIds.some(
    (brandId) => itemBrandIds.includes(brandId) && isPizzaLineBrandId(brandId, brands),
  );
}

/** Pizzas elegibles como sabores al configurar mitad y mitad (sin filtro de whitelist). */
export function catalogPizzaCandidatesForHalfHalf(
  catalog: CatalogItem[],
  excludeProductId?: string,
  brandIds?: string[],
  brands?: TpvBrandHint[],
): CatalogItem[] {
  return catalogPizzasForHalfHalf(catalog, excludeProductId, { brandIds, brands });
}

/** Pizzas vendibles como mitad en TPV. */
export function catalogPizzasForHalfHalf(
  catalog: CatalogItem[],
  halfHalfProductId?: string,
  options?: {
    allowedProductIds?: string[];
    brandIds?: string[];
    brands?: TpvBrandHint[];
  },
): CatalogItem[] {
  const brandIds = Array.isArray(options?.brandIds)
    ? options.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const allowed = normalizeHalfHalfAllowedProductIds(options?.allowedProductIds);
  const brands = options?.brands;

  let list = catalog.filter((c) => {
    if (c.active === false) return false;
    if (halfHalfProductId && c._id === halfHalfProductId) return false;
    if (c.itemType === 'combo' || c.itemType === 'service') return false;
    if (isTpvHalfHalfCatalogItem(c)) return false;
    if (isTpvBuildYourOwnCatalogItem(c)) return false;
    if (isTpvComboCatalogItem(c)) return false;
    if (!catalogPizzaMatchesBrandFilter(c, brandIds)) return false;
    return isPizzaLikeCatalogProduct(c, brandIds, brands);
  });

  if (allowed.length > 0) {
    const allowedSet = new Set(allowed);
    list = list.filter((c) => allowedSet.has(c._id));
  }

  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Menú Modomio (legacy): mitad y mitad dentro del combo — no confundir con producto suelto. */
export function tpvComboUsesHalfHalfStep(
  item: Pick<CatalogItem, 'customFields' | 'brandIds' | 'itemType' | 'category'>,
  brands?: TpvBrandHint[],
): boolean {
  const cf = item.customFields;
  if (cf?.comboHalfHalf === false) return false;
  if (cf?.comboHalfHalf === true) return true;
  const cat = foldCategoryKey(item.category || '');
  if (item.itemType !== 'combo' && cat !== 'combos' && cat !== 'combo') return false;
  const brandIds = productBrandIdsFromItem(item);
  if (!brands?.length) return cat === 'combos' || item.itemType === 'combo';
  for (const brandId of brandIds) {
    const brand = brands.find((b) => b._id === brandId);
    if (!brand) continue;
    if (brand.deliveryLineKind === 'pizza') return true;
    if (resolveBrandTpvCategoryKeys(brand).includes('pizzas')) return true;
  }
  return false;
}

/** Producto/combo configurable en TPV (quitar ingredientes, extras globales). */
export function isCustomizableCatalogItem(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds' | 'customFields'>,
  brands?: TpvBrandHint[],
): boolean {
  if (isTpvBuildYourOwnCatalogItem(item)) return true;
  if (hasProductTpvIngredients(item)) return true;
  return resolveTpvCategoryTemplateKey(item, brands) !== null;
}

/** Catálogo: sección TPV editable (pizzas, burgers, combos…). */
export function isCatalogTpvConfigurable(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds' | 'itemType' | 'customFields'>,
  brands?: TpvBrandHint[],
): boolean {
  if (item.itemType === 'combo') return true;
  const cat = foldCategoryKey(item.category || '');
  if (cat === 'combos' || cat === 'combo') return true;
  return isCustomizableCatalogItem(item, brands);
}

export function resolveItemPrimaryBrandId(item: Pick<CatalogItem, 'brandIds'>): string | null {
  const ids = Array.isArray(item.brandIds) ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  return ids[0] || null;
}

function foldCategoryKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Categorías TPV (pizza/burger) que cubre una línea comercial según su tipo y categorías de catálogo. */
export function resolveBrandTpvCategoryKeys(brand: {
  deliveryLineKind?: string;
  catalogCategories?: string[];
}): TpvCategoryTemplateKey[] {
  const keys = new Set<TpvCategoryTemplateKey>();
  for (const cat of brand.catalogCategories ?? []) {
    const c = foldCategoryKey(cat);
    if (c === 'pizzas' || c === 'pizza') keys.add('pizzas');
    if (c === 'hamburguesas' || c === 'burgers' || c === 'burger') keys.add('hamburguesas');
  }
  const kind = String(brand.deliveryLineKind || '').trim();
  if (kind === 'pizza') keys.add('pizzas');
  if (kind === 'burger_fastfood') keys.add('hamburguesas');
  if (kind === 'kebab') keys.add('hamburguesas');
  if (kind === 'tapas_bar') keys.add('entrantes');
  return [...keys];
}

export function brandsForTpvCategoryKey<T extends { _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>(
  brands: T[],
  key: TpvCategoryTemplateKey,
): T[] {
  return brands.filter((brand) => resolveBrandTpvCategoryKeys(brand).includes(key));
}

/**
 * Protege compuestos «A y B» conocidos, parte el resto por « y » / « e »
 * cuando ambos lados parecen ingredientes cortos (no prosa).
 */
function splitJoinedIngredientNames(part: string): string[] {
  let work = String(part || '').trim();
  if (!work) return [];

  const protectedChunks: string[] = [];
  for (const re of INGREDIENT_Y_COMPOUND_RES) {
    work = work.replace(re, (match) => {
      const idx = protectedChunks.length;
      protectedChunks.push(match.trim());
      return ` __YCOMP${idx}__ `;
    });
  }

  const rough = work
    .split(/\s+(?:y|e)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/__YCOMP(\d+)__/g, (_, i) => protectedChunks[Number(i)] || '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  const restore = (s: string) =>
    s
      .replace(/__YCOMP(\d+)__/g, (_, i) => protectedChunks[Number(i)] || '')
      .replace(/\s+/g, ' ')
      .trim();

  // Si al partir queda un lado basura/prosa, no partir: devolver original filtrado.
  if (rough.length <= 1) {
    const one = restore(work);
    return isLikelyInvalidIngredientLabel(one) ? [] : [one].filter(Boolean);
  }

  const restored = rough.map((s) => s.trim()).filter(Boolean);
  const valid = restored.filter((s) => !isLikelyInvalidIngredientLabel(s));
  // Si casi todo era basura, mejor no inventar: descarta el bloque.
  if (valid.length === 0) return [];
  // Si un lado era prosa y el otro válido, nos quedamos con los válidos.
  return valid;
}

function parseIngredientsText(raw: string | undefined | null): string[] {
  if (typeof raw !== 'string') return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of raw.split(/[,;\n|/]+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    for (const name of splitJoinedIngredientNames(trimmed)) {
      if (isCatalogIngredientPlaceholder(name) || isLikelyInvalidIngredientLabel(name)) continue;
      const key = ingredientNameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Textos de importación / carta que no son ingredientes reales para el TPV. */
export function isCatalogIngredientPlaceholder(name: string): boolean {
  const key = ingredientNameKey(name);
  if (!key) return true;
  const placeholders = new Set([
    'ver carta',
    'ver menu',
    'ver menú',
    'ver la carta',
    'consultar carta',
    'see menu',
    'ver',
    '-',
    '—',
    'n/a',
    'na',
    'sin ingredientes',
  ]);
  return placeholders.has(key);
}

export function isCatalogIngredientsFieldPlaceholder(raw: string | undefined | null): boolean {
  const parts = String(raw || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((part) => isCatalogIngredientPlaceholder(part));
}

export function parseIngredientsBulkText(raw: string): string[] {
  return parseIngredientsText(raw);
}

/** Guarda solo ingredientes reales (filtra «Ver carta», etc.). */
export function normalizeCatalogIngredientsForSave(raw: string | undefined | null): string {
  return parseIngredientsBulkText(String(raw || '').trim()).join(', ');
}

function ingredientNameKey(name: string): string {
  return String(name || '').trim().toLowerCase();
}

export function resolveIngredientRole(ing: Pick<StoreIngredient, 'role' | 'escandalloOnly'>): StoreIngredientRole {
  if (ing.role === 'escandallo' || ing.role === 'base' || ing.role === 'extra') return ing.role;
  if (ing.escandalloOnly) return 'escandallo';
  return 'base';
}

/** Todo es escandallo; esto indica si además sale en el TPV al cliente. */
export function ingredientShowsInTpv(ing: Pick<StoreIngredient, 'role' | 'escandalloOnly'>): boolean {
  return resolveIngredientRole(ing) !== 'escandallo';
}

export function ingredientChargesExtra(
  ing: Pick<StoreIngredient, 'role' | 'escandalloOnly' | 'tpvChargeExtra'>,
): boolean {
  if (typeof ing.tpvChargeExtra === 'boolean') return ing.tpvChargeExtra;
  return resolveIngredientRole(ing) === 'extra';
}

export function readStoreIngredientTpvFlags(
  ing: Pick<StoreIngredient, 'role' | 'escandalloOnly' | 'tpvChargeExtra' | 'tpvAllowRemove'>,
): { chargeExtra: boolean; allowRemove: boolean } {
  const role = resolveIngredientRole(ing);
  return {
    chargeExtra: ing.tpvChargeExtra ?? role === 'extra',
    allowRemove: ing.tpvAllowRemove ?? (role === 'base' || role === 'extra'),
  };
}

export function roleFromStoreIngredientTpvFlags(
  chargeExtra: boolean,
  allowRemove: boolean,
): StoreIngredientRole {
  if (!chargeExtra && !allowRemove) return 'escandallo';
  if (chargeExtra) return 'extra';
  return 'base';
}

export function withStoreIngredientTpvFlags(
  ing: StoreIngredient,
  patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
): StoreIngredient {
  const current = readStoreIngredientTpvFlags(ing);
  const chargeExtra = patch.chargeExtra ?? current.chargeExtra;
  const allowRemove = patch.allowRemove ?? current.allowRemove;
  const role = roleFromStoreIngredientTpvFlags(chargeExtra, allowRemove);
  return {
    ...ing,
    role,
    escandalloOnly: role === 'escandallo',
    tpvChargeExtra: chargeExtra,
    tpvAllowRemove: allowRemove,
  };
}

export function roleFromTpvFlags(showInTpv: boolean, chargeExtra: boolean): StoreIngredientRole {
  if (!showInTpv) return 'escandallo';
  return chargeExtra ? 'extra' : 'base';
}

function normalizeProductParts(raw: unknown): TpvCategoryTemplateKey[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<TpvCategoryTemplateKey>();
  for (const part of raw) {
    if (part === 'pizzas' || part === 'hamburguesas') out.add(part);
  }
  return [...out];
}

export function storeIngredientAppliesToProductPart(
  ing: Pick<StoreIngredient, 'productParts'>,
  productPart: TpvCategoryTemplateKey | null,
): boolean {
  const parts = normalizeProductParts(ing.productParts);
  if (parts.length === 0 || !productPart) return true;
  return parts.includes(productPart);
}

function normalizeBrandIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const id = String(entry || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function ingredientRowKey(name: string, brandIds: string[]): string {
  return `${ingredientNameKey(name)}::${[...brandIds].sort().join(',')}`;
}

/** ¿Este ingrediente aplica a alguna marca del producto? Sin marcas en el ítem = no filtra por marca. */
export function storeIngredientAppliesToBrands(
  ing: Pick<StoreIngredient, 'brandIds'>,
  productBrandIds: string[],
): boolean {
  const assigned = normalizeBrandIds(ing.brandIds);
  if (assigned.length === 0) return true;
  if (productBrandIds.length === 0) return true;
  return productBrandIds.some((id) => assigned.includes(id));
}

export function resolveStoreIngredientBrandIds(
  ing: Pick<StoreIngredient, 'brandIds'>,
  allBrandIds: string[],
): string[] {
  const assigned = normalizeBrandIds(ing.brandIds);
  if (assigned.length > 0) return assigned;
  return [...allBrandIds];
}

/** Ingredientes visibles en la pestaña de una línea comercial del panel TPV. */
export function filterStoreIngredientsByBrand(
  items: StoreIngredient[],
  brandId: string,
  allBrandIds: string[],
): StoreIngredient[] {
  if (!brandId || allBrandIds.length <= 1) return items;
  return items.filter((ing) => normalizeBrandIds(ing.brandIds).includes(brandId));
}

export function countStoreIngredientsByBrand(
  items: StoreIngredient[],
  brandId: string,
  allBrandIds: string[],
): number {
  return filterStoreIngredientsByBrand(items, brandId, allBrandIds).length;
}

export function ensureStoreIngredientBrandIds(
  list: StoreIngredient[],
  allBrandIds: string[],
): StoreIngredient[] {
  if (allBrandIds.length === 0) return list;
  if (allBrandIds.length === 1) {
    return list.map((ing) => ({
      ...ing,
      brandIds:
        normalizeBrandIds(ing.brandIds).length > 0 ? normalizeBrandIds(ing.brandIds) : [allBrandIds[0]],
    }));
  }
  return list.map((ing) => ({
    ...ing,
    brandIds: normalizeBrandIds(ing.brandIds),
  }));
}

/**
 * Una fila por línea comercial: evita que el mismo extra (pizza/burger) se comparta entre marcas.
 */
export function explodeStoreIngredientsPerBrand(
  list: StoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>,
): StoreIngredient[] {
  if (brands.length <= 1) return list;

  const allIds = brands.map((b) => b._id);
  const brandById = new Map(brands.map((b) => [b._id, b]));
  const out: StoreIngredient[] = [];

  for (const ing of list) {
    let assigned = normalizeBrandIds(ing.brandIds);
    if (assigned.length === 0) {
      const parts = normalizeProductParts(ing.productParts);
      if (parts.length > 0) {
        for (const brand of brands) {
          const keys = resolveBrandTpvCategoryKeys(brand);
          if (keys.some((k) => parts.includes(k))) assigned.push(brand._id);
        }
      }
      if (assigned.length === 0) assigned = [...allIds];
    }
    const uniqueAssigned = [...new Set(assigned.filter((id) => allIds.includes(id)))];

    if (uniqueAssigned.length <= 1) {
      const brandId = uniqueAssigned[0];
      const brand = brandId ? brandById.get(brandId) : undefined;
      let parts = normalizeProductParts(ing.productParts);
      if (parts.length === 0 && brand) parts = resolveBrandTpvCategoryKeys(brand);
      out.push({
        ...ing,
        ...(brandId ? { brandIds: [brandId] } : {}),
        ...(parts.length > 0 ? { productParts: parts } : {}),
      });
      continue;
    }

    for (const brandId of uniqueAssigned) {
      const brand = brandById.get(brandId);
      const brandKeys = brand ? resolveBrandTpvCategoryKeys(brand) : [];
      let parts = normalizeProductParts(ing.productParts);
      if (parts.length > 0 && brandKeys.length > 0) {
        parts = parts.filter((p) => brandKeys.includes(p));
      }
      if (parts.length === 0) parts = brandKeys;
      const price = ing.extraPrices?.[brandId];
      out.push({
        ...ing,
        id: `${String(ing.id || ingredientNameKey(ing.name)).trim()}::${brandId}`,
        brandIds: [brandId],
        productParts: parts.length > 0 ? parts : (['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]),
        ...(price != null && Number.isFinite(price) ? { extraPrices: { [brandId]: price } } : {}),
      });
    }
  }

  return normalizeStoreIngredients(out);
}

export function storeIngredientsNeedPerBrandSplit(
  list: StoreIngredient[],
  allBrandIds: string[],
): boolean {
  if (allBrandIds.length <= 1) return false;
  return list.some((ing) => normalizeBrandIds(ing.brandIds).length !== 1);
}

function normalizeExtraPrices(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [brandId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(brandId || '').trim();
    const price = Number(value);
    if (!id || !Number.isFinite(price) || price < 0) continue;
    out[id] = Math.round(price * 100) / 100;
  }
  return out;
}

export function normalizeStoreIngredients(raw: unknown): StoreIngredient[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoreIngredient[] = [];
  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const rec = entry as Record<string, unknown>;
    const name = String(rec.name || '').trim();
    if (!name) return;
    const brandIds = normalizeBrandIds(rec.brandIds);
    const rowKey = String(rec.id || '').trim() || ingredientRowKey(name, brandIds);
    if (seen.has(rowKey)) return;
    seen.add(rowKey);
    const role = resolveIngredientRole({
      role: rec.role as StoreIngredientRole | undefined,
      escandalloOnly: Boolean(rec.escandalloOnly),
    });
    const tpvChargeExtra =
      typeof rec.tpvChargeExtra === 'boolean' ? rec.tpvChargeExtra : role === 'extra';
    const tpvAllowRemove =
      typeof rec.tpvAllowRemove === 'boolean'
        ? rec.tpvAllowRemove
        : role === 'base' || role === 'extra';
    const extraPrices = normalizeExtraPrices(rec.extraPrices);
    const productParts = normalizeProductParts(rec.productParts);
    const syncedRole = roleFromStoreIngredientTpvFlags(tpvChargeExtra, tpvAllowRemove);
    const baseCostRaw = Number(rec.baseCost);
    const baseCost =
      Number.isFinite(baseCostRaw) && baseCostRaw >= 0 ? Math.round(baseCostRaw * 100) / 100 : undefined;
    out.push({
      id: String(rec.id || `ing-${idx}-${ingredientNameKey(name).replace(/\s+/g, '-')}`),
      name,
      role: syncedRole,
      escandalloOnly: syncedRole === 'escandallo',
      tpvChargeExtra,
      tpvAllowRemove,
      ...(brandIds.length > 0 ? { brandIds } : {}),
      ...(productParts.length > 0 ? { productParts } : {}),
      ...(syncedRole === 'extra' && Object.keys(extraPrices).length > 0 ? { extraPrices } : {}),
      ...(baseCost !== undefined ? { baseCost } : {}),
    });
  });
  return out;
}

export function mergeStoreIngredientNames(
  existing: StoreIngredient[],
  names: string[],
  defaults?: Pick<StoreIngredient, 'role' | 'brandIds' | 'productParts'>,
): StoreIngredient[] {
  const out = [...existing];
  const seen = new Set(out.map((i) => ingredientRowKey(i.name, normalizeBrandIds(i.brandIds))));
  for (const rawName of names) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const brandIds = normalizeBrandIds(defaults?.brandIds);
    const key = ingredientRowKey(name, brandIds);
    if (seen.has(key)) continue;
    seen.add(key);
    const productParts = normalizeProductParts(defaults?.productParts);
    out.push({
      id: `ing-${Date.now()}-${seen.size}`,
      name,
      role: defaults?.role || 'escandallo',
      escandalloOnly: (defaults?.role || 'escandallo') === 'escandallo',
      ...(brandIds.length > 0 ? { brandIds } : {}),
      ...(productParts.length > 0 ? { productParts } : {}),
    });
  }
  return out;
}

function mergeStoreIngredientRows(a: StoreIngredient, b: StoreIngredient): StoreIngredient {
  const flagsA = readStoreIngredientTpvFlags(a);
  const flagsB = readStoreIngredientTpvFlags(b);
  const chargeExtra = flagsA.chargeExtra || flagsB.chargeExtra;
  const allowRemove = flagsA.allowRemove || flagsB.allowRemove;
  const parts = new Set<TpvCategoryTemplateKey>([
    ...normalizeProductParts(a.productParts),
    ...normalizeProductParts(b.productParts),
  ]);
  const brandIds = normalizeBrandIds(a.brandIds);
  const brandIdsB = normalizeBrandIds(b.brandIds);
  const mergedBrands = brandIds.length > 0 ? brandIds : brandIdsB;
  const pickName = (x: string, y: string) => {
    const xt = x.trim();
    const yt = y.trim();
    if (xt.length !== yt.length) return xt.length > yt.length ? xt : yt;
    return /[A-ZÁÉÍÓÚÑ]/.test(xt) ? xt : yt;
  };
  const pickBaseCost = () => {
    const ca = Number(a.baseCost);
    const cb = Number(b.baseCost);
    if (Number.isFinite(ca) && ca >= 0 && Number.isFinite(cb) && cb >= 0) {
      return Math.round(Math.max(ca, cb) * 100) / 100;
    }
    if (Number.isFinite(ca) && ca >= 0) return Math.round(ca * 100) / 100;
    if (Number.isFinite(cb) && cb >= 0) return Math.round(cb * 100) / 100;
    return undefined;
  };
  const mergedBaseCost = pickBaseCost();
  return withStoreIngredientTpvFlags(
    {
      id: String(a.id || b.id || '').trim() || `ing-${Date.now()}`,
      name: pickName(a.name, b.name),
      role: 'base',
      escandalloOnly: false,
      ...(mergedBrands.length > 0 ? { brandIds: mergedBrands } : {}),
      ...(parts.size > 0 ? { productParts: [...parts] } : {}),
      ...(mergedBaseCost !== undefined ? { baseCost: mergedBaseCost } : {}),
    },
    { chargeExtra, allowRemove },
  );
}

/** Fusiona duplicados (mismo nombre normalizado + mismas marcas) sin intervención manual. */
export function mergeDuplicateStoreIngredients(list: StoreIngredient[]): {
  items: StoreIngredient[];
  mergedCount: number;
} {
  const map = new Map<string, StoreIngredient>();
  let mergedCount = 0;
  for (const ing of list) {
    const brandIds = normalizeBrandIds(ing.brandIds);
    const key = ingredientRowKey(ing.name, brandIds);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...ing, brandIds: brandIds.length > 0 ? brandIds : ing.brandIds });
      continue;
    }
    mergedCount += 1;
    map.set(key, mergeStoreIngredientRows(existing, ing));
  }
  return { items: [...map.values()], mergedCount };
}

/** Productos del catálogo cuya ficha lista este ingrediente (solo lectura). */
export function catalogItemsUsingIngredient(
  catalogItems: Array<
    Pick<CatalogItem, '_id' | 'name' | 'brandIds' | 'customFields' | 'active' | 'module'>
  >,
  ingredientName: string,
  options?: { brandId?: string },
): Array<Pick<CatalogItem, '_id' | 'name'>> {
  const needle = ingredientNameKey(ingredientName);
  if (!needle) return [];
  const brandId = String(options?.brandId || '').trim();
  return catalogItems
    .filter((item) => {
      if (item.module && item.module !== 'catalog') return false;
      if (item.active === false) return false;
      if (brandId) {
        const ids = Array.isArray(item.brandIds)
          ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
          : [];
        if (ids.length > 0 && !ids.includes(brandId)) return false;
      }
      const raw = item.customFields?.ingredients;
      if (typeof raw !== 'string' || !raw.trim()) return false;
      return parseIngredientsText(raw).some((part) => ingredientNameKey(part) === needle);
    })
    .map((item) => ({ _id: item._id, name: item.name }));
}

export function storeIngredientNames(list: StoreIngredient[] | undefined): string[] {
  return (list || []).map((i) => i.name).filter(Boolean);
}

/** Ingredientes base que el cliente puede quitar en el TPV (filtrados por marca del producto). */
export function tpvBaseIngredientNames(
  list: StoreIngredient[] | undefined,
  productBrandIds: string[] = [],
  productPart: TpvCategoryTemplateKey | null = null,
): string[] {
  const collect = (ignoreBrand: boolean, ignorePart: boolean): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ing of list || []) {
      if (resolveIngredientRole(ing) !== 'base') continue;
      if (!ignoreBrand && !storeIngredientAppliesToBrands(ing, productBrandIds)) continue;
      if (!ignorePart && !storeIngredientAppliesToProductPart(ing, productPart)) continue;
      const key = ingredientNameKey(ing.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ing.name);
    }
    return out;
  };

  const strict = collect(false, false);
  if (strict.length > 0) return strict;
  const noBrand = collect(true, false);
  if (noBrand.length > 0) return noBrand;
  const noPart = collect(false, true);
  if (noPart.length > 0) return noPart;
  return collect(true, true);
}

/** Ingredientes base (objeto completo) con los mismos criterios relajados que tpvBaseIngredientNames. */
export function tpvBaseStoreIngredients(
  list: StoreIngredient[] | undefined,
  productBrandIds: string[] = [],
  productPart: TpvCategoryTemplateKey | null = null,
): StoreIngredient[] {
  const collect = (ignoreBrand: boolean, ignorePart: boolean): StoreIngredient[] => {
    const seen = new Set<string>();
    const out: StoreIngredient[] = [];
    for (const ing of list || []) {
      if (resolveIngredientRole(ing) !== 'base') continue;
      if (!ignoreBrand && !storeIngredientAppliesToBrands(ing, productBrandIds)) continue;
      if (!ignorePart && !storeIngredientAppliesToProductPart(ing, productPart)) continue;
      const key = ingredientNameKey(ing.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ing);
    }
    return out;
  };

  const strict = collect(false, false);
  if (strict.length > 0) return strict;
  const noBrand = collect(true, false);
  if (noBrand.length > 0) return noBrand;
  const noPart = collect(false, true);
  if (noPart.length > 0) return noPart;
  return collect(true, true);
}

/** @deprecated Usar tpvBaseIngredientNames */
export function tpvStoreIngredientNames(list: StoreIngredient[] | undefined): string[] {
  return tpvBaseIngredientNames(list);
}

export function legacyTemplateIngredientNames(templates?: TpvCategoryTemplates): string[] {
  const names: string[] = [];
  for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
    names.push(...parseIngredientsText(templates?.[key]?.ingredients));
  }
  return names;
}

export function resolveStoreIngredientsFromDeliveryConfig(config: {
  storeIngredients?: unknown;
  tpvCategoryTemplates?: TpvCategoryTemplates;
}): StoreIngredient[] {
  const fromStore = normalizeStoreIngredients(config.storeIngredients);
  if (fromStore.length > 0) return fromStore;
  const templates = normalizeTpvCategoryTemplates(config.tpvCategoryTemplates);
  return normalizeStoreIngredients(
    legacyTemplateIngredientNames(templates).map((name, idx) => ({
      id: `legacy-${idx}`,
      name,
      role: 'base' as const,
    })),
  );
}

/** Lista unificada: ingredientes + extras legacy de marcas en un solo sitio. */
export function unifyStoreIngredientsFromConfig(
  config: {
    storeIngredients?: unknown;
    tpvBrandSupplements?: unknown;
    tpvBrandCategorySupplements?: unknown;
    tpvCategoryTemplates?: TpvCategoryTemplates;
  },
  brandIds: string[] = [],
): StoreIngredient[] {
  const merged = mergeLegacyExtrasIntoStoreIngredients(config, brandIds);
  return ensureStoreIngredientBrandIds(merged, brandIds);
}

function mergeLegacyExtrasIntoStoreIngredients(
  config: {
    storeIngredients?: unknown;
    tpvBrandSupplements?: unknown;
    tpvBrandCategorySupplements?: unknown;
    tpvCategoryTemplates?: TpvCategoryTemplates;
  },
  brandIds: string[] = [],
): StoreIngredient[] {
  const list = resolveStoreIngredientsFromDeliveryConfig(config);
  const byKey = new Map(list.map((ing) => [ingredientRowKey(ing.name, normalizeBrandIds(ing.brandIds)), { ...ing }]));
  const { brandSupplements } = resolveTpvBrandConfigFromDeliveryConfig(config, brandIds);

  for (const brandId of brandIds) {
    for (const sup of brandSupplements[brandId] || []) {
      const key = ingredientRowKey(sup.name, [brandId]);
      const existing = byKey.get(key) || byKey.get(ingredientRowKey(sup.name, []));
      if (existing) {
        existing.role = 'extra';
        existing.escandalloOnly = false;
        existing.brandIds = [...new Set([...(existing.brandIds || []), brandId])];
        existing.extraPrices = { ...(existing.extraPrices || {}), [brandId]: sup.price };
        byKey.set(ingredientRowKey(existing.name, normalizeBrandIds(existing.brandIds)), existing);
        continue;
      }
      const row: StoreIngredient = {
        id: sup.id || `extra-${ingredientNameKey(sup.name).replace(/\s+/g, '-')}`,
        name: sup.name,
        role: 'extra',
        brandIds: [brandId],
        extraPrices: { [brandId]: sup.price },
      };
      byKey.set(key, row);
    }
  }

  const templates = normalizeTpvCategoryTemplates(config.tpvCategoryTemplates);
  for (const part of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
    for (const sup of templates[part]?.supplements || []) {
      const key = ingredientRowKey(sup.name, []);
      const existing = byKey.get(key);
      if (existing) {
        existing.role = 'extra';
        existing.escandalloOnly = false;
        const parts = new Set(normalizeProductParts(existing.productParts));
        parts.add(part);
        existing.productParts = [...parts];
        if (!existing.extraPrices || Object.keys(existing.extraPrices).length === 0) {
          existing.extraPrices = { '': sup.price };
        }
        continue;
      }
      byKey.set(key, {
        id: sup.id || `extra-${ingredientNameKey(sup.name).replace(/\s+/g, '-')}`,
        name: sup.name,
        role: 'extra',
        productParts: [part],
        extraPrices: { '': sup.price },
      });
    }
  }

  return normalizeStoreIngredients([...byKey.values()]);
}

export function normalizeTpvDefaultExtraPrice(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const cleaned =
    typeof raw === 'number'
      ? raw
      : Number(
          String(raw)
            .trim()
            .replace(/\s/g, '')
            .replace(',', '.'),
        );
  const price = Number(cleaned);
  if (!Number.isFinite(price) || price < 0) return undefined;
  return Math.round(price * 100) / 100;
}

/** Precio único de extras: config global → legacy por ingrediente. */
export function inferTpvDefaultExtraPrice(
  storeIngredients: StoreIngredient[] | undefined,
  configured?: number | null,
): number {
  const fromConfig = normalizeTpvDefaultExtraPrice(configured);
  if (fromConfig != null) return fromConfig;
  for (const ing of storeIngredients || []) {
    if (resolveIngredientRole(ing) !== 'extra') continue;
    const direct = normalizeTpvDefaultExtraPrice(ing.extraPrice);
    if (direct != null) return direct;
    const legacy = ing.extraPrices ? Object.values(ing.extraPrices).find((p) => Number.isFinite(p)) : undefined;
    if (legacy != null) return Math.round(legacy * 100) / 100;
  }
  return 0;
}

export function resolveIngredientExtraPrice(
  ing: StoreIngredient,
  brandIds: string[] = [],
  defaultExtraPrice?: number,
): number {
  const global = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
  if (global != null) return global;

  const direct = normalizeTpvDefaultExtraPrice(ing.extraPrice);
  if (direct != null) return direct;
  const searchBrands = brandIds.length > 0 ? brandIds : [''];
  for (const brandId of searchBrands) {
    const p = ing.extraPrices?.[brandId];
    if (p != null && Number.isFinite(p)) return Math.round(p * 100) / 100;
  }
  if (ing.extraPrices) {
    const first = Object.values(ing.extraPrices).find((p) => Number.isFinite(p));
    if (first != null) return Math.round(first * 100) / 100;
  }
  return 0;
}

export function parseStoreIngredientExtras(
  item: Pick<CatalogItem, 'brandIds' | 'category' | 'name'>,
  storeIngredients?: StoreIngredient[],
  defaultExtraPrice?: number,
  brands?: TpvBrandHint[],
  resolveOptions?: Pick<ParseCatalogResolveOptions, 'comboSelections' | 'catalogItems'>,
): CatalogSupplement[] {
  void brands;
  void resolveOptions;
  const brandIds = productBrandIdsFromItem(item);
  const seen = new Set<string>();

  const collect = (ignoreBrand: boolean): CatalogSupplement[] => {
    const out: CatalogSupplement[] = [];
    for (const ing of storeIngredients || []) {
      // Extras = lo que se cobra al añadir (flags TPV), no solo role legado.
      if (!ingredientChargesExtra(ing)) continue;
      if (!ignoreBrand && !storeIngredientAppliesToBrands(ing, brandIds)) continue;
      // No filtrar por pizzas/burgers: en TPV hay buscador y debe salir toda la carta de extras.
      const price = resolveIngredientExtraPrice(ing, brandIds, defaultExtraPrice);
      const splitNames = parseIngredientsBulkText(ing.name);
      const labels =
        splitNames.length > 0
          ? splitNames
          : (() => {
              const fallback = String(ing.name || '').trim();
              return fallback ? [fallback] : [];
            })();
      for (const label of labels) {
        const nameKey = ingredientNameKey(label);
        if (!nameKey || seen.has(nameKey)) continue;
        seen.add(nameKey);
        out.push({
          id:
            labels.length === 1
              ? ing.id
              : `${ing.id}::${nameKey.replace(/\s+/g, '-')}`,
          name: label,
          price,
        });
      }
    }
    return out;
  };

  const byBrand = collect(false);
  if (byBrand.length > 0) return byBrand;
  if (brandIds.length === 0) return collect(true);
  return [];
}

export function storeIngredientsById(list: StoreIngredient[] | undefined): Map<string, StoreIngredient> {
  return new Map((list || []).map((ing) => [ing.id, ing]));
}

export function resolveBrandIngredientNames(
  brandId: string,
  masterList: StoreIngredient[],
  selection: TpvBrandIngredientSelection | undefined,
): string[] {
  const ids = selection?.[brandId];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = storeIngredientsById(masterList);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const ing = byId.get(String(id || '').trim());
    if (!ing) continue;
    const key = ingredientNameKey(ing.name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(ing.name);
  }
  return names;
}

export function normalizeTpvBrandIngredientSelection(
  raw: unknown,
  masterList: StoreIngredient[] = [],
): TpvBrandIngredientSelection {
  if (!raw || typeof raw !== 'object') return {};
  const byId = storeIngredientsById(masterList);
  const out: TpvBrandIngredientSelection = {};
  for (const [brandId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(brandId || '').trim();
    if (!id) continue;
    const ids: string[] = [];
    const seen = new Set<string>();
    if (Array.isArray(value)) {
      for (const entry of value) {
        const asId = String(entry || '').trim();
        if (asId && byId.has(asId) && !seen.has(asId)) {
          seen.add(asId);
          ids.push(asId);
        }
      }
    }
    if (ids.length > 0) out[id] = ids;
  }
  return out;
}

export function normalizeTpvBrandSupplements(raw: unknown): TpvBrandSupplements {
  if (!raw || typeof raw !== 'object') return {};
  const out: TpvBrandSupplements = {};
  for (const [brandId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(brandId || '').trim();
    if (!id) continue;
    const supplements = normalizeCatalogSupplementsForSave(
      Array.isArray(value)
        ? value.map((row, idx) => {
            const r = (row || {}) as Record<string, unknown>;
            return {
              id: String(r.id || `sup-${idx}`),
              name: String(r.name || ''),
              price: r.price ?? '',
            };
          })
        : [],
    );
    if (supplements.length > 0) out[id] = supplements;
  }
  return out;
}

export function migrateLegacyBrandIngredientSelection(
  legacyCategory: TpvBrandCategoryIngredients | undefined,
  masterList: StoreIngredient[],
  brandIds: string[],
): TpvBrandIngredientSelection {
  const byName = new Map(masterList.map((ing) => [ingredientNameKey(ing.name), ing.id]));
  const out: TpvBrandIngredientSelection = {};
  for (const brandId of brandIds) {
    const entry = legacyCategory?.[brandId];
    if (!entry) continue;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
      for (const ing of entry[key]?.ingredients || []) {
        const resolved = byName.get(ingredientNameKey(ing.name)) || ing.id;
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          ids.push(resolved);
        }
      }
    }
    if (ids.length > 0) out[brandId] = ids;
  }
  return out;
}

export function migrateLegacyBrandSupplements(
  legacyCategory: TpvBrandCategorySupplements | undefined,
  legacyFlat: TpvBrandSupplements | undefined,
  brandIds: string[],
): TpvBrandSupplements {
  const fromFlat = normalizeTpvBrandSupplements(legacyFlat);
  if (Object.keys(fromFlat).length > 0) return fromFlat;

  const out: TpvBrandSupplements = {};
  for (const brandId of brandIds) {
    const entry = legacyCategory?.[brandId];
    if (!entry) continue;
    const merged: CatalogSupplement[] = [];
    const seen = new Set<string>();
    for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
      for (const sup of entry[key]?.supplements || []) {
        const k = ingredientNameKey(sup.name);
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(sup);
      }
    }
    if (merged.length > 0) out[brandId] = merged;
  }
  return out;
}

export function resolveTpvBrandConfigFromDeliveryConfig(
  config: {
    storeIngredients?: unknown;
    tpvBrandIngredients?: unknown;
    tpvBrandSupplements?: unknown;
    tpvBrandCategoryIngredients?: unknown;
    tpvBrandCategorySupplements?: unknown;
    tpvCategoryTemplates?: TpvCategoryTemplates;
  },
  brandIds: string[],
): { ingredientSelection: TpvBrandIngredientSelection; brandSupplements: TpvBrandSupplements } {
  const masterList = resolveStoreIngredientsFromDeliveryConfig(config);
  let ingredientSelection = normalizeTpvBrandIngredientSelection(config.tpvBrandIngredients, masterList);
  if (Object.keys(ingredientSelection).length === 0) {
    const legacy = normalizeTpvBrandCategoryIngredients(config.tpvBrandCategoryIngredients);
    ingredientSelection = migrateLegacyBrandIngredientSelection(legacy, masterList, brandIds);
    if (Object.keys(ingredientSelection).length === 0 && masterList.length > 0 && brandIds.length > 0) {
      for (const brandId of brandIds) {
        ingredientSelection[brandId] = masterList.map((ing) => ing.id);
      }
    }
  }

  let brandSupplements = migrateLegacyBrandSupplements(
    normalizeTpvBrandCategorySupplements(config.tpvBrandCategorySupplements),
    normalizeTpvBrandSupplements(config.tpvBrandSupplements),
    brandIds,
  );
  if (Object.keys(brandSupplements).length === 0) {
    brandSupplements = migrateLegacyBrandSupplements(
      migrateLegacySupplementsToBrands(
        normalizeTpvCategoryTemplates(config.tpvCategoryTemplates),
        brandIds,
      ),
      {},
      brandIds,
    );
  }

  return { ingredientSelection, brandSupplements };
}

function parseSupplementsArray(raw: unknown): CatalogSupplement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, idx) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      const name = String(rec.name || '').trim();
      if (!name) return null;
      const id = String(rec.id || `sup-${idx}`).trim();
      const price = Number(rec.price || 0);
      return { id, name, price: Number.isFinite(price) ? price : 0 };
    })
    .filter((s): s is CatalogSupplement => Boolean(s));
}

export type ParseCatalogResolveOptions = {
  /** TPV: prioriza ingredientes de esta pizza (Excel/ficha). */
  productIngredientsOnly?: boolean;
  /** TPV: todos los extras del negocio; ignora suplementos del producto. */
  storeExtrasOnly?: boolean;
  /** TPV: si la ficha está vacía, usar solo combo/menú/mitades (nunca la lista maestra global). */
  tpvFallbackWhenEmpty?: boolean;
  /** Catálogo completo (combos → ingredientes de productos incluidos). */
  catalogItems?: CatalogItem[];
  /** Productos elegidos al vender un menú (prioridad sobre comboItems del catálogo). */
  comboSelections?: import('./deliveryApi').CatalogComboRef[];
  /** Pizza mitad y mitad del menú (ingredientes de ambas mitades). */
  halfHalfPizza?: HalfHalfPizzaSelection;
};

/** Pizza vs burger según lo que el cliente eligió en el menú. */
export function inferTemplateKeyFromComboSelections(
  selections: import('./deliveryApi').CatalogComboRef[],
  catalog: CatalogItem[],
): TpvCategoryTemplateKey | null {
  const byId = new Map(catalog.map((c) => [c._id, c]));
  const keys = new Set<TpvCategoryTemplateKey>();
  for (const ref of selections) {
    const comp = byId.get(String(ref.productId || '').trim());
    if (!comp) continue;
    const cat = `${comp.category || ''} ${comp.name || ''}`.toLowerCase();
    if (/pizza|pizzas|calzone|bowl/i.test(cat)) keys.add('pizzas');
    else if (/burger|hamburguesa|top burger/i.test(cat)) keys.add('hamburguesas');
  }
  if (keys.size === 1) return [...keys][0];
  if (keys.has('pizzas') && !keys.has('hamburguesas')) return 'pizzas';
  if (keys.has('hamburguesas') && !keys.has('pizzas')) return 'hamburguesas';
  return null;
}

function mergeComboComponentIngredients(
  item: CatalogItem,
  catalog: CatalogItem[],
  comboSelections?: import('./deliveryApi').CatalogComboRef[],
): string[] {
  const refs =
    comboSelections && comboSelections.length > 0 ? comboSelections : item.comboItems;
  return mergeComboProductIngredients(refs, catalog);
}

/** Ingredientes unidos desde los productos incluidos en un combo. */
export function mergeComboProductIngredients(
  comboItems: CatalogItem['comboItems'] | undefined,
  catalog: CatalogItem[],
): string[] {
  const refs = comboItems;
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const byId = new Map(catalog.map((c) => [c._id, c]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of refs) {
    const comp = byId.get(String(ref.productId || '').trim());
    if (!comp) continue;
    const text =
      typeof comp.customFields?.ingredients === 'string' ? comp.customFields.ingredients : '';
    for (const name of parseIngredientsText(text)) {
      const key = ingredientNameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Ingredientes unidos desde mitades de pizza mitad y mitad. */
export function mergeHalfHalfProductIngredients(
  selection: HalfHalfPizzaSelection,
  catalog: CatalogItem[],
  context?: {
    templates?: TpvCategoryTemplates;
    storeIngredients?: StoreIngredient[];
    brandIngredientSelection?: TpvBrandIngredientSelection;
    legacyBrandIngredients?: TpvBrandCategoryIngredients;
    brands?: TpvBrandHint[];
  },
): string[] {
  const fromProductFields = mergeComboProductIngredients(
    [
      { productId: selection.firstProductId, productName: selection.firstProductName, quantity: 1 },
      { productId: selection.secondProductId, productName: selection.secondProductName, quantity: 1 },
    ],
    catalog,
  );
  if (fromProductFields.length > 0) return fromProductFields;
  if (!context) return [];

  const byId = new Map(catalog.map((c) => [c._id, c]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const productId of [selection.firstProductId, selection.secondProductId]) {
    const comp = byId.get(String(productId || '').trim());
    if (!comp) continue;
    const ing = parseCatalogIngredients(
      comp,
      context.templates,
      context.storeIngredients,
      context.brandIngredientSelection,
      context.legacyBrandIngredients,
      context.brands,
      { catalogItems: catalog },
    );
    for (const name of ing) {
      const key = ingredientNameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export function parseCatalogIngredients(
  item: CatalogItem,
  templates?: TpvCategoryTemplates,
  storeIngredients?: StoreIngredient[],
  brandIngredientSelection?: TpvBrandIngredientSelection,
  legacyBrandIngredients?: TpvBrandCategoryIngredients,
  brands?: TpvBrandHint[],
  options?: ParseCatalogResolveOptions,
): string[] {
  const templateKey = resolveTpvCategoryTemplateKey(item, brands, options);
  const brandIds = productBrandIdsFromItem(item);

  const fromProduct = parseIngredientsText(
    typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '',
  );
  if (fromProduct.length > 0) return fromProduct;

  if (options?.productIngredientsOnly) {
    if (options.tpvFallbackWhenEmpty) {
      const catalog = options.catalogItems;
      if (catalog?.length) {
        if (options.halfHalfPizza) {
          const fromHalf = mergeHalfHalfProductIngredients(options.halfHalfPizza, catalog, {
            templates,
            storeIngredients,
            brandIngredientSelection,
            legacyBrandIngredients,
            brands,
          });
          if (fromHalf.length > 0) return fromHalf;
        }
        const fromCombo = mergeComboComponentIngredients(item, catalog, options.comboSelections);
        if (fromCombo.length > 0) return fromCombo;
      }
    }
    if (!options.halfHalfPizza) return [];
  }

  if (templateKey && legacyBrandIngredients) {
    for (const brandId of brandIds) {
      const fromLegacy = storeIngredientNames(legacyBrandIngredients[brandId]?.[templateKey]?.ingredients);
      if (fromLegacy.length > 0) return fromLegacy;
    }
  }

  if (templateKey && storeIngredients && storeIngredients.length > 0) {
    const fromMaster = tpvBaseIngredientNames(storeIngredients, brandIds, templateKey);
    if (fromMaster.length > 0) return fromMaster;
  }

  if (templateKey && brandIngredientSelection && storeIngredients) {
    for (const brandId of brandIds) {
      const fromBrand = resolveBrandIngredientNames(brandId, storeIngredients, brandIngredientSelection);
      if (fromBrand.length > 0) return fromBrand;
    }
  }

  if (templateKey && templates?.[templateKey]) {
    return parseIngredientsText(templates[templateKey]?.ingredients);
  }
  return [];
}

export function parseCatalogSupplements(
  item: CatalogItem,
  templates?: TpvCategoryTemplates,
  brandSupplements?: TpvBrandSupplements,
  legacyBrandSupplements?: TpvBrandCategorySupplements,
  storeIngredients?: StoreIngredient[],
  defaultExtraPrice?: number,
  brands?: TpvBrandHint[],
  options?: ParseCatalogResolveOptions,
): CatalogSupplement[] {
  if (!options?.storeExtrasOnly) {
    const fromProduct = parseSupplementsArray(item.customFields?.supplements);
    if (fromProduct.length > 0) return fromProduct;
  }

  const fromStore = parseStoreIngredientExtras(
    item,
    storeIngredients,
    defaultExtraPrice,
    brands,
    options,
  );
  if (fromStore.length > 0) return fromStore;

  const key = resolveTpvCategoryTemplateKey(item, brands, options);
  if (!key) return [];

  const brandIds = Array.isArray(item.brandIds)
    ? item.brandIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  for (const brandId of brandIds) {
    const fromBrand = parseSupplementsArray(brandSupplements?.[brandId]);
    if (fromBrand.length > 0) return fromBrand;
  }

  for (const brandId of brandIds) {
    const fromLegacy = parseSupplementsArray(legacyBrandSupplements?.[brandId]?.[key]?.supplements);
    if (fromLegacy.length > 0) return fromLegacy;
  }

  if (templates?.[key]) {
    const fromTemplate = parseSupplementsArray(templates[key]?.supplements);
    if (fromTemplate.length > 0) {
      const fallbackPrice = normalizeTpvDefaultExtraPrice(defaultExtraPrice) ?? 0;
      return fromTemplate.map((sup) => ({
        ...sup,
        price: sup.price > 0 ? sup.price : fallbackPrice,
      }));
    }
  }
  return [];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cartLineUnitPrice(baseUnitPrice: number, customization: CartLineCustomization): number {
  const lineExtras = customization.addedSupplements.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const comboExtras = (customization.comboSelections ?? []).reduce((sum, ref) => {
    const unitExtras = (ref.addedSupplements ?? []).reduce((s, x) => s + Number(x.price || 0), 0);
    return sum + unitExtras * Math.max(1, Number(ref.quantity) || 1);
  }, 0);
  return round2(Number(baseUnitPrice || 0) + lineExtras + comboExtras);
}

export function cartLineTotal(
  baseUnitPrice: number,
  quantity: number,
  customization: CartLineCustomization,
): number {
  return round2(cartLineUnitPrice(baseUnitPrice, customization) * quantity);
}

export function customizationSignature(customization: CartLineCustomization): string {
  const removed = [...customization.removedIngredients].sort().join('|');
  const added = customization.addedSupplements
    .map((s) => s.id)
    .sort()
    .join('|');
  const combo = (customization.comboSelections ?? [])
    .map((c) => {
      const rem = [...(c.removedIngredients ?? [])].sort().join(',');
      const add = [...(c.addedSupplements ?? [])].map((s) => s.id).sort().join(',');
      const notes = String(c.notes || '').trim();
      return `${c.instanceId || c.productId}:${c.quantity}:${rem}:${add}:${notes}`;
    })
    .sort()
    .join('|');
  const half = customization.halfHalfPizza
    ? `${customization.halfHalfPizza.firstProductId}|${customization.halfHalfPizza.secondProductId}`
    : '';
  const addedBase = [...(customization.addedBaseIngredients || [])].sort().join('|');
  return `${removed}::${added}::${combo}::${half}::${addedBase}::${customization.notes.trim()}`;
}

export function buildOrderExtras(customization: CartLineCustomization): string[] {
  const out: string[] = [];
  if (customization.halfHalfPizza) {
    const hh = customization.halfHalfPizza;
    out.push(`½ ${hh.firstProductName}`);
    out.push(`½ ${hh.secondProductName}`);
  }
  for (const ref of customization.comboSelections ?? []) {
    const label = String(ref.productName || '').trim();
    if (!label) continue;
    out.push(`▸ ${label}${ref.quantity > 1 ? ` ×${ref.quantity}` : ''}`);
    for (const s of ref.addedSupplements ?? []) {
      const name = String(s.name || '').trim();
      if (name) out.push(`+ ${name}`);
    }
    for (const ing of ref.removedIngredients ?? []) {
      const name = String(ing || '').trim();
      if (name) out.push(`SIN ${name}`);
    }
    const notes = String(ref.notes || '').trim();
    if (notes) out.push(`· ${notes}`);
  }
  for (const ing of customization.addedBaseIngredients ?? []) {
    out.push(`+ ${ing}`);
  }
  for (const s of customization.addedSupplements) {
    out.push(`+ ${s.name}`);
  }
  for (const ing of customization.removedIngredients) {
    out.push(`SIN ${ing}`);
  }
  return out;
}

export function buildOrderIngredients(
  item: CatalogItem,
  customization: CartLineCustomization,
  templates?: TpvCategoryTemplates,
  storeIngredients?: StoreIngredient[],
  brandIngredientSelection?: TpvBrandIngredientSelection,
  brands?: TpvBrandHint[],
  catalogItems?: CatalogItem[],
): { name: string; quantity: string }[] {
  if (isTpvBuildYourOwnCatalogItem(item)) {
    return (customization.addedBaseIngredients ?? []).map((name) => ({
      name,
      quantity: 'normal',
    }));
  }
  return parseCatalogIngredients(
    item,
    templates,
    storeIngredients,
    brandIngredientSelection,
    undefined,
    brands,
    {
      productIngredientsOnly: true,
      tpvFallbackWhenEmpty: true,
      catalogItems,
      comboSelections: customization.comboSelections,
      halfHalfPizza: customization.halfHalfPizza,
    },
  ).map((name) => ({
    name,
    quantity: customization.removedIngredients.includes(name) ? 'sin' : 'normal',
  }));
}

export function emptyTpvCategoryTemplates(): TpvCategoryTemplates {
  return {
    pizzas: { ingredients: '', supplements: [] },
    hamburguesas: { ingredients: '', supplements: [] },
  };
}

export function normalizeTpvCategoryTemplates(raw: unknown): TpvCategoryTemplates {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: TpvCategoryTemplates = {};
  for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
    const entry = src[key];
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    out[key] = {
      ingredients: String(rec.ingredients || '').trim(),
      supplements: normalizeCatalogSupplementsForSave(
        Array.isArray(rec.supplements)
          ? rec.supplements.map((row, idx) => {
              const r = row as Record<string, unknown>;
              return {
                id: String(r.id || `sup-${idx}`),
                name: String(r.name || ''),
                price: r.price ?? '',
              };
            })
          : [],
      ),
    };
  }
  return out;
}

export function normalizeTpvBrandCategorySupplements(raw: unknown): TpvBrandCategorySupplements {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: TpvBrandCategorySupplements = {};
  for (const [brandId, entry] of Object.entries(src)) {
    const id = String(brandId || '').trim();
    if (!id || !entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const brandEntry: Partial<Record<TpvCategoryTemplateKey, { supplements: CatalogSupplement[] }>> = {};
    for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
      const cat = rec[key];
      if (!cat || typeof cat !== 'object') continue;
      const catRec = cat as Record<string, unknown>;
      brandEntry[key] = {
        supplements: normalizeCatalogSupplementsForSave(
          Array.isArray(catRec.supplements)
            ? catRec.supplements.map((row, idx) => {
                const r = row as Record<string, unknown>;
                return {
                  id: String(r.id || `sup-${idx}`),
                  name: String(r.name || ''),
                  price: r.price ?? '',
                };
              })
            : [],
        ),
      };
    }
    if (Object.keys(brandEntry).length > 0) out[id] = brandEntry;
  }
  return out;
}

export function normalizeTpvBrandCategoryIngredients(raw: unknown): TpvBrandCategoryIngredients {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: TpvBrandCategoryIngredients = {};
  for (const [brandId, entry] of Object.entries(src)) {
    const id = String(brandId || '').trim();
    if (!id || !entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const brandEntry: Partial<Record<TpvCategoryTemplateKey, { ingredients: StoreIngredient[] }>> = {};
    for (const key of ['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]) {
      const cat = rec[key];
      if (!cat || typeof cat !== 'object') continue;
      const catRec = cat as Record<string, unknown>;
      const ingredients = normalizeStoreIngredients(catRec.ingredients);
      if (ingredients.length > 0) brandEntry[key] = { ingredients };
    }
    if (Object.keys(brandEntry).length > 0) out[id] = brandEntry;
  }
  return out;
}

export function migrateLegacyStoreIngredientsToBrands(
  storeIngredients: StoreIngredient[],
  brands: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>,
): TpvBrandCategoryIngredients {
  if (storeIngredients.length === 0 || brands.length === 0) return {};
  const out: TpvBrandCategoryIngredients = {};
  for (const brand of brands) {
    const keys = resolveBrandTpvCategoryKeys(brand);
    if (keys.length === 0) continue;
    const entry: Partial<Record<TpvCategoryTemplateKey, { ingredients: StoreIngredient[] }>> = {};
    for (const key of keys) {
      entry[key] = { ingredients: [...storeIngredients] };
    }
    out[brand._id] = entry;
  }
  return out;
}

export function migrateLegacySupplementsToBrands(
  legacy: TpvCategoryTemplates,
  brandIds: string[],
): TpvBrandCategorySupplements {
  const hasLegacy =
    (legacy.pizzas?.supplements?.length || 0) > 0 || (legacy.hamburguesas?.supplements?.length || 0) > 0;
  if (!hasLegacy || brandIds.length === 0) return {};
  const targetId = brandIds[0];
  return {
    [targetId]: {
      pizzas: { supplements: legacy.pizzas?.supplements || [] },
      hamburguesas: { supplements: legacy.hamburguesas?.supplements || [] },
    },
  };
}

export function normalizeCatalogSupplementsForSave(
  rows: Array<{ id?: string; name: string; price: string | number }>,
): CatalogSupplement[] {
  return rows
    .map((row, idx) => {
      const name = String(row.name || '').trim();
      if (!name) return null;
      const price = Number(row.price || 0);
      return {
        id: String(row.id || `sup-${Date.now()}-${idx}`),
        name,
        price: Number.isFinite(price) ? round2(price) : 0,
      };
    })
    .filter((s): s is CatalogSupplement => Boolean(s));
}
