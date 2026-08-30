/**
 * Facturación entre marcas — config por empresa (sin hardcode Modomio/BB).
 *
 * Excel de cierre: 1 hoja por «cubo» (sheet). Dinero se reparte por unidades
 * de las columnas de ese cubo vs el total de unidades de todos los cubos.
 * Pedidos cruzados: lo compartido (bebidas…) según sharedSplitMode
 * (majority = dominante; equal = a medias 1/N).
 */
import type { Brand } from './brandApi';
import {
  brandIdAliases,
  buildBrandLabelsMap,
  displayBrandName,
  looksLikeBrandTechnicalId,
} from './brandLabels';
import { isBrandActive, isDefaultBrandNamePlaceholder, isDefaultCommercialBrand } from './brandUtils';
import {
  DEFAULT_ES_TAX_POLICY,
  normalizeEsTaxPolicy,
} from './spainVat';

export type BrandBillingTaxPolicy = ReturnType<typeof normalizeEsTaxPolicy>;

export { DEFAULT_ES_TAX_POLICY };

export type FoodUnitKey = 'pizza' | 'burger' | 'taco';

export type BrandBillingUnitColumn = {
  key: FoodUnitKey;
  /** Cabecera Excel, p. ej. TOTAL PIZZA */
  header: string;
};

export type BrandBillingSheet = {
  id: string;
  /** Nombre de la hoja Excel */
  label: string;
  brandIds: string[];
  unitColumns: BrandBillingUnitColumn[];
};

export type BrandBillingSharedSplitMode = 'majority' | 'by_units' | 'equal';

/**
 * Pedido (o líneas) sin ninguna marca: cerveza suelta, solo bebidas, etc.
 * - shift_majority: todo a la marca que más ha facturado en el turno
 * - equal: a medias entre las marcas del turno / hojas
 * - fixed_brand: siempre a orphanFixedBrandId
 * Nunca se deja «Sin marca»: `unassigned` legacy se normaliza a shift_majority.
 */
export type BrandBillingOrphanMode = 'shift_majority' | 'equal' | 'fixed_brand';

export type BrandBillingConfig = {
  _id: string;
  _rev?: string;
  type: 'brand_billing_config';
  business_id: string;
  sheets: BrandBillingSheet[];
  /**
   * Pedido cruzado (2+ marcas): cómo asignar lo sin marca (bebidas/postres…).
   * - majority: entero a la marca con más uds (empate → más €)
   * - equal: a medias (1/N) entre las marcas del ticket
   * - by_units: legacy → equal
   */
  sharedSplitMode: BrandBillingSharedSplitMode;
  /** Pedido de 1 sola marca: bebidas/postres sin marca van enteros a esa marca. */
  monoBrandTakesAll: boolean;
  /** Pedido/líneas sin ninguna marca (suelto). */
  orphanMode: BrandBillingOrphanMode;
  /** Si orphanMode = fixed_brand: id de marca destino. */
  orphanFixedBrandId: string;
  /** IVA España — opt-in (enabled:false por defecto). El % por producto va en el catálogo. */
  taxPolicy: BrandBillingTaxPolicy;
  updatedAt: string;
  createdAt?: string;
};

/** Options para el motor de atribución (desde la config guardada). */
export type BrandBillingSplitRules = {
  sharedSplitMode: BrandBillingSharedSplitMode;
  monoBrandTakesAll: boolean;
  orphanMode: BrandBillingOrphanMode;
  orphanFixedBrandId: string;
};

export const SHARED_SPLIT_MODE_OPTIONS: Array<{
  value: 'majority' | 'equal';
  label: string;
  shortLabel: string;
  hint: string;
  example: string;
}> = [
  {
    value: 'majority',
    label: 'Todo a la que más vende en el ticket',
    shortLabel: 'Marca dominante',
    hint: 'La bebida o postre sin marca se apunta entero a la marca con más unidades (si empatan, a la de más €).',
    example: '2 de marca A + 1 de marca B + bebida 2,50 € → los 2,50 € van a marca A',
  },
  {
    value: 'equal',
    label: 'Repartir a medias entre las marcas',
    shortLabel: 'A medias',
    hint: 'La bebida o postre se parte a partes iguales entre las marcas que hay en ese pedido.',
    example: '1 de marca A + 1 de marca B + bebida 2,50 € → 1,25 € a A y 1,25 € a B',
  },
];

export function normalizeBillingSharedSplitMode(
  raw: string | null | undefined,
): 'majority' | 'equal' {
  const mode = String(raw || 'majority').trim();
  if (mode === 'equal' || mode === 'by_units') return 'equal';
  return 'majority';
}

