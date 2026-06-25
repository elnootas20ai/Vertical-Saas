import type { Brand } from './brandApi';

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

export type BrandSetupPendingKey = 'display_name' | 'delivery_kind' | 'catalog_categories' | 'stores';

export type BrandSetupContext = {
  isDelivery: boolean;
  retailStoreCount: number;
};

/** Qué falta por completar en la marca General (u otra) antes de operar con claridad. */
export function getBrandSetupPending(
  brand: Pick<Brand, 'name' | 'isDefault' | 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>,
  ctx: BrandSetupContext,
): BrandSetupPendingKey[] {
  const pending: BrandSetupPendingKey[] = [];
  if (isDefaultCommercialBrand(brand) && isDefaultBrandNamePlaceholder(brand.name)) {
    pending.push('display_name');
  }
  if (ctx.isDelivery && !String(brand.deliveryLineKind || '').trim()) {
    pending.push('delivery_kind');
  }
  if (ctx.isDelivery && !(brand.catalogCategories && brand.catalogCategories.length > 0)) {
    pending.push('catalog_categories');
  }
  if (ctx.retailStoreCount > 0) {
    const ids = brand.salesPointIds ?? [];
    if (ids.length > 0 && ids.length < ctx.retailStoreCount) {
      /* parcial válido */
    }
    /* vacío = todas las tiendas → OK */
  } else if (ctx.isDelivery) {
    pending.push('stores');
  }
  return pending;
}

export function isBrandSetupComplete(
  brand: Pick<Brand, 'deliveryLineKind' | 'catalogCategories' | 'salesPointIds'>,
  ctx: BrandSetupContext,
): boolean {
  return getBrandSetupPending(brand, ctx).length === 0;
}

export function brandSetupPendingLabels(
  keys: BrandSetupPendingKey[],
  ctx: BrandSetupContext,
): string[] {
  return keys.map((k) => {
    if (k === 'display_name') return 'Pon el nombre de tu negocio o carta';
    if (k === 'delivery_kind') return 'Indica qué tipo de producto vendes (pizza, comida preparada, etc.)';
    if (k === 'catalog_categories') return 'Añade al menos una categoría de catálogo';
    if (k === 'stores') return 'Crea al menos una tienda en Ajustes → Tienda';
    return '';
  }).filter(Boolean);
}
