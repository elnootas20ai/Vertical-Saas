import * as XLSX from 'xlsx';
import type { ImportFieldDef } from '../components/saas/GenericImportModal';
import { normalizeImportHeader } from './importHeaderMapping';
import { getDeliveryBrandLinePreset, UNIVERSAL_CATALOG_CATEGORIES } from './deliveryBrandLineKinds';
import {
  normalizeImportCategory,
  organizerBrandsForCatalogTemplate,
  readImportLineText,
  resolveCommercialLineIdsFromText,
  allCommercialLineBrands,
  shouldClearBrandForCategory,
  isImportComboCategory,
  isWarehouseImportCategory,
  formatUnmatchedImportLineRowWarning,
  MISSING_BRAND_IMPORT_CODE,
  type ImportBrandLike,
} from './deliveryCatalogImportLogic';
import {
  downloadEventsTpvCatalogImportTemplate,
  EVENTS_TPV_CATALOG_IMPORT_FIELDS,
  EVENTS_TPV_CATALOG_TEMPLATE_FILENAME,
  EVENTS_TPV_CATALOG_HEADER_ALIASES,
} from './eventsTpvCatalogExcelTemplate';
import { isEventsBusinessType } from './deliveryOpsTypes';

/** Columnas oficiales del Excel → claves internas (mapeo automático sin errores). */
export const DELIVERY_CATALOG_IMPORT_COLUMNS = [
  'name',
  'sku',
  'category',
  'linea',
  'price',
  'ingredients',
  'description',
] as const;

export const DELIVERY_CATALOG_CORE_COLUMNS = DELIVERY_CATALOG_IMPORT_COLUMNS;

/** Opcionales: van en la plantilla para que se vean; el import las usa si vienen rellenas. */
export const DELIVERY_CATALOG_OPTIONAL_COLUMNS = [
  'tipo_menu',
  'taxRate',
  'allergens',
  'formato',
  'stock',
  'minStock',
  'unit',
] as const;

export const DELIVERY_CATALOG_IMPORT_LABELS: Record<
  (typeof DELIVERY_CATALOG_IMPORT_COLUMNS)[number] | (typeof DELIVERY_CATALOG_OPTIONAL_COLUMNS)[number],
  string
> = {
  name: 'nombre',
  sku: 'codigo',
  category: 'categoria',
  linea: 'linea',
  price: 'precio',
  ingredients: 'ingredientes',
  description: 'descripcion',
  tipo_menu: 'tipo_menu',
  taxRate: 'iva',
  allergens: 'alergenos',
  formato: 'formato',
  stock: 'stock',
  minStock: 'stock_minimo',
  unit: 'unidad',
};

/** Cabeceras exactas de la hoja «catalogo» (core + opcionales). No renombrar. */
export const DELIVERY_CATALOG_TEMPLATE_HEADERS = [
  ...DELIVERY_CATALOG_IMPORT_COLUMNS.map((key) => DELIVERY_CATALOG_IMPORT_LABELS[key]),
  ...DELIVERY_CATALOG_OPTIONAL_COLUMNS.map((key) => DELIVERY_CATALOG_IMPORT_LABELS[key]),
];

/** Versión de la plantilla (solo cambiar si hay migración acordada). */
export const DELIVERY_CATALOG_TEMPLATE_VERSION = 5;

export const DELIVERY_CATALOG_TEMPLATE_FILENAME = 'plantilla_catalogo_tpv.xlsx';
export const HELADERIA_CATALOG_TEMPLATE_FILENAME = 'plantilla_catalogo_heladeria.xlsx';
export const RESTAURANT_CATALOG_TEMPLATE_FILENAME = 'plantilla_catalogo_bar_restaurante.xlsx';

/** Filas vacías en «catalogo» (fila 2 en adelante). No se importan si están vacías. Si hacen falta más, se insertan filas en Excel. */
export const DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS = 100;

export type CatalogTemplateVertical = 'delivery' | 'restaurant' | 'iceCreamShop' | 'events';

/** Categorías TPV típicas de heladería (hoja referencia / valores válidos). */
export const HELADERIA_CATALOG_CATEGORIES = [
  'Sabores',
  'Tarrinas',
  'Conos',
  'Batidos',
  'Toppings',
  'Encargos',
  'Bebidas',
  'Complementos',
  'Postres',
  'Combos',
] as const;

/** Categorías TPV típicas de bar/restaurante (sin carta delivery Pizzas/Burgers). */
export const RESTAURANT_CATALOG_CATEGORIES = [
  'Tapas',
  'Raciones',
  'Bocadillos',
  'Pinchos',
  'Entrantes',
  'Principales',
  'Complementos',
  'Bebidas',
  'Postres',
  'Combos',
] as const;

/** Categorías de almacén en la plantilla bar (no van al TPV). */
export const RESTAURANT_WAREHOUSE_CATEGORIES = ['Envases', 'Limpieza', 'Varios'] as const;

/** @deprecated Incluidas en DELIVERY_CATALOG_OPTIONAL_COLUMNS / plantilla v5. */
export const HELADERIA_CATALOG_EXTRA_HEADERS = ['alergenos', 'formato'] as const;

const CATALOG_OPTIONAL_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'tipo_menu', label: 'tipo_menu', example: 'estandar' },
  { key: 'taxRate', label: 'iva', example: '10' },
  { key: 'allergens', label: 'alergenos', example: 'leche, gluten' },
  { key: 'formato', label: 'formato', example: '2 bolas / 500ml' },
  { key: 'stock', label: 'stock', example: '20' },
  { key: 'minStock', label: 'stock_minimo', example: '5' },
  { key: 'unit', label: 'unidad', example: 'ud' },
];