export const ORPHAN_MODE_OPTIONS: Array<{
  value: BrandBillingOrphanMode;
  label: string;
  shortLabel: string;
  hint: string;
  example: string;
}> = [
  {
    value: 'shift_majority',
    label: 'A la marca que más lleva el turno',
    shortLabel: 'Dominante del turno',
    hint: 'Una cerveza sola, o solo bebidas sin marca, se apunta a la marca que más ha facturado en ese turno.',
    example: 'Turno: Modomio 200 € · Black Burger 80 € · cerveza suelta 3 € → los 3 € a Modomio',
  },
  {
    value: 'equal',
    label: 'A medias entre las marcas del turno',
    shortLabel: 'A medias',
    hint: 'Lo suelto se parte a partes iguales entre las marcas que ya tienen ventas en el turno.',
    example: '2 marcas en el turno + cerveza 4 € → 2 € a cada una',
  },
  {
    value: 'fixed_brand',
    label: 'Siempre a una marca fija',
    shortLabel: 'Marca fija',
    hint: 'Elige abajo a qué marca va todo lo suelto sin marca (recomendado si casi todo es de una).',
    example: 'Cerveza suelta 3 € → siempre a la marca que elijas',
  },
];

export function normalizeBillingOrphanMode(
  raw: string | null | undefined,
): BrandBillingOrphanMode {
  const mode = String(raw || 'shift_majority').trim();
  // Legacy «unassigned» / basura → dominante (nunca dejar Sin marca en cierre).
  if (mode === 'equal' || mode === 'fixed_brand') return mode;
  return 'shift_majority';
}

export const FOOD_UNIT_OPTIONS: Array<{ key: FoodUnitKey; defaultHeader: string; label: string }> = [
  { key: 'pizza', defaultHeader: 'TOTAL PIZZA', label: 'Pizzas' },
  { key: 'burger', defaultHeader: 'TOTAL BURGUER', label: 'Burgers' },
  { key: 'taco', defaultHeader: 'TOTAL TACOS', label: 'Tacos' },
];

export function brandBillingDocId(businessId: string): string {
  return `brand-billing-${String(businessId || '').trim()}`;
}

export function emptyBrandBillingConfig(businessId: string): BrandBillingConfig {
  const now = new Date().toISOString();
  return {
    _id: brandBillingDocId(businessId),
    type: 'brand_billing_config',
    business_id: String(businessId || '').trim(),
    sheets: [],
    sharedSplitMode: 'majority',
    monoBrandTakesAll: true,
    orphanMode: 'shift_majority',
    orphanFixedBrandId: '',
    taxPolicy: { ...DEFAULT_ES_TAX_POLICY },
    createdAt: now,
    updatedAt: now,
  };
}

/** Política fiscal de la empresa (desde Facturación de marcas). */
export function taxPolicyFromBillingConfig(
  config: Pick<BrandBillingConfig, 'taxPolicy'> | null | undefined,
): BrandBillingTaxPolicy {
  return normalizeEsTaxPolicy(config?.taxPolicy);
}

/** Reglas de cruce listas para el motor (sin hardcode de marcas). */
export function splitRulesFromBillingConfig(
  config: Pick<
    BrandBillingConfig,
    'sharedSplitMode' | 'monoBrandTakesAll' | 'orphanMode' | 'orphanFixedBrandId'
  > | null | undefined,
): BrandBillingSplitRules {
  return {
    sharedSplitMode: normalizeBillingSharedSplitMode(config?.sharedSplitMode),
    monoBrandTakesAll: config?.monoBrandTakesAll !== false,
    orphanMode: normalizeBillingOrphanMode(config?.orphanMode),
    orphanFixedBrandId: String(config?.orphanFixedBrandId || '').trim(),
  };
}

/**
 * Marcas que cuentan para Facturación.
 * Incluye la principal aunque siga marcada isDefault (p. ej. «General» renombrada a Modomio).
 * Solo se excluyen inactivas. Sin duplicar el mismo id/alias.
 */
export function brandsForBilling(brands: Brand[]): Brand[] {
  const seen = new Set<string>();
  const out: Brand[] = [];
  for (const b of brands || []) {
    if (!b || !isBrandActive(b)) continue;
    const keys = brandIdKeys(b);
    if (keys.length === 0) continue;
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(b);
  }
  return out;
}

/** @deprecated Usar brandsForBilling — la principal renombrada también factura. */
export function commercialBrandsForBilling(brands: Brand[]): Brand[] {
  return brandsForBilling(brands);
}

