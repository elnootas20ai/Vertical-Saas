import { useEffect, useRef, useCallback } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { getApiBase } from '../lib/apiBase';
import { isVertialNativeApp } from '../lib/vertialPrint/isNativeApp';
import { readPushConsent, writePushConsent } from '../lib/pushPermissionConsent';

async function registerNativeToken(
  apiBase: string,
  authToken: string,
  deviceToken: string,
  platform: string,
): Promise<void> {
  await fetch(`${apiBase}/api/push/native-register`, {
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
 * El aviso profesional y requestPermissions viven en PushPermissionGate.
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
    if (!isVertialNativeApp() || !userId || !token) return;
    if (platform !== 'ios' && platform !== 'android') return;

    // Nunca pedir el popup del sistema aquí (solo 1 vez vía soft prompt).
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') return;

    if (readPushConsent(userId).decision !== 'accepted') {
      writePushConsent(userId, 'accepted');
    }
    await PushNotifications.register();
  }, [userId, token, platform]);

  useEffect(() => {
    if (!isVertialNativeApp() || !userId || !token) return;
    if (platform !== 'ios' && platform !== 'android') return;

    let cancelled = false;

    void (async () => {
      const regHandle = await PushNotifications.addListener('registration', (ev) => {
        if (cancelled || !ev.value) return;
        deviceTokenRef.current = ev.value;
        const auth = lastAuthTokenRef.current;
        if (!auth) return;
        registerNativeToken(apiBase, auth, ev.value, platform).catch((err) => {
          console.warn('[NativePush] Error registrando token:', err?.message);
        });
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
          const route = action.notification?.data?.route;
          if (typeof route === 'string' && route.startsWith('/')) {
            window.location.href = route;
          }
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
    window.addEventListener('vertial:push-register-now', onRegisterNow);

    return () => {
      cancelled = true;
      cleanupListeners.current?.();
      cleanupListeners.current = null;
      window.removeEventListener('vertial:push-register-now', onRegisterNow);
    };
  }, [userId, token, apiBase, platform, register]);

  useEffect(() => {
    if (userId && token) return;

    const deviceToken = deviceTokenRef.current;
    const auth = lastAuthTokenRef.current;
    if (!deviceToken || !auth) {
      deviceTokenRef.current = null;
      return;
    }

    unregisterNativeToken(apiBase, auth, deviceToken, platform).catch(() => {});
    deviceTokenRef.current = null;
    lastAuthTokenRef.current = null;
  }, [userId, token, apiBase, platform]);
}
