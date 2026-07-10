/**
 * Onboarding de bienvenida en la app nativa (iOS/Android).
 * Solo se muestra la primera vez que se abre la app; después `/` va directo al acceso.
 */
export const NATIVE_ONBOARDING_SEEN_KEY = 'vertial_native_onboarding_seen';

export function hasSeenNativeOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(NATIVE_ONBOARDING_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markNativeOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NATIVE_ONBOARDING_SEEN_KEY, '1');
    window.dispatchEvent(new CustomEvent('vertial-native-onboarding-seen'));
  } catch {
    // ignore
  }
}