export const DELIVERY_CATALOG_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'nombre', required: true, example: 'Pizza Margarita' },
  { key: 'sku', label: 'codigo', example: 'PIZ-001' },
  { key: 'category', label: 'categoria', required: true, example: 'Pizzas' },
  { key: 'linea', label: 'linea', example: 'modomio' },
  { key: 'price', label: 'precio', required: true, example: '9.50' },
  { key: 'ingredients', label: 'ingredientes', example: 'Tomate, Mozzarella, Albahaca' },
  { key: 'description', label: 'descripcion', example: '' },
  ...CATALOG_OPTIONAL_IMPORT_FIELDS,
];

export const HELADERIA_CATALOG_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'nombre', required: true, example: 'Vainilla Madagascar' },
  { key: 'sku', label: 'codigo', example: 'HEL-VAI-01' },
  { key: 'category', label: 'categoria', required: true, example: 'Sabores' },
  { key: 'linea', label: 'linea', example: 'Heladería' },
  { key: 'price', label: 'precio', required: true, example: '2.80' },
  { key: 'ingredients', label: 'ingredientes', example: 'Leche, nata, vainilla' },
  { key: 'description', label: 'descripcion', example: 'Helado artesano' },
  ...CATALOG_OPTIONAL_IMPORT_FIELDS.map((f) =>
    f.key === 'allergens'
      ? { ...f, example: 'leche' }
      : f.key === 'formato'
        ? { ...f, example: 'bola / tarrina 500ml' }
        : f,
  ),
];

/** Campos del modal de import — bar/restaurante (sin ejemplos delivery ni locales concretos). */
export const RESTAURANT_CATALOG_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'nombre', required: true, example: 'Patatas bravas' },
  { key: 'sku', label: 'codigo', example: 'TAP-001' },
  { key: 'category', label: 'categoria', required: true, example: 'Tapas' },
  { key: 'linea', label: 'linea', example: 'Tu marca' },
  { key: 'price', label: 'precio', required: true, example: '4.50' },
  { key: 'ingredients', label: 'ingredientes', example: 'Patata, Aceite, Pimentón' },
  { key: 'description', label: 'descripcion', example: '' },
  ...CATALOG_OPTIONAL_IMPORT_FIELDS.map((f) =>
    f.key === 'allergens' ? { ...f, example: 'gluten' } : f,
  ),
];

/** Sinónimos de cabecera para auto-mapeo (plantilla oficial + exportaciones habituales). */
export const DELIVERY_CATALOG_HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'producto', 'product', 'articulo', 'nombre producto', 'product name', 'sabor'],
  sku: ['codigo', 'codigo producto', 'id producto', 'sku', 'codigo sku', 'ref', 'referencia', 'cod'],
  category: ['categoria', 'category', 'seccion', 'familia', 'tipo', 'categoria tpv', 'grupo', 'departamento'],
  linea: ['linea', 'line', 'marca', 'organizador', 'linea comercial', 'linea tpv', 'brand line'],
  price: ['precio', 'price', 'pvp', 'precio venta', 'unit price', 'precio unitario'],
  ingredients: ['ingredientes', 'ingredients', 'ingrediente', 'receta', 'componentes'],
  description: ['descripcion', 'description', 'desc', 'notas', 'observaciones'],
  tipo_menu: ['tipo_menu', 'tipo menu', 'tipo menú', 'menu', 'menú', 'tamano menu', 'tamaño menú', 'combo tipo'],
  taxRate: ['iva', 'tax', 'taxrate', 'vat', 'impuesto', 'tipo iva', '% iva'],
  allergens: ['alergenos', 'alérgenos', 'allergens', 'alergeno', 'alérgeno', 'alergias'],
  formato: ['formato', 'format', 'tamano', 'tamaño', 'size', 'presentacion', 'presentación'],
  stock: ['stock', 'stock_actual', 'stock actual', 'cantidad', 'existencia', 'qty', 'quantity'],
  minStock: ['stock_minimo', 'stock minimo', 'min_stock', 'minstock', 'stock min', 'minimo'],
  unit: ['unidad', 'unit', 'ud', 'uom', 'medida'],
  costPrice: ['coste', 'coste_escandallo', 'costprice', 'cost price', 'coste unitario', 'precio coste'],
  mermaPct: ['merma_pct', 'merma', 'merma %', '% merma', 'merma%', 'waste', 'waste_pct'],
};

export type DeliveryCatalogImportIssue = {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  /** p. ej. missing_brand — permite agrupar avisos en el informe. */
  code?: string;
  /** Valor asociado al aviso (p. ej. nombre de marca no encontrada). */
  value?: string;
};

export type DeliveryCatalogImportValidation = {
  ok: boolean;
  issues: DeliveryCatalogImportIssue[];
};

const CATEGORY_PRODUCT_EXAMPLES: Record<string, string> = {
  Pizzas: 'Pizza Margarita',
  Entrantes: 'Bruschetta',
  Principales: 'Plato del día',
  Rolls: 'California Roll',
  Bowls: 'Poke Bowl salmón',
  Burgers: 'Hamburguesa clásica',
  Hamburguesas: 'Hamburguesa clásica',
  Complementos: 'Patatas fritas',
  Bebidas: 'Coca-Cola 33cl',
  Postres: 'Tiramisú',
  Combos: 'Menú Estándar',
  Extras: 'Extra queso',
  Otros: 'Producto varios',
  Tapas: 'Patatas bravas',
  Raciones: 'Jamón ibérico',
  Pinchos: 'Pincho moruno',
  Montaditos: 'Montadito de lomo',
  Kebab: 'Döner kebab',
  Bocadillos: 'Bocadillo mixto',
  Cafés: 'Café con leche',
  Bollería: 'Croissant',
  Sabores: 'Vainilla Madagascar',
  Tarrinas: 'Tarrina 500 ml chocolate',
  Conos: 'Cono 2 bolas',
  Batidos: 'Batido de fresa',
  Toppings: 'Salsa de chocolate',
  Encargos: 'Tarta helada 8 raciones',
};

