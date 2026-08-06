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

const ASK_DELAY_MS = 1600;
const LOCATION_ASK_DELAY_MS = 3200;

async function systemReceiveStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (isVertialNativeApp()) {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return 'unsupported';
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

async function requestSystemPermission(): Promise<'granted' | 'denied'> {
  if (isVertialNativeApp()) {
    const req = await PushNotifications.requestPermissions();
    return req.receive === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'denied';
  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : 'denied';
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

export function PushPermissionGate({ userId }: { userId: string | null }) {
  const ranForUserRef = useRef<string | null>(null);
  const locationRanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (ranForUserRef.current === userId) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        ranForUserRef.current = userId;

        const accountDecision = await hydratePushConsentFromAccount(userId);
        if (cancelled) return;

        const status = await systemReceiveStatus();
        if (cancelled) return;

        if (status === 'unsupported') return;

        // Ya concedió el SO → marcar accepted forever + registrar token
        if (status === 'granted') {
          if (readPushConsent(userId).decision !== 'accepted') {
            writePushConsent(userId, 'accepted');
          }
          triggerPushRegister();
          return;
        }

        // Cuenta ya dijo sí (p. ej. reinstalación): volver a pedir al SO si hace falta
        if (accountDecision === 'accepted') {
          if (status === 'prompt') {
            const result = await requestSystemPermission();
            if (cancelled) return;
            if (result === 'granted') {
              writePushConsent(userId, 'accepted');
              triggerPushRegister();
            }
            return;
          }
          return;
        }

        if (accountDecision === 'declined') {
          return;
        }

        if (status === 'denied') {
          writePushConsent(userId, 'declined');
          return;
        }

        // Primera vez: diálogo nativo del sistema
        if (status === 'prompt' && readPushConsent(userId).decision === 'unset') {
          const result = await requestSystemPermission();
          if (cancelled) return;
          writePushConsent(userId, result === 'granted' ? 'accepted' : 'declined');
          if (result === 'granted') triggerPushRegister();
        }
      })();
    }, ASK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
