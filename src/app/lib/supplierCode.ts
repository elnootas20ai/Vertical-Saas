/** Código interno de proveedor: enlaza pedidos, facturas y OCR. */

/** Máx. caracteres del código (letras/números + guión). */
export const SUPPLIER_CODE_MAX_LEN = 12;

export function normalizeSupplierCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9._-]/g, '')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, SUPPLIER_CODE_MAX_LEN);
}

/** Entrada del campo código: mayúsculas, solo A-Z 0-9 . _ - y tope de longitud. */
export function sanitizeSupplierCodeInput(raw: string): string {
  return normalizeSupplierCode(raw);
}

/** Base del código a partir del nombre (p. ej. «Makro» → MAKRO). */
export function slugFromSupplierName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, SUPPLIER_CODE_MAX_LEN);
}

/** Tres letras del nombre para el prefijo del código (p. ej. «Makro» → MAK). */
export function supplierInitialsFromName(name: string): string {
  const slug = slugFromSupplierName(name);
  if (!slug) return 'PROV';
  if (slug.length >= 3) return slug.slice(0, 3);
  return slug.padEnd(3, 'X').slice(0, 3);
}

function nextSequentialCode(
  prefix: string,
  suppliers: Array<{ _id?: string; code?: string | null } | null | undefined>,
  excludeId?: string,
): string {
  const skip = String(excludeId || '').trim();
  const safePrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${safePrefix}-(\\d+)$`);
  let max = 0;

  for (const s of suppliers || []) {
    if (!s) continue;
    if (skip && String(s._id || '').trim() === skip) continue;
    const code = normalizeSupplierCode(String(s?.code || ''));
    const m = code.match(re);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }

  return `${prefix}-${String(max + 1).padStart(3, '0')}`.slice(0, SUPPLIER_CODE_MAX_LEN);
}

/**
 * Código sugerido: 3 letras del nombre + -001 (MAK-001, DIS-002…).
 * Sin nombre → PROV-001, PROV-002…
 */
export function suggestSupplierCodeFromName(
  name: string,
  suppliers: Array<{ _id?: string; code?: string | null } | null | undefined>,
  excludeId?: string,
): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return suggestNextSupplierCode(suppliers, excludeId);
  return nextSequentialCode(supplierInitialsFromName(trimmed), suppliers, excludeId);
}

/** Siguiente código libre tipo PROV-001 a partir de los ya existentes. */
export function suggestNextSupplierCode(
  suppliers: Array<{ _id?: string; code?: string | null } | null | undefined>,
  excludeId?: string,
): string {
  return nextSequentialCode('PROV', suppliers, excludeId);
}

export function supplierCodeAlreadyUsed(
  code: string,
  suppliers: Array<{ _id?: string; code?: string | null } | null | undefined>,
  excludeId?: string,
): boolean {
  const want = normalizeSupplierCode(code);
  if (!want) return false;
  const skip = String(excludeId || '').trim();
  return (suppliers || []).some((s) => {
    if (!s) return false;
    if (skip && String(s._id || '').trim() === skip) return false;
    return normalizeSupplierCode(String(s.code || '')) === want;
  });
}
