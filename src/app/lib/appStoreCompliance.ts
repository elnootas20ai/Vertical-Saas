import { Capacitor } from '@capacitor/core';

/** App instalada en iOS (App Store / TestFlight / dev). */
export function isIosNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** App instalada en Android. */
export function isAndroidNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Apple Guideline 4.8 — en iOS nativo usamos Sign in with Apple (no Google).
 */
export function shouldHideThirdPartyAuthOnIos(): boolean {
  return isIosNativeApp();
}

/** Sign in with Apple disponible solo en app iOS nativa. */
export function isAppleSignInAvailable(): boolean {
  return isIosNativeApp();
}

/**
 * Apple Guideline 3.1.1 — suscripciones digitales consumidas en la app
 * deben usar IAP. Ocultamos cobro MONEI en iOS; gestión en web.
 */
export function shouldHideInAppSubscriptionPurchaseOnIos(): boolean {
  return isIosNativeApp();
}

export const IOS_WEB_BILLING_URL = 'https://vertialapp.com/saas/settings?tab=facturacion';
export const IOS_PRIVACY_POLICY_URL = 'https://vertialapp.com/legal/privacidad';
export const IOS_TERMS_URL = 'https://vertialapp.com/legal/terminos';
export const IOS_SUPPORT_URL = 'https://vertialapp.com';
