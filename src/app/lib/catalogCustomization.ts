import type { CatalogItem } from './deliveryApi';

export interface CatalogSupplement {
  id: string;
  name: string;
  price: number;
}

export interface CartLineCustomization {
  removedIngredients: string[];
  addedSupplements: CatalogSupplement[];
  notes: string;
}

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
}

const CUSTOMIZABLE_KEYS = ['pizza', 'pizzas', 'hamburguesa', 'hamburguesas', 'burger', 'burgers'];

type TpvBrandHint = { _id: string; deliveryLineKind?: string; catalogCategories?: string[] };

function productBrandIdsFromItem(item: Pick<CatalogItem, 'brandIds'>): string[] {
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
): TpvCategoryTemplateKey | null {
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (/hamburguesa|burger/.test(cat) || /hamburguesa|burger/.test(name)) return 'hamburguesas';
  if (/pizza/.test(cat) || /pizza/.test(name)) return 'pizzas';
  if (/bebida|postre|complemento|entrante|ensalada|bebidas|postres/.test(cat)) return null;
  if (/combo/.test(cat)) {
    const fromBrand = resolveTpvCategoryFromBrands(productBrandIdsFromItem(item), brands);
    if (fromBrand) return fromBrand;
  }
  return resolveTpvCategoryFromBrands(productBrandIdsFromItem(item), brands);
}

/** Producto/combo configurable en TPV (quitar ingredientes, extras globales). */
export function isCustomizableCatalogItem(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds'>,
  brands?: TpvBrandHint[],
): boolean {
  return resolveTpvCategoryTemplateKey(item, brands) !== null;
}

/** Catálogo: sección TPV editable (pizzas, burgers, combos…). */
export function isCatalogTpvConfigurable(
  item: Pick<CatalogItem, 'category' | 'name' | 'brandIds' | 'itemType'>,
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
  return [...keys];
}

export function brandsForTpvCategoryKey<T extends { _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>(
  brands: T[],
  key: TpvCategoryTemplateKey,
): T[] {
  return brands.filter((brand) => resolveBrandTpvCategoryKeys(brand).includes(key));
}

function parseIngredientsText(raw: string | undefined | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseIngredientsBulkText(raw: string): string[] {
  return parseIngredientsText(raw);
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

export function ingredientChargesExtra(ing: Pick<StoreIngredient, 'role' | 'escandalloOnly'>): boolean {
  return resolveIngredientRole(ing) === 'extra';
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

export function ensureStoreIngredientBrandIds(
  list: StoreIngredient[],
  allBrandIds: string[],
): StoreIngredient[] {
  if (allBrandIds.length === 0) return list;
  return list.map((ing) => ({
    ...ing,
    brandIds: normalizeBrandIds(ing.brandIds).length > 0 ? normalizeBrandIds(ing.brandIds) : [...allBrandIds],
  }));
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
    const extraPrices = normalizeExtraPrices(rec.extraPrices);
    const productParts = normalizeProductParts(rec.productParts);
    out.push({
      id: String(rec.id || `ing-${idx}-${ingredientNameKey(name).replace(/\s+/g, '-')}`),
      name,
      role,
      escandalloOnly: role === 'escandallo',
      ...(brandIds.length > 0 ? { brandIds } : {}),
      ...(productParts.length > 0 ? { productParts } : {}),
      ...(role === 'extra' && Object.keys(extraPrices).length > 0 ? { extraPrices } : {}),
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

  return normalizeStoreIngredients([...byKey.values()]);
}

export function normalizeTpvDefaultExtraPrice(raw: unknown): number | undefined {
  const price = Number(raw);
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
): CatalogSupplement[] {
  const brandIds = productBrandIdsFromItem(item);
  const productPart = resolveTpvCategoryTemplateKey(item, brands);
  const seen = new Set<string>();

  const collect = (ignoreBrand: boolean, ignorePart: boolean): CatalogSupplement[] => {
    const out: CatalogSupplement[] = [];
    for (const ing of storeIngredients || []) {
      if (resolveIngredientRole(ing) !== 'extra') continue;
      if (!ignoreBrand && !storeIngredientAppliesToBrands(ing, brandIds)) continue;
      if (!ignorePart && !storeIngredientAppliesToProductPart(ing, productPart)) continue;
      const nameKey = ingredientNameKey(ing.name);
      if (seen.has(nameKey)) continue;
      if (!ing.name) continue;
      seen.add(nameKey);
      out.push({
        id: ing.id,
        name: ing.name,
        price: resolveIngredientExtraPrice(ing, brandIds, defaultExtraPrice),
      });
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
  /** TPV: si la ficha está vacía, usar combo + ingredientes base del negocio + plantilla. */
  tpvFallbackWhenEmpty?: boolean;
  /** Catálogo completo (combos → ingredientes de productos incluidos). */
  catalogItems?: CatalogItem[];
};

function mergeComboComponentIngredients(item: CatalogItem, catalog: CatalogItem[]): string[] {
  return mergeComboProductIngredients(item.comboItems, catalog);
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

export function parseCatalogIngredients(
  item: CatalogItem,
  templates?: TpvCategoryTemplates,
  storeIngredients?: StoreIngredient[],
  brandIngredientSelection?: TpvBrandIngredientSelection,
  legacyBrandIngredients?: TpvBrandCategoryIngredients,
  brands?: TpvBrandHint[],
  options?: ParseCatalogResolveOptions,
): string[] {
  const templateKey = resolveTpvCategoryTemplateKey(item, brands);
  const brandIds = productBrandIdsFromItem(item);

  const fromProduct = parseIngredientsText(
    typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '',
  );
  if (fromProduct.length > 0) return fromProduct;

  if (options?.productIngredientsOnly) {
    if (options.tpvFallbackWhenEmpty) {
      const catalog = options.catalogItems;
      if (catalog?.length) {
        const fromCombo = mergeComboComponentIngredients(item, catalog);
        if (fromCombo.length > 0) return fromCombo;
      }
      if (templateKey && storeIngredients && storeIngredients.length > 0) {
        const fromMaster = tpvBaseIngredientNames(storeIngredients, brandIds, templateKey);
        if (fromMaster.length > 0) return fromMaster;
      }
      if (templateKey && templates?.[templateKey]) {
        const fromTemplate = parseIngredientsText(templates[templateKey]?.ingredients);
        if (fromTemplate.length > 0) return fromTemplate;
      }
    }
    return [];
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

  const fromStore = parseStoreIngredientExtras(item, storeIngredients, defaultExtraPrice, brands);
  if (fromStore.length > 0) return fromStore;

  const key = resolveTpvCategoryTemplateKey(item, brands);
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
    return parseSupplementsArray(templates[key]?.supplements);
  }
  return [];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cartLineUnitPrice(baseUnitPrice: number, customization: CartLineCustomization): number {
  const extras = customization.addedSupplements.reduce((sum, s) => sum + Number(s.price || 0), 0);
  return round2(Number(baseUnitPrice || 0) + extras);
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
  return `${removed}::${added}::${customization.notes.trim()}`;
}

export function buildOrderExtras(customization: CartLineCustomization): string[] {
  const out: string[] = [];
  for (const s of customization.addedSupplements) {
    out.push(`+ ${s.name}`);
  }
  for (const ing of customization.removedIngredients) {
    out.push(`- sin ${ing}`);
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
): { name: string; quantity: string }[] {
  return parseCatalogIngredients(
    item,
    templates,
    storeIngredients,
    brandIngredientSelection,
    undefined,
    brands,
    { productIngredientsOnly: true },
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