/** Cascarón «General» sin configurar: no genera hoja sola. */
function isUnsetDefaultShell(brand: Brand): boolean {
  return isDefaultCommercialBrand(brand) && isDefaultBrandNamePlaceholder(brand.name);
}

export function unitColumnsForDeliveryLineKind(kind?: string | null): BrandBillingUnitColumn[] {
  const k = String(kind || '').trim();
  if (k === 'pizza') return [{ key: 'pizza', header: 'TOTAL PIZZA' }];
  if (k === 'burger_fastfood') return [{ key: 'burger', header: 'TOTAL BURGUER' }];
  if (k === 'tacos_mexican') return [{ key: 'taco', header: 'TOTAL TACOS' }];
  return [];
}

function foldBillingText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Tipo de unidades Excel ligado a la marca creada:
 * 1) deliveryLineKind al crear/editar marca
 * 2) categorías de carta (Pizzas, Burgers, Tacos…)
 * 3) nombre de la marca
 */
export function resolveBrandFoodUnitKey(
  brand: Pick<Brand, 'name' | 'deliveryLineKind' | 'catalogCategories'> | null | undefined,
): FoodUnitKey | null {
  if (!brand) return null;
  const fromKind = unitColumnsForDeliveryLineKind(brand.deliveryLineKind);
  if (fromKind[0]?.key) return fromKind[0].key;

  const cats = (Array.isArray(brand.catalogCategories) ? brand.catalogCategories : [])
    .map((c) => foldBillingText(c))
    .join(' ');
  if (/\bpizzas?\b/.test(cats)) return 'pizza';
  if (/\bburgers?\b|\bhamburg/.test(cats)) return 'burger';
  if (/\btacos?\b|\bmexican|\bburrito|\bquesadilla/.test(cats)) return 'taco';

  const name = foldBillingText(brand.name);
  if (/\bpizza|\bmodomio|\bpizzer/.test(name)) return 'pizza';
  if (/\bburger|\bhamburg|\bfast\s*food/.test(name)) return 'burger';
  if (/\btaco|\bmexic/.test(name)) return 'taco';
  return null;
}

export function unitColumnsForBrand(
  brand: Pick<Brand, 'name' | 'deliveryLineKind' | 'catalogCategories'> | null | undefined,
): BrandBillingUnitColumn[] {
  const key = resolveBrandFoodUnitKey(brand);
  if (!key) return [];
  const opt = FOOD_UNIT_OPTIONS.find((o) => o.key === key);
  return [{ key, header: opt?.defaultHeader || `TOTAL ${key.toUpperCase()}` }];
}

function brandIdKeys(brand: Pick<Brand, '_id' | 'id'> | null | undefined): string[] {
  const out = new Set<string>();
  for (const raw of [brand?._id, brand?.id]) {
    for (const key of brandIdAliases(String(raw || ''))) {
      if (key) out.add(key);
    }
  }
  return [...out];
}

function brandsByIdMap(brands: Brand[]): Map<string, Brand> {
  const byId = new Map<string, Brand>();
  for (const brand of brands) {
    for (const key of brandIdKeys(brand)) byId.set(key, brand);
  }
  return byId;
}

function sheetHasUnit(sheet: BrandBillingSheet, key: FoodUnitKey): boolean {
  return (sheet.unitColumns || []).some((c) => c.key === key);
}

const BILLING_UNIT_ORDER: FoodUnitKey[] = ['pizza', 'burger', 'taco'];

function sheetDedicatedToUnit(sheet: BrandBillingSheet, key: FoodUnitKey): boolean {
  const cols = (sheet.unitColumns || []).map((c) => c.key);
  return cols.length === 1 && cols[0] === key;
}

function findDedicatedSheet(
  sheets: BrandBillingSheet[],
  key: FoodUnitKey,
): BrandBillingSheet | undefined {
  return sheets.find((s) => sheetDedicatedToUnit(s, key));
}

function unitTypesInBusiness(brands: Brand[]): Set<FoodUnitKey> {
  const out = new Set<FoodUnitKey>();
  for (const b of brandsForBilling(brands).filter((x) => !isUnsetDefaultShell(x))) {
    const u = resolveBrandFoodUnitKey(b);
    if (u) out.add(u);
  }
  return out;
}

function brandIdMatchSet(brandId: string, brands: Brand[]): Set<string> {
  const raw = String(brandId || '').trim();
  if (!raw) return new Set();
  const brand = brandsByIdMap(brands).get(raw);
  if (brand) return new Set(brandIdKeys(brand));
  return new Set(brandIdAliases(raw));
}

function canonicalBrandId(brandId: string, brands: Brand[]): string {
  const raw = String(brandId || '').trim();
  if (!raw) return '';
  const brand = brandsByIdMap(brands).get(raw);
  if (brand) return String(brand._id || brand.id || '').trim() || raw;
  return raw;
}

