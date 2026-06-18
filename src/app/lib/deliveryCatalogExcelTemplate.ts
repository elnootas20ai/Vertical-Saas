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
  type ImportBrandLike,
} from './deliveryCatalogImportLogic';

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

export const DELIVERY_CATALOG_IMPORT_LABELS: Record<(typeof DELIVERY_CATALOG_IMPORT_COLUMNS)[number], string> = {
  name: 'nombre',
  sku: 'sku',
  category: 'categoria',
  linea: 'linea',
  price: 'precio',
  ingredients: 'ingredientes',
  description: 'descripcion',
};

/** Cabeceras exactas de la hoja «catalogo» (no cambiar: el import las auto-detecta). */
export const DELIVERY_CATALOG_TEMPLATE_HEADERS = DELIVERY_CATALOG_IMPORT_COLUMNS.map(
  (key) => DELIVERY_CATALOG_IMPORT_LABELS[key],
);

/** Versión de la plantilla (solo cambiar si hay migración acordada). */
export const DELIVERY_CATALOG_TEMPLATE_VERSION = 3;

export const DELIVERY_CATALOG_TEMPLATE_FILENAME = 'plantilla_catalogo_delivery_tpv.xlsx';

/** Filas vacías en «catalogo» (fila 2 en adelante). No se importan si están vacías. */
export const DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS = 5000;

export const DELIVERY_CATALOG_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'nombre', required: true, example: 'Pizza Margarita' },
  { key: 'sku', label: 'sku', example: 'PIZ-001' },
  { key: 'category', label: 'categoria', required: true, example: 'Pizzas' },
  { key: 'linea', label: 'linea', example: 'modomio' },
  { key: 'price', label: 'precio', required: true, example: '9.50' },
  { key: 'ingredients', label: 'ingredientes', example: 'Tomate, Mozzarella, Albahaca' },
  { key: 'description', label: 'descripcion', example: '' },
];

/** Sinónimos de cabecera para auto-mapeo (plantilla oficial + exportaciones habituales). */
export const DELIVERY_CATALOG_HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'producto', 'product', 'articulo', 'nombre producto', 'product name'],
  sku: ['sku', 'codigo', 'codigo sku', 'ref', 'referencia', 'cod'],
  category: ['categoria', 'category', 'seccion', 'familia', 'tipo', 'categoria tpv'],
  linea: ['linea', 'line', 'marca', 'organizador', 'linea comercial', 'linea tpv', 'brand line'],
  price: ['precio', 'price', 'pvp', 'precio venta', 'unit price', 'precio unitario'],
  ingredients: ['ingredientes', 'ingredients', 'ingrediente', 'receta', 'componentes'],
  description: ['descripcion', 'description', 'desc', 'notas', 'observaciones'],
};

export type DeliveryCatalogImportIssue = {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
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
  Extras: 'Extra queso',
  Otros: 'Producto varios',
  Café: 'Café solo',
  Bollería: 'Croissant',
};

/** Categorías TPV de una línea (las de la marca o las típicas del tipo de negocio). */
export function lineCategoriesForCatalogTemplate(brand: ImportBrandLike): string[] {
  const fromBrand = (brand.catalogCategories ?? [])
    .map((c) => normalizeImportCategory(String(c || '')))
    .filter((c) => c && !shouldClearBrandForCategory(c));
  if (fromBrand.length > 0) return [...new Set(fromBrand)];

  const preset = getDeliveryBrandLinePreset(brand.deliveryLineKind);
  const fromPreset = (preset?.typicalCategories ?? [])
    .map((c) => normalizeImportCategory(c))
    .filter((c) => c && !shouldClearBrandForCategory(c));
  if (fromPreset.length > 0) return fromPreset;

  return ['Principales', 'Entrantes'];
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
): string[][] {
  return Array.from({ length: count }, () => DELIVERY_CATALOG_TEMPLATE_HEADERS.map(() => ''));
}

/**
 * Filas de ejemplo (solo tests / documentación interna; no van en la plantilla descargable).
 */
