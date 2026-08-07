import type { CatalogItem } from './deliveryApi';
import { isDrinkCatalogProduct } from './vertialDefaultCosts';
import { isImportComboCategory } from './deliveryCatalogImportLogic';

export type CatalogProductPlaceholderKind =
  | 'cola'
  | 'lemon'
  | 'fantaLemon'
  | 'fantaLemon2l'
  | 'orange'
  | 'aquarius'
  | 'aquariusLemon'
  | 'water'
  | 'beer'
  | 'desperados'
  | 'cerdosVoladores'
  | 'juice'
  | 'energy'
  | 'wine'
  | 'wineRed'
  | 'cafe'
  | 'drink'
  | 'pizza'
  | 'carbonara'
  | 'bacon'
  | 'bbq'
  | 'burger'
  | 'side'
  | 'onionRings'
  | 'wings'
  | 'dessert'
  | 'brownie'
  | 'tapas'
  | 'kebab'
  | 'sushi'
  | 'combo'
  | 'food';

const PLACEHOLDER_BASE = '/catalog-placeholders/photos';

export const CATALOG_PRODUCT_PLACEHOLDER_URLS: Record<CatalogProductPlaceholderKind, string> = {
  cola: `${PLACEHOLDER_BASE}/cola.webp`,
  lemon: `${PLACEHOLDER_BASE}/lemon-soda.webp`,
  fantaLemon: `${PLACEHOLDER_BASE}/fanta-lemon-can.webp`,
  fantaLemon2l: `${PLACEHOLDER_BASE}/fanta-lemon-2l.webp`,
  orange: `${PLACEHOLDER_BASE}/orange-soda.webp`,
  aquarius: `${PLACEHOLDER_BASE}/aquarius.webp`,
  aquariusLemon: `${PLACEHOLDER_BASE}/aquarius-lemon-can.webp`,
  water: `${PLACEHOLDER_BASE}/water.webp`,
  beer: `${PLACEHOLDER_BASE}/beer.webp`,
  desperados: `${PLACEHOLDER_BASE}/desperados.webp`,
  cerdosVoladores: `${PLACEHOLDER_BASE}/cerdos-voladores.webp`,
  juice: `${PLACEHOLDER_BASE}/juice.webp`,
  energy: `${PLACEHOLDER_BASE}/energy.webp`,
  wine: `${PLACEHOLDER_BASE}/wine.webp`,
  wineRed: `${PLACEHOLDER_BASE}/wine-red.webp`,
  cafe: `${PLACEHOLDER_BASE}/cafe.webp`,
  drink: `${PLACEHOLDER_BASE}/drink.webp`,
  pizza: `${PLACEHOLDER_BASE}/pizza-lite.webp`,
  carbonara: `${PLACEHOLDER_BASE}/pizza-carbonara.webp`,
  bacon: `${PLACEHOLDER_BASE}/pizza-bacon.webp`,
  bbq: `${PLACEHOLDER_BASE}/pizza-bbq.webp`,
  burger: `${PLACEHOLDER_BASE}/burger-lite.webp`,
  side: `${PLACEHOLDER_BASE}/side.webp`,
  onionRings: `${PLACEHOLDER_BASE}/onion-rings.webp`,
  wings: `${PLACEHOLDER_BASE}/wings.webp`,
  dessert: `${PLACEHOLDER_BASE}/dessert.webp`,
  brownie: `${PLACEHOLDER_BASE}/brownie-helado.webp`,
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
  // Fanta Limón 2L antes que lata / limón genérico
  {
    kind: 'fantaLemon2l',
    patterns: [
      'fanta limon 2l',
      'fanta limón 2l',
      'fanta limon 2 l',
      'fanta limón 2 l',
      'fanta limon 2 litros',
      'fanta limón 2 litros',
      'fanta limon 2lt',
      'fanta limón 2lt',
    ],
  },
  // Fanta Limón lata / 33cl
  {
    kind: 'fantaLemon',
    patterns: ['fanta limon', 'fanta limón'],
  },
  // Aquarius Limón (lata) antes que limón genérico / Aquarius naranja
  {
    kind: 'aquariusLemon',
    patterns: ['aquarius limon', 'aquarius limón'],
  },
  // Limón genérico (Sprite, Schweppes limón, etc.) — no Aquarius
  {
    kind: 'lemon',
    patterns: [
      'sprite',
      'seven up',
      'schweppes limon',
      'schweppes limón',
      'tonica',
      'tónica',
      'limonada',
      'limón',
      'limon',
    ],
  },
  // Zumos antes de «naranja» genérico (evita Fanta/zumo cruzados)
  { kind: 'juice', patterns: ['zumo', 'juice', 'nestea', 'ice tea', 'te helado', 'té helado'] },
  // Aquarius naranja / genérico (isotónica) ≠ Fanta
  { kind: 'aquarius', patterns: ['aquarius naranja', 'aquarius'] },
  // Naranja / Fanta naranja
  {
    kind: 'orange',
    patterns: ['fanta naranja', 'fanta', 'schweppes naranja', 'naranja'],
  },
  { kind: 'water', patterns: ['agua', 'water'] },
  { kind: 'desperados', patterns: ['desperados', 'desperado'] },
  { kind: 'cerdosVoladores', patterns: ['cerdos voladores', 'cerdos voladore', 'cerdo volador'] },
  {
    kind: 'beer',
    patterns: [
      'cerveza',
      'beer',
      'mahou',
      'estrella',
      'heineken',
      'corona',
      'san miguel',
      'cana',
      'caña',
      'clara',
      'peroni',
      'voll damm',
      'voll-damm',
    ],
  },
  { kind: 'energy', patterns: ['red bull', 'monster', 'energetica', 'energética', 'burn'] },
  // Vino negro / tinto antes que blanco genérico
  {
    kind: 'wineRed',
    patterns: [
      'vino negro',
      'vino tinto',
      'nina barbuda',
      'lambrusco',
      'tinto',
      'negro',
    ],
  },
  {
    kind: 'wine',
    patterns: [
      'vino blanco',
      'vino rosado',
      'vino',
      'blanco',
      'rosado',
      'cava',
      'sangria',
      'sangría',
    ],
  },
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
  // Burger antes que «bacon» / «bbq» (Black BBQ burger ≠ pizza BBQ)
  { kind: 'burger', patterns: ['burger', 'hamburg', 'smash', 'crispy chicken', 'chicken burger'] },
  // Alitas antes que BBQ pizza
  {
    kind: 'wings',
    patterns: ['alitas', 'alita', 'wings', 'chicken wing', 'alas de pollo'],
  },
  // Pizzas concretas antes que pizza genérica
  { kind: 'carbonara', patterns: ['carbonara'] },
  { kind: 'bacon', patterns: ['bacon'] },
  { kind: 'bbq', patterns: ['bbq', 'barbacoa'] },
  { kind: 'pizza', patterns: ['pizza', 'calzone', 'mitad', 'half'] },
  { kind: 'kebab', patterns: ['kebab', 'doner', 'shawarma', 'durum'] },
  { kind: 'sushi', patterns: ['sushi', 'maki', 'nigiri', 'sashimi', 'uramaki', 'poke'] },
  {
    kind: 'onionRings',
    patterns: ['aros de cebolla', 'aros cebolla', 'onion ring', 'onion rings', 'aros'],
  },
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
      'nugget',
      'ensalada',
      'entrante',
      'extra',
      'salsa',
      'bread',
      'side',
    ],
  },
  { kind: 'brownie', patterns: ['brownie'] },
  { kind: 'dessert', patterns: ['postre', 'dessert', 'tarta', 'helado', 'galleta', 'churro'] },
];

