import { Capacitor } from '@capacitor/core';
import { clearVertialClientCachesForAppUpdate, SESSION_USER_STORAGE_KEY } from './clientSessionStorage';
import { logoutRequest } from './authApi';

/** Marca de instalación: al cambiar (nueva build TestFlight / nuevo bundle) → login limpio. */
export const APP_INSTALL_STAMP_KEY = 'vertial_app_install_stamp';

/**
 * Tras wipe por update: Auth no debe rehidratar sesión aunque quede basura local/cookie.
 * Se limpia al completar un login nuevo.
 */
export const FORCE_FRESH_LOGIN_KEY = 'vertial_force_fresh_login';

function bundleStamp(): string {
  return String(import.meta.env.VITE_BUILD_STAMP || import.meta.env.VITE_APP_VERSION || '0');
}

/**
 * Identificador de la build actual.
 * Nativo: version + build (Codemagic) + stamp del bundle JS (por si el nº de build no cambia).
 * Web: stamp del bundle (cada deploy frontend).
 *
 * Si App.getInfo() falla, devolvemos null → no inventar stamp distinto (evitar logout falso en TPV).
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

export function shouldWipeSessionOnStampChange(
  previousStamp: string | null,
  currentStamp: string,
  opts?: { hasPersistedSession?: boolean },
): boolean {
  if (!currentStamp) return false;
  // Sin marca previa: instalación limpia → no tocar.
  // Si ya había sesión de una build antigua (antes de esta lógica) → forzar login.
  if (!previousStamp) {
    return Boolean(opts?.hasPersistedSession);
  }
  return previousStamp !== currentStamp;
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
 * Si la app cambió de versión/build/bundle, borra sesión y fuerza login.
 * Debe ejecutarse ANTES de montar AuthProvider.
 * @returns true si se forzó login limpio
 */
async function logoutWithTimeout(ms = 2500): Promise<void> {
  await Promise.race([
    logoutRequest().catch(() => undefined),
    new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, ms);
    }),
  ]);
}

export async function enforceFreshLoginOnAppUpdate(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let currentStamp: string | null = null;
  try {
    currentStamp = await resolveCurrentAppStamp();
  } catch {
    return false;
  }
  // Sin stamp nativo fiable: no tocar sesión (mejor seguir en TPV que echar por error).
  if (!currentStamp) return false;

  // Solo app nativa (TestFlight/APK). En web no cerramos sesión en cada deploy.
  if (!currentStamp.startsWith('native:')) {
    try {
      localStorage.setItem(APP_INSTALL_STAMP_KEY, currentStamp);
    } catch {
      /* ignore */
    }
    return false;
  }

  let previousStamp: string | null = null;
  try {
    previousStamp = localStorage.getItem(APP_INSTALL_STAMP_KEY);
  } catch {
    previousStamp = null;
  }

  const wipe = shouldWipeSessionOnStampChange(previousStamp, currentStamp, {
    hasPersistedSession: hasPersistedAuthSession(),
  });

  if (wipe) {
    // Primero marcar force-fresh para que Auth no rehidrate ni con basura.
    markForceFreshLogin();
    // No bloquear el arranque de la app si la red va mal.
    await logoutWithTimeout(2500);
    clearVertialClientCachesForAppUpdate();
    // Reafirmar tras el wipe (clearCaches no borra esta clave).
    markForceFreshLogin();
  }

  try {
    localStorage.setItem(APP_INSTALL_STAMP_KEY, currentStamp);
  } catch {
    /* ignore */
  }

  return wipe;
}