export function isHeladeriaCatalogVertical(vertical?: string | null): boolean {
  return String(vertical || '').trim() === 'iceCreamShop';
}

export function isRestaurantCatalogVertical(vertical?: string | null): boolean {
  return String(vertical || '').trim() === 'restaurant';
}

export function isEventsCatalogVertical(vertical?: string | null): boolean {
  return isEventsBusinessType(vertical);
}

export function catalogTemplateFilenameForVertical(vertical?: string | null): string {
  if (isEventsCatalogVertical(vertical)) return EVENTS_TPV_CATALOG_TEMPLATE_FILENAME;
  if (isHeladeriaCatalogVertical(vertical)) return HELADERIA_CATALOG_TEMPLATE_FILENAME;
  if (isRestaurantCatalogVertical(vertical)) return RESTAURANT_CATALOG_TEMPLATE_FILENAME;
  return DELIVERY_CATALOG_TEMPLATE_FILENAME;
}

export function catalogImportFieldsForVertical(vertical?: string | null): ImportFieldDef[] {
  if (isEventsCatalogVertical(vertical)) return EVENTS_TPV_CATALOG_IMPORT_FIELDS;
  if (isHeladeriaCatalogVertical(vertical)) return HELADERIA_CATALOG_IMPORT_FIELDS;
  if (isRestaurantCatalogVertical(vertical)) return RESTAURANT_CATALOG_IMPORT_FIELDS;
  return DELIVERY_CATALOG_IMPORT_FIELDS;
}

export function catalogHeaderAliasesForVertical(vertical?: string | null): Record<string, string[]> {
  if (isEventsCatalogVertical(vertical)) {
    return {
      ...DELIVERY_CATALOG_HEADER_ALIASES,
      ...EVENTS_TPV_CATALOG_HEADER_ALIASES,
    };
  }
  return DELIVERY_CATALOG_HEADER_ALIASES;
}

export function catalogTemplateHeadersForVertical(_vertical?: string | null): string[] {
  // Misma plantilla para todas las verticales: core + opcionales visibles.
  return [...DELIVERY_CATALOG_TEMPLATE_HEADERS];
}

/** Rellena celdas vacías hasta el nº de columnas de la plantilla. */
export function padCatalogTemplateRow(cells: Array<string | number | null | undefined>, vertical?: string | null): string[] {
  const n = catalogTemplateHeadersForVertical(vertical).length;
  const out = cells.map((c) => (c == null ? '' : String(c)));
  while (out.length < n) out.push('');
  return out.slice(0, n);
}

/** Categorías TPV de una línea (las de la marca o las típicas del tipo de negocio). */
export function lineCategoriesForCatalogTemplate(
  brand: ImportBrandLike,
  vertical?: string | null,
): string[] {
  const fromBrand = (brand.catalogCategories ?? [])
    .map((c) => normalizeImportCategory(String(c || '')))
    .filter((c) => c && !shouldClearBrandForCategory(c));
  if (fromBrand.length > 0) {
    const cats = [...new Set(fromBrand)];
    if (!cats.some((c) => c === 'Combos')) cats.push('Combos');
    return cats;
  }

  if (isHeladeriaCatalogVertical(vertical)) {
    return [...HELADERIA_CATALOG_CATEGORIES];
  }

  const kind = String(brand.deliveryLineKind || '').trim();
  const preset = getDeliveryBrandLinePreset(kind);
  const fromPreset = (preset?.typicalCategories ?? [])
    .map((c) => normalizeImportCategory(c))
    .filter((c) => c && !shouldClearBrandForCategory(c));

  // Bar/restaurante: no inventar Pizzas/Burgers si la marca no trae categorías.
  // Solo usar preset delivery (pizza/burger/…) si el tipo de línea es explícito.
  if (isRestaurantCatalogVertical(vertical)) {
    if (fromPreset.length > 0 && kind && kind !== 'mixed_restaurant') {
      return [...fromPreset, 'Combos'];
    }
    const tapas = getDeliveryBrandLinePreset('tapas_bar');
    const fromTapas = (tapas?.typicalCategories ?? [])
      .map((c) => normalizeImportCategory(c))
      .filter((c) => c && !shouldClearBrandForCategory(c));
    if (fromTapas.length > 0) return [...fromTapas, 'Combos'];
    return [...RESTAURANT_CATALOG_CATEGORIES];
  }

  if (fromPreset.length > 0) return [...fromPreset, 'Combos'];

  return ['Principales', 'Entrantes', 'Combos'];
}