function sheetContainsBrand(
  sheet: Pick<BrandBillingSheet, 'brandIds'>,
  brandId: string,
  brands: Brand[],
): boolean {
  const aliases = brandIdMatchSet(brandId, brands);
  return (sheet.brandIds || []).some((id) => aliases.has(String(id || '').trim()));
}

function stripBrandFromIds(brandIds: string[], brandId: string, brands: Brand[]): string[] {
  const aliases = brandIdMatchSet(brandId, brands);
  return (brandIds || []).filter((id) => !aliases.has(String(id || '').trim()));
}

function defaultSheetForUnit(
  key: FoodUnitKey,
  brands: Brand[],
  options?: { assignAnchor?: boolean },
): BrandBillingSheet {
  const assignAnchor = options?.assignAnchor !== false;
  const eligible = brandsForBilling(brands).filter((b) => !isUnsetDefaultShell(b));
  const anchor = eligible.find((b) => resolveBrandFoodUnitKey(b) === key);
  const opt = FOOD_UNIT_OPTIONS.find((o) => o.key === key);
  const anchorId = assignAnchor && anchor ? String(anchor._id || anchor.id || '').trim() : '';
  return {
    id: `sheet-${key}`,
    label: anchor ? sanitizeSheetLabel(anchor.name) : sanitizeSheetLabel(opt?.label || key),
    brandIds: anchorId ? [anchorId] : [],
    unitColumns: [{ key, header: opt?.defaultHeader || `TOTAL ${key.toUpperCase()}` }],
  };
}

function findSheetHostingUnit(
  sheets: BrandBillingSheet[],
  key: FoodUnitKey,
  brands: Brand[] = [],
): BrandBillingSheet | undefined {
  const dedicated = findDedicatedSheet(sheets, key);
  if (dedicated) return dedicated;
  // Hoja mixta (p. ej. burger+taco) también «cubre» ese tipo: no crear otra hoja vacía.
  const withColumn = sheets.find((s) => sheetHasUnit(s, key));
  if (withColumn) return withColumn;
  if (brands.length === 0) return undefined;
  const byId = brandsByIdMap(brands);
  return sheets.find((s) =>
    (s.brandIds || []).some((raw) => {
      const brand = byId.get(String(raw || '').trim());
      return brand ? resolveBrandFoodUnitKey(brand) === key : false;
    }),
  );
}

function billingSheetSortOrder(sheet: BrandBillingSheet): number {
  if (sheetDedicatedToUnit(sheet, 'pizza')) return 0;
  if (sheetDedicatedToUnit(sheet, 'burger')) return 1;
  if (sheetDedicatedToUnit(sheet, 'taco')) return 2;
  return 3;
}

function collapseSheetsById(sheets: BrandBillingSheet[]): BrandBillingSheet[] {
  const byId = new Map<string, BrandBillingSheet>();
  for (const s of sheets || []) {
    const id = String(s?.id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        ...s,
        id,
        brandIds: [...(s.brandIds || [])],
        unitColumns: [...(s.unitColumns || [])],
      });
      continue;
    }
    const brandIds = [...(prev.brandIds || [])];
    for (const raw of s.brandIds || []) {
      const bid = String(raw || '').trim();
      if (bid && !brandIds.includes(bid)) brandIds.push(bid);
    }
    const unitColumns = [...(prev.unitColumns || [])];
    const seen = new Set(unitColumns.map((c) => c.key));
    for (const col of s.unitColumns || []) {
      if (!col?.key || seen.has(col.key)) continue;
      seen.add(col.key);
      unitColumns.push(col);
    }
    byId.set(id, {
      ...prev,
      label: String(prev.label || s.label || '').trim() || prev.label,
      brandIds,
      unitColumns,
    });
  }
  return [...byId.values()];
}

/**
 * Quita hojas vacías duplicadas (p. ej. otra «BURGERGOOD» sin marcas
 * cuando burger ya está en otra hoja).
 */
