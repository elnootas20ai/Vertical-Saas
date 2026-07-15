/** Separador decimal del teclado numérico de la app (punto, no coma). */
export const DECIMAL_PAD_SEPARATOR = '.' as const;

/** Normaliza texto pegado o escrito: coma → punto y solo dígitos + un punto. */
export function sanitizeDecimalTyping(raw: string, maxDecimals = 2): string {
  if (!raw) return '';
  let s = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  if (maxDecimals <= 0) return s.replace(/\./g, '');
  const dotIdx = s.indexOf('.');
  if (dotIdx === -1) return s;
  const intPart = s.slice(0, dotIdx);
  const decPart = s.slice(dotIdx + 1).replace(/\./g, '').slice(0, maxDecimals);
  return decPart.length > 0 || s.endsWith('.') ? `${intPart}.${decPart}` : intPart;
}

/** Añade una tecla del pad (dígito, punto o borrar). */
export function appendDecimalNumpadKey(current: string, key: string, maxDecimals = 2): string {
  if (key === 'backspace') return current.slice(0, -1);
  if (key === '.') {
    if (maxDecimals <= 0) return current;
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (!/^\d$/.test(key)) return current;
  if (current.includes('.')) {
    const [, dec = ''] = current.split('.');
    if (dec.length >= maxDecimals) return current;
  }
  if (current === '0') return key;
  return current + key;
}

/** Convierte el valor del pad a número (acepta coma legacy). */
export function parseDecimalPadValue(raw: string): number {
  const s = raw.replace(/,/g, '.').trim();
  if (!s || s === '.') return Number.NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}