function skuPrefixForLine(brand: ImportBrandLike): string {
  const code = String((brand as { shortCode?: string }).shortCode || '').trim();
  if (code) return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PRD';
  return (
    String(brand.name || 'PRD')
      .trim()
      .slice(0, 3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') || 'PRD'
  );
}

function exampleProductName(category: string, lineName: string, index: number): string {
  const cat = normalizeImportCategory(category);
  const preset = CATEGORY_PRODUCT_EXAMPLES[cat];
  if (preset) return preset;
  return index === 0 ? `${cat} ${lineName}`.trim() : `${cat} especial`;
}

/**
 * Filas vacías para la plantilla descargable (solo cabecera + espacio para rellenar).
 */
export function buildDeliveryCatalogEmptyDataRows(
  count = DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS,
  vertical?: string | null,
): string[][] {
  const headers = catalogTemplateHeadersForVertical(vertical);
  return Array.from({ length: count }, () => headers.map(() => ''));
}

/**
 * Filas de ejemplo (solo tests / hoja «ejemplos»; no van en «catalogo» descargable).
 * vertical: restaurant → carta bar; sin nombres de locales concretos.
 */
export function buildDeliveryCatalogSampleRows(
  commercialLines: ImportBrandLike[],
  vertical?: string | null,
): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const restaurant = isRestaurantCatalogVertical(vertical);
  const rows: string[][] = [];
  let skuN = 1;

  for (const brand of lines) {
    const lineName = String(brand.name || '').trim();
    if (!lineName) continue;
    const prefix = skuPrefixForLine(brand);
    const cats = lineCategoriesForCatalogTemplate(brand, vertical);

    cats.forEach((cat, i) => {
      const isPizza = /pizza/i.test(cat);
      const isTapas = /tapa|racion|pincho|montadito/i.test(cat);
      const isKebab = /kebab/i.test(cat);
      const isBocadillo = /bocadillo|bocata|sandwich/i.test(cat);
      const isComplemento = /complemento/i.test(cat);
      const isBebida = /bebida|cerveza|vino/i.test(cat);
      const ingredients = isPizza
        ? 'Tomate, Mozzarella, Albahaca'
        : isBocadillo
          ? 'Pan barra, Tomate, Jamón serrano'
          : isTapas
            ? 'Patata, Aceite, Pimentón'
            : isKebab
              ? 'Carne kebab, Lechuga, Salsa yogur'
              : isComplemento
                ? 'Patata, Aceite, Sal'
                : '';
      const price = isBebida
        ? (4.5).toFixed(2)
        : isBocadillo
          ? (5.5).toFixed(2)
          : isTapas
            ? (4.5).toFixed(2)
            : isKebab
              ? (6.5).toFixed(2)
              : isComplemento
                ? (3.0).toFixed(2)
                : (9.5 + i * 0.5).toFixed(2);
      rows.push(
        padCatalogTemplateRow([
          exampleProductName(cat, lineName, i),
          `${prefix}-${String(skuN++).padStart(3, '0')}`,
          cat,
          lineName,
          price,
          ingredients,
          i === 0 ? `Ejemplo · borra y pon tus productos · linea=${lineName}` : '',
        ], vertical),
      );
    });

    rows.push(
      padCatalogTemplateRow([
        `Menú ${lineName}`,
        `${prefix}-M01`,
        'Combos',
        lineName,
        restaurant ? '12.90' : '14.90',
        '',
        'Menú TPV · borra o duplica',
        'estandar',
        '10',
      ], vertical),
    );
  }

  const sharedExamples: Array<[string, string, string, string]> = [
    ['Agua 50cl', 'BEB-001', 'Bebidas', 'Borra esta fila o pon tus bebidas · linea vacía'],
    ['Patatas fritas', 'COM-001', 'Complementos', 'Borra esta fila · linea vacía en Bebidas/Complementos/Postres'],
    ['Tiramisú', 'POS-001', 'Postres', 'Borra esta fila · linea vacía'],
  ];
  for (const [name, sku, cat, note] of sharedExamples) {
    rows.push(
      padCatalogTemplateRow([
        name,
        sku,
        cat,
        '',
        cat === 'Bebidas' ? '2.50' : cat === 'Complementos' ? '3.00' : '4.50',
        '',
        note,
      ], vertical),
    );
  }

  if (lines.length === 0) {
    if (restaurant) {
      return [
        padCatalogTemplateRow(['Patatas bravas', 'TAP-001', 'Tapas', '', '4.50', 'Patata, Aceite, Pimentón', 'Ejemplo · crea tu marca en Ajustes y ponla en linea', '', '10', 'gluten'], vertical),
        padCatalogTemplateRow(['Bocadillo mixto', 'BOC-001', 'Bocadillos', '', '5.50', 'Pan barra, Jamón serrano, Queso', '', '', '10', 'gluten'], vertical),
        padCatalogTemplateRow(['Caña', 'BEB-001', 'Bebidas', '', '1.80', '', 'linea vacía en bebidas', '', '10'], vertical),
        padCatalogTemplateRow(['Patatas fritas', 'COM-001', 'Complementos', '', '3.00', '', '', '', '10'], vertical),
        padCatalogTemplateRow(['Tarta de queso', 'POS-001', 'Postres', '', '4.50', '', '', '', '10', 'leche'], vertical),
        padCatalogTemplateRow(['Papel higiénico', 'ALM-001', 'Limpieza', '', '0', '', 'Almacén · no sale en TPV', '', '21', '', '', '24', '5', 'ud'], vertical),
        padCatalogTemplateRow(['Vasos de plástico', 'ALM-002', 'Envases', '', '0', '', 'Almacén · packaging', '', '21', '', '', '100', '20', 'ud'], vertical),
        padCatalogTemplateRow(['Guantes desechables', 'ALM-003', 'Varios', '', '0', '', 'Almacén · consumible', '', '21', '', '', '50', '10', 'ud'], vertical),
      ];
    }
    return [
      padCatalogTemplateRow(['Pizza Margarita', 'PIZ-001', 'Pizzas', '', '9.50', 'Tomate, Mozzarella', 'Ejemplo · crea tu marca en Ajustes y ponla en linea', '', '10'], vertical),
      padCatalogTemplateRow(['Agua 50cl', 'BEB-001', 'Bebidas', '', '1.80', '', 'linea vacía', '', '10'], vertical),
      padCatalogTemplateRow(['Patatas fritas', 'COM-001', 'Complementos', '', '3.00', '', '', '', '10'], vertical),
      padCatalogTemplateRow(['Tarta de queso', 'POS-001', 'Postres', '', '4.50', '', '', '', '10'], vertical),
    ];
  }

  return rows;
}