function pruneRedundantEmptySheets(
  sheets: BrandBillingSheet[],
  brands: Brand[],
): BrandBillingSheet[] {
  const byId = brandsByIdMap(brands);
  return sheets.filter((s, idx) => {
    if ((s.brandIds || []).length > 0) return true;

    const dedicated = BILLING_UNIT_ORDER.find((k) => sheetDedicatedToUnit(s, k));
    if (!dedicated) return false;

    for (let j = 0; j < sheets.length; j += 1) {
      if (j === idx) continue;
      const o = sheets[j];
      const otherHasUnitBrand = (o.brandIds || []).some((raw) => {
        const brand = byId.get(String(raw || '').trim());
        return brand ? resolveBrandFoodUnitKey(brand) === dedicated : false;
      });
      if (otherHasUnitBrand) return false;
      if ((o.brandIds || []).length > 0 && sheetHasUnit(o, dedicated)) return false;
      // Dos vacías del mismo tipo: nos quedamos con la primera.
      if (j < idx && sheetDedicatedToUnit(o, dedicated) && (o.brandIds || []).length === 0) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Normaliza hojas: exclusividad de marca, columnas Excel y hojas dedicadas vacías.
 * No arranca marcas de una hoja a otra: el clic «mover aquí» debe persistir.
 * Si hay tipo pizza/burger/taco en el negocio y ninguna hoja lo cubre, crea hoja vacía.
 */
export function normalizeBillingSheetsLayout(
  sheets: BrandBillingSheet[],
  brands: Brand[] = [],
): BrandBillingSheet[] {
  let next = collapseSheetsById(sheets || []);
  next = brands.length > 0
    ? enforceExclusiveBrandAssignment(next, brands)
    : next.map((s) => ({
        ...s,
        brandIds: [...(s.brandIds || [])],
        unitColumns: [...(s.unitColumns || [])],
      }));

  const unitsPresent = unitTypesInBusiness(brands);

  for (const key of BILLING_UNIT_ORDER) {
    if (!unitsPresent.has(key)) continue;
    if (findSheetHostingUnit(next, key, brands)) continue;
    next.push(defaultSheetForUnit(key, brands, { assignAnchor: false }));
  }

  next = collapseSheetsById(next);

  if (brands.length > 0) {
    next = enforceExclusiveBrandAssignment(next, brands);
  }

  next = next.map((s) => {
    if ((s.brandIds || []).length === 0) {
      const dedicated = BILLING_UNIT_ORDER.find((k) => sheetDedicatedToUnit(s, k));
      if (dedicated) {
        const opt = FOOD_UNIT_OPTIONS.find((o) => o.key === dedicated);
        return {
          ...s,
          unitColumns: [{ key: dedicated, header: opt?.defaultHeader || `TOTAL ${dedicated.toUpperCase()}` }],
        };
      }
    }
    return {
      ...s,
      unitColumns:
        brands.length > 0 ? unitColumnsForBrandIds(brands, s.brandIds) : s.unitColumns || [],
    };
  });

  next = pruneRedundantEmptySheets(next, brands);

  next.sort(
    (a, b) =>
      billingSheetSortOrder(a) - billingSheetSortOrder(b)
      || String(a.label || '').localeCompare(String(b.label || ''), 'es'),
  );

  return next;
}

/** @deprecated Usar normalizeBillingSheetsLayout — ya no fusiona tacos con burger. */
export function pruneEmptyBillingSheets(sheets: BrandBillingSheet[]): BrandBillingSheet[] {
  return sheets.filter((s) => {
    if ((s.brandIds || []).length > 0) return true;
    return BILLING_UNIT_ORDER.some((key) => sheetDedicatedToUnit(s, key));
  });
}

/** @deprecated Usar normalizeBillingSheetsLayout. */
export function coalesceTacoIntoBurgerSheets(
  sheets: BrandBillingSheet[],
  brands: Brand[] = [],
): BrandBillingSheet[] {
  return normalizeBillingSheetsLayout(sheets, brands);
}

/** Columnas Excel = tipos de las marcas asignadas a la hoja. */
export function unitColumnsForBrandIds(
  brands: Brand[],
  brandIds: string[],
): BrandBillingUnitColumn[] {
  const byId = brandsByIdMap(brands);
  const cols: BrandBillingUnitColumn[] = [];
  const seen = new Set<string>();
  for (const rawId of brandIds) {
    const id = String(rawId || '').trim();
    const brand = byId.get(id);
    for (const col of unitColumnsForBrand(brand)) {
      if (seen.has(col.key)) continue;
      seen.add(col.key);
      cols.push(col);
    }
  }
  return cols;
}

function sanitizeSheetLabel(name: string): string {
  const raw = String(name || '').trim().toUpperCase() || 'MARCA';
  return raw.slice(0, 31);
}

function sheetForBrand(brand: Brand): BrandBillingSheet {
  const id = String(brand._id || brand.id || '').trim();
  return {
    id: `sheet-${id}`,
    label: sanitizeSheetLabel(brand.name),
    brandIds: id ? [id] : [],
    unitColumns: unitColumnsForBrand(brand),
  };
}

/**
 * Sugiere hojas Excel: una por tipo (pizza, burger, taco) presente en el negocio.
 */
export function suggestBillingSheetsFromBrands(brands: Brand[]): BrandBillingSheet[] {
  const eligible = brandsForBilling(brands).filter((b) => !isUnsetDefaultShell(b));
  const sheets: BrandBillingSheet[] = [];

  for (const key of BILLING_UNIT_ORDER) {
    const group = eligible.filter((b) => resolveBrandFoodUnitKey(b) === key);
    if (group.length === 0) continue;
    const brandIds = group
      .map((b) => String(b._id || b.id || '').trim())
      .filter(Boolean);
    sheets.push({
      id: `sheet-${key}`,
      label: sanitizeSheetLabel(group[0].name),
      brandIds,
      unitColumns: unitColumnsForBrandIds(brands, brandIds),
    });
  }

  for (const brand of eligible) {
    if (resolveBrandFoodUnitKey(brand)) continue;
    sheets.push(sheetForBrand(brand));
  }

  return normalizeBillingSheetsLayout(sheets, brands);
}

/**
 * Sincroniza hojas con marcas nuevas. Una hoja por tipo; tacos en hoja propia.
 */
export function syncBillingSheetsWithBrands(
  sheets: BrandBillingSheet[],
  brands: Brand[],
): BrandBillingSheet[] {
  const exclusive = enforceExclusiveBrandAssignment(sheets, brands);
  const eligible = brandsForBilling(brands).filter((b) => !isUnsetDefaultShell(b));
  const assigned = new Set<string>();
  for (const s of exclusive) {
    for (const id of s.brandIds) {
      for (const k of brandIdMatchSet(id, brands)) assigned.add(k);
    }
  }

  const next = [...exclusive];

  for (const b of eligible) {
    const id = String(b._id || b.id || '').trim();
    if (!id || assigned.has(id)) continue;
    // Alias ya asignado en otra forma (brand-uuid vs uuid).
    if ([...brandIdKeys(b)].some((k) => assigned.has(k))) continue;
    const unit = resolveBrandFoodUnitKey(b);
    if (unit) {
      let host = findSheetHostingUnit(next, unit, brands);
      if (!host) {
        next.push(defaultSheetForUnit(unit, brands, { assignAnchor: false }));
        host = next[next.length - 1];
      }
      if (!sheetContainsBrand(host, id, brands)) {
        host.brandIds = [...host.brandIds, id];
      }
    } else {
      next.push(sheetForBrand(b));
    }
    for (const k of brandIdKeys(b)) assigned.add(k);
  }

  return normalizeBillingSheetsLayout(next, brands);
}

/**
 * Una marca = una hoja. Si está duplicada, se queda en la primera hoja que la tenía.
 */
export function enforceExclusiveBrandAssignment(
  sheets: BrandBillingSheet[],
  brands: Brand[] = [],
): BrandBillingSheet[] {
  const seen = new Set<string>();
  return sheets.map((s) => {
    const brandIds: string[] = [];
    for (const raw of s.brandIds || []) {
      const id = String(raw || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      brandIds.push(id);
    }
    return {
      ...s,
      brandIds,
      unitColumns:
        brands.length > 0
          ? brandIds.length > 0
            ? unitColumnsForBrandIds(brands, brandIds)
            : (s.unitColumns || [])
          : s.unitColumns || [],
    };
  });
}

/** Asigna una marca a una hoja y la quita del resto. */
export function assignBrandToSheetExclusive(
  sheets: BrandBillingSheet[],
  sheetId: string,
  brandId: string,
  brands: Brand[],
): BrandBillingSheet[] {
  const bid = canonicalBrandId(brandId, brands);
  const sid = String(sheetId || '').trim();
  if (!bid || !sid) return sheets;

  const next = sheets.map((s) => {
    if (s.id === sid) {
      const without = stripBrandFromIds(s.brandIds || [], bid, brands);
      return { ...s, brandIds: [...without, bid] };
    }
    if (!sheetContainsBrand(s, bid, brands)) return s;
    return { ...s, brandIds: stripBrandFromIds(s.brandIds || [], bid, brands) };
  });
  return normalizeBillingSheetsLayout(next, brands);
}

/** Quita una marca de una hoja (sin moverla a otra). */
export function removeBrandFromSheet(
  sheets: BrandBillingSheet[],
  sheetId: string,
  brandId: string,
  brands: Brand[],
): BrandBillingSheet[] {
  const bid = canonicalBrandId(brandId, brands);
  const sid = String(sheetId || '').trim();
  if (!bid || !sid) return sheets;
  const next = sheets.map((s) => {
    if (s.id !== sid) return s;
    return { ...s, brandIds: stripBrandFromIds(s.brandIds || [], bid, brands) };
  });
  return normalizeBillingSheetsLayout(next, brands);
}

/** ¿La hoja tiene esta marca (con alias brand-/uuid)? */
export function billingSheetHasBrand(
  sheet: Pick<BrandBillingSheet, 'brandIds'>,
  brandId: string,
  brands: Brand[],
): boolean {
  return sheetContainsBrand(sheet, brandId, brands);
}

export function normalizeBrandBillingConfig(
  raw: Partial<BrandBillingConfig> | null | undefined,
  businessId: string,
): BrandBillingConfig {
  const base = emptyBrandBillingConfig(businessId);
  if (!raw || typeof raw !== 'object') return base;
  const sheetsIn = Array.isArray(raw.sheets) ? raw.sheets : [];
  const sheets: BrandBillingSheet[] = sheetsIn
    .map((s, idx) => {
      if (!s || typeof s !== 'object') return null;
      const id = String(s.id || `sheet-${idx + 1}`).trim() || `sheet-${idx + 1}`;
      const brandIds = Array.isArray(s.brandIds)
        ? s.brandIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const unitColumns: BrandBillingUnitColumn[] = Array.isArray(s.unitColumns)
        ? s.unitColumns
            .map((c) => {
              const key = String(c?.key || '').trim() as FoodUnitKey;
              if (key !== 'pizza' && key !== 'burger' && key !== 'taco') return null;
              const def = FOOD_UNIT_OPTIONS.find((o) => o.key === key);
              const header = String(c?.header || def?.defaultHeader || key).trim().toUpperCase();
              return { key, header: header.slice(0, 24) };
            })
            .filter(Boolean) as BrandBillingUnitColumn[]
        : [];
      return {
        id,
        label: sanitizeSheetLabel(s.label || id),
        brandIds,
        unitColumns,
      };
    })
    .filter(Boolean) as BrandBillingSheet[];

  return {
    ...base,
    _id: String(raw._id || base._id),
    _rev: raw._rev,
    sheets,
    sharedSplitMode: normalizeBillingSharedSplitMode(raw.sharedSplitMode),
    monoBrandTakesAll: raw.monoBrandTakesAll !== false,
    orphanMode: normalizeBillingOrphanMode(raw.orphanMode),
    orphanFixedBrandId: String(raw.orphanFixedBrandId || '').trim(),
    taxPolicy: normalizeEsTaxPolicy(raw.taxPolicy || base.taxPolicy),
    createdAt: String(raw.createdAt || base.createdAt || ''),
    updatedAt: String(raw.updatedAt || base.updatedAt),
  };
}

export type UnitCounts = Record<FoodUnitKey, number>;

export function unitsForSheet(counts: UnitCounts, sheet: BrandBillingSheet): number {
  let n = 0;
  for (const col of sheet.unitColumns) {
    n += Math.max(0, Number(counts[col.key]) || 0);
  }
  return n;
}

export function totalConfiguredUnits(counts: UnitCounts, sheets: BrandBillingSheet[]): number {
  const keys = new Set<FoodUnitKey>();
  for (const sheet of sheets) {
    for (const col of sheet.unitColumns) keys.add(col.key);
  }
  let n = 0;
  for (const key of keys) n += Math.max(0, Number(counts[key]) || 0);
  return n;
}

/** Fracción [0..1] de € que corresponde a cada hoja (por unidades). */
export function sheetMoneyShares(
  counts: UnitCounts,
  sheets: BrandBillingSheet[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!sheets.length) return out;
  const total = totalConfiguredUnits(counts, sheets);
  if (total <= 0) {
    const eq = 1 / sheets.length;
    for (const s of sheets) out[s.id] = eq;
    return out;
  }
  for (const s of sheets) {
    out[s.id] = unitsForSheet(counts, s) / total;
  }
  return out;
}

/**
 * Pedido cruzado: unidades compartidas según mode (majority | equal).
 */
export function allocateSharedUnitsByPresence(
  brandedUnitsByBrandId: Record<string, number>,
  sharedUnits: number,
  mode: BrandBillingSharedSplitMode = 'majority',
  brandedRevenueByBrandId: Record<string, number> = {},
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, n] of Object.entries(brandedUnitsByBrandId)) {
    result[id] = Math.max(0, Number(n) || 0);
  }
  const shared = Math.max(0, Number(sharedUnits) || 0);
  if (shared <= 0) return result;

  const ids = Object.entries(brandedUnitsByBrandId)
    .filter(([, n]) => (Number(n) || 0) > 0)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));
  if (ids.length === 0) return result;

  const normalized = normalizeBillingSharedSplitMode(mode);
  if (normalized === 'equal') {
    const each = shared / ids.length;
    let assigned = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const part =
        i === ids.length - 1
          ? Math.round((shared - assigned) * 100) / 100
          : Math.round(each * 100) / 100;
      result[id] = (result[id] || 0) + part;
      assigned += part;
    }
    return result;
  }

  let best = ids[0];
  let bestU = -1;
  let bestR = -1;
  for (const id of ids) {
    const u = Math.max(0, Number(brandedUnitsByBrandId[id]) || 0);
    const r = Math.max(0, Number(brandedRevenueByBrandId[id]) || 0);
    if (u > bestU || (u === bestU && r > bestR)) {
      best = id;
      bestU = u;
      bestR = r;
    }
  }
  result[best] = (result[best] || 0) + shared;
  return result;
}

