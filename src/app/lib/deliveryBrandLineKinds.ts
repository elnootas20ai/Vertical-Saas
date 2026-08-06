/** Tipo de producto / negocio que define una línea en delivery. */
export type DeliveryBrandLineKindId =
  | 'prepared_meals'
  | 'pizza'
  | 'burger_fastfood'
  | 'tacos_mexican'
  | 'kebab'
  | 'tapas_bar'
  | 'sushi_asian'
  | 'cafe_bakery'
  | 'ice_cream'
  | 'drinks_desserts'
  | 'groceries'
  | 'mixed_restaurant'
  | 'other';

export type DeliveryBrandLinePreset = {
  id: DeliveryBrandLineKindId;
  label: string;
  hint: string;
  suggestedName: string;
  shortCode: string;
  primaryColor: string;
  description: string;
  /** Categorías habituales en catálogo para esta línea. */
  typicalCategories: string[];
};

const LINE_PHOTO_BASE = '/catalog-placeholders/photos';

/** Foto representativa por tipo de carta (selector de marca). */
export const DELIVERY_BRAND_LINE_PHOTOS: Record<DeliveryBrandLineKindId, string> = {
  prepared_meals: `${LINE_PHOTO_BASE}/combo.webp`,
  pizza: `${LINE_PHOTO_BASE}/pizza-lite.webp`,
  burger_fastfood: `${LINE_PHOTO_BASE}/burger-lite.webp`,
  tacos_mexican: `${LINE_PHOTO_BASE}/tapas.webp`,
  kebab: `${LINE_PHOTO_BASE}/kebab.webp`,
  tapas_bar: `${LINE_PHOTO_BASE}/tapas.webp`,
  sushi_asian: `${LINE_PHOTO_BASE}/sushi.webp`,
  cafe_bakery: `${LINE_PHOTO_BASE}/cafe.webp`,
  ice_cream: `${LINE_PHOTO_BASE}/dessert.webp`,
  drinks_desserts: `${LINE_PHOTO_BASE}/drink.webp`,
  groceries: `${LINE_PHOTO_BASE}/grocery.webp`,
  mixed_restaurant: `${LINE_PHOTO_BASE}/restaurant.webp`,
  other: `${LINE_PHOTO_BASE}/generic-brand.webp`,
};

/** Ocultos en el selector (siguen válidos en marcas ya creadas). */
export const DELIVERY_BRAND_LINE_PICKER_HIDDEN: DeliveryBrandLineKindId[] = [
  'drinks_desserts',
  'mixed_restaurant',
];

/** Pastel + icono (misma línea que tipos de centro en Ajustes → Tienda). */
export const DELIVERY_BRAND_LINE_ICON_BOX: Record<DeliveryBrandLineKindId, string> = {
  prepared_meals: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  pizza: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  burger_fastfood: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  tacos_mexican: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
  kebab: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  tapas_bar: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  sushi_asian: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  cafe_bakery: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ice_cream: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  drinks_desserts: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  groceries: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  mixed_restaurant: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
  other: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
};

