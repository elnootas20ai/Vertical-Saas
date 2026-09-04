import * as XLSX from 'xlsx';
import type { ImportFieldDef } from '../components/saas/GenericImportModal';

/**
 * Plantilla Excel Eventos → Productos TPV.
 * Una fila = un producto. Incluye columna IVA (10 / 21 / otro %).
 */

export const EVENTS_TPV_CATALOG_SHEET_NAME = 'productos';
export const EVENTS_TPV_CATALOG_TEMPLATE_FILENAME = 'plantilla_productos_tpv_eventos.xlsx';
export const EVENTS_TPV_CATALOG_TEMPLATE_VERSION = 2;

/** Cabeceras exactas (fila 1). No renombrar. IVA va junto al precio. */
export const EVENTS_TPV_CATALOG_HEADERS = [
  'nombre',
  'precio',
  'iva',
  'descripcion',
  'categoria',
  'coste',
  'merma_pct',
  'ingredientes',
  'stock',
  'stock_minimo',
  'unidad',
  'alergenos',
  'codigo',
] as const;

export const EVENTS_TPV_CATALOG_CATEGORIES = [
  'Catering',
  'Bebidas',
  'Complementos',
  'Postres',
  'Extras',
  'Packs',
  'Otros',
] as const;

export const EVENTS_TPV_CATALOG_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'nombre', required: true, example: 'Bocadillo jamón' },
  { key: 'price', label: 'precio', required: true, example: '4,50' },
  { key: 'taxRate', label: 'iva', required: false, example: '10' },
  { key: 'description', label: 'descripcion', example: 'Servicio barra' },
  { key: 'category', label: 'categoria', example: 'Catering' },
  { key: 'costPrice', label: 'coste', example: '1,80' },
  { key: 'mermaPct', label: 'merma_pct', example: '5' },
  { key: 'ingredients', label: 'ingredientes', example: 'Pan, Jamón, Tomate' },
  { key: 'stock', label: 'stock', example: '40' },
  { key: 'minStock', label: 'stock_minimo', example: '10' },
  { key: 'unit', label: 'unidad', example: 'ud' },
  { key: 'allergens', label: 'alergenos', example: 'gluten' },
  { key: 'sku', label: 'codigo', example: 'EVT-BOC-01' },
];

export const EVENTS_TPV_CATALOG_HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'producto', 'articulo'],
  price: ['precio', 'price', 'pvp', 'precio venta'],
  taxRate: ['iva', 'tax', 'taxrate', '% iva', 'tipo iva', 'porcentaje iva'],
  description: ['descripcion', 'descripción', 'description', 'notas'],
  category: ['categoria', 'categoría', 'category', 'familia', 'seccion'],
  costPrice: ['coste', 'coste_escandallo', 'costprice', 'cost price', 'coste unitario', 'precio coste'],
  mermaPct: ['merma_pct', 'merma', 'merma %', '% merma', 'merma%', 'waste', 'waste_pct'],
  ingredients: ['ingredientes', 'ingredients', 'escandallo', 'receta', 'componentes'],
  stock: ['stock', 'stock_actual', 'cantidad'],
  minStock: ['stock_minimo', 'stock minimo', 'min_stock', 'minimo'],
  unit: ['unidad', 'unit', 'ud'],
  allergens: ['alergenos', 'alérgenos', 'allergens'],
  sku: ['codigo', 'código', 'sku', 'ref', 'referencia'],
};

function instructionLines(): string[] {
  return [
    `PLANTILLA PRODUCTOS TPV EVENTOS v${EVENTS_TPV_CATALOG_TEMPLATE_VERSION}`,
    '',
    'HOJA A USAR: «productos» (la primera).',
    'Una fila = un producto para cobrar en el TPV del evento.',
    '',
    'COLUMNAS (fila 1 — no las renombres):',
    `  ${EVENTS_TPV_CATALOG_HEADERS.join(' | ')}`,
    '',
    'OBLIGATORIO: nombre · precio',
    '',
    'IVA (columna «iva»):',
    '  · 10 = comida / catering (por defecto si dejas vacío)',
    '  · 21 = general',
    '  · Otro número 0–100 (ej. 4) = tipo manual',
    '  · Ejemplo: 10 | 21 | 4',
    '',
    'OPCIONAL: descripcion · categoria · coste · merma_pct · ingredientes · stock · …',
    'Precio en formato ES (4,50 o 1.250,00).',
    '',
    `CATEGORÍAS sugeridas: ${EVENTS_TPV_CATALOG_CATEGORIES.join(' | ')}`,
    '',
    'Borra o cambia las filas «Ejemplo · …» antes de importar.',
    'Luego: Servicios → Productos → Nuevo producto → Importar Excel.',
  ];
}

