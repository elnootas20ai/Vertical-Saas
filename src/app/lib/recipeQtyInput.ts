/**
 * Cantidad de escandallo / carta (RecipeQtyInput): coma y punto = decimal.
 * Evita el fallo típico: al editar «0,05» se pierde la coma y queda «05» / «050».
 * Conserva ceros finales tipados («1,2000») para ver la precisión en receta.
 */

export const RECIPE_QTY_MAX_DECIMALS = 4;

/** Texto → número (null si incompleto o inválido). */
export function parseRecipeQtyDraft(
  raw: string,
  opts?: { commitIncomplete?: boolean },
): number | null {
  let trimmed = sanitizeRecipeQtyTyping(String(raw || ''));
  if (trimmed === '' || trimmed === ',') return null;
  // Interno con punto
  let normalized = trimmed.replace(',', '.');
  if (normalized.endsWith('.')) {
    if (!opts?.commitIncomplete) return null;
    normalized = normalized.slice(0, -1);
    if (normalized === '') return null;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  const factor = 10 ** RECIPE_QTY_MAX_DECIMALS;
  return Math.round(n * factor) / factor;
}

/**
 * Normaliza lo que escribe el usuario:
 * - punto → coma (teclado EN / iPad)
 * - «05» / «050» (coma perdida) → «0,5» / «0,50»
 * - una sola coma, máx. RECIPE_QTY_MAX_DECIMALS decimales (incluye ceros finales)
 */
export function sanitizeRecipeQtyTyping(raw: string): string {
  let s = String(raw || '').replace(/\s/g, '');
  if (!s) return '';

  // Si no hay coma, un solo punto = decimal (iPad / teclado EN).
  if (!s.includes(',')) {
    const dots = (s.match(/\./g) || []).length;
    if (dots === 1) s = s.replace('.', ',');
  }

  s = s.replace(/[^\d,]/g, '');

  const commaIdx = s.indexOf(',');
  if (commaIdx !== -1) {
    const intRaw = s.slice(0, commaIdx).replace(/,/g, '');
    const dec = s.slice(commaIdx + 1).replace(/,/g, '').slice(0, RECIPE_QTY_MAX_DECIMALS);
    const intPart = intRaw === '' ? (s.endsWith(',') || dec.length > 0 ? '0' : '') : intRaw;
    if (intPart === '' && dec === '' && !s.endsWith(',')) return '';
    if (s.endsWith(',') && dec === '') return `${intPart},`;
    return `${intPart},${dec}`;
  }

  // Coma perdida: «05» «015» «050» → «0,5» «0,15» «0,50»
  if (/^0\d+$/.test(s)) {
    return `0,${s.slice(1).slice(0, RECIPE_QTY_MAX_DECIMALS)}`;
  }

  return s;
}

/**
 * Tras blur/commit: deja el texto tipado (ceros finales incluidos).
 * Solo limpia borradores incompletos («1,» → «1»).
 */
export function commitRecipeQtyDraft(raw: string, fallbackValue: number): string {
  const sanitized = sanitizeRecipeQtyTyping(raw);
  const parsed = parseRecipeQtyDraft(sanitized, { commitIncomplete: true });
  if (parsed == null) return formatRecipeQtyDisplay(fallbackValue);
  if (sanitized.endsWith(',')) return formatRecipeQtyDisplay(parsed);
  return sanitized || formatRecipeQtyDisplay(parsed);
}

/** Número guardado → texto visible (es-ES). No inventa ceros; sí muestra los significativos. */
export function formatRecipeQtyDisplay(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  const factor = 10 ** RECIPE_QTY_MAX_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toLocaleString('es-ES', {
    useGrouping: false,
    maximumFractionDigits: RECIPE_QTY_MAX_DECIMALS,
    minimumFractionDigits: 0,
  });
}

/**
 * Preferir el texto tipado guardado («2,50») si sigue cuadrando con el número.
 * Así al reabrir la ficha no se pierde el 0 final.
 */
export function resolveRecipeQtyDisplay(quantity: number, quantityText?: string | null): string {
  const text = String(quantityText || '').trim();
  if (!text) return formatRecipeQtyDisplay(quantity);
  const parsed = parseRecipeQtyDraft(text, { commitIncomplete: true });
  if (parsed == null) return formatRecipeQtyDisplay(quantity);
  const factor = 10 ** RECIPE_QTY_MAX_DECIMALS;
  const q = Math.round(Number(quantity) * factor) / factor;
  if (parsed !== q) return formatRecipeQtyDisplay(quantity);
  return commitRecipeQtyDraft(text, q);
}

export function isRecipeQtyDraftAllowed(raw: string): boolean {
  const s = String(raw || '');
  if (s === '') return true;
  // Tras sanitize debería cumplir; admite borrador intermedio con punto.
  return new RegExp(`^\\d*[.,]?\\d{0,${RECIPE_QTY_MAX_DECIMALS}}$`).test(s.replace(/\s/g, ''));
}