export function buildDeliveryCatalogSampleRows(commercialLines: ImportBrandLike[]): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const rows: string[][] = [];
  let skuN = 1;

  for (const brand of lines) {
    const lineName = String(brand.name || '').trim();
    if (!lineName) continue;
    const prefix = skuPrefixForLine(brand);
    const cats = lineCategoriesForCatalogTemplate(brand);

    cats.forEach((cat, i) => {
      const isPizza = /pizza/i.test(cat);
      rows.push([
        exampleProductName(cat, lineName, i),
        `${prefix}-${String(skuN++).padStart(3, '0')}`,
        cat,
        lineName,
        (9.5 + i * 0.5).toFixed(2),
        isPizza ? 'Tomate, Mozzarella, Albahaca' : '',
        i === 0 ? `Ejemplo · borra y pon tus productos · linea=${lineName}` : '',
      ]);
    });
  }

  const sharedExamples: Array<[string, string, string, string]> = [
    ['Agua 50cl', 'BEB-001', 'Bebidas', 'Borra esta fila o pon tus bebidas · linea vacía'],
    ['Patatas fritas', 'COM-001', 'Complementos', 'Borra esta fila · linea vacía en Bebidas/Complementos/Postres'],
    ['Tiramisú', 'POS-001', 'Postres', 'Borra esta fila · linea vacía'],
  ];
  for (const [name, sku, cat, note] of sharedExamples) {
    rows.push([
      name,
      sku,
      cat,
      '',
      cat === 'Bebidas' ? '2.50' : cat === 'Complementos' ? '3.00' : '4.50',
      '',
      note,
    ]);
  }

  if (lines.length === 0) {
    return [
      ['Pizza Margarita', 'PIZ-001', 'Pizzas', 'modomio', '9.50', 'Tomate, Mozzarella, Albahaca', 'Crea marcas en Ajustes → Marca y vuelve a descargar'],
      ['Agua 50cl', 'BEB-001', 'Bebidas', '', '1.80', '', 'linea vacía = pestaña compartida TPV'],
      ['Patatas fritas', 'COM-001', 'Complementos', '', '3.00', '', ''],
      ['Tiramisú', 'POS-001', 'Postres', '', '4.50', '', ''],
    ];
  }

  return rows;
}

/** Combinaciones linea + categoría válidas (hoja referencia_tpv). */
function buildCatalogReferenceRows(commercialLines: ImportBrandLike[]): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const rows: string[][] = [['linea', 'categoria', 'va_en_columna_linea', 'va_en_columna_categoria']];

  for (const brand of lines) {
    const lineName = String(brand.name || '').trim();
    for (const cat of lineCategoriesForCatalogTemplate(brand)) {
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

function buildValidValuesRows(commercialLines: ImportBrandLike[]): string[][] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const rows: string[][] = [['linea (pestaña TPV)', 'categorias validas', 'notas']];

  for (const brand of lines) {
    const cats = lineCategoriesForCatalogTemplate(brand).join(', ');
    rows.push([brand.name, cats || 'Principales, Entrantes', 'Nombre exacto en columna linea']);
  }

  rows.push(
    ['(dejar vacío)', 'Bebidas', 'Pestaña compartida — sin linea'],
    ['(dejar vacío)', 'Complementos', 'Pestaña compartida — sin linea'],
    ['(dejar vacío)', 'Postres', 'Pestaña compartida — sin linea'],
  );
  return rows;
}

function instructionLines(commercialLines: ImportBrandLike[]): string[] {
  const lines = organizerBrandsForCatalogTemplate(commercialLines);
  const lineNames = lines.map((b) => b.name.trim()).filter(Boolean);
  const namesText = lineNames.length > 0 ? lineNames.join(' | ') : '(configura marcas en Ajustes → Marca)';

  return [
    `PLANTILLA OFICIAL v${DELIVERY_CATALOG_TEMPLATE_VERSION} — Catálogo + TPV`,
    `${DELIVERY_CATALOG_TEMPLATE_EMPTY_DATA_ROWS} filas vacías en «catalogo» (desde fila 2).`,
    '',
    'HOJA A IMPORTAR: «catalogo» (la primera). Las demás hojas son solo ayuda.',
    '',
    'COLUMNAS fila 1 (NO renombrar):',
    `  ${DELIVERY_CATALOG_TEMPLATE_HEADERS.join(' | ')}`,
    '',
    'RELLENA desde la fila 2. Las filas vacías no se importan.',
    '',
    'OBLIGATORIO por producto:',
    '  · nombre — nombre en TPV',
    '  · categoria — Pizzas, Burgers, Combos, Bebidas…',
    '  · precio — número (14.50)',
    '',
    'RECOMENDADO:',
    '  · sku — código único (PIZ-001). Mismo SKU = actualiza sin duplicar',
    '  · linea — pestaña TPV: ' + namesText,
    '  · linea VACÍA en Bebidas, Complementos y Postres',
    '  · ingredientes — solo pizzas/burgers: Tomate, Mozzarella, Jamón',
    '',
    'Consulta «referencia_tpv» y «valores_validos» para tus líneas y categorías.',
  ];
}

export function isOfficialCatalogTemplateHeaders(headers: string[]): boolean {
  const coreHeaders = DELIVERY_CATALOG_CORE_COLUMNS.map((key) => DELIVERY_CATALOG_IMPORT_LABELS[key]);
  if (headers.length < coreHeaders.length) return false;
  return coreHeaders.every(
    (expected, idx) => normalizeImportHeader(String(headers[idx] ?? '')) === normalizeImportHeader(expected),
  );
}

export function buildDeliveryCatalogImportWorkbook(commercialLines: ImportBrandLike[] = []) {
  const organizers = organizerBrandsForCatalogTemplate(commercialLines);
  const catalogRows = [DELIVERY_CATALOG_TEMPLATE_HEADERS, ...buildDeliveryCatalogEmptyDataRows()];

  const catalogSheet = XLSX.utils.aoa_to_sheet(catalogRows);
  catalogSheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 36 }, { wch: 42 }];
  catalogSheet['!autofilter'] = { ref: 'A1:G1' };
  catalogSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  const referenceSheet = XLSX.utils.aoa_to_sheet(buildCatalogReferenceRows(organizers));
  referenceSheet['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];

  const validSheet = XLSX.utils.aoa_to_sheet(buildValidValuesRows(organizers));
  validSheet['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 36 }];

  const helpSheet = XLSX.utils.aoa_to_sheet(instructionLines(organizers).map((line) => [line]));
  helpSheet['!cols'] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, catalogSheet, 'catalogo');
  XLSX.utils.book_append_sheet(wb, referenceSheet, 'referencia_tpv');
  XLSX.utils.book_append_sheet(wb, validSheet, 'valores_validos');
  XLSX.utils.book_append_sheet(wb, helpSheet, 'instrucciones');
  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ activeTab: 0 }] };
  return wb;
}

