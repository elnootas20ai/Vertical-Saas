/**
 * Fechas en UI Vertial: siempre día / mes / año (es-ES).
 * Almacenamiento y <input type="date"> siguen en yyyy-mm-dd.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseToDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (DATE_ONLY.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Fecha visible: 03/09/2026 */
export function formatDateEs(value: string | Date | null | undefined): string {
  const dt = parseToDate(value);
  if (!dt) return value == null ? '' : String(value);
  return dt.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Rango: 03/09/2026 → 05/09/2026 */
export function formatDateRangeEs(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  const a = formatDateEs(start);
  const b = formatDateEs(end);
  if (!a && !b) return '';
  if (!b || a === b) return a;
  if (!a) return b;
  return `${a} → ${b}`;
}

/** Fecha + hora: 03/09/2026, 14:30 */
export function formatDateTimeEs(value: string | Date | null | undefined): string {
  const dt = parseToDate(value);
  if (!dt) return value == null ? '' : String(value);
  return dt.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
