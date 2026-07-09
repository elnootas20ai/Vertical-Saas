import { clearAuthTokens } from './authApi';

/** Clave única del usuario en caché (compartida entre pestañas del mismo perfil de Chrome). */
export const SESSION_USER_STORAGE_KEY = 'vertial_session_user';

const LOCAL_PREFIXES = ['vertial_', 'vertial.'];

/** Claves que no se borran al cambiar de cuenta (consentimiento, email recordado del login trabajador). */
const KEEP_ON_ACCOUNT_SWITCH = new Set([
  'vertial_saved_worker_login',
  'vertial_cookie_consent',
  'vertial_native_onboarding_seen',
]);

/**
 * Limpia cachés locales de Vertial al cerrar sesión o antes de iniciar con otra cuenta.
 * Evita mezclar empresa/PDV/datos de un usuario con la cookie de otro en el mismo PC.
 */
/** Cachés de CRM que no deben vivir en localStorage (fuente de verdad: API). */
const SERVER_BACKED_CACHE_PREFIXES = [
  'vertial-clients:b:',
  'vertial-clients:u:',
  'vertial-leads:b:',
  'vertial-leads:u:',
  'vertial-vehicles:b:',
  'vertial-vehicles:u:',
];

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  );
}

/** Elimina cachés locales pesados; la API es la fuente de verdad para cuentas autenticadas. */
export function pruneServerBackedLocalCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const lsRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (SERVER_BACKED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        lsRemove.push(key);
      }
    }
    for (const key of lsRemove) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Persiste JSON en localStorage sin tumbar la app si no hay espacio.
 * Devuelve false si no se pudo guardar (p. ej. lista demasiado grande).
 */
export function persistVertialJsonCache(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn('Error saving local cache:', key, error);
      return false;
    }
    pruneLargeVertialCaches();
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (retryError) {
      if (!isQuotaExceededError(retryError)) {
        console.warn('Error saving local cache after prune:', key, retryError);
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      return false;
    }
  }
}

/** Libera espacio si localStorage está lleno (p. ej. cachés de notificaciones o CRM). */
export function pruneLargeVertialCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const lsRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('vertial-notifications:')
        || key.startsWith('vertial_businesses_cache:')
        || key.startsWith('vertial_delivery_stores_cache:')
        || SERVER_BACKED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        lsRemove.push(key);
      }
    }
    for (const key of lsRemove) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Libera espacio si localStorage está lleno (p. ej. cachés de notificaciones). */
export function pruneVertialStorageIfNeeded(): void {
  if (typeof window === 'undefined') return;
  pruneServerBackedLocalCaches();
  try {
    const lsRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('vertial-notifications:')
        || key.startsWith('vertial_businesses_cache:')
        || key.startsWith('vertial_delivery_stores_cache:')
      ) {
        lsRemove.push(key);
      }
    }
    for (const key of lsRemove) localStorage.removeItem(key);

    const ssRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('vertial_delivery_stores_cache:')) ssRemove.push(key);
    }
    for (const key of ssRemove) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

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