/** Combinaciones linea + categoría válidas (hoja referencia_tpv). */
function buildCatalogReferenceRows(
  commercialLines: ImportBrandLike[],
  vertical?: string | null,
): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const rows: string[][] = [['linea', 'categoria', 'va_en_columna_linea', 'va_en_columna_categoria']];
  const heladeria = isHeladeriaCatalogVertical(vertical);

  if (heladeria && lines.length === 0) {
    for (const cat of HELADERIA_CATALOG_CATEGORIES) {
      const shared = ['Bebidas', 'Complementos', 'Postres'].includes(cat);
      rows.push([shared ? '' : 'Heladería', cat, shared ? '' : 'Heladería', cat]);
    }
    return rows;
  }

  if (isRestaurantCatalogVertical(vertical) && lines.length === 0) {
    for (const cat of [...RESTAURANT_CATALOG_CATEGORIES, ...RESTAURANT_WAREHOUSE_CATEGORIES]) {
      const shared = ['Bebidas', 'Complementos', 'Postres', 'Envases', 'Limpieza', 'Varios'].includes(cat);
      const warehouse = ['Envases', 'Limpieza', 'Varios'].includes(cat);
      rows.push([
        shared ? '' : '(tu marca en Ajustes)',
        cat,
        shared ? '' : '(nombre exacto de tu marca)',
        warehouse ? `${cat} · solo Inventario (no TPV)` : cat,
      ]);
    }
    return rows;
  }

  for (const brand of lines) {
    const lineName = String(brand.name || '').trim();
    for (const cat of lineCategoriesForCatalogTemplate(brand, vertical)) {
      rows.push([lineName, cat, lineName, cat]);
    }
  }

  for (const cat of UNIVERSAL_CATALOG_CATEGORIES.filter((c) =>
    ['Bebidas', 'Complementos', 'Postres'].includes(c),
  )) {
    rows.push(['', cat, '', cat]);
  }

  return rows;
}

function buildValidValuesRows(
  commercialLines: ImportBrandLike[],
  vertical?: string | null,
): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const rows: string[][] = [['linea (pestaña TPV)', 'categorias validas', 'notas']];
  const heladeria = isHeladeriaCatalogVertical(vertical);

  for (const brand of lines) {
    const cats = lineCategoriesForCatalogTemplate(brand, vertical).join(', ');
    rows.push([
      brand.name,
      cats || (heladeria
        ? 'Sabores, Tarrinas, Conos'
        : isRestaurantCatalogVertical(vertical)
          ? 'Tapas, Raciones, Bocadillos'
          : 'Principales, Entrantes'),
      'Nombre exacto en columna linea',
    ]);
  }

  if (lines.length === 0 && isRestaurantCatalogVertical(vertical)) {
    rows.push([
      '(crea tu marca en Ajustes → Marca)',
      RESTAURANT_CATALOG_CATEGORIES.filter((c) => !['Bebidas', 'Complementos', 'Postres'].includes(c)).join(', '),
      'Luego escribe ese nombre exacto en columna linea',
    ]);
  }

  if (heladeria) {
    rows.push(
      ['(dejar vacío)', 'Bebidas', 'Pestaña compartida — sin linea'],
      ['(dejar vacío)', 'Toppings', 'Puede ir sin linea o con tu marca Heladería'],
      ['(dejar vacío)', 'Complementos', 'Pestaña compartida — sin linea'],
    );
  } else {
    rows.push(
      ['(dejar vacío)', 'Bebidas', 'Pestaña compartida — sin linea'],
      ['(dejar vacío)', 'Complementos', 'Pestaña compartida — sin linea'],
      ['(dejar vacío)', 'Postres', 'Pestaña compartida — sin linea'],
    );
    if (isRestaurantCatalogVertical(vertical)) {
      rows.push(
        ['(dejar vacío)', 'Envases', 'Solo Inventario · packaging / papel / vasos — no TPV'],
        ['(dejar vacío)', 'Limpieza', 'Solo Inventario · detergentes — no TPV'],
        ['(dejar vacío)', 'Varios', 'Solo Inventario · consumibles — no TPV'],
      );
    }
  }
  return rows;
}

