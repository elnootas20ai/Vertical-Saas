import * as XLSX from 'xlsx';
import type { ImportFieldDef } from '../components/saas/GenericImportModal';
import { normalizeImportHeader } from './importHeaderMapping';

/** Plantilla de recuento — solo unidades, sin precios. */
export const DELIVERY_STOCK_IMPORT_COLUMNS = ['sku', 'name', 'quantity', 'unit'] as const;

export const DELIVERY_STOCK_IMPORT_LABELS: Record<(typeof DELIVERY_STOCK_IMPORT_COLUMNS)[number], string> = {
  sku: 'sku',
  name: 'nombre',
  quantity: 'cantidad',
  unit: 'unidad',
};

export const DELIVERY_STOCK_TEMPLATE_HEADERS = DELIVERY_STOCK_IMPORT_COLUMNS.map(
  (key) => DELIVERY_STOCK_IMPORT_LABELS[key],
);

export const DELIVERY_STOCK_TEMPLATE_FILENAME = 'plantilla_stock_delivery.xlsx';
export const DELIVERY_STOCK_SHEET_NAME = 'stock';

export const DELIVERY_STOCK_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'sku', label: 'sku', example: 'BEB-001' },
  { key: 'name', label: 'nombre', example: 'Coca-Cola 33cl' },
  { key: 'quantity', label: 'cantidad', required: true, example: '48' },
  { key: 'unit', label: 'unidad', example: 'ud' },
];

export const DELIVERY_STOCK_HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'ref', 'referencia', 'cod'],
  name: ['nombre', 'name', 'producto', 'articulo', 'product name'],
  quantity: ['cantidad', 'quantity', 'stock', 'stock_actual', 'stock actual', 'existencias', 'unidades'],
  unit: ['unidad', 'unit', 'uom', 'medida'],
};

export type DeliveryStockImportIssue = {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

export type DeliveryStockImportValidation = {
  ok: boolean;
  issues: DeliveryStockImportIssue[];
};

export function buildDeliveryStockSampleRows(): string[][] {
  return [
    ['BEB-001', 'Coca-Cola 33cl', '120', 'ud'],
    ['PIZ-001', 'Pizza Margarita', '0', 'ud'],
    ['', 'Agua 50cl', '80', 'ud'],
    ['COM-001', 'Patatas fritas', '25', 'ud'],
  ];
}

function instructionLines(): string[] {
  return [
    'PLANTILLA STOCK — Recuento de unidades en tienda',
    '',
    'HOJA A USAR: «stock» (la primera).',
    '',
    'COLUMNAS (fila 1 — NO renombrar):',
    `  ${DELIVERY_STOCK_TEMPLATE_HEADERS.join(' | ')}`,
    '',
    'REGLAS:',
    '  · Importa ANTES el catálogo (productos + precios de venta).',
    '  · Cada fila actualiza un producto YA existente por SKU o por nombre.',
    '  · cantidad — unidades que hay ahora (recuento semanal o carga inicial).',
    '  · sku — recomendado (más fiable que el nombre).',
    '  · nombre — alternativa si no tienes SKU (debe coincidir con el catálogo).',
    '  · unidad — opcional (ud, kg, L…); si vacío se mantiene la del producto.',
    '',
    'NO incluyas precios de venta ni de compra aquí.',
    'El coste de compra va en proveedores / facturas de compra.',
    '',
    'Consejo: exporta mentalmente tu lista, cuenta en almacén y pega cantidades.',
  ];
}

export function isOfficialStockTemplateHeaders(headers: string[]): boolean {
  if (headers.length < 3) return false;
  const required = ['sku', 'nombre', 'cantidad'] as const;
  return required.every(
    (expected, idx) => normalizeImportHeader(String(headers[idx] ?? '')) === expected,
  );
}

export function validateDeliveryStockImportEntries(
  entries: Record<string, string>[],
): DeliveryStockImportValidation {
  const issues: DeliveryStockImportIssue[] = [];

  entries.forEach((entry, index) => {
    const row = index + 2;
    const sku = String(entry.sku || '').trim();
    const name = String(entry.name || entry.nombre || '').trim();
    const qtyRaw = String(entry.quantity || entry.cantidad || entry.stockQuantity || '').trim();
    const qty = Number(qtyRaw.replace(',', '.'));

    if (!sku && !name) {
      issues.push({
        row,
        field: 'sku/nombre',
        message: 'Indica SKU o nombre del producto (debe existir en catálogo)',
        severity: 'error',
      });
    }

    if (!qtyRaw) {
      issues.push({ row, field: 'cantidad', message: 'Falta la cantidad', severity: 'error' });
    } else if (!Number.isFinite(qty) || qty < 0) {
      issues.push({
        row,
        field: 'cantidad',
        message: 'Cantidad no válida (usa número ≥ 0)',
        severity: 'error',
      });
    }
  });

  return {
    ok: issues.every((i) => i.severity !== 'error'),
    issues,
  };
}

export function formatDeliveryStockImportValidationToast(validation: DeliveryStockImportValidation): string {
  const errors = validation.issues.filter((i) => i.severity === 'error').slice(0, 5);
  if (errors.length === 0) return '';
  return errors.map((e) => `Fila ${e.row} (${e.field}): ${e.message}`).join('\n');
}

export function buildDeliveryStockImportWorkbook() {
  const rows = [DELIVERY_STOCK_TEMPLATE_HEADERS, ...buildDeliveryStockSampleRows()];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 8 }];
  if (sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] };
  }

  const helpSheet = XLSX.utils.aoa_to_sheet(instructionLines().map((line) => [line]));
  helpSheet['!cols'] = [{ wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, DELIVERY_STOCK_SHEET_NAME);
  XLSX.utils.book_append_sheet(wb, helpSheet, 'instrucciones');
  wb.Workbook = { ...(wb.Workbook || {}), Views: [{ activeTab: 0 }] };
  return wb;
}

export function downloadDeliveryStockImportTemplate() {
  const wb = buildDeliveryStockImportWorkbook();
  XLSX.writeFile(wb, DELIVERY_STOCK_TEMPLATE_FILENAME);
}
