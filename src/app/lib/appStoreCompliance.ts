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

/**
 * Sign in with Apple: app iOS nativa, o web con Services ID (`VITE_APPLE_CLIENT_ID`).
 */
export function isAppleSignInAvailable(): boolean {
  if (isIosNativeApp()) return true;
  if (Capacitor.isNativePlatform()) return false;
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
  const clientId = String(env.VITE_APPLE_CLIENT_ID || 'com.vertial.app.web').trim();
  return Boolean(clientId);
}

/**
 * Apple Guideline 3.1.1 — modelo SaaS multiplataforma:
 * la app iOS es acceso para clientes con cuenta ya gestionada en la web.
 * No cobro, no IAP, no CTAs de «pagar / contratar en la web».
 */
export function shouldHideInAppSubscriptionPurchaseOnIos(): boolean {
  return isIosNativeApp();
}

/** Alias semántico: iOS = solo clientes existentes (sin comercio de suscripción). */
export function isIosCustomerAccessOnlyApp(): boolean {
  return shouldHideInAppSubscriptionPurchaseOnIos();
}

/**
 * Apple 3.1.1 (julio 2026): en iOS no hay alta de empresa, organización ni afiliado.
 * Solo login de cuentas ya existentes.
 */
export function shouldHideBusinessOrganizationRegistrationOnIos(): boolean {
  return isIosNativeApp();
}

/**
 * Apple 5.1.2(i): no mostrar banner de cookies de tracking en iOS
 * (evita ATT; la app no hace publicidad ni tracking entre apps).
 */
export function shouldHideCookieConsentBannerOnIos(): boolean {
  return isIosNativeApp();
}

/** Soporte (sin deep-link a checkout). */
export const IOS_SUPPORT_URL = 'https://vertialapp.com';
export const IOS_SUPPORT_EMAIL = 'soporte@vertialapp.com';
export const IOS_PRIVACY_POLICY_URL = 'https://vertialapp.com/legal/privacidad';
export const IOS_TERMS_URL = 'https://vertialapp.com/legal/terminos';

/**
 * @deprecated No usar como CTA de compra en iOS (Guideline 3.1.1).
 * La suscripción se gestiona en web fuera de la app; en iOS no enlazamos a checkout.
 */
export const IOS_WEB_BILLING_URL = 'https://vertialapp.com/saas/settings?tab=facturacion';
