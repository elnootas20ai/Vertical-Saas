/**
 * Entrada de importes estilo es-ES en modales de centro de trabajo:
 * miles con punto; decimales con coma (solo si allowDecimals).
 * En iPad/teclado EN el decimal suele ser «.» → se normaliza a «,».
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

  // Si no hay coma aún, un punto con ≤2 decimales (o acabando en punto) = decimal iPad/EN.
  let s = s0;
  if (!s.includes(',')) {
    const dots = (s.match(/\./g) || []).length;
    if (dots === 1) {
      const lastDot = s.lastIndexOf('.');
      const afterDigits = s.slice(lastDot + 1).replace(/\D/g, '');
      const endsWithDot = s.endsWith('.');
      if (endsWithDot || afterDigits.length <= 2) {
        s = `${s.slice(0, lastDot)},${s.slice(lastDot + 1)}`;
      }
    }
  }

  if (s.includes(',')) {
    const lastComma = s.lastIndexOf(',');
    const intDigits = s.slice(0, lastComma).replace(/\D/g, '');
    const decDigits = s.slice(lastComma + 1).replace(/\D/g, '').slice(0, 2);
    if (intDigits === '' && decDigits === '' && !s.endsWith(',')) return '';
    const intNum = intDigits ? parseInt(intDigits, 10) : 0;
    if (!Number.isFinite(intNum) || intNum < 0) return '';
    let out = intNum.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
    if (decDigits.length > 0 || s.endsWith(',')) {
      out += `,${decDigits}`;
    }
    return out;
  }

  const intDigits = s.replace(/\D/g, '');
  if (!intDigits) return '';
  const n = parseInt(intDigits, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
}

/**
 * Tras reformatear un input controlado, React deja el caret al inicio.
 * Llamar tras onChange (y/o en useLayoutEffect) para escribir al final.
 */
export function scheduleMoneyInputCaretToEnd(el: HTMLInputElement | null | undefined): void {
  if (!el || typeof window === 'undefined') return;
  const place = () => {
    try {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  };
  place();
  window.requestAnimationFrame(() => {
    place();
    window.requestAnimationFrame(place);
  });
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