export function downloadDeliveryCatalogImportTemplate(commercialLines: ImportBrandLike[] = []) {
  const organizers = organizerBrandsForCatalogTemplate(commercialLines);
  const wb = buildDeliveryCatalogImportWorkbook(organizers);
  XLSX.writeFile(wb, DELIVERY_CATALOG_TEMPLATE_FILENAME);
}

export function parseImportPrice(raw: string): number {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[€$£]/g, '')
    .replace(',', '.');
  const price = Number(cleaned);
  return Number.isFinite(price) ? price : NaN;
}

function isTemplateExampleImportRow(entry: Record<string, string>): boolean {
  const name = String(entry.name || '').trim();
  return /^ejemplo\s*[·\-–—]/i.test(name);
}

export function validateDeliveryCatalogImportEntries(
  entries: Record<string, string>[],
  brands: ImportBrandLike[],
): DeliveryCatalogImportValidation {
  const issues: DeliveryCatalogImportIssue[] = [];
  const commercial = organizerBrandsForCatalogTemplate(brands);
  const linePool = allCommercialLineBrands(brands);
  const lineNames = new Set(linePool.map((b) => String(b.name || '').trim().toLowerCase()));
  const seenSkus = new Set<string>();

  entries.forEach((entry, index) => {
    if (isTemplateExampleImportRow(entry)) return;

    const row = index + 2;
    const name = String(entry.name || '').trim();
    const categoryRaw = String(entry.category || '').trim();
    const category = normalizeImportCategory(categoryRaw);
    const lineText = readImportLineText(entry);
    const priceRaw = String(entry.price || entry.unitPrice || '').trim();
    const price = parseImportPrice(priceRaw);
    const sku = String(entry.sku || '').trim().toLowerCase();

    if (!name) {
      issues.push({ row, field: 'nombre', message: 'Falta el nombre del producto', severity: 'error' });
    } else if (/^ejemplo · borra/i.test(name) || /^ejemplo ·/i.test(name)) {
      issues.push({
        row,
        field: 'nombre',
        message: 'Parece fila de ejemplo de la plantilla — cámbiala o bórrala',
        severity: 'warning',
      });
    }

    if (!categoryRaw) {
      issues.push({ row, field: 'categoria', message: 'Falta la categoría TPV', severity: 'error' });
    } else if (/^dato\s*\d+$/i.test(categoryRaw)) {
      issues.push({
        row,
        field: 'categoria',
        message: `«${categoryRaw}» no es una categoría válida (revisa la columna categoria)`,
        severity: 'error',
      });
    }

    if (!priceRaw) {
      issues.push({ row, field: 'precio', message: 'Falta el precio', severity: 'error' });
    } else if (!Number.isFinite(price) || price < 0) {
      issues.push({ row, field: 'precio', message: 'Precio no válido (usa formato 9.50)', severity: 'error' });
    } else if (price <= 0) {
      issues.push({
        row,
        field: 'precio',
        message: 'Precio 0: el producto no se podrá vender en TPV',
        severity: 'warning',
      });
    }

    if (sku) {
      if (seenSkus.has(sku)) {
        issues.push({ row, field: 'sku', message: `SKU duplicado «${entry.sku}» en el archivo`, severity: 'error' });
      }
      seenSkus.add(sku);
    }

    if (lineText) {
      const { unmatchedNames } = resolveCommercialLineIdsFromText(lineText, brands);
      if (unmatchedNames.length > 0) {
        issues.push({
          row,
          field: 'linea',
          message: `Línea «${unmatchedNames[0]}» no coincide con Ajustes → Marca (${[...lineNames].slice(0, 5).join(', ') || 'sin líneas'}). Se asignará por categoría.`,
          severity: 'warning',
        });
      }
      if (shouldClearBrandForCategory(category)) {
        issues.push({
          row,
          field: 'linea',
          message: `Categoría «${category}» es compartida: deja linea vacía`,
          severity: 'warning',
        });
      }
    } else if (!shouldClearBrandForCategory(category) && commercial.length > 0) {
      issues.push({
        row,
        field: 'linea',
        message: `Sin linea: se asignará por categoría o a la línea principal`,
        severity: 'warning',
      });
    }
  });

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
