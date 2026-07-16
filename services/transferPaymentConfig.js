/**
 * Datos de transferencia bancaria para activación manual de suscripciones.
 * Configurar en env; si faltan, la UI muestra placeholders claros.
 */

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

export function getTransferPaymentInstructions() {
  const iban = env('VERTIAL_TRANSFER_IBAN', 'ES66 2100 3323 0421 0078 3688');
  return {
    iban,
    holder: env('VERTIAL_TRANSFER_HOLDER', 'Uriel Arnau Ruiz'),
    bankName: env('VERTIAL_TRANSFER_BANK', ''),
    bic: env('VERTIAL_TRANSFER_BIC', ''),
    configured: Boolean(iban),
  };
}
