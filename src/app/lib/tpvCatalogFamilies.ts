/**
 * Familias TPV (pestaña superior) y subfamilias (franja inferior).
 * La categoría del Excel = subfamilia; aquí se resuelve a qué familia pertenece.
 * Sin nombres de negocio: solo taxonomía de carta.
 */

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u0300-\u036f]/g, '');
}

export type TpvFamilyKey = 'bebidas' | 'cafes' | 'postres' | 'complementos';

export type TpvFamilyDef = {
  key: TpvFamilyKey;
  label: string;
  /** Orden fijo de pestañas tras la(s) marca(s). */
  order: number;
};

/** Orden de pestañas de familia: Bebidas → Cafés → Postres → Complementos. */
export const TPV_FAMILY_DEFS: TpvFamilyDef[] = [
  { key: 'bebidas', label: 'Bebidas', order: 10 },
  { key: 'cafes', label: 'Cafés', order: 20 },
  { key: 'postres', label: 'Postres', order: 30 },
  { key: 'complementos', label: 'Complementos', order: 40 },
];

/**
 * Subfamilia canónica (valor de `categoria` en Excel) → familia superior.
 * Ampliar aquí = más tipos de carta, sin tocar UI.
 */
const SUBFAMILY_TO_FAMILY: Record<string, TpvFamilyKey> = {
  // Bebidas
  bebidas: 'bebidas',
  bebida: 'bebidas',
  refrescos: 'bebidas',
  refresco: 'bebidas',
  cervezas: 'bebidas',
  cerveza: 'bebidas',
  vinos: 'bebidas',
  vino: 'bebidas',
  cavas: 'bebidas',
  cava: 'bebidas',
  champan: 'bebidas',
  champagne: 'bebidas',
  whisky: 'bebidas',
  whiskey: 'bebidas',
  ron: 'bebidas',
  ginebra: 'bebidas',
  vodka: 'bebidas',
  licores: 'bebidas',
  licor: 'bebidas',
  combinados: 'bebidas',
  combinado: 'bebidas',
  zumos: 'bebidas',
  zumo: 'bebidas',
  aguas: 'bebidas',
  agua: 'bebidas',
  soft: 'bebidas',
  softs: 'bebidas',
  // Cafés
  cafes: 'cafes',
  cafe: 'cafes',
  cafesitos: 'cafes',
  infusions: 'cafes',
  infusion: 'cafes',
  te: 'cafes',
  tes: 'cafes',
  bolleria: 'cafes',
  desayunos: 'cafes',
  desayuno: 'cafes',
  // Postres
  postres: 'postres',
  postre: 'postres',
  helados: 'postres',
  helado: 'postres',
  dulces: 'postres',
  dulce: 'postres',
  // Complementos
  complementos: 'complementos',
  complemento: 'complementos',
  extras: 'complementos',
  extra: 'complementos',
  salsas: 'complementos',
  salsa: 'complementos',
  guarniciones: 'complementos',
  guarnicion: 'complementos',
};

/** Alias de import: conserva subfamilias (no las aplasta a «Bebidas»). */
export const TPV_SUBFAMILY_CANONICAL: Record<string, string> = {
  bebidas: 'Bebidas',
  bebida: 'Bebidas',
  refrescos: 'Refrescos',
  refresco: 'Refrescos',
  cervezas: 'Cervezas',
  cerveza: 'Cervezas',
  vinos: 'Vinos',
  vino: 'Vinos',
  cavas: 'Cavas',
  cava: 'Cava',
  champan: 'Champán',
  champagne: 'Champán',
  whisky: 'Whisky',
  whiskey: 'Whisky',
  ron: 'Ron',
  ginebra: 'Ginebra',
  vodka: 'Vodka',
  licores: 'Licores',
  licor: 'Licores',
  combinados: 'Combinados',
  combinado: 'Combinados',
  zumos: 'Zumos',
  zumo: 'Zumos',
  aguas: 'Aguas',
  agua: 'Aguas',
  cafes: 'Cafés',
  cafe: 'Café',
  infusions: 'Infusiones',
  infusion: 'Infusiones',
  bolleria: 'Bollería',
  desayunos: 'Desayunos',
  desayuno: 'Desayunos',
  postres: 'Postres',
  postre: 'Postres',
  helados: 'Helados',
  helado: 'Helados',
  complementos: 'Complementos',
  complemento: 'Complementos',
  extras: 'Extras',
  salsas: 'Salsas',
  salsa: 'Salsas',
};

export function resolveTpvFamilyKey(category: string): TpvFamilyKey | null {
  const key = foldKey(category);
  if (!key) return null;
  const direct = SUBFAMILY_TO_FAMILY[key];
  if (direct) return direct;
  // Heurística ligera por raíz (sin listar cada marca de bebida)
  if (/cerveza/.test(key)) return 'bebidas';
  if (/^vino|lambrusco|cava|champan|champagne/.test(key)) return 'bebidas';
  if (/whisky|whiskey|licor|combinado|refresco|zumo|^agua/.test(key)) return 'bebidas';
  if (/cafe|infusion|^te$|bolleria|desayuno/.test(key)) return 'cafes';
  if (/postre|helado|dulce/.test(key)) return 'postres';
  if (/complement|extra|salsa|guarnicion|side/.test(key)) return 'complementos';
  return null;
}

export function tpvFamilyLabel(familyKey: TpvFamilyKey): string {
  return TPV_FAMILY_DEFS.find((f) => f.key === familyKey)?.label || familyKey;
}

/** Categoría de comida de marca (Tapas, Raciones…): no es familia superior. */
export function isBrandFoodCategory(category: string): boolean {
  return resolveTpvFamilyKey(category) == null && Boolean(String(category || '').trim());
}

/**
 * Normaliza categoría de Excel en modo carta con subfamilias:
 * «cerveza» → «Cervezas», no → «Bebidas».
 */
export function normalizeSubfamilyCategory(value: string): string | null {
  const key = foldKey(value);
  if (!key) return null;
  return TPV_SUBFAMILY_CANONICAL[key] || null;
}
