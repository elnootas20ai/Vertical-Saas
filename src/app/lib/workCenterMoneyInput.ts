/**
 * Entrada de importes estilo es-ES en modales de centro de trabajo:
 * miles con punto; decimales opcionales con coma (solo si allowDecimals).
 */

export function formatMoneyAsYouType(raw: string, allowDecimals: boolean): string {
  const s0 = raw.replace(/\s/g, '');
  if (!s0) return '';

  if (!allowDecimals) {
    const digits = s0.replace(/\D/g, '');
    if (!digits) return '';
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 0) return '';
    return n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
  }

  if (s0.includes(',')) {
    const lastComma = s0.lastIndexOf(',');
    const intDigits = s0.slice(0, lastComma).replace(/\D/g, '');
    const decDigits = s0.slice(lastComma + 1).replace(/\D/g, '').slice(0, 2);
    if (intDigits === '' && decDigits === '' && !s0.endsWith(',')) return '';
    const intNum = intDigits ? parseInt(intDigits, 10) : 0;
    if (!Number.isFinite(intNum) || intNum < 0) return '';
    let out = intNum.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
    if (decDigits.length > 0 || s0.endsWith(',')) {
      out += `,${decDigits}`;
    }
    return out;
  }

  const intDigits = s0.replace(/\D/g, '');
  if (!intDigits) return '';
  const n = parseInt(intDigits, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
}

/** Convierte texto con miles (.) y decimales (,) a número. Cadena vacía → NaN. */
export function parseSpanishMoneyInput(raw: string): number {
  const s = raw.replace(/\s/g, '').trim();
  if (!s) return NaN;
  if (s.includes(',')) {
    const lastComma = s.lastIndexOf(',');
    const intDigits = s.slice(0, lastComma).replace(/\D/g, '');
    const decDigits = s.slice(lastComma + 1).replace(/\D/g, '');
    const base = intDigits || '0';
    if (!decDigits) return parseInt(base, 10);
    return Number(`${base}.${decDigits}`);
  }
  const intDigits = s.replace(/\D/g, '');
  if (!intDigits) return NaN;
  return parseInt(intDigits, 10);
}

/** Valor numérico guardado en API → texto mostrado en el input. */
export function moneyNumberToDisplay(n: number | undefined | null, allowDecimals: boolean): string {
  if (n === undefined || n === null || !Number.isFinite(n) || n < 0) return '';
  if (!allowDecimals) {
    return formatMoneyAsYouType(String(Math.round(n)), false);
  }
  const abs = Math.abs(n);
  const intPart = Math.floor(abs + 1e-9);
  const decCents = Math.round((abs - intPart) * 100);
  if (decCents === 0) {
    return formatMoneyAsYouType(String(intPart), false);
  }
  const decStr = String(decCents).padStart(2, '0');
  return formatMoneyAsYouType(`${intPart},${decStr}`, true);
}
