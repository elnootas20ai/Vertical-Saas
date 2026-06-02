import { clearAuthTokens } from './authApi';

/** Clave única del usuario en caché (compartida entre pestañas del mismo perfil de Chrome). */
export const SESSION_USER_STORAGE_KEY = 'vertial_session_user';

const LOCAL_PREFIXES = ['vertial_', 'vertial.'];

/** Claves que no se borran al cambiar de cuenta (consentimiento, email recordado del login trabajador). */
const KEEP_ON_ACCOUNT_SWITCH = new Set([
  'vertial_saved_worker_login',
  'vertial_cookie_consent',
]);

/**
 * Limpia cachés locales de Vertial al cerrar sesión o antes de iniciar con otra cuenta.
 * Evita mezclar empresa/PDV/datos de un usuario con la cookie de otro en el mismo PC.
 */
export function clearVertialClientCaches(extraKeepKeys: string[] = []): void {
  if (typeof window === 'undefined') return;

  const keep = new Set([...KEEP_ON_ACCOUNT_SWITCH, ...extraKeepKeys]);
  clearAuthTokens();

  const lsRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || keep.has(key)) continue;
    if (LOCAL_PREFIXES.some((p) => key.startsWith(p))) lsRemove.push(key);
  }
  for (const key of lsRemove) localStorage.removeItem(key);

  const ssRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key || keep.has(key)) continue;
    if (LOCAL_PREFIXES.some((p) => key.startsWith(p))) ssRemove.push(key);
  }
  for (const key of ssRemove) sessionStorage.removeItem(key);
}
