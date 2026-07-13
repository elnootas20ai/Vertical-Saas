import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { isIosNativeApp } from './appStoreCompliance';

const APPLE_CLIENT_ID = 'com.vertial.app';
const APPLE_REDIRECT_URI = 'https://vertialapp.com';

export interface AppleSignInNativeResult {
  identityToken: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  appleUserId: string | null;
}

export function isAppleSignInNativeAvailable(): boolean {
  return isIosNativeApp();
}

/** Lanza Sign in with Apple nativo (solo app iOS). */
export async function signInWithAppleNative(): Promise<AppleSignInNativeResult> {
  if (!isAppleSignInNativeAvailable()) {
    throw new Error('Sign in with Apple solo está disponible en la app iOS');
  }

  const { response } = await SignInWithApple.authorize({
    clientId: APPLE_CLIENT_ID,
    redirectURI: APPLE_REDIRECT_URI,
    scopes: 'email name',
  });

  if (!response?.identityToken) {
    throw new Error('Apple no devolvió un token de identidad');
  }

  return {
    identityToken: response.identityToken,
    email: response.email,
    givenName: response.givenName,
    familyName: response.familyName,
    appleUserId: response.user,
  };
}
