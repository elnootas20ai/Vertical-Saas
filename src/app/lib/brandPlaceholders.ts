import type { DeliveryBrandLineKindId } from './deliveryBrandLineKinds';
import { DELIVERY_BRAND_LINE_PHOTOS } from './deliveryBrandLineKinds';

export type BrandPlaceholderKind =
  | 'pizza'
  | 'burger'
  | 'kebab'
  | 'tapas'
  | 'sushi'
  | 'cafe'
  | 'kitchen'
  | 'drinks'
  | 'grocery'
  | 'restaurant'
  | 'generic';

const BRAND_PLACEHOLDER_BASE = '/catalog-placeholders/photos';

export const BRAND_PLACEHOLDER_URLS: Record<BrandPlaceholderKind, string> = {
  pizza: `${BRAND_PLACEHOLDER_BASE}/pizza-lite.webp`,
  burger: `${BRAND_PLACEHOLDER_BASE}/burger-lite.webp`,
  kebab: `${BRAND_PLACEHOLDER_BASE}/kebab.webp`,
  tapas: `${BRAND_PLACEHOLDER_BASE}/tapas.webp`,
  sushi: `${BRAND_PLACEHOLDER_BASE}/sushi.webp`,
  cafe: `${BRAND_PLACEHOLDER_BASE}/cafe.webp`,
  kitchen: `${BRAND_PLACEHOLDER_BASE}/combo.webp`,
  drinks: `${BRAND_PLACEHOLDER_BASE}/drink.webp`,
  grocery: `${BRAND_PLACEHOLDER_BASE}/grocery.webp`,
  restaurant: `${BRAND_PLACEHOLDER_BASE}/restaurant.webp`,
  generic: `${BRAND_PLACEHOLDER_BASE}/generic-brand.webp`,
};

const LINE_KIND_PLACEHOLDER: Record<DeliveryBrandLineKindId, BrandPlaceholderKind> = {
  prepared_meals: 'kitchen',
  pizza: 'pizza',
  burger_fastfood: 'burger',
  kebab: 'kebab',
  tapas_bar: 'tapas',
  sushi_asian: 'sushi',
  cafe_bakery: 'cafe',
  drinks_desserts: 'drinks',
  groceries: 'grocery',
  mixed_restaurant: 'restaurant',
  other: 'generic',
};

type PlaceholderRule = {
  kind: BrandPlaceholderKind;
  lineKind?: DeliveryBrandLineKindId;
  patterns: string[];
};

const BRAND_NAME_RULES: PlaceholderRule[] = [
  { kind: 'kebab', lineKind: 'kebab', patterns: ['kebab', 'doner', 'döner', 'durum', 'shawarma', 'gyros', 'pita'] },
  { kind: 'tapas', lineKind: 'tapas_bar', patterns: ['tapas', 'tapa', 'bar', 'cerveceria', 'cervecería', 'raciones', 'pincho', 'taberna'] },
  { kind: 'pizza', lineKind: 'pizza', patterns: ['pizza', 'pizzeria', 'modomio'] },
  { kind: 'burger', lineKind: 'burger_fastfood', patterns: ['burger', 'hamburg', 'fast food', 'fastfood'] },
  { kind: 'sushi', lineKind: 'sushi_asian', patterns: ['sushi', 'roll', 'wok', 'asiatico', 'asiático', 'japon'] },
  { kind: 'cafe', lineKind: 'cafe_bakery', patterns: ['cafe', 'café', 'cafeter', 'panader', 'boller', 'bakery'] },
  { kind: 'drinks', lineKind: 'drinks_desserts', patterns: ['bebida', 'postre', 'helader', 'dulce'] },
  { kind: 'grocery', lineKind: 'groceries', patterns: ['despensa', 'ultramarino', 'super', 'market'] },
  { kind: 'kitchen', lineKind: 'prepared_meals', patterns: ['cocina', 'menu', 'menú', 'comida preparada'] },
  { kind: 'restaurant', lineKind: 'mixed_restaurant', patterns: ['restaurante', 'carte', 'carta'] },
];

function foldBrandText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function isKnownBrandPlaceholderUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/catalog-placeholders/')) return true;
  if (Object.values(BRAND_PLACEHOLDER_URLS).includes(trimmed)) return true;
  return Object.values(DELIVERY_BRAND_LINE_PHOTOS).includes(trimmed);
}

function resolveLineKindForBrand(brand: BrandPlaceholderInput): DeliveryBrandLineKindId | '' {
  const explicit = String(brand.deliveryLineKind || '').trim() as DeliveryBrandLineKindId;
  if (explicit) return explicit;
  return inferDeliveryLineKindFromBrandName(String(brand.name || '')) || '';
}

export type BrandPlaceholderInput = {
  name?: string;
  deliveryLineKind?: string | null;
  catalogCategories?: string[];
  logo?: string | null;
};

export function inferDeliveryLineKindFromBrandName(name: string): DeliveryBrandLineKindId | null {
  const folded = foldBrandText(name);
  if (!folded) return null;
  for (const rule of BRAND_NAME_RULES) {
    if (rule.lineKind && rule.patterns.some((pattern) => folded.includes(foldBrandText(pattern)))) {
      return rule.lineKind;
    }
  }
  return null;
}

export function resolveBrandPlaceholderKind(brand: BrandPlaceholderInput): BrandPlaceholderKind {
  const lineKind = String(brand.deliveryLineKind || '').trim() as DeliveryBrandLineKindId;
  if (lineKind && lineKind in LINE_KIND_PLACEHOLDER && lineKind !== 'other') {
    return LINE_KIND_PLACEHOLDER[lineKind];
  }

  const folded = foldBrandText(
    [brand.name, ...(brand.catalogCategories ?? [])].filter(Boolean).join(' '),
  );
  for (const rule of BRAND_NAME_RULES) {
    if (rule.patterns.some((pattern) => folded.includes(foldBrandText(pattern)))) {
      return rule.kind;
    }
  }

  return 'generic';
}

export function resolveBrandPlaceholderUrl(brand: BrandPlaceholderInput): string {
  const lineKind = resolveLineKindForBrand(brand);
  if (lineKind && lineKind in DELIVERY_BRAND_LINE_PHOTOS) {
    return DELIVERY_BRAND_LINE_PHOTOS[lineKind];
  }
  return BRAND_PLACEHOLDER_URLS[resolveBrandPlaceholderKind(brand)];
}

/** Logo guardado o foto genérica según línea/nombre de la marca. */
export function resolveBrandLogo(brand: BrandPlaceholderInput): string {
  const explicit = String(brand.logo || '').trim();
  if (explicit && !isKnownBrandPlaceholderUrl(explicit)) return explicit;
  return resolveBrandPlaceholderUrl(brand);
}

export function shouldPersistBrandPlaceholderLogo(logo: string | undefined | null): boolean {
  const trimmed = String(logo || '').trim();
  return !trimmed || isKnownBrandPlaceholderUrl(trimmed);
}