export const DELIVERY_BRAND_LINE_PRESETS: DeliveryBrandLinePreset[] = [
  {
    id: 'prepared_meals',
    label: 'Comida preparada / menús',
    hint: 'Platos del día, menús, comida para llevar',
    suggestedName: 'Cocina',
    shortCode: 'COC',
    primaryColor: '#EA580C',
    description: 'Platos preparados, menús y raciones para sala, para llevar o recogida.',
    typicalCategories: ['Entrantes', 'Principales', 'Postres', 'Complementos'],
  },
  {
    id: 'pizza',
    label: 'Pizza',
    hint: 'Pizzería, bases, ingredientes',
    suggestedName: 'Pizza',
    shortCode: 'PIZ',
    primaryColor: '#DC2626',
    description: 'Pizzas, calzones y complementos de pizzería.',
    typicalCategories: ['Pizzas', 'Entrantes', 'Postres', 'Bebidas'],
  },
  {
    id: 'burger_fastfood',
    label: 'Burger / fast food',
    hint: 'Hamburguesas, bocadillos, fritos',
    suggestedName: 'Burger',
    shortCode: 'BUR',
    primaryColor: '#D97706',
    description: 'Hamburguesas, combos y complementos tipo fast food.',
    typicalCategories: ['Burgers', 'Complementos', 'Postres', 'Bebidas'],
  },
  {
    id: 'tacos_mexican',
    label: 'Tacos / mexicano',
    hint: 'Tacos, burritos, quesadillas, nachos',
    suggestedName: 'Tacos',
    shortCode: 'TAC',
    primaryColor: '#16A34A',
    description: 'Tacos, burritos, quesadillas y carta mexicana.',
    typicalCategories: ['Tacos', 'Complementos', 'Bebidas'],
  },
  {
    id: 'kebab',
    label: 'Kebab / döner',
    hint: 'Kebab, döner, wraps y complementos',
    suggestedName: 'Kebab',
    shortCode: 'KEB',
    primaryColor: '#B45309',
    description: 'Kebab, döner, wraps y complementos.',
    typicalCategories: ['Kebab', 'Complementos', 'Bebidas', 'Menús'],
  },
  {
    id: 'tapas_bar',
    label: 'Bar / tapas',
    hint: 'Tapas, raciones, cervecería',
    suggestedName: 'Bar',
    shortCode: 'BAR',
    primaryColor: '#7C2D12',
    description: 'Tapas, raciones y carta de bar.',
    typicalCategories: ['Tapas', 'Raciones', 'Bocadillos', 'Pinchos', 'Complementos', 'Bebidas'],
  },
  {
    id: 'sushi_asian',
    label: 'Sushi / asiático',
    hint: 'Rolls, bowls, wok',
    suggestedName: 'Sushi',
    shortCode: 'SUS',
    primaryColor: '#059669',
    description: 'Sushi, rolls, bowls y cocina asiática.',
    typicalCategories: ['Rolls', 'Bowls', 'Entrantes', 'Bebidas'],
  },
  {
    id: 'cafe_bakery',
    label: 'Cafetería / panadería',
    hint: 'Café, bollería, desayunos',
    suggestedName: 'Cafetería',
    shortCode: 'CAF',
    primaryColor: '#92400E',
    description: 'Café, bollería, desayunos y snacks.',
    typicalCategories: ['Café', 'Bollería', 'Desayunos', 'Bebidas'],
  },
  {
    id: 'ice_cream',
    label: 'Heladería',
    hint: 'Sabores, tarrinas, conos, batidos, encargos',
    suggestedName: 'Heladería',
    shortCode: 'HEL',
    primaryColor: '#DB2777',
    description: 'Sabores, tarrinas, conos, batidos, toppings y encargos.',
    typicalCategories: ['Sabores', 'Tarrinas', 'Conos', 'Batidos', 'Toppings', 'Encargos', 'Bebidas'],
  },
  {
    id: 'drinks_desserts',
    label: 'Bebidas y postres',
    hint: 'Línea solo de bebidas, helados, postres',
    suggestedName: 'Bebidas',
    shortCode: 'BEB',
    primaryColor: '#2563EB',
    description: 'Bebidas, postres y complementos sin plato principal.',
    typicalCategories: ['Bebidas', 'Postres', 'Complementos'],
  },
  {
    id: 'groceries',
    label: 'Ultramarinos / despensa',
    hint: 'Producto envasado, básicos',
    suggestedName: 'Despensa',
    shortCode: 'DES',
    primaryColor: '#4B5563',
    description: 'Productos de despensa y ultramarinos.',
    typicalCategories: ['Despensa', 'Frescos', 'Bebidas', 'Otros'],
  },
  {
    id: 'mixed_restaurant',
    label: 'Restaurante variado',
    hint: 'Carta mixta con varios tipos de plato',
    suggestedName: 'Restaurante',
    shortCode: 'RES',
    primaryColor: '#6366F1',
    description: 'Carta variada: entrantes, principales y postres.',
    typicalCategories: ['Entrantes', 'Principales', 'Postres', 'Bebidas', 'Complementos'],
  },
  {
    id: 'other',
    label: 'Otro',
    hint: 'Define tú el nombre y las categorías',
    suggestedName: '',
    shortCode: '',
    primaryColor: '#6366F1',
    description: '',
    typicalCategories: ['Principales', 'Bebidas', 'Complementos'],
  },
];

/** Presets visibles al crear/editar línea comercial. */
export const DELIVERY_BRAND_LINE_PRESETS_PICKER = DELIVERY_BRAND_LINE_PRESETS.filter(
  (p) => !DELIVERY_BRAND_LINE_PICKER_HIDDEN.includes(p.id),
);

export function getDeliveryBrandLinePreset(id: string | undefined | null): DeliveryBrandLinePreset | undefined {
  return DELIVERY_BRAND_LINE_PRESETS.find((p) => p.id === id);
}

export function deliveryBrandLineKindLabel(id: string | undefined | null): string {
  return getDeliveryBrandLinePreset(id)?.label ?? '';
}

/** Categorías globales (sin línea o bebidas/complementos). */
export const UNIVERSAL_CATALOG_CATEGORIES = ['Bebidas', 'Complementos', 'Postres', 'Extras', 'Otros'] as const;

type BrandCategorySource = { _id: string; catalogCategories?: string[] };

/** Sugerencias de categoría según líneas elegidas + las ya usadas en catálogo. */
export function catalogCategorySuggestions(
  brands: BrandCategorySource[],
  selectedBrandIds: string[],
  categoriesUsedInCatalog: string[],
): string[] {
  const out = new Set<string>();
  const relevant =
    selectedBrandIds.length > 0
      ? brands.filter((b) => selectedBrandIds.includes(b._id))
      : brands;
  for (const b of relevant) {
    for (const c of b.catalogCategories ?? []) {
      const t = String(c || '').trim();
      if (t) out.add(t);
    }
  }
  for (const c of categoriesUsedInCatalog) {
    const t = String(c || '').trim();
    if (t) out.add(t);
  }
  for (const u of UNIVERSAL_CATALOG_CATEGORIES) out.add(u);
  return [...out].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Primera categoría de la línea al seleccionar una sola marca. */
export function defaultCategoryForSingleBrand(
  brands: BrandCategorySource[],
  brandId: string,
): string {
  const b = brands.find((x) => x._id === brandId);
  return String(b?.catalogCategories?.[0] || '').trim();
}
