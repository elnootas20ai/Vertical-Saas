/**
 * Sign in with Apple en navegador (Apple JS SDK + popup).
 * Requiere Services ID en Apple Developer y VITE_APPLE_CLIENT_ID en el build.
 */
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

/** Services ID (no el Bundle ID de la app). */
export const APPLE_WEB_CLIENT_ID = String(
  env.VITE_APPLE_CLIENT_ID || 'com.vertial.app.web',
).trim();

export const appleWebClientConfigured = Boolean(APPLE_WEB_CLIENT_ID);

function resolveRedirectUri(): string {
  const fromEnv = String(env.VITE_APPLE_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'https://vertialapp.com';
}

export interface AppleSignInWebResult {
  identityToken: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  appleUserId: string | null;
}

type AppleAuthResponse = {
  authorization?: {
    id_token?: string;
    code?: string;
    state?: string;
  };
  user?: {
    email?: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: Record<string, unknown>) => void;
        signIn: (config?: Record<string, unknown>) => Promise<AppleAuthResponse>;
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
let initDone = false;

function loadAppleScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Sign in with Apple solo funciona en el navegador'));
  }
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${APPLE_JS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Apple Sign In')));
      if (window.AppleID?.auth) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = APPLE_JS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('No se pudo cargar el SDK de Apple'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function ensureAppleAuthReady(): Promise<void> {
  if (!appleWebClientConfigured) {
    throw new Error(
      'No se pudo iniciar sesión con Apple. Inténtalo de nuevo más tarde.',
    );
  }
  await loadAppleScript();
  if (!window.AppleID?.auth) {
    throw new Error('Apple Sign In no está disponible en este navegador');
  }
  if (!initDone) {
    window.AppleID.auth.init({
      clientId: APPLE_WEB_CLIENT_ID,
      scope: 'name email',
      redirectURI: resolveRedirectUri(),
      usePopup: true,
    });
    initDone = true;
  }
}

function isUserCancel(error: unknown): boolean {
  const msg = String(
    error instanceof Error
      ? error.message
      : (error as { error?: string })?.error || error || '',
  ).toLowerCase();
  return (
    msg.includes('popup_closed')
    || msg.includes('user_cancelled')
    || msg.includes('user canceled')
    || msg.includes('user cancelled')
    || msg.includes('cancel')
  );
}

/** Lanza Sign in with Apple en web (popup). */
export async function signInWithAppleWeb(): Promise<AppleSignInWebResult> {
  await ensureAppleAuthReady();

  let response: AppleAuthResponse;
  try {
    response = await window.AppleID!.auth.signIn();
  } catch (error) {
    if (isUserCancel(error)) {
      throw new Error('Inicio con Apple cancelado');
    }
    throw error instanceof Error ? error : new Error('No se pudo iniciar con Apple');
  }

  const identityToken = String(response?.authorization?.id_token || '').trim();
  if (!identityToken) {
    throw new Error('Apple no devolvió un token de identidad');
  }

  return {
    identityToken,
    email: response.user?.email || null,
    givenName: response.user?.name?.firstName || null,
    familyName: response.user?.name?.lastName || null,
    appleUserId: null,
  };
}
