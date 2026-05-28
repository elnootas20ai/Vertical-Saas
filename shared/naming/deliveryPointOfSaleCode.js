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

const PDV_CODE_SEQ_RE = /-(\d+)$/i;

/** Límites compartidos front + API (evitar textos enormes en UI / Couch). */
export const PDV_RETAIL_LIMITS = {
  /** Cabe en sidebar, topbar y tarjetas (se trunca en UI si hiciera falta). */
  storeNameMax: 40,
  pdvCodeMax: 24,
  pdvCodeMin: 2,
  addressMax: 200,
  cityMax: 80,
  postalCodeMax: 12,
  phoneMax: 24,
  emailMax: 120,
  customTypeMax: 60,
  notesMax: 500,
};

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;
/** Código: letras/números y guiones, sin empezar/terminar en guion (ej. BAD-01). */
const PDV_CODE_FORMAT_RE = /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/;

export function clampText(raw, maxLen) {
  const n = Number(maxLen);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(raw ?? '').slice(0, n);
}

export function sanitizeStoreDisplayName(raw) {
  const s = String(raw || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .replace(/\s+/g, ' ');
  return clampText(s, PDV_RETAIL_LIMITS.storeNameMax);
}

/** Recorte defensivo en sidebar/topbar (datos legacy pueden ser más largos). */
export function truncateStoreLabelForUi(raw, maxLen = PDV_RETAIL_LIMITS.storeNameMax) {
  const s = String(raw || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1))}…`;
}

export function validateStoreDisplayName(raw) {
  const s = sanitizeStoreDisplayName(raw);
  if (!s) return 'El nombre es obligatorio';
  if (String(raw || '').replace(CONTROL_CHARS_RE, '').trim().length > PDV_RETAIL_LIMITS.storeNameMax) {
    return `El nombre no puede superar ${PDV_RETAIL_LIMITS.storeNameMax} caracteres`;
  }
  return null;
}

/** Normaliza entrada de usuario: «OLE -02» → «OLE-02». */
export function normalizePdvCodeInput(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-+/g, '-');
}

export function sanitizePdvCodeInput(raw) {
  return clampText(normalizePdvCodeInput(raw), PDV_RETAIL_LIMITS.pdvCodeMax);
}

export function validatePdvCodeInput(raw) {
  const code = sanitizePdvCodeInput(raw);
  if (!code) return 'El código PDV es obligatorio';
  if (code.length < PDV_RETAIL_LIMITS.pdvCodeMin) {
    return `El código debe tener al menos ${PDV_RETAIL_LIMITS.pdvCodeMin} caracteres (ej. BAD-01)`;
  }
  if (code.length > PDV_RETAIL_LIMITS.pdvCodeMax) {
    return `El código no puede superar ${PDV_RETAIL_LIMITS.pdvCodeMax} caracteres`;
  }
  if (!PDV_CODE_FORMAT_RE.test(code) || code.includes('--')) {
    return 'Usa letras, números y un guion (ej. BAD-01)';
  }
  return null;
}

export function sanitizeRetailTextField(raw, maxLen) {
  return clampText(
    String(raw || '')
      .replace(CONTROL_CHARS_RE, '')
      .trim()
      .replace(/\s+/g, ' '),
    maxLen,
  );
}

/**
 * Siguiente código PREFIX-01, PREFIX-02…
 * El número (01, 02…) es **global por cuenta**: 1.ª tienda → 01, 2.ª → 02 (aunque cambie el prefijo BAD/GRA).
 * Cuenta códigos legacy tipo PDV-01 para no repetir 01 en la segunda tienda.
 */
export function suggestNextPdvCode(displayName, existingCodes) {
  const prefix = derivePdvCodePrefix(displayName);
  let max = 0;
  for (const c of existingCodes || []) {
    const m = String(c).trim().match(PDV_CODE_SEQ_RE);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

const PDV_NAME_SUFFIX_RE = /\s*-\s*(\d{1,2})\s*$/i;

/** Quita el sufijo « - 02 » del nombre para obtener la base (p. ej. «Badalona»). */
export function stripPdvDisplayNameBase(displayName) {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) return '';
  const without = trimmed.replace(PDV_NAME_SUFFIX_RE, '').trim();
  return without || trimmed;
}

/**
 * Nombre visible al crear: 1.ª tienda de la cuenta = solo «Badalona»; 2.ª en adelante = «Badalona - 02».
 * El número coincide con el del código (01 → sin sufijo en nombre; 02+ → sufijo en nombre).
 */
/** Comprueba si un código PDV ya está en uso (comparación normalizada). */
export function isPdvCodeAlreadyUsed(code, existingCodes, exceptCode) {
  const norm = normalizePdvCodeInput(code);
  if (!norm) return false;
  const exceptNorm = exceptCode ? normalizePdvCodeInput(exceptCode) : '';
  for (const c of existingCodes || []) {
    const existing = normalizePdvCodeInput(c);
    if (!existing || existing === exceptNorm) continue;
    if (existing === norm) return true;
  }
  return false;
}

export function suggestNextPdvDisplayName(displayName, existingNames, existingCodes, explicitCode) {
  const base = stripPdvDisplayNameBase(displayName);
  if (!base) return '';

  void existingNames;

  const code =
    String(explicitCode || '').trim() || suggestNextPdvCode(base, existingCodes || []);
  const codeMatch = code.match(PDV_CODE_SEQ_RE);
  const seq = codeMatch ? parseInt(codeMatch[1], 10) : 1;

  if (seq <= 1) return base;

  return `${base} - ${String(seq).padStart(2, '0')}`;
}
