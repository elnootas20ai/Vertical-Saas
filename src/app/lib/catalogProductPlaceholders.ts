import type { CatalogItem } from './deliveryApi';
import { isDrinkCatalogProduct } from './vertialDefaultCosts';
import { isImportComboCategory } from './deliveryCatalogImportLogic';

export type CatalogProductPlaceholderKind =
  | 'cola'
  | 'lemon'
  | 'water'
  | 'beer'
  | 'juice'
  | 'energy'
  | 'wine'
  | 'cafe'
  | 'drink'
  | 'pizza'
  | 'burger'
  | 'side'
  | 'dessert'
  | 'tapas'
  | 'kebab'
  | 'sushi'
  | 'combo'
  | 'food';

const PLACEHOLDER_BASE = '/catalog-placeholders/photos';

export const CATALOG_PRODUCT_PLACEHOLDER_URLS: Record<CatalogProductPlaceholderKind, string> = {
  cola: `${PLACEHOLDER_BASE}/cola.webp`,
  lemon: `${PLACEHOLDER_BASE}/lemon-soda.webp`,
  water: `${PLACEHOLDER_BASE}/water.webp`,
  beer: `${PLACEHOLDER_BASE}/beer.webp`,
  juice: `${PLACEHOLDER_BASE}/juice.webp`,
  energy: `${PLACEHOLDER_BASE}/energy.webp`,
  wine: `${PLACEHOLDER_BASE}/wine.webp`,
  cafe: `${PLACEHOLDER_BASE}/cafe.webp`,
  drink: `${PLACEHOLDER_BASE}/drink.webp`,
  pizza: `${PLACEHOLDER_BASE}/pizza-lite.webp`,
  burger: `${PLACEHOLDER_BASE}/burger-lite.webp`,
  side: `${PLACEHOLDER_BASE}/side.webp`,
  dessert: `${PLACEHOLDER_BASE}/dessert.webp`,
  tapas: `${PLACEHOLDER_BASE}/tapas.webp`,
  kebab: `${PLACEHOLDER_BASE}/kebab.webp`,
  sushi: `${PLACEHOLDER_BASE}/sushi.webp`,
  combo: `${PLACEHOLDER_BASE}/combo.webp`,
  food: `${PLACEHOLDER_BASE}/food.webp`,
};

type PlaceholderRule = {
  kind: CatalogProductPlaceholderKind;
  patterns: string[];
};

const DRINK_PLACEHOLDER_RULES: PlaceholderRule[] = [
  { kind: 'cola', patterns: ['coca', 'cola', 'pepsi', 'refresco zero', 'zero cola'] },
  { kind: 'lemon', patterns: ['sprite', 'fanta', 'schweppes', 'tonica', 'tónica', 'seven up', 'limon', 'limón', 'naranja'] },
  { kind: 'water', patterns: ['agua', 'water'] },
  { kind: 'beer', patterns: ['cerveza', 'beer', 'mahou', 'estrella', 'heineken', 'corona', 'san miguel', 'cana', 'caña', 'clara'] },
  { kind: 'juice', patterns: ['zumo', 'juice', 'nestea', 'aquarius', 'ice tea', 'te helado', 'té helado'] },
  { kind: 'energy', patterns: ['red bull', 'monster', 'energetica', 'energética', 'burn'] },
  { kind: 'wine', patterns: ['vino', 'tinto', 'blanco', 'rosado', 'cava', 'sangria', 'sangría'] },
  {
    kind: 'cafe',
    patterns: [
      'cafe',
      'cappuccino',
      'capuchino',
      'latte',
      'espresso',
      'cortado',
      'americano',
      'macchiato',
      'manchado',
      'bombon',
      'infusion',
      'manzanilla',
      'chocolate caliente',
    ],
  },
];

