import { useEffect, useRef, useCallback } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { getApiBase } from '../lib/apiBase';
import { isVertialNativeApp } from '../lib/vertialPrint/isNativeApp';

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
 * Push nativo iOS/Android (APNs/FCM) — solo en app Capacitor.
 * Web Push queda en usePushNotifications para PWA/navegador.
 */
export function useNativePushNotifications({ userId, token }: UseNativePushNotificationsOptions) {
  const deviceTokenRef = useRef<string | null>(null);
  const apiBase = getApiBase();
  const platform = Capacitor.getPlatform();

  const cleanupListeners = useRef<(() => void) | null>(null);

  const register = useCallback(async () => {
    if (!isVertialNativeApp() || !userId || !token) return;
    if (platform !== 'ios' && platform !== 'android') return;

    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      const req = await PushNotifications.requestPermissions();
      receive = req.receive;
    }
    if (receive !== 'granted') return;

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
        registerNativeToken(apiBase, token, ev.value, platform).catch((err) => {
          console.warn('[NativePush] Error registrando token:', err?.message);
        });
      });

      const errHandle = await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[NativePush] Error de registro:', err?.error);
      });

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
        void actionHandle.remove();
      };

      await register();
    })();

    return () => {
      cancelled = true;
      cleanupListeners.current?.();
      cleanupListeners.current = null;

      const deviceToken = deviceTokenRef.current;
      if (deviceToken && token) {
        unregisterNativeToken(apiBase, token, deviceToken, platform).catch(() => {});
      }
      deviceTokenRef.current = null;
    };
  }, [userId, token, apiBase, platform, register]);
}
