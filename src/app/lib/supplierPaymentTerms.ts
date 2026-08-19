/** Condiciones de pago para alta/edición de proveedores (texto guardado en paymentTerms). */

export const SUPPLIER_PAYMENT_TERMS_PRESETS = [
  'Contado',
  '7 días',
  '15 días',
  '30 días',
  '45 días',
  '60 días',
  '90 días',
  'Transferencia anticipada',
] as const;

export const SUPPLIER_PAYMENT_TERMS_MANUAL = '__manual__';

export function isSupplierPaymentTermsPreset(value: string): boolean {
  const v = String(value || '').trim();
  return (SUPPLIER_PAYMENT_TERMS_PRESETS as readonly string[]).includes(v);
}

/** Valor del <select>: preset, manual o vacío. */
export function supplierPaymentTermsSelectValue(paymentTerms: string): string {
  const v = String(paymentTerms || '').trim();
  if (!v) return '';
  if (isSupplierPaymentTermsPreset(v)) return v;
  return SUPPLIER_PAYMENT_TERMS_MANUAL;
}