const FOOD_PLACEHOLDER_RULES: PlaceholderRule[] = [
  { kind: 'pizza', patterns: ['pizza', 'calzone', 'mitad', 'half'] },
  { kind: 'burger', patterns: ['burger', 'hamburg', 'smash'] },
  { kind: 'kebab', patterns: ['kebab', 'doner', 'shawarma', 'durum'] },
  { kind: 'sushi', patterns: ['sushi', 'maki', 'nigiri', 'sashimi', 'uramaki', 'poke'] },
  {
    kind: 'tapas',
    patterns: [
      'bocata',
      'bocadillo',
      'sandwich',
      'baguette',
      'montadito',
      'tostada',
      'tapa',
      'tapas',
      'racion',
      'pincho',
      'pintxo',
      'croqueta',
      'bravas',
    ],
  },
  {
    kind: 'side',
    patterns: [
      'complement',
      'patata',
      'alita',
      'nugget',
      'aros',
      'ensalada',
      'entrante',
      'extra',
      'salsa',
      'bread',
      'side',
    ],
  },
  { kind: 'dessert', patterns: ['postre', 'dessert', 'tarta', 'helado', 'brownie', 'galleta', 'churro'] },
];

function foldPlaceholderText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function matchesPlaceholderRule(folded: string, rule: PlaceholderRule): boolean {
  return rule.patterns.some((pattern) => folded.includes(foldPlaceholderText(pattern)));
}

function matchRules(rules: PlaceholderRule[], folded: string): CatalogProductPlaceholderKind | null {
  for (const rule of rules) {
    if (matchesPlaceholderRule(folded, rule)) return rule.kind;
  }
  return null;
}

export type CatalogProductPlaceholderInput = Pick<
  CatalogItem,
  'name' | 'category' | 'stockCategory' | 'itemType'
>;

function looksLikeHotDrink(folded: string): boolean {
  // Té helado / ice tea → bebida fría (juice), no café.
  if (/te helado|ice tea|iced tea|nestea/.test(folded)) return false;
  return (
    /\bcafe\b/.test(folded)
    || folded.includes('cappuccino')
    || folded.includes('capuchino')
    || folded.includes('latte')
    || folded.includes('espresso')
    || folded.includes('cortado')
    || folded.includes('americano')
    || folded.includes('macchiato')
    || folded.includes('infusion')
    || folded.includes('manzanilla')
    || folded.includes('chocolate caliente')
    || /\bte\b/.test(folded)
  );
}

/** Foto genérica (sin marcas) según nombre/categoría del producto. */
export function resolveCatalogProductPlaceholderKind(
  item: CatalogProductPlaceholderInput,
): CatalogProductPlaceholderKind {
  const name = String(item.name || '').trim();
  const category = String(item.category || '').trim();
  const folded = foldPlaceholderText(`${name} ${category}`);

  if (item.itemType === 'combo' || isImportComboCategory(category)) return 'combo';

  // Café / té / infusiones: antes que comida genérica (p. ej. «Café con leche»).
  if (looksLikeHotDrink(folded) || /cafes|cafeteria|cafetería|infusiones/.test(folded)) {
    return matchRules(DRINK_PLACEHOLDER_RULES.filter((r) => r.kind === 'cafe'), folded) || 'cafe';
  }

  if (isDrinkCatalogProduct(item) || /bebida|refresco|cerveza|agua|zumo|cola/.test(folded)) {
    return matchRules(DRINK_PLACEHOLDER_RULES, folded) || 'drink';
  }

  const foodKind = matchRules(FOOD_PLACEHOLDER_RULES, folded);
  if (foodKind) return foodKind;

  if (/bebida|refresco|cerveza|agua|zumo|cola/.test(folded)) return 'drink';
  if (/combo|menu|menú/.test(folded)) return 'combo';

  return 'food';
}

export function resolveCatalogProductPlaceholderUrl(item: CatalogProductPlaceholderInput): string {
  return CATALOG_PRODUCT_PLACEHOLDER_URLS[resolveCatalogProductPlaceholderKind(item)];
}

/** Imagen del producto: URL propia o ilustración genérica incluida en Vertial. */
export function resolveCatalogProductImage(
  item: Pick<CatalogItem, 'name' | 'category' | 'stockCategory' | 'itemType' | 'image' | 'images'>,
): string {
  const explicit = String(item.image || item.images?.[0] || '').trim();
  if (explicit) return explicit;
  return resolveCatalogProductPlaceholderUrl(item);
}