function sampleRows(): string[][] {
  // Orden: nombre, precio, iva, descripcion, categoria, coste, merma, ingredientes, stock, min, unidad, alergenos, codigo
  return [
    [
      'Ejemplo · Bocadillo jamón',
      '4,50',
      '10',
      'Barra del evento',
      'Catering',
      '1,80',
      '5',
      'Pan, Jamón, Tomate',
      '40',
      '10',
      'ud',
      'gluten',
      'EVT-BOC-01',
    ],
    [
      'Ejemplo · Agua 50cl',
      '1,50',
      '10',
      '',
      'Bebidas',
      '0,35',
      '2',
      '',
      '100',
      '20',
      'ud',
      '',
      'EVT-AGU-50',
    ],
    [
      'Ejemplo · Merch camiseta',
      '18,00',
      '21',
      'Venta general',
      'Extras',
      '6,00',
      '0',
      '',
      '20',
      '5',
      'ud',
      '',
      'EVT-MER-01',
    ],
    [
      'Ejemplo · Leche infantil',
      '1,20',
      '4',
      'Tipo superreducido',
      'Bebidas',
      '0,40',
      '1',
      '',
      '30',
      '8',
      'ud',
      '',
      'EVT-LEC-01',
    ],
  ];
}

function columnsHelpRows(): string[][] {
  return [
    ['columna', 'obligatorio', 'para qué'],
    ['nombre', 'sí', 'Nombre en el botón del TPV'],
    ['precio', 'sí', 'PVP de venta'],
    ['iva', 'recomendado', '% IVA: 10 comida, 21 general, u otro (ej. 4). Vacío → 10'],
    ['descripcion', 'opcional', 'Notas internas'],
    ['categoria', 'opcional', 'Agrupa (Catering, Bebidas…)'],
    ['coste', 'opcional', 'Coste unitario (escandallo)'],
    ['merma_pct', 'opcional', '% merma esperada (5 = 5%)'],
    ['ingredientes', 'opcional', 'Escandallo en texto: Ing1, Ing2'],
    ['stock', 'opcional', 'Stock inicial'],
    ['stock_minimo', 'opcional', 'Alerta de stock bajo'],
    ['unidad', 'opcional', 'ud, kg, l…'],
    ['alergenos', 'opcional', 'Separados por coma'],
    ['codigo', 'opcional', 'SKU estable'],
  ];
}

export function buildEventsTpvCatalogImportWorkbook(): XLSX.WorkBook {
  const rows = [EVENTS_TPV_CATALOG_HEADERS as unknown as string[], ...sampleRows()];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EVENTS_TPV_CATALOG_HEADERS.map((h) => {
    if (h === 'nombre' || h === 'ingredientes' || h === 'descripcion') return { wch: 28 };
    if (h === 'categoria' || h === 'alergenos') return { wch: 14 };
    if (h === 'iva') return { wch: 8 };
    return { wch: 12 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EVENTS_TPV_CATALOG_SHEET_NAME);

  const cols = XLSX.utils.aoa_to_sheet(columnsHelpRows());
  cols['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, cols, 'columnas');

  const help = XLSX.utils.aoa_to_sheet(instructionLines().map((line) => [line]));
  help['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, help, 'instrucciones');

  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ activeTab: 0 }] };
  return wb;
}

export function downloadEventsTpvCatalogImportTemplate() {
  XLSX.writeFile(buildEventsTpvCatalogImportWorkbook(), EVENTS_TPV_CATALOG_TEMPLATE_FILENAME);
}

export function isEventsTpvCatalogExampleName(nombre: string): boolean {
  return /^ejemplo(\s|·|-)/i.test(String(nombre || '').trim());
}

/** Precio ES: 4,50 o 1.250,00 */
export function parseEventsTpvCatalogPrice(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/€/gi, '')
    .replace(/\s/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized = s;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
