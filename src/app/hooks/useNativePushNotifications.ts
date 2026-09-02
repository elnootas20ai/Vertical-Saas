import { useEffect, useRef, useCallback } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { getApiBase } from '../lib/apiBase';
import { ensureFreshAccessToken, loadStoredTokens } from '../lib/authApi';
import { isVertialNativeApp } from '../lib/vertialPrint/isNativeApp';
import { readPushConsent, writePushConsent } from '../lib/pushPermissionConsent';
import { canUseNativePushRegistration } from '../lib/nativePushRuntime';
import { queuePushDeepLink } from '../lib/pushDeepLink';

/** Siempre leer el JWT actual: el prop `token` de AppContext se memoiza y caduca ~15 min. */
function currentAccessToken(fallback?: string | null): string | null {
  try {
    const { accessToken } = loadStoredTokens();
    if (accessToken) return accessToken;
  } catch {
    /* ignore */
  }
  return fallback || null;
}

async function resolveAuthForPush(fallback?: string | null): Promise<string | null> {
  try {
    await ensureFreshAccessToken(90);
  } catch {
    /* seguir con lo que haya en localStorage */
  }
  return currentAccessToken(fallback);
}

async function registerNativeToken(
  apiBase: string,
  authToken: string,
  deviceToken: string,
  platform: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/push/native-register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      platform,
      token: deviceToken,
      bundleId: 'com.vertial.app',
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body && typeof body === 'object' && 'error' in body && String((body as { error?: unknown }).error || ''))
        || `native-register ${res.status}`,
    );
  }
}

async function unregisterNativeToken(
  apiBase: string,
  authToken: string,
  deviceToken: string,
  platform: string,
): Promise<void> {
  await fetch(`${apiBase}/api/push/native-unregister`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ platform, token: deviceToken }),
  });
}

interface UseNativePushNotificationsOptions {
  userId: string | null;
  token: string | null;
}

/**
 * Push nativo iOS/Android — solo registra si el permiso ya está concedido.
 * El requestPermissions del sistema lo hace PushPermissionGate una vez.
 */
export function useNativePushNotifications({ userId, token }: UseNativePushNotificationsOptions) {
  const deviceTokenRef = useRef<string | null>(null);
  const lastAuthTokenRef = useRef<string | null>(null);
  const apiBase = getApiBase();
  const platform = Capacitor.getPlatform();
  const cleanupListeners = useRef<(() => void) | null>(null);

  if (token) {
    lastAuthTokenRef.current = token;
  }

  const register = useCallback(async () => {
    if (!isVertialNativeApp() || !userId) return;
    if (platform !== 'ios' && platform !== 'android') return;
    if (platform === 'android' && !canUseNativePushRegistration()) return;

    const auth = await resolveAuthForPush(lastAuthTokenRef.current || token);
    if (!auth) return;
    lastAuthTokenRef.current = auth;

    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') return;

      if (readPushConsent(userId).decision !== 'accepted') {
        writePushConsent(userId, 'accepted');
      }

      if (platform === 'android') {
        try {
          await PushNotifications.createChannel({
            id: 'vertial_alerts_v3',
            name: 'Alertas Vertial',
            description: 'Avisos con sonido (cierre de caja, resumen, alertas)',
            importance: 5,
            visibility: 1,
            sound: 'vertial_alert',
            vibration: true,
            lights: true,
          });
        } catch {
          /* canal ya existe o API no disponible */
        }
        // Canales antiguos: por si quedan avisos en cola
        for (const legacy of ['vertial_alerts_v2', 'vertial_alerts'] as const) {
          try {
            await PushNotifications.createChannel({
              id: legacy,
              name: 'Alertas Vertial (antiguo)',
              description: 'Canal anterior',
              importance: 5,
              visibility: 1,
              sound: 'default',
              vibration: true,
              lights: true,
            });
          } catch {
            /* ignore */
          }
        }
      }

      // Si FCM ya nos dio token antes, reenviarlo al API (JWT fresco).
      if (deviceTokenRef.current) {
        try {
          await registerNativeToken(apiBase, auth, deviceTokenRef.current, platform);
        } catch (err) {
          console.warn('[NativePush] Re-registro token:', (err as Error)?.message);
        }
      }

      await PushNotifications.register();
    } catch (err) {
      console.warn('[NativePush] Registro omitido:', (err as Error)?.message || err);
    }
  }, [userId, token, platform, apiBase]);

  useEffect(() => {
    if (!isVertialNativeApp() || !userId) return;
    if (platform !== 'ios' && platform !== 'android') return;
    if (platform === 'android' && !canUseNativePushRegistration()) return;

    let cancelled = false;

    void (async () => {
      const regHandle = await PushNotifications.addListener('registration', (ev) => {
        if (cancelled || !ev.value) return;
        deviceTokenRef.current = ev.value;
        void (async () => {
          const auth = await resolveAuthForPush(lastAuthTokenRef.current || token);
          if (cancelled || !auth) return;
          lastAuthTokenRef.current = auth;
          try {
            await registerNativeToken(apiBase, auth, ev.value, platform);
          } catch (err) {
            console.warn('[NativePush] Error registrando token:', (err as Error)?.message);
          }
        })();
      });

      const errHandle = await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[NativePush] Error de registro:', err?.error);
      });

      const receivedHandle = await PushNotifications.addListener(
        'pushNotificationReceived',
        () => {
          /* presentationOptions muestra el aviso en primer plano */
        },
      );

      const actionHandle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          const data = (action.notification?.data || {}) as Record<string, unknown>;
          const route =
            data.route ||
            data.url ||
            (typeof data.FCM_MSG === 'object' && data.FCM_MSG
              ? (data.FCM_MSG as { data?: { route?: string } }).data?.route
              : undefined);
          queuePushDeepLink(route);
        },
      );

      cleanupListeners.current = () => {
        void regHandle.remove();
        void errHandle.remove();
        void receivedHandle.remove();
        void actionHandle.remove();
      };

      await register();
    })();

    const onRegisterNow = () => {
      void register();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void register();
    };
    window.addEventListener('vertial:push-register-now', onRegisterNow);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      cleanupListeners.current?.();
      cleanupListeners.current = null;
      window.removeEventListener('vertial:push-register-now', onRegisterNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, token, apiBase, platform, register]);

  useEffect(() => {
    if (userId) return;

    const deviceToken = deviceTokenRef.current;
    const auth = currentAccessToken(lastAuthTokenRef.current);
    if (!deviceToken || !auth) {
      deviceTokenRef.current = null;
      return;
    }

    unregisterNativeToken(apiBase, auth, deviceToken, platform).catch(() => {});
    deviceTokenRef.current = null;
    lastAuthTokenRef.current = null;
  }, [userId, apiBase, platform]);
}