function instructionLines(
  commercialLines: ImportBrandLike[],
  vertical?: string | null,
): string[] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const lineNames = lines.map((b) => b.name.trim()).filter(Boolean);
  const namesText = lineNames.length > 0 ? lineNames.join(' | ') : '(configura marcas en Ajustes → Marca)';
  const headers = catalogTemplateHeadersForVertical(vertical);

  if (isHeladeriaCatalogVertical(vertical)) {
    return [
      `PLANTILLA HELADERÍA v${DELIVERY_CATALOG_TEMPLATE_VERSION} — Catálogo + TPV`,
      `${DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS} filas vacías en «catalogo» (desde fila 2). Si necesitas más, inserta filas en Excel; las vacías no se importan.`,
      '',
      'HOJA A IMPORTAR: «catalogo» (la primera).',
      'HOJA «columnas»: qué es OBLIGATORIO y qué es OPCIONAL (léela primero).',
      'Las demás hojas son solo ayuda (no se importan).',
      '',
      'COLUMNAS fila 1 (NO renombrar):',
      `  ${headers.join(' | ')}`,
      '',
      'RELLENA desde la fila 2. Las filas vacías no se importan.',
      '',
      'OBLIGATORIO: nombre · categoria · precio',
      'RECOMENDADO: codigo · linea · ingredientes · descripcion',
      'OPCIONAL (ya en el Excel): tipo_menu · iva · alergenos · formato · stock · stock_minimo · unidad',
      '',
      'HELADERÍA:',
      '  · Sabores — bola / sabor a granel (precio por bola o unidad)',
      '  · Tarrinas / Conos — formatos listos (500 ml, 1 L, cono 2 bolas…)',
      '  · Batidos — milkshakes y cremosos',
      '  · Toppings — salsas, toppings, extras',
      '  · Encargos — tartas, encargos anticipados, packs fiesta',
      '  · Usa alergenos y formato cuando puedas',
      '  · IVA vacío → 10% al importar',
      '',
      'RECOMENDADO:',
      '  · codigo — HEL-VAI-01 (mismo código = actualiza sin duplicar)',
      '  · linea — pestaña TPV: ' + namesText,
      '  · ingredientes — Leche, nata, vainilla… (escandallo / coste)',
      '',
      'Consulta «columnas», «referencia_tpv» y «valores_validos».',
    ];
  }

  if (isRestaurantCatalogVertical(vertical)) {
    return [
      `PLANTILLA BAR / RESTAURANTE v${DELIVERY_CATALOG_TEMPLATE_VERSION} — Catálogo + TPV`,
      `${DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS} filas vacías en «catalogo» (desde fila 2). Si necesitas más, inserta filas en Excel; las vacías no se importan.`,
      '',
      'HOJA A IMPORTAR: «catalogo» (la primera).',
      'HOJA «columnas»: qué es OBLIGATORIO y qué es OPCIONAL (léela primero).',
      'Las demás hojas son solo ayuda (no se importan).',
      '',
      'COLUMNAS fila 1 (NO renombrar):',
      `  ${headers.join(' | ')}`,
      '',
      'RELLENA desde la fila 2. Las filas vacías no se importan.',
      'Lo que pongas en el Excel es lo que se monta en el TPV (categorías y productos).',
      '',
      'OBLIGATORIO: nombre · categoria · precio',
      'RECOMENDADO: codigo · linea · ingredientes · descripcion',
      'OPCIONAL (ya en el Excel): tipo_menu · iva · alergenos · formato · stock · stock_minimo · unidad',
      '',
      'BAR / TAPAS / RESTAURANTE:',
      '  · categorias carta (TPV): Tapas, Raciones, Bocadillos, Pinchos, Complementos, Bebidas, Postres',
      '  · categorias ALMACÉN (NO salen en TPV): Envases, Limpieza, Varios',
      '      · Envases — packaging, vasos, servilletas, papel de baño, bolsas…',
      '      · Limpieza — detergente, lejía, bayetas…',
      '      · Varios — otros consumibles de local',
      '  · en almacén: deja linea vacía y precio 0 (o vacío). Rellena stock / stock_minimo / unidad si quieres',
      '  · NO uses categorías de delivery (Pizzas, Burgers, Tacos) salvo que las vendas de verdad',
      '  · ingredientes — Patata, Aceite, Jamón, Pan barra… (escandallo; solo carta)',
      '  · IVA vacío → 10% al importar',
      '',
      'MENÚS / COMBOS (categoria = Combos):',
      '  · linea = nombre exacto de tu Marca en Ajustes (hoja valores_validos)',
      '  · ingredientes vacío (el cliente elige en TPV)',
      '  · tipo_menu opcional: estandar | duo | familiar | con_postre',
      '',
      'RECOMENDADO:',
      '  · codigo — TAP-001 (mismo código = actualiza sin duplicar)',
      '  · linea — pestaña TPV / marca: ' + namesText,
      '  · linea VACÍA en Bebidas, Complementos, Postres y en Envases/Limpieza/Varios',
      '',
      'Consulta «columnas», «referencia_tpv», «valores_validos» y «ejemplos» (no importes ejemplos).',
    ];
  }

  return [
    `PLANTILLA OFICIAL v${DELIVERY_CATALOG_TEMPLATE_VERSION} — Catálogo + TPV`,
    `${DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS} filas vacías en «catalogo» (desde fila 2). Si necesitas más, inserta filas en Excel; las vacías no se importan.`,
    '',
    'HOJA A IMPORTAR: «catalogo» (la primera).',
    'HOJA «columnas»: qué es OBLIGATORIO y qué es OPCIONAL (léela primero).',
    'Las demás hojas son solo ayuda (no se importan).',
    '',
    'COLUMNAS fila 1 (NO renombrar):',
    `  ${headers.join(' | ')}`,
    '',
    'RELLENA desde la fila 2. Las filas vacías no se importan.',
    '',
    'OBLIGATORIO: nombre · categoria · precio',
    'RECOMENDADO: codigo · linea · ingredientes · descripcion',
    'OPCIONAL (ya en el Excel): tipo_menu · iva · alergenos · formato · stock · stock_minimo · unidad',
    '',
    'DELIVERY:',
    '  · categorias habituales: Pizzas, Burgers, Tacos, Complementos, Bebidas, Postres',
    '  · ingredientes — Tomate, Mozzarella, Jamón… (escandallo / coste)',
    '  · IVA vacío → 10% al importar',
    '',
    'MENÚS / COMBOS (categoria = Combos):',
    '  · linea obligatoria (nombre de tu Marca en Ajustes)',
    '  · ingredientes vacío (el cliente elige plato + bebida en TPV)',
    '  · tipo_menu opcional: estandar | duo | familiar | con_postre',
    '',
    'RECOMENDADO:',
    '  · codigo — referencia única por producto (PIZ-001). Mismo código = actualiza sin duplicar',
    '  · linea — pestaña TPV: ' + namesText,
    '  · linea VACÍA en Bebidas, Complementos y Postres',
    '  · ingredientes — pizzas/burgers: Tomate, Mozzarella, Jamón…',
    '',
    'Consulta «columnas», «referencia_tpv» y «valores_validos».',
  ];
}

/** Hoja «columnas»: obligatorio vs opcional, para que se entienda sin leer código. */
export function buildCatalogColumnLegendRows(vertical?: string | null): string[][] {
  const fields = catalogImportFieldsForVertical(vertical);
  const rows: string[][] = [
    ['columna', 'obligatorio', 'para_que', 'ejemplo'],
  ];
  for (const f of fields) {
    const required = f.required === true;
    rows.push([
      f.label,
      required ? 'SI — obligatorio' : 'NO — opcional',
      legendPurposeForField(f.key, vertical),
      String(f.example ?? ''),
    ]);
  }
  rows.push([]);
  rows.push([
    'NOTA',
    '',
    'No renombres las cabeceras de «catalogo». Si no usas una opcional, déjala vacía.',
    '',
  ]);
  return rows;
}

