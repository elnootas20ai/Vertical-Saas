/**
 * Permisos nativos al entrar (iOS/Android):
 * 1) Notificaciones (push) — una vez por cuenta
 * 2) Ubicación — para fichaje (diálogo del sistema)
 *
 * En web/PWA no fuerza ubicación aquí (sale al fichar).
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import {
  hydratePushConsentFromAccount,
  readPushConsent,
  writePushConsent,
} from '../../lib/pushPermissionConsent';
import { ensureLocationPermissionPrompt } from '../../hooks/useGeolocation';
import { canUseNativePushRegistration } from '../../lib/nativePushRuntime';

const ASK_DELAY_MS = 900;
const LOCATION_ASK_DELAY_MS = 2800;

async function systemReceiveStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (isVertialNativeApp()) {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return 'unsupported';
    if (platform === 'android' && !canUseNativePushRegistration()) return 'unsupported';
    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') return 'granted';
      if (perm.receive === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

async function requestSystemPermission(): Promise<'granted' | 'denied' | 'error'> {
  if (isVertialNativeApp()) {
    if (Capacitor.getPlatform() === 'android' && !canUseNativePushRegistration()) {
      return 'error';
    }
    try {
      const req = await PushNotifications.requestPermissions();
      return req.receive === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'error';
    }
  }
  if (!('Notification' in window)) return 'error';
  try {
    const result = await Notification.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}

function triggerPushRegister(): void {
  try {
    window.dispatchEvent(new CustomEvent('vertial:push-register-now'));
  } catch {
    /* ignore */
  }
}

const LOCATION_CONSENT_PREFIX = 'vertial.locationConsentAsked.v1.';

function locationAskKey(userId: string): string {
  return `${LOCATION_CONSENT_PREFIX}${userId}`;
}

function alreadyAskedLocation(userId: string): boolean {
  try {
    return window.localStorage.getItem(locationAskKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markAskedLocation(userId: string): void {
  try {
    window.localStorage.setItem(locationAskKey(userId), '1');
  } catch {
    /* ignore */
  }
}

/**
 * Pide el diálogo del SO si aún no está concedido.
 * En Android 13+ es POST_NOTIFICATIONS; en &lt;13 Capacitor lo da por granted sin diálogo.
 */
async function ensureNativePushPermission(
  userId: string,
): Promise<'granted' | 'denied' | 'skipped' | 'error'> {
  const status = await systemReceiveStatus();
  if (status === 'unsupported') return 'error';
  if (status === 'granted') {
    if (readPushConsent(userId).decision !== 'accepted') {
      writePushConsent(userId, 'accepted');
    }
    triggerPushRegister();
    return 'granted';
  }

  // Si el SO aún puede mostrar el diálogo (prompt), pedirlo aunque local diga declined
  // (a veces se marcó declined sin haber mostrado el popup).
  if (status === 'prompt') {
    const result = await requestSystemPermission();
    if (result === 'granted') {
      writePushConsent(userId, 'accepted');
      triggerPushRegister();
      return 'granted';
    }
    if (result === 'denied') {
      writePushConsent(userId, 'declined', { force: true });
      return 'denied';
    }
    return 'error';
  }

  // status === denied: el SO ya bloqueó; no hay diálogo que mostrar
  if (readPushConsent(userId).decision !== 'declined') {
    writePushConsent(userId, 'declined', { force: true });
  }
  return 'denied';
}

export function PushPermissionGate({ userId }: { userId: string | null }) {
  const finishedForUserRef = useRef<string | null>(null);
  const locationRanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (finishedForUserRef.current === userId) return;

    let cancelled = false;
    let finished = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        // Hydrate no debe impedir el diálogo si el SO aún está en "prompt".
        await hydratePushConsentFromAccount(userId);
        if (cancelled) return;

        const outcome = await ensureNativePushPermission(userId);
        if (cancelled) return;

        // Solo marcar "ya hecho" si hubo resultado real (no error de plugin).
        if (outcome !== 'error') {
          finished = true;
          finishedForUserRef.current = userId;
        }
      })();
    }, ASK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // Si el efecto se desmontó antes de terminar, permitir reintento.
      if (!finished && finishedForUserRef.current === userId) {
        finishedForUserRef.current = null;
      }
    };
  }, [userId]);

  // Al volver a primer plano: si aún no hay permiso, volver a intentar (Android).
  useEffect(() => {
    if (!userId || !isVertialNativeApp()) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (finishedForUserRef.current === userId) return;
      void (async () => {
        const status = await systemReceiveStatus();
        if (status === 'granted') {
          writePushConsent(userId, 'accepted');
          triggerPushRegister();
          finishedForUserRef.current = userId;
          return;
        }
        if (status === 'prompt') {
          const outcome = await ensureNativePushPermission(userId);
          if (outcome !== 'error') finishedForUserRef.current = userId;
        }
      })();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  // Ubicación (fichaje): una vez por cuenta en app nativa, tras el push
  useEffect(() => {
    if (!userId || !isVertialNativeApp()) return;
    if (locationRanRef.current === userId) return;
    if (alreadyAskedLocation(userId)) {
      locationRanRef.current = userId;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        locationRanRef.current = userId;
        markAskedLocation(userId);
        await ensureLocationPermissionPrompt();
      })();
    }, LOCATION_ASK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  return null;
}
