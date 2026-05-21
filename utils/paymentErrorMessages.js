/** Mensaje genérico para el cliente cuando falla un cobro o suscripción. */
export const PUBLIC_PAYMENT_UNAVAILABLE =
  'No pudimos procesar el pago en este momento. Inténtalo de nuevo en unos minutos o contacta con soporte.';

const TECHNICAL_PATTERNS = [
  /no\s+hay\s+api/i,
  /\bapi\s*key\b/i,
  /\bmonei\b/i,
  /token_api/i,
  /\.env\b/i,
  /pasarela\s+de\s+pago/i,
  /configuraci[oó]n\s*>\s*pasarela/i,
  /\brevisa\b/i,
  /webhook/i,
  /skip_monei/i,
  /modo\s+prueba/i,
  /simulaci[oó]n/i,
  /monei\s+api\s+error/i,
  /len=\d+/i,
  /\b(test|live)\s+mode\b/i,
];

/**
 * Oculta detalles técnicos (API keys, MONEI, .env) antes de mostrar al usuario.
 */
export function sanitizePaymentErrorForClient(raw) {
  if (raw == null || raw === '') return PUBLIC_PAYMENT_UNAVAILABLE;
  const text = String(raw).trim();
  if (!text) return PUBLIC_PAYMENT_UNAVAILABLE;
  if (text.length > 200) return PUBLIC_PAYMENT_UNAVAILABLE;
  if (TECHNICAL_PATTERNS.some((re) => re.test(text))) return PUBLIC_PAYMENT_UNAVAILABLE;
  return text;
}
