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

/**
 * Parsea texto DD/MM/YYYY o DD-MM-YYYY → yyyy-mm-dd.
 * Acepta años futuros (reservas, citas).
 */
export function parseDateEsToIso(value: string): string | null {
  const raw = String(value || '').trim().replace(/-/g, '/');
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T12:00:00`);
  if (
    check.getFullYear() !== year
    || check.getMonth() + 1 !== month
    || check.getDate() !== day
  ) {
    return null;
  }
  return iso;
}

/**
 * Formatea mientras escribes: día / mes / año.
 * Acepta dígitos o separadores / y -.
 */
export function formatDateEsAsTyping(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';

  let day = digits.slice(0, 2);
  let month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (day.length === 2) {
    const d = Number(day);
    if (d === 0) day = '01';
    else if (d > 31) day = '31';
  }

  if (month.length === 2) {
    const m = Number(month);
    if (m === 0) month = '01';
    else if (m > 12) month = '12';
  }

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}
