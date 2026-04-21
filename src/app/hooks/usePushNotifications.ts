import { useEffect, useRef, useCallback } from 'react';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase(): string {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host = env.VITE_API_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const protocol = env.VITE_API_PROTOCOL || (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

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
  /** userId del usuario autenticado; null desactiva el hook */
  userId: string | null;
  /** JWT access token */
  token: string | null;
}

/**
 * Hook que gestiona la suscripción Web Push del usuario.
 * - Solicita permiso al montarse si hay usuario autenticado.
 * - Registra la suscripción en el backend.
 * - Cancela y limpia al desmontar o cerrar sesión.
 */
export function usePushNotifications({ userId, token }: UsePushNotificationsOptions) {
  const subscriptionRef = useRef<PushSubscription | null>(null);
  const apiBase = getApiBase();

  const subscribe = useCallback(async () => {
    if (!userId || !token) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

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
      subscribe().catch((err) =>
        console.warn('[Push] Error al suscribirse a notificaciones push:', err?.message),
      );
    } else {
      unsubscribe().catch(() => {});
    }

    return () => {
      // No desuscribimos al desmontar para mantener el SW activo
    };
  }, [userId, token, subscribe, unsubscribe]);
}
