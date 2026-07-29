import type { Brand } from './brandApi';
import { inferDeliveryLineKindFromBrandName } from './brandPlaceholders';
import { getDeliveryBrandLinePreset } from './deliveryBrandLineKinds';

export const DEFAULT_COMMERCIAL_BRAND_NAME = 'General';

/** Nombres rápidos cuando aún no se ha personalizado la primera marca. */
export const DEFAULT_BRAND_NAME_SUGGESTIONS = [
  'Mi restaurante',
  'Pizzería',
  'Burger',
  'Cafetería',
  'Bar',
  'Cocina',
] as const;

export function isDefaultBrandNamePlaceholder(name: string): boolean {
  const key = normalizeBrandNameKey(name);
  return !key || key === normalizeBrandNameKey(DEFAULT_COMMERCIAL_BRAND_NAME);
}

export function normalizeBrandNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Código corto PDV/informes a partir del nombre de marca (p. ej. «Crepería» → «CRE»). */
export function suggestBrandShortCodeFromName(name: string, maxLen = 3): string {
  const cleaned = String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  if (!cleaned) return '';
  return cleaned.slice(0, Math.max(1, maxLen));
}

export function isDefaultCommercialBrand(brand: Pick<Brand, 'name' | 'isDefault'>): boolean {
  return Boolean(brand.isDefault) || normalizeBrandNameKey(brand.name) === normalizeBrandNameKey(DEFAULT_COMMERCIAL_BRAND_NAME);
}

export function isBrandActive(brand: Pick<Brand, 'active'>): boolean {
  return brand.active !== false;
}

/** Al menos una marca activa debe quedar en la empresa. */
export function canDeactivateBrand(
  brand: Pick<Brand, '_id' | 'active'>,
  brands: Array<Pick<Brand, '_id' | 'active'>>,
): boolean {
  if (!isBrandActive(brand)) return true;
  const activeCount = brands.filter((b) => isBrandActive(b)).length;
  return activeCount > 1;
}

/** Nueva línea comercial: activa al crear (salvo que se pida explícitamente inactiva). */
export function resolveBrandActiveOnCreate(
  _existingBrands: Array<Pick<Brand, 'active'>>,
  requestedActive?: boolean,
): boolean {
  return requestedActive !== false;
}

/** Fondo de vista previa / cabecera según color de marca. */
export function brandPreviewGradient(primaryColor: string): string {
  const hex = String(primaryColor || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return 'linear-gradient(145deg, #6366f1 0%, #4f46e5 100%)';
  }
  return `linear-gradient(145deg, ${hex} 0%, ${hex}dd 48%, ${hex}b3 100%)`;
}