function foldPlaceholderText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Patrones cortos que pisan comida si se buscan por substring (americana→cana, pepperoni→peroni). */
const WHOLE_WORD_PLACEHOLDER_PATTERNS = new Set([
  'cana',
  'caña',
  'clara',
  'peroni',
  'jarra',
  'burn',
  'cava', // evita «Porcavacca» → vino
]);

function matchesPlaceholderRule(folded: string, rule: PlaceholderRule): boolean {
  return rule.patterns.some((pattern) => {
    const p = foldPlaceholderText(pattern);
    if (!p) return false;
    if (WHOLE_WORD_PLACEHOLDER_PATTERNS.has(p)) {
      return new RegExp(`(?:^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(` ${folded} `);
    }
    return folded.includes(p);
  });
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

  // Comida clara (Burger / Pizza / …) antes que reglas de bebida: evita «Americana»→caña/cerveza.
  const looksLikeFoodCategory = /burger|hamburg|pizza|pizzeria|especialidad|complement|postre|tapa|kebab|sushi/.test(
    foldPlaceholderText(category),
  );
  if (looksLikeFoodCategory) {
    const foodFirst = matchRules(FOOD_PLACEHOLDER_RULES, folded);
    if (foodFirst) return foodFirst;
  }

  // Café / té / infusiones: antes que comida genérica (p. ej. «Café con leche»).
  if (looksLikeHotDrink(folded) || /cafes|cafeteria|cafetería|infusiones/.test(folded)) {
    return matchRules(DRINK_PLACEHOLDER_RULES.filter((r) => r.kind === 'cafe'), folded) || 'cafe';
  }

  // Vinos: categoría «Vinos» / nombre con vino (antes no entraban y caían en food.webp)
  if (
    isDrinkCatalogProduct(item) ||
    /bebida|refresco|cerveza|agua|zumo|cola|vino|wine|sangria|sangría|lambrusco/.test(folded) ||
    /(?:^|\s)cava(?:\s|$)/.test(` ${folded} `)
  ) {
    return matchRules(DRINK_PLACEHOLDER_RULES, folded) || 'drink';
  }

  const foodKind = matchRules(FOOD_PLACEHOLDER_RULES, folded);
  if (foodKind) return foodKind;

  if (/bebida|refresco|cerveza|agua|zumo|cola|vino|wine/.test(folded)) return 'drink';
  if (/combo|menu|menú/.test(folded)) return 'combo';

  return 'food';
}

export function resolveCatalogProductPlaceholderUrl(item: CatalogProductPlaceholderInput): string {
  return CATALOG_PRODUCT_PLACEHOLDER_URLS[resolveCatalogProductPlaceholderKind(item)];
}

/** Imagen del producto: URL propia (CDN) o ilustración genérica Vertial. */
export function resolveCatalogProductImage(
  item: Pick<CatalogItem, 'name' | 'category' | 'stockCategory' | 'itemType' | 'image' | 'images'>,
): string {
  const explicit = String(item.image || item.images?.[0] || '').trim();
  // Placeholders Vertial se recalculan siempre (evita beer.webp viejo en burgers).
  if (explicit && !explicit.includes('/catalog-placeholders/')) return explicit;
  return resolveCatalogProductPlaceholderUrl(item);
}
