import { useEffect, useRef, useCallback } from 'react';
import { getApiBase } from '../lib/apiBase';
import { isVertialNativeApp } from '../lib/vertialPrint/isNativeApp';
import { readPushConsent, writePushConsent } from '../lib/pushPermissionConsent';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getVapidPublicKey(apiBase: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase}/api/push/vapid-public-key`);
    const data = await res.json();
    return data.ok ? data.publicKey : null;
  } catch {
    return null;
  }
}

async function registerSubscription(
  apiBase: string,
  token: string,
  subscription: PushSubscription,
): Promise<void> {
  await fetch(`${apiBase}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

async function unregisterSubscription(
  apiBase: string,
  token: string,
  endpoint: string,
): Promise<void> {
  await fetch(`${apiBase}/api/push/unsubscribe`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint }),
  });
}

interface UsePushNotificationsOptions {
  userId: string | null;
  token: string | null;
}

/**
 * Web Push (PWA). No llama a requestPermission solo:
 * el soft prompt de PushPermissionGate pide 1 vez; aquí solo suscribe si granted.
 */
export function usePushNotifications({ userId, token }: UsePushNotificationsOptions) {
  const subscriptionRef = useRef<PushSubscription | null>(null);
  const apiBase = getApiBase();

  const subscribe = useCallback(async () => {
    if (!userId || !token) return;
    if (isVertialNativeApp()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window)) return;

    // Solo si el usuario (o el soft prompt) ya concedió.
    if (Notification.permission !== 'granted') return;

    if (readPushConsent(userId).decision !== 'accepted') {
      writePushConsent(userId, 'accepted');
    }

    const vapidKey = env.VITE_VAPID_PUBLIC_KEY || (await getVapidPublicKey(apiBase));
    if (!vapidKey) {
      console.warn('[Push] No se encontró la clave VAPID pública');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    subscriptionRef.current = subscription;
    await registerSubscription(apiBase, token, subscription);
  }, [userId, token, apiBase]);

  const unsubscribe = useCallback(async () => {
    const sub = subscriptionRef.current;
    if (!sub || !token) return;

    await sub.unsubscribe().catch(() => {});
    await unregisterSubscription(apiBase, token, sub.endpoint).catch(() => {});
    subscriptionRef.current = null;
  }, [token, apiBase]);

  useEffect(() => {
    if (userId && token) {
      const run = () => {
        subscribe().catch((err) =>
          console.warn('[Push] Error al suscribirse a notificaciones push:', err?.message),
        );
      };
      run();
      window.addEventListener('vertial:push-register-now', run);
      return () => window.removeEventListener('vertial:push-register-now', run);
    }

    unsubscribe().catch(() => {});
    return undefined;
  }, [userId, token, subscribe, unsubscribe]);
}