/** Color de marca con alpha en hex (#RRGGBB + AA). */
export function brandTint(primaryColor: string, alphaSuffix = '18'): string {
  const hex = String(primaryColor || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return `#6366f1${alphaSuffix}`;
  return `${hex}${alphaSuffix}`;
}

export function sortBrandsForDisplay(brands: Brand[]): Brand[] {
  return [...brands].sort((a, b) => {
    const aDef = isDefaultCommercialBrand(a) ? 0 : 1;
    const bDef = isDefaultCommercialBrand(b) ? 0 : 1;
    if (aDef !== bDef) return aDef - bDef;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function brandStoreLabel(count: number, totalStores: number): string {
  if (totalStores === 0) return 'Sin tiendas';
  if (count === 0 || count >= totalStores) return 'Todas las tiendas';
  return `${count} tienda${count !== 1 ? 's' : ''}`;
}

export type BrandStoreAssignment = {
  mode: 'none' | 'all' | 'partial';
  stores: { id: string; name: string }[];
};

/** Tiendas donde opera la línea (vacío en salesPointIds = todas). */
export function brandStoreAssignment(
  brand: Pick<Brand, 'salesPointIds'>,
  retailStores: { _id: string; name: string }[],
): BrandStoreAssignment {
  if (retailStores.length === 0) return { mode: 'none', stores: [] };
  const ids = brand.salesPointIds ?? [];
  if (ids.length === 0) {
    return { mode: 'all', stores: retailStores.map((s) => ({ id: s._id, name: s.name })) };
  }
  const stores = retailStores.filter((s) => ids.includes(s._id)).map((s) => ({ id: s._id, name: s.name }));
  if (stores.length >= retailStores.length) return { mode: 'all', stores: retailStores.map((s) => ({ id: s._id, name: s.name })) };
  return { mode: 'partial', stores };
}

export type BrandSetupPendingKey = 'display_name' | 'delivery_kind';

export type BrandSetupContext = {
  isDelivery: boolean;
  retailStoreCount: number;
};

function effectiveDeliveryLineKind(
  brand: Pick<Brand, 'name' | 'deliveryLineKind'>,
): string {
  return (
    String(brand.deliveryLineKind || '').trim() ||
    inferDeliveryLineKindFromBrandName(String(brand.name || '')) ||
    ''
  );
}

function effectiveCatalogCategories(
  brand: Pick<Brand, 'catalogCategories'>,
  lineKind: string,
): string[] {
  const saved = (brand.catalogCategories ?? []).map((c) => String(c || '').trim()).filter(Boolean);
  if (saved.length > 0) return saved;
  if (!lineKind) return [];
  return getDeliveryBrandLinePreset(lineKind)?.typicalCategories ?? [];
}

/** Qué falta por completar en la marca General (u otra) antes de operar con claridad. */
export function getBrandSetupPending(
  brand: Pick<Brand, 'name' | 'isDefault' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>,
  ctx: BrandSetupContext,
): BrandSetupPendingKey[] {
  const pending: BrandSetupPendingKey[] = [];
  if (isDefaultCommercialBrand(brand) && isDefaultBrandNamePlaceholder(brand.name)) {
    pending.push('display_name');
  }
  const lineKind = effectiveDeliveryLineKind(brand);
  if (ctx.isDelivery && !lineKind) {
    pending.push('delivery_kind');
  }
  return pending;
}

export function isBrandSetupComplete(
  brand: Pick<Brand, 'name' | 'isDefault' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>,
  ctx: BrandSetupContext,
): boolean {
  return getBrandSetupPending(brand, ctx).length === 0;
}

/** Marca auto-creada o a medias en el alta (p. ej. «test1» sin categorías): hay que completarla, no duplicar. */
export function isIncompleteActivationShell(
  brand: Pick<Brand, 'name' | 'isDefault' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>,
  ctx: BrandSetupContext,
): boolean {
  return !isBrandSetupComplete(brand, ctx);
}

/** Prioriza la marca pendiente que el asistente del alta debe abrir (como editar PDV, no crear otro). */
export function findBrandToCompleteInActivation<T extends Pick<Brand, '_id' | 'name' | 'isDefault' | 'active' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>>(
  brands: T[],
  ctx: BrandSetupContext,
): T | null {
  const incomplete = brands.filter((b) => b.active !== false && isIncompleteActivationShell(b, ctx));
  if (incomplete.length === 0) return null;
  if (incomplete.length === 1) return incomplete[0];
  const defaultIncomplete = incomplete.find((b) => isDefaultCommercialBrand(b));
  return defaultIncomplete ?? incomplete[0];
}

/** Paso «Marca» del alta delivery: basta con una marca activa bien configurada. */
export function isDeliveryBrandActivationComplete(
  brands: Array<Pick<Brand, 'active' | 'name' | 'isDefault' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>>,
  ctx: BrandSetupContext,
): boolean {
  return brands.some((b) => b.active !== false && isBrandSetupComplete(b, ctx));
}

/** Contexto para validar marcas: si el PDV ya está listo, no exigir tiendas en scope vacío transitorio. */
export function resolveBrandSetupContext(
  isDelivery: boolean,
  retailWorkCenters: Array<{ active?: boolean }>,
  options?: { storesConfirmed?: boolean },
): BrandSetupContext {
  let retailStoreCount = retailWorkCenters.filter((wc) => wc.active !== false).length;
  if (isDelivery && retailStoreCount === 0 && options?.storesConfirmed) {
    retailStoreCount = 1;
  }
  return { isDelivery, retailStoreCount };
}

export function brandSetupPendingLabels(
  keys: BrandSetupPendingKey[],
  ctx: BrandSetupContext,
): string[] {
  return keys.map((k) => {
    if (k === 'display_name') return 'Pon el nombre de tu negocio o carta';
    if (k === 'delivery_kind') return 'Indica qué tipo de producto vendes (pizza, comida preparada, etc.)';
    return '';
  }).filter(Boolean);
}
