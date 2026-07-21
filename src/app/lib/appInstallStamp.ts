import { Capacitor } from '@capacitor/core';
import { clearVertialClientCachesForAppUpdate, SESSION_USER_STORAGE_KEY } from './clientSessionStorage';
import { logoutRequest } from './authApi';

/** Marca de instalación: al cambiar (nueva build TestFlight) → login limpio. */
export const APP_INSTALL_STAMP_KEY = 'vertial_app_install_stamp';

/**
 * Identificador de la build actual.
 * En iOS/Android usa version+build nativos (Codemagic sube CFBundleVersion).
 * En web solo marca el canal web (no fuerza logout en cada deploy de vertialapp.com).
 */
export async function resolveCurrentAppStamp(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const version = String(info.version || '').trim() || '0';
      const build = String(info.build || '').trim() || '0';
      return `native:${version}:${build}`;
    } catch {
      return `native:fallback:${String(import.meta.env.VITE_APP_VERSION || '0')}`;
    }
  }
  return `web:${String(import.meta.env.VITE_APP_VERSION || '0')}`;
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

/**
 * Si la app nativa cambió de versión/build, borra sesión, tokens y “recordarme”
 * y notifica logout al servidor. Debe ejecutarse ANTES de montar AuthProvider.
 * @returns true si se forzó login limpio
 */
export async function enforceFreshLoginOnAppUpdate(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let currentStamp = '';
  try {
    currentStamp = await resolveCurrentAppStamp();
  } catch {
    return false;
  }
  if (!currentStamp) return false;

  // Solo en app nativa (TestFlight/APK). En web no cerramos sesión en cada deploy.
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
    try {
      // Invalidar cookie/refresh en servidor si aún hay token local.
      await logoutRequest();
    } catch {
      /* ignore */
    }
    clearVertialClientCachesForAppUpdate();
  }

  try {
    localStorage.setItem(APP_INSTALL_STAMP_KEY, currentStamp);
  } catch {
    /* ignore */
  }

  return wipe;
}
