/**
 * Presets Vertial de escandallo aproximado para bar / tapas / cervecería.
 * Se aplican al importar catálogo (Excel) o al generar costes automáticos.
 * Costes orientativos (€) — el usuario puede ajustarlos en Escandallos.
 */

export type BarCategoryEscandalloPreset = {
  /** Patrones de categoría (foldName). */
  categoryPatterns: string[];
  /** Coste fijo aproximado si no hay ingredientes/receta. */
  fixedCost: number;
  /** Ingredientes por defecto para escandallo (columna Excel vacía). */
  defaultIngredients: string[];
  /** Usar reglas de cantidad tipo bocadillo. */
  bocataStyle?: boolean;
};

export type BarNameCostHint = {
  patterns: string[];
  fixedCost?: number;
  ingredients?: string[];
};

function foldBarKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function matchesPatterns(folded: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const key = foldBarKey(p);
    return folded.includes(key) || key.includes(folded);
  });
}

/** Categorías típicas de bar/restaurante con coste e ingredientes base. */
export const BAR_CATEGORY_ESCANDALLO_PRESETS: BarCategoryEscandalloPreset[] = [
  {
    categoryPatterns: ['bebidas', 'bebida', 'cervezas', 'vinos', 'combinados'],
    fixedCost: 0.55,
    defaultIngredients: [],
  },
  {
    categoryPatterns: ['complementos', 'complemento', 'guarnicion', 'guarniciones', 'extras'],
    fixedCost: 1.15,
    defaultIngredients: ['Patata', 'Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['tapas', 'tapa', 'para picar', 'picoteo'],
    fixedCost: 2.2,
    defaultIngredients: ['Aceite de oliva', 'Sal', 'Pan'],
  },
  {
    categoryPatterns: ['raciones', 'racion'],
    fixedCost: 3.5,
    defaultIngredients: ['Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['pinchos', 'pincho'],
    fixedCost: 2.0,
    defaultIngredients: ['Pan', 'Aceite de oliva'],
  },
  {
    categoryPatterns: ['montaditos', 'montadito'],
    fixedCost: 2.5,
    defaultIngredients: ['Pan', 'Tomate', 'Aceite de oliva'],
  },
  {
    categoryPatterns: ['bocadillos', 'bocadillo', 'bocatas', 'bocata', 'sandwiches', 'sandwich'],
    fixedCost: 2.4,
    defaultIngredients: ['Pan barra', 'Tomate', 'Aceite de oliva', 'Jamón serrano'],
    bocataStyle: true,
  },
  {
    categoryPatterns: ['postres', 'postre', 'dulces'],
    fixedCost: 1.2,
    defaultIngredients: [],
  },
  {
    categoryPatterns: ['cafe', 'café', 'cafes', 'cafés', 'desayunos', 'bolleria', 'bollería'],
    fixedCost: 0.35,
    defaultIngredients: ['Café', 'Leche'],
  },
  {
    categoryPatterns: ['entrantes', 'entrante'],
    fixedCost: 1.5,
    defaultIngredients: ['Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['principales', 'principal', 'platos', 'plato', 'cocina', 'carta'],
    fixedCost: 4.2,
    defaultIngredients: ['Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['ensaladas', 'ensalada', 'ensaladilla'],
    fixedCost: 2.4,
    defaultIngredients: ['Lechuga', 'Tomate', 'Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['carnes', 'carne', 'parrilla', 'asados', 'asado'],
    fixedCost: 5.5,
    defaultIngredients: ['Carne', 'Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['pescados', 'pescado', 'mariscos', 'marisco'],
    fixedCost: 5.2,
    defaultIngredients: ['Pescado', 'Aceite de oliva', 'Limón', 'Sal'],
  },
  {
    categoryPatterns: ['arroces', 'arroz', 'paellas', 'paella'],
    fixedCost: 4.8,
    defaultIngredients: ['Arroz', 'Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['pastas', 'pasta', 'italiana'],
    fixedCost: 3.6,
    defaultIngredients: ['Pasta', 'Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['hamburguesas', 'hamburguesa', 'burgers', 'burger'],
    fixedCost: 2.6,
    defaultIngredients: ['Pan brioche', 'Carne burger', 'Lechuga', 'Tomate'],
  },
  {
    categoryPatterns: ['menus', 'menús', 'menu', 'menú'],
    fixedCost: 5.5,
    defaultIngredients: ['Aceite de oliva', 'Sal'],
  },
  {
    categoryPatterns: ['sopas', 'sopa', 'cremas', 'crema', 'guisos', 'guiso'],
    fixedCost: 2.8,
    defaultIngredients: ['Aceite de oliva', 'Sal'],
  },
];

/** Ajuste fino por nombre de producto (dentro de la categoría). */
export const BAR_NAME_COST_HINTS: BarNameCostHint[] = [
  { patterns: ['caña', 'cana', 'tubo', 'corto'], fixedCost: 0.35 },
  { patterns: ['clara', 'lemon', 'radler'], fixedCost: 0.45 },
  { patterns: ['jarra', 'litro', 'tercio'], fixedCost: 1.05 },
  { patterns: ['botella vino', 'vino tinto', 'vino blanco', 'copa vino'], fixedCost: 1.2 },
  { patterns: ['cubata', 'combinado', 'gintonic', 'gin tonic', 'mojito'], fixedCost: 0.85 },
  { patterns: ['agua'], fixedCost: 0.22 },
  { patterns: ['refresco', 'coca', 'pepsi', 'fanta', 'nestea'], fixedCost: 0.65 },
  { patterns: ['red bull', 'monster', 'energetica', 'energética'], fixedCost: 0.85 },
  { patterns: ['cafe solo', 'café solo', 'espresso', 'expresso'], fixedCost: 0.12, ingredients: ['Café'] },
  { patterns: ['cafe con leche', 'café con leche', 'capuccino', 'cappuccino', 'latte'], fixedCost: 0.28, ingredients: ['Café', 'Leche'] },
  { patterns: ['croissant', 'napolitana', 'bolleria', 'bollería'], fixedCost: 0.45, ingredients: ['Harina', 'Mantequilla'] },
  { patterns: ['patatas bravas', 'bravas'], fixedCost: 1.8, ingredients: ['Patata', 'Aceite de oliva', 'Pimentón', 'Alioli'] },
  { patterns: ['patatas fritas', 'fritas'], fixedCost: 1.15, ingredients: ['Patata', 'Aceite de oliva', 'Sal'] },
  { patterns: ['aceitunas', 'aceituna', 'olivas'], fixedCost: 0.65, ingredients: ['Aceituna', 'Aceite de oliva'] },
  { patterns: ['croquetas', 'croqueta'], fixedCost: 1.8, ingredients: ['Bechamel', 'Pan rallado', 'Aceite de oliva'] },
  { patterns: ['tortilla', 'tortilla de patata'], fixedCost: 2.0, ingredients: ['Patata', 'Huevo', 'Aceite de oliva', 'Cebolla'] },
  { patterns: ['calamares', 'calamar'], fixedCost: 2.4, ingredients: ['Calamar', 'Harina', 'Aceite de oliva', 'Limón'] },
  { patterns: ['pulpo', 'pulpo a la gallega'], fixedCost: 3.8, ingredients: ['Pulpo', 'Aceite de oliva', 'Pimentón', 'Sal'] },
  { patterns: ['jamon iberico', 'jamón ibérico', 'jamon serrano', 'jamón serrano'], fixedCost: 3.2, ingredients: ['Jamón ibérico', 'Pan'] },
  { patterns: ['queso manchego', 'tabla de queso'], fixedCost: 2.8, ingredients: ['Queso manchego', 'Pan'] },
  { patterns: ['bocadillo de calamares', 'bocata calamares'], fixedCost: 2.6, ingredients: ['Pan barra', 'Calamar', 'Alioli', 'Limón'] },
  { patterns: ['bocadillo de lomo', 'bocata lomo', 'lomo con queso'], fixedCost: 2.5, ingredients: ['Pan barra', 'Lomo', 'Queso', 'Tomate'] },
  { patterns: ['bocadillo mixto', 'bocata mixta', 'mixto'], fixedCost: 2.2, ingredients: ['Pan barra', 'Jamón serrano', 'Queso', 'Tomate'] },
  { patterns: ['bocadillo de atun', 'bocadillo de atún', 'bocata atun'], fixedCost: 2.0, ingredients: ['Pan barra', 'Atún', 'Tomate', 'Mayonesa'] },
  { patterns: ['pincho moruno', 'pincho'], fixedCost: 1.9, ingredients: ['Carne pincho', 'Aceite de oliva', 'Pimentón'] },
  { patterns: ['alitas', 'wings'], fixedCost: 2.2, ingredients: ['Pollo', 'Aceite de oliva', 'Salsa'] },
  { patterns: ['tarta', 'helado', 'postre'], fixedCost: 1.2 },
];

/** Ingredientes base que se crean en almacén al importar carta de bar. */
export const BAR_ESCANDALLO_BASE_INGREDIENTS: string[] = [
  'Pan barra',
  'Pan',
  'Aceite de oliva',
  'Sal',
  'Tomate',
  'Jamón serrano',
  'Jamón ibérico',
  'Queso manchego',
  'Patata',
  'Pimentón',
  'Alioli',
  'Huevo',
  'Cebolla',
  'Calamar',
  'Pulpo',
  'Aceituna',
  'Café',
  'Leche',
  'Harina',
  'Mantequilla',
  'Bechamel',
  'Pan rallado',
  'Limón',
  'Atún',
  'Lomo',
  'Pollo',
  'Carne pincho',
  'Lechuga',
  'Carne',
  'Pescado',
  'Arroz',
  'Pasta',
  'Pan brioche',
  'Carne burger',
  'Queso',
  'Mayonesa',
  'Salsa',
];

/** Reglas de cantidad para bocadillos / bocatas. */
export const BOCATA_QUANTITY_RULES: Array<{ patterns: string[]; quantity: number; unit: string }> = [
  { patterns: ['pan', 'barra', 'baguette'], quantity: 1, unit: 'ud' },
  { patterns: ['jamon', 'jamón', 'serrano', 'iberico', 'ibérico'], quantity: 0.04, unit: 'kg' },
  { patterns: ['lomo', 'ternera', 'cerdo'], quantity: 0.06, unit: 'kg' },
  { patterns: ['queso', 'manchego', 'loncha'], quantity: 0.025, unit: 'kg' },
  { patterns: ['tomate'], quantity: 0.03, unit: 'kg' },
  { patterns: ['atun', 'atún'], quantity: 0.05, unit: 'kg' },
  { patterns: ['calamar'], quantity: 0.08, unit: 'kg' },
  { patterns: ['aceite', 'oliva'], quantity: 0.01, unit: 'kg' },
  { patterns: ['mayonesa', 'alioli', 'salsa'], quantity: 0.02, unit: 'kg' },
  { patterns: ['lechuga', 'cebolla'], quantity: 0.02, unit: 'kg' },
  { patterns: ['huevo'], quantity: 1, unit: 'ud' },
  { patterns: ['tortilla'], quantity: 0.12, unit: 'kg' },
];

export function matchBarCategoryPreset(category: string): BarCategoryEscandalloPreset | null {
  const cat = foldBarKey(category);
  if (!cat) return null;
  for (const preset of BAR_CATEGORY_ESCANDALLO_PRESETS) {
    if (matchesPatterns(cat, preset.categoryPatterns)) return preset;
  }
  return null;
}

export function matchBarNameHint(name: string): BarNameCostHint | null {
  const folded = foldBarKey(name);
  if (!folded) return null;
  for (const hint of BAR_NAME_COST_HINTS) {
    if (matchesPatterns(folded, hint.patterns)) return hint;
  }
  return null;
}

export function isBarEscandalloCategory(category: string): boolean {
  return matchBarCategoryPreset(category) != null;
}

export function isBarBocataCategory(category: string): boolean {
  const preset = matchBarCategoryPreset(category);
  return Boolean(preset?.bocataStyle);
}

/** Cantidad/unidad típica de un ingrediente en bocadillo (para ficha e import). */
export function resolveBocataIngredientQuantity(
  ingredientName: string,
): { quantity: number; unit: string } | null {
  const folded = foldBarKey(ingredientName);
  if (!folded) return null;
  for (const rule of BOCATA_QUANTITY_RULES) {
    if (matchesPatterns(folded, rule.patterns)) {
      return { quantity: rule.quantity, unit: rule.unit };
    }
  }
  return null;
}

/** Coste fijo aproximado según categoría + nombre (bar). */
export function resolveBarEscandalloFixedCost(
  category: string,
  productName = '',
): number | null {
  const nameHint = matchBarNameHint(productName);
  if (nameHint?.fixedCost != null) return nameHint.fixedCost;
  const catPreset = matchBarCategoryPreset(category);
  if (catPreset) return catPreset.fixedCost;
  return null;
}

/** Ingredientes por defecto si el Excel no trae columna ingredientes. */
export function resolveBarEscandalloDefaultIngredients(
  category: string,
  productName = '',
): string[] {
  const nameHint = matchBarNameHint(productName);
  if (nameHint?.ingredients?.length) return [...nameHint.ingredients];
  const catPreset = matchBarCategoryPreset(category);
  if (catPreset?.defaultIngredients.length) return [...catPreset.defaultIngredients];
  return [];
}

export function shouldUseBarEscandalloPresets(
  lineKind: string | undefined | null,
  category: string,
): boolean {
  const kind = String(lineKind || '').trim();
  if (
    kind === 'tapas_bar' ||
    kind === 'cafe_bakery' ||
    kind === 'mixed_restaurant' ||
    kind === 'prepared_meals'
  ) {
    return true;
  }
  return isBarEscandalloCategory(category);
}

/** Coste fijo aprox. por % del PVP cuando no hay preset de categoría (carta bar/restaurante). */
export function resolveBarEscandalloApproxFromSalePrice(unitPrice: number): number | null {
  const sale = Number(unitPrice) || 0;
  if (!(sale > 0)) return null;
  // Orientativo ~30% food cost, con suelo/techo razonables.
  const approx = Math.min(Math.max(sale * 0.3, 0.9), sale * 0.42);
  return Math.round(approx * 100) / 100;
}
