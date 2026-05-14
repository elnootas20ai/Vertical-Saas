/**
 * Códigos automáticos de punto de venta (Delivery / TPV / centros tipo PDV).
 *
 * Única fuente de verdad para esta regla. El front (`deliveryApi`) reexporta desde aquí;
 * el backend importa este mismo archivo (ver `shared/naming/README.md`).
 *
 * Para otro vertical con regla parecida: copia este archivo con otro nombre, ajusta
 * stop-words o longitud de prefijo, y enlaza desde tu controller + API client.
 */

const PDV_STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'lo', 'de', 'del', 'al', 'en', 'y', 'con', 'por', 'un', 'una', 'unos', 'unas',
  'the', 'and', 'of', 'a',
]);

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function significantTokens(raw) {
  const n = stripDiacritics(String(raw || '').trim());
  return n
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0 && !PDV_STOP_WORDS.has(t));
}

function alnumUpper(s) {
  return stripDiacritics(String(s || '')).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Prefijo de 3 caracteres (p. ej. «Badalona» → BAD, «La Tiana» → TIA). */
export function derivePdvCodePrefix(displayName) {
  const n = String(displayName || '').trim();
  if (!n) return 'PDV';
  const tokens = significantTokens(n);

  if (tokens.length === 0) {
    const a = alnumUpper(n);
    return (a.slice(0, 3) || 'PDV').slice(0, 3);
  }
  if (tokens.length === 1) {
    const a = alnumUpper(tokens[0]);
    return (a.slice(0, 3) || 'PDV').slice(0, 3);
  }
  let ini = tokens
    .slice(0, 3)
    .map((t) => t[0])
    .join('')
    .toUpperCase();
  if (ini.length < 3) {
    const w0 = alnumUpper(tokens[0]);
    ini = (w0.slice(0, 3) + ini).slice(0, 3).toUpperCase();
  }
  return ini.slice(0, 3);
}

/** Siguiente código PREFIX-01, PREFIX-02… según códigos ya usados. */
export function suggestNextPdvCode(displayName, existingCodes) {
  const prefix = derivePdvCodePrefix(displayName);
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}-(\\d+)$`, 'i');
  let max = 0;
  for (const c of existingCodes || []) {
    const m = String(c).trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}
