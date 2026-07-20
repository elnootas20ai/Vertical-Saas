import { Capacitor } from '@capacitor/core';
import { isIosNativeApp } from './appStoreCompliance';
import {
  isAppleSignInNativeAvailable,
  signInWithAppleNative,
  type AppleSignInNativeResult,
} from './appleSignInNative';
import {
  appleWebClientConfigured,
  signInWithAppleWeb,
} from './appleSignInWeb';

export type AppleSignInResult = AppleSignInNativeResult;

/** Disponible en iOS nativo siempre; en web si hay Services ID configurado. */
export function canUseAppleSignIn(): boolean {
  if (isIosNativeApp()) return true;
  if (Capacitor.isNativePlatform()) return false;
  return appleWebClientConfigured;
}

/** Sign in with Apple: nativo en iOS, JS popup en web. */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (isAppleSignInNativeAvailable()) {
    return signInWithAppleNative();
  }
  return signInWithAppleWeb();
}