function legendPurposeForField(key: string, vertical?: string | null): string {
  switch (key) {
    case 'name':
      return 'Nombre del producto en TPV / carta';
    case 'sku':
      return 'Código interno. Mismo código = actualiza el producto (no duplica)';
    case 'category':
      return isRestaurantCatalogVertical(vertical)
        ? 'Categoría TPV o almacén (Envases/Limpieza/Varios no salen en TPV)'
        : 'Categoría / pestaña del TPV';
    case 'linea':
      return 'Marca comercial exacta (Ajustes → Marca). Vacía en Bebidas/Complementos/Postres';
    case 'price':
      return 'Precio de venta. Número (9.50). En almacén puedes poner 0';
    case 'ingredients':
      return 'Ingredientes separados por coma (escandallo). Vacío en Combos';
    case 'description':
      return 'Descripción o notas del producto';
    case 'tipo_menu':
      return 'Solo si categoria = Combos: estandar, duo, familiar, con_postre';
    case 'taxRate':
      return '% IVA. Si vacío se aplica 10% al importar';
    case 'allergens':
      return 'Alérgenos separados por coma (leche, gluten…)';
    case 'formato':
      return 'Presentación (bola, 500ml, ración…). Muy útil en heladería';
    case 'stock':
      return 'Cantidad inicial en almacén (si la rellenas, el producto lleva stock)';
    case 'minStock':
      return 'Stock mínimo para aviso de bajo stock';
    case 'unit':
      return 'Unidad de medida: ud, kg, L… (por defecto ud)';
    default:
      return '';
  }
}

export function isOfficialCatalogTemplateHeaders(headers: string[]): boolean {
  const coreHeaders = DELIVERY_CATALOG_CORE_COLUMNS.map((key) => DELIVERY_CATALOG_IMPORT_LABELS[key]);
  if (headers.length < coreHeaders.length) return false;
  // Heladería puede traer columnas extra (alergenos, formato) tras el core.
  return coreHeaders.every((expected, idx) => {
    const actual = normalizeImportHeader(String(headers[idx] ?? ''));
    const exp = normalizeImportHeader(expected);
    if (DELIVERY_CATALOG_CORE_COLUMNS[idx] === 'sku') {
      return actual === exp || actual === 'sku';
    }
    return actual === exp;
  });
}

export function buildDeliveryCatalogImportWorkbook(
  commercialLines: ImportBrandLike[] = [],
  vertical?: string | null,
) {
  const organizers = organizerBrandsForCatalogTemplate(commercialLines);
  const headers = catalogTemplateHeadersForVertical(vertical);
  const catalogRows = [headers, ...buildDeliveryCatalogEmptyDataRows(undefined, vertical)];
  const colCount = headers.length;
  const lastCol = String.fromCharCode('A'.charCodeAt(0) + Math.max(colCount - 1, 0));

  const catalogSheet = XLSX.utils.aoa_to_sheet(catalogRows);
  catalogSheet['!cols'] = [
    { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ];
  catalogSheet['!autofilter'] = { ref: `A1:${lastCol}1` };
  catalogSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  const columnsSheet = XLSX.utils.aoa_to_sheet(buildCatalogColumnLegendRows(vertical));
  columnsSheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 72 }, { wch: 28 }];

  const referenceSheet = XLSX.utils.aoa_to_sheet(buildCatalogReferenceRows(organizers, vertical));
  referenceSheet['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 22 }];

  const validSheet = XLSX.utils.aoa_to_sheet(buildValidValuesRows(organizers, vertical));
  validSheet['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 40 }];

  const helpSheet = XLSX.utils.aoa_to_sheet(instructionLines(organizers, vertical).map((line) => [line]));
  helpSheet['!cols'] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, catalogSheet, 'catalogo');
  XLSX.utils.book_append_sheet(wb, columnsSheet, 'columnas');
  XLSX.utils.book_append_sheet(wb, referenceSheet, 'referencia_tpv');
  XLSX.utils.book_append_sheet(wb, validSheet, 'valores_validos');
  if (isRestaurantCatalogVertical(vertical)) {
    const exampleRows = [
      headers,
      ...buildDeliveryCatalogSampleRows(organizers, vertical),
    ];
    const exampleSheet = XLSX.utils.aoa_to_sheet(exampleRows);
    exampleSheet['!cols'] = catalogSheet['!cols'];
    XLSX.utils.book_append_sheet(wb, exampleSheet, 'ejemplos');
  }
  XLSX.utils.book_append_sheet(wb, helpSheet, 'instrucciones');
  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ activeTab: 0 }] };
  return wb;
}

export function downloadDeliveryCatalogImportTemplate(
  commercialLines: ImportBrandLike[] = [],
  filename?: string,
  options?: { vertical?: string | null },
) {
  const vertical = options?.vertical;
  if (isEventsCatalogVertical(vertical)) {
    downloadEventsTpvCatalogImportTemplate();
    return;
  }
  const organizers = organizerBrandsForCatalogTemplate(commercialLines);
  const wb = buildDeliveryCatalogImportWorkbook(organizers, vertical);
  XLSX.writeFile(
    wb,
    filename || catalogTemplateFilenameForVertical(vertical),
  );
}

export function parseImportPrice(raw: string): number {
  let cleaned = String(raw || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[€$£]/g, '');
  // Formato europeo: 1.234,56
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  const price = Number(cleaned);
  return Number.isFinite(price) ? price : NaN;
}

