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
 * Solo se excluyen inactivas.
 */
export function brandsForBilling(brands: Brand[]): Brand[] {
  return brands.filter((b) => b && isBrandActive(b));
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

function tacoUnitColumn(): BrandBillingUnitColumn {
  return { key: 'taco', header: 'TOTAL TACOS' };
}

function sheetHasUnit(sheet: BrandBillingSheet, key: FoodUnitKey): boolean {
  return (sheet.unitColumns || []).some((c) => c.key === key);
}

/** Quita hojas vacías (sin marcas) que quedan al mover tacos a Black Burger. */
export function pruneEmptyBillingSheets(sheets: BrandBillingSheet[]): BrandBillingSheet[] {
  return sheets.filter((s) => (s.brandIds || []).length > 0);
}

/**
 * Plantilla clasica de cierres: burgers + tacos en la misma hoja.
 * - Marcas taco → se mueven a la hoja burger si existe.
 * - Si hay hoja burger sin columna TACOS y no hay hoja taco aparte → se añade TOTAL TACOS.
 */
export function coalesceTacoIntoBurgerSheets(
  sheets: BrandBillingSheet[],
  brands: Brand[] = [],
): BrandBillingSheet[] {
  let next = brands.length > 0
    ? enforceExclusiveBrandAssignment(sheets, brands)
    : sheets.map((s) => ({ ...s, unitColumns: [...(s.unitColumns || [])] }));

  const burgerIdx = next.findIndex((s) => sheetHasUnit(s, 'burger'));
  if (burgerIdx < 0) return pruneEmptyBillingSheets(next);

  const tacoOnlyIdxs = next
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => (
      i !== burgerIdx
      && sheetHasUnit(s, 'taco')
      && !sheetHasUnit(s, 'burger')
      && !sheetHasUnit(s, 'pizza')
    ))
    .map(({ i }) => i);

  if (tacoOnlyIdxs.length > 0) {
    const movedIds = [...next[burgerIdx].brandIds];
    for (const i of tacoOnlyIdxs) {
      for (const id of next[i].brandIds) {
        if (!movedIds.includes(id)) movedIds.push(id);
      }
    }
    next = next.map((s, i) => {
      if (i === burgerIdx) return { ...s, brandIds: movedIds };
      if (tacoOnlyIdxs.includes(i)) return { ...s, brandIds: [] };
      return s;
    });
    next = brands.length > 0
      ? enforceExclusiveBrandAssignment(next, brands)
      : next.map((s, i) => {
        if (i !== burgerIdx) return s;
        const cols = [...s.unitColumns];
        if (!cols.some((c) => c.key === 'taco')) cols.push(tacoUnitColumn());
        return { ...s, unitColumns: cols };
      });
  }

  next = pruneEmptyBillingSheets(next);

  // Hoja burger sin marca taco: igual muestra TOTAL TACOS (conteo del cierre).
  const stillHasTacoSheet = next.some((s) =>
    sheetHasUnit(s, 'taco') && !sheetHasUnit(s, 'burger'),
  );
  if (stillHasTacoSheet) return next;

  return next.map((s) => {
    if (!sheetHasUnit(s, 'burger') || sheetHasUnit(s, 'taco')) return s;
    return { ...s, unitColumns: [...s.unitColumns, tacoUnitColumn()] };
  });
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
 * Sugiere hojas Excel: 1 por marca, pero tacos van con la hoja burger
 * (plantilla clasica de cierres: BLACK BURGER = TOTAL BURGUER + TOTAL TACOS).
 */
export function suggestBillingSheetsFromBrands(brands: Brand[]): BrandBillingSheet[] {
  const eligible = brandsForBilling(brands).filter((b) => !isUnsetDefaultShell(b));
  const sheets: BrandBillingSheet[] = [];
  let burgerIdx = -1;

  for (const brand of eligible) {
    const id = String(brand._id || brand.id || '').trim();
    const unit = resolveBrandFoodUnitKey(brand);
    if (unit === 'taco' && burgerIdx >= 0) {
      const host = sheets[burgerIdx];
      const brandIds = host.brandIds.includes(id) ? host.brandIds : [...host.brandIds, id];
      sheets[burgerIdx] = {
        ...host,
        brandIds,
        unitColumns: unitColumnsForBrandIds(brands, brandIds),
      };
      continue;
    }
    sheets.push(sheetForBrand(brand));
    if (unit === 'burger') burgerIdx = sheets.length - 1;
  }

  return coalesceTacoIntoBurgerSheets(sheets, brands);
}

/**
 * Sincroniza hojas con marcas nuevas. Tacos nuevos → hoja burger si existe.
 * Recalcula columnas y garantiza: cada marca en como máximo una hoja.
 */
export function syncBillingSheetsWithBrands(
  sheets: BrandBillingSheet[],
  brands: Brand[],
): BrandBillingSheet[] {
  const exclusive = enforceExclusiveBrandAssignment(sheets, brands);
  const eligible = brandsForBilling(brands).filter((b) => !isUnsetDefaultShell(b));
  const assigned = new Set<string>();
  for (const s of exclusive) {
    for (const id of s.brandIds) assigned.add(id);
  }

  const next = [...exclusive];
  let burgerIdx = next.findIndex((s) => sheetHasUnit(s, 'burger'));

  for (const b of eligible) {
    const id = String(b._id || b.id || '').trim();
    if (!id || assigned.has(id)) continue;
    const unit = resolveBrandFoodUnitKey(b);
    if (unit === 'taco' && burgerIdx >= 0) {
      const host = next[burgerIdx];
      const brandIds = host.brandIds.includes(id) ? host.brandIds : [...host.brandIds, id];
      next[burgerIdx] = { ...host, brandIds };
      assigned.add(id);
      continue;
    }
    next.push(sheetForBrand(b));
    assigned.add(id);
    if (unit === 'burger' && burgerIdx < 0) burgerIdx = next.length - 1;
  }

  return coalesceTacoIntoBurgerSheets(next, brands);
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
      unitColumns: brands.length > 0
        ? unitColumnsForBrandIds(brands, brandIds)
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
  const bid = String(brandId || '').trim();
  const sid = String(sheetId || '').trim();
  if (!bid || !sid) return sheets;

  const next = sheets.map((s) => {
    if (s.id === sid) {
      const brandIds = s.brandIds.includes(bid) ? s.brandIds : [...s.brandIds, bid];
      return { ...s, brandIds };
    }
    if (!s.brandIds.includes(bid)) return s;
    return { ...s, brandIds: s.brandIds.filter((id) => id !== bid) };
  });
  return coalesceTacoIntoBurgerSheets(next, brands);
}

/** Quita una marca de una hoja (sin moverla a otra). */
export function removeBrandFromSheet(
  sheets: BrandBillingSheet[],
  sheetId: string,
  brandId: string,
  brands: Brand[],
): BrandBillingSheet[] {
  const bid = String(brandId || '').trim();
  const next = sheets.map((s) => {
    if (s.id !== sheetId) return s;
    return { ...s, brandIds: s.brandIds.filter((id) => id !== bid) };
  });
  return coalesceTacoIntoBurgerSheets(next, brands);
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
