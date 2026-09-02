/**
 * Lógica push nativo (cuenta, no “tipo de aparato”):
 *
 * - Cuenta CEO logueada (móvil, iPad o lo que sea) → sí registrar / sí recibir digest.
 * - Sesión de TIENDA con código PDV (tablet de local) → no push CEO en ese dispositivo.
 *
 * Los trabajadores con código no son la cuenta CEO; si el dueño dejó la cuenta CEO
 * abierta en una tablet de tienda y luego activa código de tienda, se desregistra
 * el token de ese aparato para que deje de sonar el resumen ahí.
 */
import { readTpvTabletBinding } from './tpvTabletSession';

/** ¿Este dispositivo está en modo caja/tienda (código PDV)? */
export function isStoreTabletSession(): boolean {
  try {
    return Boolean(String(readTpvTabletBinding()?.pdvId || '').trim());
  } catch {
    return false;
  }
}

/**
 * ¿Registrar push de cuenta (CEO / admin) en este dispositivo ahora?
 * Sí en login normal del dueño. No en sesión de tienda con código.
 */
export function shouldRegisterNativePushOnThisDevice(): boolean {
  return !isStoreTabletSession();
}
