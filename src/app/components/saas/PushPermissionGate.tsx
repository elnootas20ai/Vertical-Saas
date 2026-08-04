/**
 * Permiso de notificaciones nativo (iOS/Android) / navegador:
 * pide el diálogo del sistema UNA sola vez por cuenta CEO/empresa.
 * Trabajadores (código) no lo piden de momento.
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
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';

const ASK_DELAY_MS = 1600;

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

export function PushPermissionGate({ userId }: { userId: string | null }) {
  const ranForUserRef = useRef<string | null>(null);
  const { user } = useAuth();
  const isWorker = isWorkerAccount(user);

  useEffect(() => {
    // Solo CEO / cuenta empresa. Trabajadores (código) → sin pedirlo de momento.
    if (!userId || isWorker) return;
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
            // Si niega en reinstall, NO bajamos accepted en cuenta (user rule: sí forever)
            return;
          }
          return;
        }

        // Cuenta dijo no → no insistir nunca
        if (accountDecision === 'declined') {
          return;
        }

        // SO ya denegó sin haber guardado → declined y no insistir
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
  }, [userId, isWorker]);

  return null;
}