function isTemplateExampleImportRow(entry: Record<string, string>): boolean {
  const name = String(entry.name || '').trim();
  return /^ejemplo\s*[·\-–—]/i.test(name);
}

type CatalogImportRowContext = {
  commercial: ImportBrandLike[];
  brands: ImportBrandLike[];
  seenSkus: Set<string>;
};

function collectDeliveryCatalogImportRowIssues(
  entry: Record<string, string>,
  row: number,
  ctx: CatalogImportRowContext,
): DeliveryCatalogImportIssue[] {
  const issues: DeliveryCatalogImportIssue[] = [];
  const name = String(entry.name || '').trim();
  const categoryRaw = String(entry.category || '').trim();
  const category = normalizeImportCategory(categoryRaw);
  const lineText = readImportLineText(entry);
  const priceRaw = String(entry.price || entry.unitPrice || '').trim();
  const price = parseImportPrice(priceRaw);
  const sku = String(entry.sku || '').trim().toLowerCase();

  if (!name) {
    issues.push({ row, field: 'nombre', message: 'Falta el nombre del producto', severity: 'error' });
  } else if (/^dato\s*\d+$/i.test(name)) {
    issues.push({
      row,
      field: 'nombre',
      message: `«${name}» no es un nombre de producto (revisa columnas del Excel)`,
      severity: 'error',
    });
  } else if (/^ejemplo · borra/i.test(name) || /^ejemplo ·/i.test(name)) {
    issues.push({
      row,
      field: 'nombre',
      message: 'Parece fila de ejemplo de la plantilla — cámbiala o bórrala',
      severity: 'warning',
    });
  }

  if (!categoryRaw) {
    issues.push({ row, field: 'categoria', message: 'Falta la categoría', severity: 'error' });
  } else if (/^dato\s*\d+$/i.test(categoryRaw)) {
    issues.push({
      row,
      field: 'categoria',
      message: `«${categoryRaw}» no es una categoría válida (revisa la columna categoria)`,
      severity: 'error',
    });
  }

  if (!priceRaw) {
    if (!isWarehouseImportCategory(category)) {
      issues.push({ row, field: 'precio', message: 'Falta el precio', severity: 'error' });
    }
  } else if (!Number.isFinite(price) || price < 0) {
    issues.push({ row, field: 'precio', message: 'Precio no válido (usa formato 9.50)', severity: 'error' });
  } else if (price <= 0 && !isWarehouseImportCategory(category)) {
    issues.push({
      row,
      field: 'precio',
      message: 'Precio 0: el producto no se podrá vender en TPV',
      severity: 'warning',
    });
  }

  if (sku) {
    if (ctx.seenSkus.has(sku)) {
      issues.push({
        row,
        field: 'codigo',
        message: `Código duplicado «${entry.sku}» en el archivo (cada producto debe llevar uno distinto)`,
        severity: 'error',
      });
    } else {
      ctx.seenSkus.add(sku);
    }
  }

  if (lineText) {
    const { unmatchedNames } = resolveCommercialLineIdsFromText(lineText, ctx.brands);
    if (unmatchedNames.length > 0) {
      const missingBrand = unmatchedNames[0];
      issues.push({
        row,
        field: 'linea',
        message: formatUnmatchedImportLineRowWarning(missingBrand, ctx.brands),
        severity: 'warning',
        code: MISSING_BRAND_IMPORT_CODE,
        value: missingBrand,
      });
    }
    // Si la linea existe en Ajustes → Marca, se respeta tal cual (el Excel manda),
    // incluso en categorías compartidas (Bebidas, Complementos…).
  } else if (isImportComboCategory(category)) {
    issues.push({
      row,
      field: 'linea',
      message: 'Menú/combo: indica la linea comercial (nombre de tu Marca en Ajustes)',
      severity: 'warning',
    });
  } else if (!shouldClearBrandForCategory(category) && ctx.commercial.length > 0) {
    issues.push({
      row,
      field: 'linea',
      message: `Sin linea: se asignará por categoría o a la línea principal`,
      severity: 'warning',
    });
  }

  return issues;
}

/** Importa filas válidas aunque otras del mismo Excel fallen (p. ej. una pizza sin precio). */
export function partitionDeliveryCatalogImportEntries(
  entries: Record<string, string>[],
  brands: ImportBrandLike[],
): { validEntries: Record<string, string>[]; issues: DeliveryCatalogImportIssue[] } {
  const issues: DeliveryCatalogImportIssue[] = [];
  const validEntries: Record<string, string>[] = [];
  const ctx: CatalogImportRowContext = {
    commercial: organizerBrandsForCatalogTemplate(brands),
    brands,
    seenSkus: new Set<string>(),
  };

  entries.forEach((entry, index) => {
    if (isTemplateExampleImportRow(entry)) return;
    const rowIssues = collectDeliveryCatalogImportRowIssues(entry, index + 2, ctx);
    issues.push(...rowIssues);
    if (!rowIssues.some((i) => i.severity === 'error')) {
      validEntries.push(entry);
    }
  });

  return { validEntries, issues };
}

export function validateDeliveryCatalogImportEntries(
  entries: Record<string, string>[],
  brands: ImportBrandLike[],
): DeliveryCatalogImportValidation {
  const { issues } = partitionDeliveryCatalogImportEntries(entries, brands);
  return {
    ok: issues.every((i) => i.severity !== 'error'),
    issues,
  };
}

export function formatDeliveryCatalogImportValidationToast(validation: DeliveryCatalogImportValidation): string {
  const errors = validation.issues.filter((i) => i.severity === 'error').slice(0, 5);
  if (errors.length === 0) return '';
  return errors.map((e) => `Fila ${e.row} (${e.field}): ${e.message}`).join('\n');
}
