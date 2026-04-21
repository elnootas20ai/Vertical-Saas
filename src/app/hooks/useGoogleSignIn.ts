import { useEffect, useRef, useCallback, useState } from 'react';

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
const GOOGLE_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID || '';

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
  clientId?: string;
}

type OnCredentialCallback = (credential: string) => void;

export function useGoogleSignIn(onCredential: OnCredentialCallback) {
  const callbackRef = useRef(onCredential);
  const [ready, setReady] = useState(false);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('[GoogleSignIn] VITE_GOOGLE_CLIENT_ID no configurado');
      return;
    }

    const initGoogle = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: GoogleCredentialResponse) => {
          callbackRef.current(response.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      setReady(true);
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    const existing = document.querySelector(`script[src="${GOOGLE_GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', initGoogle);
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    script.onerror = () => console.error('[GoogleSignIn] Error cargando Google Identity Services');
    document.head.appendChild(script);
  }, []);

  const prompt = useCallback(() => {
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.prompt();
  }, []);

  const renderButton = useCallback((element: HTMLElement | null, options?: { theme?: string; size?: string; width?: number; text?: string }) => {
    if (!element || !window.google?.accounts?.id) return;
    window.google.accounts.id.renderButton(element, {
      type: 'standard',
      theme: (options?.theme as 'outline') || 'outline',
      size: (options?.size as 'large') || 'large',
      width: options?.width,
      text: (options?.text as 'signin_with') || 'signin_with',
      logo_alignment: 'left',
    });
  }, []);

  return { ready, prompt, renderButton, clientId: GOOGLE_CLIENT_ID };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (notification?: unknown) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
          revoke: (hint: string, callback?: () => void) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
