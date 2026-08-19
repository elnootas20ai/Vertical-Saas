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

/**
 * Código sugerido desde el nombre. Si ya existe, prueba MAKRO-2, MAKRO-3…
 * Si el nombre está vacío, cae al secuencial PROV-001.
 */
export function suggestSupplierCodeFromName(
  name: string,
  suppliers: Array<{ _id?: string; code?: string | null } | null | undefined>,
  excludeId?: string,
): string {
  const base = slugFromSupplierName(name);
  if (!base) return suggestNextSupplierCode(suppliers);

  if (!supplierCodeAlreadyUsed(base, suppliers, excludeId)) return base;

  const prefixMax = Math.max(1, SUPPLIER_CODE_MAX_LEN - 3);
  const prefix = base.slice(0, prefixMax);
  for (let n = 2; n < 1000; n++) {
    const candidate = normalizeSupplierCode(`${prefix}-${n}`);
    if (candidate && !supplierCodeAlreadyUsed(candidate, suppliers, excludeId)) {
      return candidate;
    }
  }
  return suggestNextSupplierCode(suppliers);
}

/** Siguiente código libre tipo PROV-001 a partir de los ya existentes. */
export function suggestNextSupplierCode(
  suppliers: Array<{ code?: string | null } | null | undefined>,
): string {
  let max = 0;
  for (const s of suppliers || []) {
    const code = normalizeSupplierCode(String(s?.code || ''));
    const m = code.match(/^PROV-?(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `PROV-${String(max + 1).padStart(3, '0')}`.slice(0, SUPPLIER_CODE_MAX_LEN);
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
