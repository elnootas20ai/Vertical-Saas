import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiBase } from '../lib/apiBase';
import { resolveSseAccessToken } from '../lib/sseToken';

export type SSEEventHandler = (data: unknown) => void;
export type SSEEventMap = Record<string, SSEEventHandler>;

interface UseSSEOptions {
  /** userId del usuario autenticado */
  userId: string | null;
  /** JWT access token (opcional; se resuelve vía cookie si falta) */
  token?: string | null;
  /** businessId para recibir eventos del equipo */
  businessId?: string | null;
  /** Mapa de nombre de evento → función manejadora */
  handlers: SSEEventMap;
  /** Activa o desactiva la conexión (útil para pausarla sin desmontar) */
  enabled?: boolean;
}

const RECONNECT_INITIAL_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

function buildSseUrl(token: string | null, businessId?: string | null): string {
  const base = getApiBase();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (businessId) params.set('businessId', businessId);
  const qs = params.toString();
  return `${base}/api/sse${qs ? `?${qs}` : ''}`;
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
  const [resolvedToken, setResolvedToken] = useState<string | null>(token ?? null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !userId) {
      setResolvedToken(null);
      return;
    }
    if (token) {
      setResolvedToken(token);
      return;
    }
    void resolveSseAccessToken().then((t) => {
      if (!cancelled) setResolvedToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, token, enabled]);

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

  const connect = useCallback(async () => {
    if (!userId || !enabled) return;
    disconnect();

    let activeToken = token || resolvedToken;
    if (!activeToken) {
      activeToken = await resolveSseAccessToken();
      if (activeToken) setResolvedToken(activeToken);
    }
    if (!activeToken && getApiBase() !== '') {
      return;
    }

    const url = buildSseUrl(activeToken, businessId);
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.addEventListener('connected', () => {
      reconnectDelay.current = RECONNECT_INITIAL_MS;
    });

    // Siempre leer handlersRef.current: si capturamos `handler` al conectar,
    // el chat se queda con selectedChannelId=null y deja de anexar mensajes.
    for (const eventName of Object.keys(handlersRef.current)) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        const current = handlersRef.current[eventName];
        if (!current) return;
        try {
          const data = JSON.parse(e.data);
          current(data);
        } catch {
          current(e.data);
        }
      });
    }

    es.onerror = () => {
      const disconnectedHandler = handlersRef.current.disconnected;
      if (typeof disconnectedHandler === 'function') {
        disconnectedHandler({ reason: 'error' });
      }
      const reconnectingHandler = handlersRef.current.reconnecting;
      if (typeof reconnectingHandler === 'function') {
        reconnectingHandler({ retryInMs: reconnectDelay.current });
      }
      es.close();
      esRef.current = null;

      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        void connect();
      }, reconnectDelay.current);
    };
  }, [userId, token, resolvedToken, businessId, enabled, disconnect]);

  useEffect(() => {
    if (enabled && userId && (token || resolvedToken || getApiBase() === '')) {
      void connect();
    } else if (!enabled) {
      disconnect();
    }
    return disconnect;
  }, [userId, token, resolvedToken, businessId, enabled, connect, disconnect]);
}
