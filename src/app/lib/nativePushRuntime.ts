import { Capacitor } from '@capacitor/core';

/**
 * Push nativo en Android exige google-services.json (Firebase) en el APK.
 * Sin eso, PushNotifications.register() puede cerrar la app en algunos dispositivos.
 */
export function canUseNativePushRegistration(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return true;
  if (platform === 'android') {
    return String(import.meta.env.VITE_ANDROID_FCM_ENABLED || '').trim() === 'true';
  }
  return false;
}