export function isBrandBillingUnlocked(brands: Brand[]): boolean {
  return brandsForBilling(brands).length >= 2;
}

/**
 * Slot de 2ª caja / cierre: 1 por hoja de Facturación (no 1 por marca suelta).
 * Si tacos facturan con Black Burger → un solo input con el nombre de la marca que manda.
 */
export type ClosingBillingBrandSlot = {
  /** Marca ancla (la que predomina en la hoja). */
  brandId: string;
  /** Nombre visible (marca ancla). */
  name: string;
  /** Todas las marcas de la hoja (p. ej. burger + taco). */
  memberBrandIds: string[];
  /**
   * Hoja de Facturación / Excel a la que va este Total (MM → hoja MM, BB → hoja BB).
   * Misma dirección en cierre y en las 4 pestañas marca×tienda.
   */
  sheetId?: string;
};

/** Hojas listas para cierre/Excel: config guardada o sugerencia clasica (tacos → burger). */
export function resolveBillingSheetsForClosing(
  sheets: BrandBillingSheet[] | null | undefined,
  brands: Brand[],
): BrandBillingSheet[] {
  if (!sheets || sheets.length === 0) {
    return suggestBillingSheetsFromBrands(brands);
  }
  return syncBillingSheetsWithBrands(sheets, brands);
}

