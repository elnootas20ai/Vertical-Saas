import { useEffect, useRef, useCallback } from 'react';

export type SSEEventHandler = (data: unknown) => void;
export type SSEEventMap = Record<string, SSEEventHandler>;

interface UseSSEOptions {
  /** userId del usuario autenticado */
  userId: string | null;
  /** JWT access token */
  token: string | null;
  /** businessId para recibir eventos del equipo */
  businessId?: string | null;
  /** Mapa de nombre de evento → función manejadora */
  handlers: SSEEventMap;
  /** Activa o desactiva la conexión (útil para pausarla sin desmontar) */
  enabled?: boolean;
}

const RECONNECT_INITIAL_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

function getSseUrl(token: string, businessId?: string | null): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';

  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');

  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  const base = `${protocol}://${host}:${port}`;

  const params = new URLSearchParams({ token });
  if (businessId) params.set('businessId', businessId);

  return `${base}/api/sse?${params.toString()}`;
}

/**
 * Hook para conectarse al endpoint SSE del backend.
 * Se reconecta automáticamente con backoff exponencial.
 */
export function useSSE({ userId, token, businessId, handlers, enabled = true }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_INITIAL_MS);
  const handlersRef = useRef(handlers);

  // Mantener la referencia actualizada sin re-crear la conexión
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!userId || !token || !enabled) return;
    disconnect();

    const url = getSseUrl(token, businessId);
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      reconnectDelay.current = RECONNECT_INITIAL_MS;
    });

    // Registrar todos los handlers proporcionados
    for (const [eventName, handler] of Object.entries(handlersRef.current)) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handler(data);
        } catch {
          handler(e.data);
        }
      });
    }

    es.onerror = () => {
      es.close();
      esRef.current = null;

      // Backoff exponencial hasta RECONNECT_MAX_MS
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };
  }, [userId, token, businessId, enabled, disconnect]);

  useEffect(() => {
    if (enabled && userId && token) {
      connect();
    } else {
      disconnect();
    }
    return disconnect;
  }, [userId, token, businessId, enabled, connect, disconnect]);
}
