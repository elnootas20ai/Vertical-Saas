/**
 * Facturación entre marcas — config por empresa (sin hardcode Modomio/BB).
 *
 * Excel de cierre: 1 hoja por «cubo» (sheet). Dinero se reparte por unidades
 * de las columnas de ese cubo vs el total de unidades de todos los cubos.
 * Pedidos cruzados: lo compartido (bebidas…) según sharedSplitMode
 * (majority = dominante; equal = a medias 1/N).
 */
import type { Brand } from './brandApi';
import { isBrandActive, isDefaultBrandNamePlaceholder, isDefaultCommercialBrand } from './brandUtils';

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
  updatedAt: string;
  createdAt?: string;
};

/** Options para el motor de atribución (desde la config guardada). */
export type BrandBillingSplitRules = {
  sharedSplitMode: BrandBillingSharedSplitMode;
  monoBrandTakesAll: boolean;
};

export const SHARED_SPLIT_MODE_OPTIONS: Array<{
  value: 'majority' | 'equal';
  label: string;
  hint: string;
  example: string;
}> = [
  {
    value: 'majority',
    label: 'Marca dominante',
    hint: 'Lo compartido (bebidas, postres…) va entero a la marca con más unidades.',
    example: '2 de A + 1 de B + bebida 2,50 € → 2,50 € a A',
  },
  {
    value: 'equal',
    label: 'A medias (1 a 1)',
    hint: 'Lo compartido se parte a partes iguales entre las marcas del ticket.',
    example: 'A + B + bebida 2,50 € → 1,25 € a A y 1,25 € a B',
  },
];

export function normalizeBillingSharedSplitMode(
  raw: string | null | undefined,
): 'majority' | 'equal' {
  const mode = String(raw || 'majority').trim();
  if (mode === 'equal' || mode === 'by_units') return 'equal';
  return 'majority';
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
    createdAt: now,
    updatedAt: now,
  };
}

/** Reglas de cruce listas para el motor (sin hardcode de marcas). */
export function splitRulesFromBillingConfig(
  config: Pick<BrandBillingConfig, 'sharedSplitMode' | 'monoBrandTakesAll'> | null | undefined,
): BrandBillingSplitRules {
  return {
    sharedSplitMode: normalizeBillingSharedSplitMode(config?.sharedSplitMode),
    monoBrandTakesAll: config?.monoBrandTakesAll !== false,
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

/** Columnas Excel = tipos de las marcas asignadas a la hoja. */
export function unitColumnsForBrandIds(
  brands: Brand[],
  brandIds: string[],
): BrandBillingUnitColumn[] {
  const byId = new Map(
    brands.map((b) => [String(b._id || b.id || '').trim(), b] as const),
  );
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

/** Sugiere 1 hoja por marca activa (salta el cascarón General sin nombre real). */
export function suggestBillingSheetsFromBrands(brands: Brand[]): BrandBillingSheet[] {
  return brandsForBilling(brands)
    .filter((b) => !isUnsetDefaultShell(b))
    .map((b) => sheetForBrand(b));
}

/**
 * Si creas una 3ª marca (p. ej. Tacos), aparece como hoja nueva sin tocar las ya guardadas.
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
  for (const b of eligible) {
    const id = String(b._id || b.id || '').trim();
    if (!id || assigned.has(id)) continue;
    next.push(sheetForBrand(b));
    assigned.add(id);
  }
  return enforceExclusiveBrandAssignment(next, brands);
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
  return enforceExclusiveBrandAssignment(next, brands);
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
  return enforceExclusiveBrandAssignment(next, brands);
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