/**
 * Marca ancla de una hoja: burger si hay, si no pizza, si no la primera de brandIds.
 * El nombre de la ancla es el que se muestra en «Total [marca]».
 */
export function predominantBrandIdForSheet(
  sheet: BrandBillingSheet,
  brands: Brand[] = [],
): string {
  const memberIds = (sheet.brandIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  if (memberIds.length === 0) return '';
  if (memberIds.length === 1) return memberIds[0];

  const byId = brandsByIdMap(brands);
  const preferUnit: FoodUnitKey | null = sheetHasUnit(sheet, 'burger')
    ? 'burger'
    : sheetHasUnit(sheet, 'pizza')
      ? 'pizza'
      : sheetHasUnit(sheet, 'taco')
        ? 'taco'
        : null;

  if (preferUnit) {
    const match = memberIds.find((id) => {
      const brand = byId.get(id);
      return brand ? resolveBrandFoodUnitKey(brand) === preferUnit : false;
    });
    if (match) return match;
  }
  return memberIds[0];
}

/** Slots de 2ª caja desde hojas de Facturación (Pau: 3 marcas → 2 inputs). */
export function closingSlotsFromBillingSheets(
  sheets: BrandBillingSheet[],
  brands: Brand[],
): ClosingBillingBrandSlot[] {
  const byId = brandsByIdMap(brands);
  const labels = buildBrandLabelsMap(brands);
  const out: ClosingBillingBrandSlot[] = [];
  const seenHosts = new Set<string>();

  for (const sheet of sheets || []) {
    const memberBrandIds = (sheet.brandIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (memberBrandIds.length === 0) continue;

    const hostId = predominantBrandIdForSheet(sheet, brands) || memberBrandIds[0];
    if (!hostId || seenHosts.has(hostId)) continue;
    seenHosts.add(hostId);

    const hostBrand = byId.get(hostId);
    const sheetLabel = String(sheet.label || '').trim();
    const fromBrand = String(hostBrand?.name || '').trim();
    const candidate =
      (fromBrand && !looksLikeBrandTechnicalId(fromBrand) ? fromBrand : '')
      || (sheetLabel && !looksLikeBrandTechnicalId(sheetLabel) ? sheetLabel : '')
      || displayBrandName(hostId, labels, 'Marca');

    out.push({
      brandId: hostId,
      name: candidate,
      memberBrandIds,
      sheetId: String(sheet.id || '').trim() || undefined,
    });
  }

  return out;
}
