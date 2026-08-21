import * as XLSX from 'xlsx';
import type { ImportFieldDef } from '../components/saas/GenericImportModal';

/**
 * Plantilla Excel Eventos → Carta TPV.
 * Sin marcas / líneas: una fila = un producto.
 * Incluye coste + % merma + ingredientes (escandallo).
 */

export const EVENTS_TPV_CATALOG_SHEET_NAME = 'productos';
export const EVENTS_TPV_CATALOG_TEMPLATE_FILENAME = 'plantilla_productos_tpv_eventos.xlsx';
export const EVENTS_TPV_CATALOG_TEMPLATE_VERSION = 1;

/** Cabeceras exactas (fila 1). No renombrar. */
export const EVENTS_TPV_CATALOG_HEADERS = [
  'nombre',
  'categoria',
  'precio',
  'coste',
  'merma_pct',
  'ingredientes',
  'iva',
  'stock',
  'stock_minimo',
  'unidad',
  'alergenos',
  'descripcion',
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
  { key: 'category', label: 'categoria', required: true, example: 'Catering' },
  { key: 'price', label: 'precio', required: true, example: '4,50' },
  { key: 'costPrice', label: 'coste', example: '1,80' },
  { key: 'mermaPct', label: 'merma_pct', example: '5' },
  { key: 'ingredients', label: 'ingredientes', example: 'Pan, Jamón, Tomate' },
  { key: 'taxRate', label: 'iva', example: '10' },
  { key: 'stock', label: 'stock', example: '40' },
  { key: 'minStock', label: 'stock_minimo', example: '10' },
  { key: 'unit', label: 'unidad', example: 'ud' },
  { key: 'allergens', label: 'alergenos', example: 'gluten' },
  { key: 'description', label: 'descripcion', example: 'Servicio barra' },
  { key: 'sku', label: 'codigo', example: 'EVT-BOC-01' },
];

export const EVENTS_TPV_CATALOG_HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'producto', 'articulo'],
  category: ['categoria', 'categoría', 'category', 'familia', 'seccion'],
  price: ['precio', 'price', 'pvp', 'precio venta'],
  costPrice: ['coste', 'coste_escandallo', 'costprice', 'cost price', 'coste unitario', 'precio coste'],
  mermaPct: ['merma_pct', 'merma', 'merma %', '% merma', 'merma%', 'waste', 'waste_pct'],
  ingredients: ['ingredientes', 'ingredients', 'escandallo', 'receta', 'componentes'],
  taxRate: ['iva', 'tax', 'taxrate', '% iva'],
  stock: ['stock', 'stock_actual', 'cantidad'],
  minStock: ['stock_minimo', 'stock minimo', 'min_stock', 'minimo'],
  unit: ['unidad', 'unit', 'ud'],
  allergens: ['alergenos', 'alérgenos', 'allergens'],
  description: ['descripcion', 'descripción', 'description', 'notas'],
  sku: ['codigo', 'código', 'sku', 'ref', 'referencia'],
};

function instructionLines(): string[] {
  return [
    `PLANTILLA PRODUCTOS TPV EVENTOS v${EVENTS_TPV_CATALOG_TEMPLATE_VERSION}`,
    '',
    'HOJA A USAR: «productos» (la primera).',
    'Sin marcas ni líneas: una fila = un producto para vender en el TPV del evento.',
    '',
    'COLUMNAS (fila 1 — no las renombres):',
    `  ${EVENTS_TPV_CATALOG_HEADERS.join(' | ')}`,
    '',
    'OBLIGATORIO: nombre · categoria · precio',
    'ESCANDALLO / MERMAS:',
    '  · coste — coste unitario del producto (€)',
    '  · merma_pct — % de merma esperada (ej. 5 = 5%)',
    '  · ingredientes — lista separada por comas (escandallo / receta)',
    '',
    'OPCIONAL: iva · stock · stock_minimo · unidad · alergenos · descripcion · codigo',
    'IVA vacío → 10%. Precio en formato ES (4,50 o 1.250,00).',
    '',
    `CATEGORÍAS sugeridas: ${EVENTS_TPV_CATALOG_CATEGORIES.join(' | ')}`,
    '',
    'Borra o cambia las filas «Ejemplo · …» antes de importar.',
    'Luego: Catálogo → Carta → Nuevo producto → Importar Excel.',
  ];
}

function sampleRows(): string[][] {
  return [
    [
      'Ejemplo · Bocadillo jamón',
      'Catering',
      '4,50',
      '1,80',
      '5',
      'Pan, Jamón, Tomate',
      '10',
      '40',
      '10',
      'ud',
      'gluten',
      'Barra del evento',
      'EVT-BOC-01',
    ],
    [
      'Ejemplo · Agua 50cl',
      'Bebidas',
      '1,50',
      '0,35',
      '2',
      '',
      '10',
      '100',
      '20',
      'ud',
      '',
      '',
      'EVT-AGU-50',
    ],
    [
      'Ejemplo · Café',
      'Bebidas',
      '1,80',
      '0,25',
      '3',
      'Café, Azúcar',
      '10',
      '80',
      '15',
      'ud',
      '',
      'Máquina café',
      'EVT-CAF-01',
    ],
  ];
}

function columnsHelpRows(): string[][] {
  return [
    ['columna', 'obligatorio', 'para qué'],
    ['nombre', 'sí', 'Nombre en el botón del TPV'],
    ['categoria', 'sí', 'Agrupa en el TPV (Catering, Bebidas…)'],
    ['precio', 'sí', 'PVP de venta'],
    ['coste', 'recomendado', 'Coste unitario (escandallo)'],
    ['merma_pct', 'recomendado', '% merma esperada (5 = 5%)'],
    ['ingredientes', 'recomendado', 'Escandallo en texto: Ing1, Ing2, Ing3'],
    ['iva', 'opcional', 'Por defecto 10'],
    ['stock', 'opcional', 'Stock inicial'],
    ['stock_minimo', 'opcional', 'Alerta de stock bajo'],
    ['unidad', 'opcional', 'ud, kg, l…'],
    ['alergenos', 'opcional', 'Separados por coma'],
    ['descripcion', 'opcional', 'Notas internas'],
    ['codigo', 'opcional', 'SKU estable para actualizar sin duplicar'],
  ];
}

export function buildEventsTpvCatalogImportWorkbook(): XLSX.WorkBook {
  const rows = [EVENTS_TPV_CATALOG_HEADERS as unknown as string[], ...sampleRows()];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EVENTS_TPV_CATALOG_HEADERS.map((h) => {
    if (h === 'nombre' || h === 'ingredientes' || h === 'descripcion') return { wch: 28 };
    if (h === 'categoria' || h === 'alergenos') return { wch: 14 };
    return { wch: 12 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EVENTS_TPV_CATALOG_SHEET_NAME);

  const cols = XLSX.utils.aoa_to_sheet(columnsHelpRows());
  cols['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 48 }];
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
