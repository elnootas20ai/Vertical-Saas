/** Código interno de proveedor (PROV-001…): enlaza pedidos, facturas y OCR. */

export function normalizeSupplierCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9._-]/g, '');
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
  return `PROV-${String(max + 1).padStart(3, '0')}`;
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
