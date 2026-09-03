/**
 * Cantidad de escandallo / carta (RecipeQtyInput): coma y punto = decimal.
 * Evita el fallo típico: al editar «0,05» se pierde la coma y queda «05» / «050».
 */

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
  return Math.round(n * 1000) / 1000;
}

/**
 * Normaliza lo que escribe el usuario:
 * - punto → coma (teclado EN / iPad)
 * - «05» / «050» (coma perdida) → «0,5» / «0,50»
 * - una sola coma, máx. 3 decimales
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
    const dec = s.slice(commaIdx + 1).replace(/,/g, '').slice(0, 3);
    const intPart = intRaw === '' ? (s.endsWith(',') || dec.length > 0 ? '0' : '') : intRaw;
    if (intPart === '' && dec === '' && !s.endsWith(',')) return '';
    if (s.endsWith(',') && dec === '') return `${intPart},`;
    return `${intPart},${dec}`;
  }

  // Coma perdida: «05» «015» «050» → «0,5» «0,15» «0,50»
  if (/^0\d+$/.test(s)) {
    return `0,${s.slice(1).slice(0, 3)}`;
  }

  return s;
}

/** Número guardado → texto visible (es-ES, hasta 3 decimales). */
export function formatRecipeQtyDisplay(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('es-ES', {
    useGrouping: false,
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
}

export function isRecipeQtyDraftAllowed(raw: string): boolean {
  const s = String(raw || '');
  if (s === '') return true;
  // Tras sanitize debería cumplir; admite borrador intermedio con punto.
  return /^\d*[.,]?\d{0,3}$/.test(s.replace(/\s/g, ''));
}
