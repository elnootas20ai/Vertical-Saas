import { Capacitor } from '@capacitor/core';
import { SESSION_USER_STORAGE_KEY } from './clientSessionStorage';

/** Marca de instalación (diagnóstico). Ya no fuerza logout al cambiar. */
export const APP_INSTALL_STAMP_KEY = 'vertial_app_install_stamp';

/**
 * Flag legacy: builds antiguas lo ponían tras update.
 * Lo limpiamos al arrancar para no bloquear la sesión persistente.
 */
export const FORCE_FRESH_LOGIN_KEY = 'vertial_force_fresh_login';

function bundleStamp(): string {
  return String(import.meta.env.VITE_BUILD_STAMP || import.meta.env.VITE_APP_VERSION || '0');
}

/**
 * Identificador de la build actual.
 * Nativo: version + build (Codemagic) + stamp del bundle JS.
 * Web: stamp del bundle.
 */
export async function resolveCurrentAppStamp(): Promise<string | null> {
  const bundle = bundleStamp();
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const version = String(info.version || '').trim() || '0';
      const build = String(info.build || '').trim() || '0';
      return `native:${version}:${build}:${bundle}`;
    } catch {
      return null;
    }
  }
  return `web:${bundle}`;
}

export function hasPersistedAuthSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      localStorage.getItem(SESSION_USER_STORAGE_KEY)
        || localStorage.getItem('vertial_access_token')
        || localStorage.getItem('vertial_refresh_token')
        || localStorage.getItem('vertial_saved_login')
        || localStorage.getItem('vertial_saved_worker_login'),
    );
  } catch {
    return false;
  }
}

/**
 * ¿Borrar sesión al detectar otro stamp de build?
 * Política tipo Instagram: NO. La cuenta sigue abierta hasta «Cerrar sesión».
 */
export function shouldWipeSessionOnStampChange(
  _previousStamp: string | null,
  _currentStamp: string,
  _opts?: { hasPersistedSession?: boolean },
): boolean {
  return false;
}

export function markForceFreshLogin(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FORCE_FRESH_LOGIN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearForceFreshLogin(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(FORCE_FRESH_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

export function mustForceFreshLogin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FORCE_FRESH_LOGIN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Recuerda el stamp de build. No cierra sesión (iOS/Android como Instagram).
 * @returns siempre false
 */
export async function enforceFreshLoginOnAppUpdate(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let currentStamp: string | null = null;
  try {
    currentStamp = await resolveCurrentAppStamp();
  } catch {
    return false;
  }
  if (!currentStamp) {
    clearForceFreshLogin();
    return false;
  }

  try {
    localStorage.setItem(APP_INSTALL_STAMP_KEY, currentStamp);
  } catch {
    /* ignore */
  }

  // Quitar flag de builds viejas que sí forzaban login.
  clearForceFreshLogin();
  return false;
}
