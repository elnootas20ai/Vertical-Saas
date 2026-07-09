/** true cuando el servidor debe activar planes sin pasarela MONEI (desarrollo / cuentas manuales). */
export function isSkipMoneiSubscription() {
  const raw = String(process.env.SKIP_MONEI_SUBSCRIPTION || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return process.env.NODE_ENV === 'development';
}
