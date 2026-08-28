/**
 * Números en UI Vertial: locale es-ES.
 * - Miles: 100.000 (nunca 100000)
 * - Decimales / dinero: 100,00
 */

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Entero o decimal con separador de miles: 100.000 · 1.234,5 */
export function formatNumberEs(
  value: number | string | null | undefined,
  opts?: { minFraction?: number; maxFraction?: number },
): string {
  const n = toFiniteNumber(value);
  if (n == null) return value == null ? '' : String(value);
  const min = opts?.minFraction ?? 0;
  const max = opts?.maxFraction ?? Math.max(min, 2);
  return n.toLocaleString('es-ES', {
    useGrouping: true,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/** Siempre 2 decimales (importes): 100,00 · 1.234,56 */
export function formatDecimalEs(value: number | string | null | undefined): string {
  return formatNumberEs(value, { minFraction: 2, maxFraction: 2 });
}

/** Importe con euro: 100,00 € */
export function formatMoneyEs(value: number | string | null | undefined): string {
  const formatted = formatDecimalEs(value);
  if (!formatted) return '';
  return `${formatted} €`;
}

/** Días / cantidades con hasta N decimales si hace falta: 2,5 · 10 · -0,27 */
export function formatQtyEs(value: number | string | null | undefined, maxFraction = 1): string {
  const n = toFiniteNumber(value);
  if (n == null) return value == null ? '' : String(value);
  const factor = 10 ** Math.max(0, Math.min(8, Math.floor(maxFraction)));
  const rounded = Math.round(n * factor) / factor;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return rounded.toLocaleString('es-ES', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: isInt ? 0 : maxFraction,
  });
}
