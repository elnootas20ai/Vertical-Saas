import * as XLSX from 'xlsx';
import type { ImportFieldDef } from '../components/saas/GenericImportModal';
import {
  EVENT_SERVICE_CATEGORY_LABELS,
  EVENT_SERVICE_UNIT_LABELS,
  type EventServiceCategory,
  type EventServiceUnit,
} from './eventsTypes';
import { normalizeImportHeader } from './importHeaderMapping';

export const EVENTS_SERVICES_SHEET_NAME = 'servicios';
export const EVENTS_SERVICES_TEMPLATE_FILENAME = 'plantilla_servicios_eventos.xlsx';

export const EVENTS_SERVICES_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'Nombre', required: true, example: 'Banquete premium' },
  { key: 'category', label: 'Categoría', example: 'Catering' },
  { key: 'price', label: 'Precio', example: '85,00' },
  { key: 'taxRate', label: 'IVA', example: '21' },
  { key: 'unit', label: 'Unidad', example: 'Por persona' },
  { key: 'description', label: 'Descripción', example: 'Menú de 4 platos' },
];

export const EVENTS_SERVICES_HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'servicio', 'concepto'],
  category: ['categoria', 'categoría', 'category', 'tipo'],
  price: ['precio', 'price', 'tarifa', 'importe', 'pvp'],
  taxRate: ['iva', 'tax', 'taxrate', '% iva', 'tipo iva'],
  unit: ['unidad', 'unit', 'modo', 'tipo precio', 'tipo de precio'],
  description: ['descripcion', 'descripción', 'description', 'notas', 'detalle'],
};

const CATEGORY_ALIASES: Record<string, EventServiceCategory> = {
  dj: 'musica',
  'musica dj': 'musica',
  'musica / dj': 'musica',
  'musica/dj': 'musica',
  foto: 'fotografia',
  photos: 'fotografia',
  staff: 'personal',
    other: 'otro',
};

const UNIT_ALIASES: Record<string, EventServiceUnit> = {
  pack: 'fijo',
  evento: 'fijo',
  ud: 'fijo',
  pax: 'por_persona',
  persona: 'por_persona',
  comensal: 'por_persona',
  hora: 'por_hora',
  h: 'por_hora',
  hr: 'por_hora',
};

export function mapEventServiceCategory(raw: string): EventServiceCategory {
  const n = normalizeImportHeader(raw);
  if (!n) return 'otro';
  const fromAlias = CATEGORY_ALIASES[n];
  if (fromAlias) return fromAlias;
  for (const [id, label] of Object.entries(EVENT_SERVICE_CATEGORY_LABELS)) {
    if (n === id || n === normalizeImportHeader(label)) return id as EventServiceCategory;
  }
  return 'otro';
}

export function mapEventServiceUnit(raw: string): EventServiceUnit {
  const n = normalizeImportHeader(raw);
  if (!n) return 'fijo';
  const fromAlias = UNIT_ALIASES[n];
  if (fromAlias) return fromAlias;
  for (const [id, label] of Object.entries(EVENT_SERVICE_UNIT_LABELS)) {
    if (n === normalizeImportHeader(id) || n === normalizeImportHeader(label)) {
      return id as EventServiceUnit;
    }
  }
  return 'fijo';
}

/** Precio ES: 85,50 / 1.250,00 / 85.5 */
export function parseEventServicePrice(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/€/gi, '')
    .replace(/\s/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const normalized =
    lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function isEventsServicesExampleName(nombre: string): boolean {
  return /^ejemplo(\s|·|-)/i.test(String(nombre || '').trim());
}

function instructionLines(): string[] {
  const cats = Object.values(EVENT_SERVICE_CATEGORY_LABELS).join(' | ');
  const units = Object.values(EVENT_SERVICE_UNIT_LABELS).join(' | ');
  return [
    'PLANTILLA SERVICIOS Y TARIFAS — EVENTOS',
    '',
    'HOJA A USAR: «servicios» (la primera).',
    '',
    'COLUMNAS (fila 1 — no las renombres):',
    '  Nombre* | Categoría | Precio | IVA | Unidad | Descripción',
    '',
    'OBLIGATORIO: Nombre.',
    'Precio en formato ES (85,00 o 1.250,50).',
    'IVA: 10 (comida/catering) o 21 (servicios / general). Vacío → 21%.',
    '',
    'CATEGORÍAS:',
    `  ${cats}`,
    '',
    'UNIDADES:',
    `  ${units}`,
    '',
    'Borra o cambia las filas «Ejemplo · …» antes de importar.',
    'Añade una fila por servicio. Luego: Servicios y tarifas → Nuevo servicio → Importar.',
  ];
}

function sampleRows(): string[][] {
  return [
    ['Ejemplo · Banquete premium', 'Catering', '85,00', '10', 'Por persona', 'Menú de 4 platos'],
    ['Ejemplo · DJ 6 horas', 'Música / DJ', '650,00', '21', 'Precio fijo', 'Equipo de sonido incluido'],
    ['Ejemplo · Coordinación del día', 'Coordinación', '45,00', '21', 'Por hora', 'Wedding planner in situ'],
  ];
}

export function buildEventsServicesImportWorkbook(): XLSX.WorkBook {
  const headers = EVENTS_SERVICES_IMPORT_FIELDS.map((f) => f.label);
  const rows = [headers, ...sampleRows()];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 32 },
    { wch: 16 },
    { wch: 12 },
    { wch: 8 },
    { wch: 14 },
    { wch: 36 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EVENTS_SERVICES_SHEET_NAME);

  const help = XLSX.utils.aoa_to_sheet(instructionLines().map((line) => [line]));
  help['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, help, 'instrucciones');
  return wb;
}

export function downloadEventsServicesImportTemplate() {
  XLSX.writeFile(buildEventsServicesImportWorkbook(), EVENTS_SERVICES_TEMPLATE_FILENAME);
}
