import { useEffect, useRef, useCallback, useState } from 'react';

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
const GOOGLE_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID || '';

/** false si el build se hizo sin VITE_GOOGLE_CLIENT_ID (muy típico en prod si solo pusiste GOOGLE_CLIENT_ID en el servidor). */
export const googleClientConfigured = Boolean(GOOGLE_CLIENT_ID.trim());

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
    if (!GOOGLE_CLIENT_ID.trim()) {
      console.warn('[GoogleSignIn] VITE_GOOGLE_CLIENT_ID no configurado en el build');
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

  const renderButton = useCallback(
    (
      element: HTMLElement | null,
      options?: { theme?: string; size?: string; width?: number; text?: string; shape?: string },
    ) => {
      if (!element || !window.google?.accounts?.id) return;
      // Evita botones duplicados si el efecto corre dos veces (p. ej. React Strict Mode) o el tema cambia.
      element.replaceChildren();
      const width =
        options?.width ??
        Math.min(400, Math.max(280, Math.floor(element.getBoundingClientRect().width || 320)));
      window.google.accounts.id.renderButton(element, {
        type: 'standard',
        // Estilos actuales de GIS: filled_blue / filled_black suelen verse más “nuevos” que outline.
        theme: (options?.theme as 'filled_blue') || 'filled_blue',
        size: (options?.size as 'large') || 'large',
        width,
        text: (options?.text as 'signin_with') || 'signin_with',
        shape: (options?.shape as 'pill') || 'pill',
        logo_alignment: 'left',
      });
    },
    [],
  );

  return {
    ready,
    prompt,
    renderButton,
    clientId: GOOGLE_CLIENT_ID,
    clientConfigured: googleClientConfigured,
  };
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
