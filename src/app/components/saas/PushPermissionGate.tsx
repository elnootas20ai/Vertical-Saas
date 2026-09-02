/**
 * Permisos nativos al entrar (iOS/Android), en este orden y una sola vez:
 * 1) Notificaciones (push)
 * 2) Ubicación (fichaje) — solo cuando el flujo de push ha terminado
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
import { shouldRegisterNativePushOnThisDevice } from '../../lib/nativePushDevice';

/** Pequeña pausa para que la UI de login asiente antes del diálogo del SO. */
const ASK_DELAY_MS = 600;
/** Pausa entre cerrar el diálogo de push y pedir ubicación. */
const AFTER_PUSH_BEFORE_LOCATION_MS = 700;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

  // status === denied: el SO ya bloqueó; no hay diálogo que mostrar → activar desde Ajustes
  if (readPushConsent(userId).decision !== 'declined') {
    writePushConsent(userId, 'declined', { force: true });
  }
  return 'denied';
}

async function askLocationOnce(userId: string): Promise<void> {
  if (!isVertialNativeApp()) return;
  if (alreadyAskedLocation(userId)) return;
  markAskedLocation(userId);
  await ensureLocationPermissionPrompt();
}

export function PushPermissionGate({ userId }: { userId: string | null }) {
  const finishedPushForUserRef = useRef<string | null>(null);
  const locationRanRef = useRef<string | null>(null);

  // Un solo flujo: notificaciones primero → luego ubicación (nunca en paralelo).
  useEffect(() => {
    if (!userId) return;
    if (finishedPushForUserRef.current === userId && locationRanRef.current === userId) return;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        const wantPush = isVertialNativeApp() && shouldRegisterNativePushOnThisDevice();

        // 1) Push solo en teléfono (CEO). Tablets de tienda: saltar.
        if (wantPush && finishedPushForUserRef.current !== userId) {
          await hydratePushConsentFromAccount(userId);
          if (cancelled) return;

          const outcome = await ensureNativePushPermission(userId);
          if (cancelled) return;

          if (outcome !== 'error') {
            finishedPushForUserRef.current = userId;
          }
        } else if (!wantPush) {
          finishedPushForUserRef.current = userId;
        }

        if (cancelled) return;

        // 2) Ubicación solo después del push (y una sola vez) — sí en tablets
        if (locationRanRef.current === userId) return;
        if (alreadyAskedLocation(userId)) {
          locationRanRef.current = userId;
          return;
        }

        await sleep(AFTER_PUSH_BEFORE_LOCATION_MS);
        if (cancelled) return;

        locationRanRef.current = userId;
        await askLocationOnce(userId);
      })();
    }, ASK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  // Al volver a primer plano: si aún no hay permiso de push (solo teléfono), reintentar.
  useEffect(() => {
    if (!userId || !isVertialNativeApp()) return;
    if (!shouldRegisterNativePushOnThisDevice()) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (finishedPushForUserRef.current === userId) return;
      void (async () => {
        const status = await systemReceiveStatus();
        if (status === 'granted') {
          writePushConsent(userId, 'accepted');
          triggerPushRegister();
          finishedPushForUserRef.current = userId;
          return;
        }
        if (status === 'prompt') {
          const outcome = await ensureNativePushPermission(userId);
          if (outcome !== 'error') finishedPushForUserRef.current = userId;
        }
      })();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  return null;
}
