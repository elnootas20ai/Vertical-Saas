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

function emitHandler(name: string, handlers: SSEEventMap, payload: unknown) {
  const fn = handlers[name];
  if (typeof fn === 'function') fn(payload);
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
  const intentionalCloseRef = useRef(false);
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
    intentionalCloseRef.current = true;
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
    intentionalCloseRef.current = false;

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

    const markConnected = (payload: unknown) => {
      reconnectDelay.current = RECONNECT_INITIAL_MS;
      emitHandler('connected', handlersRef.current, payload);
    };

    // onopen: algunos proxies no reenvían bien el event: connected del server.
    es.onopen = () => {
      markConnected({ source: 'open', ts: Date.now() });
    };

    es.addEventListener('connected', (e: Event) => {
      const msg = e as MessageEvent;
      try {
        markConnected(JSON.parse(String(msg.data || '{}')));
      } catch {
        markConnected({ source: 'connected', raw: msg.data });
      }
    });

    // Siempre leer handlersRef.current: si capturamos `handler` al conectar,
    // el chat se queda con selectedChannelId=null y deja de anexar mensajes.
    for (const eventName of Object.keys(handlersRef.current)) {
      if (eventName === 'connected' || eventName === 'disconnected' || eventName === 'reconnecting') {
        continue; // ya gestionados arriba / en onerror
      }
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
      if (intentionalCloseRef.current) return;
      // No marcar "desconectado" al primer corte: solo reconectando.
      // Si marcamos offline aquí, el OP cae a poll 30s aunque el SSE vuelva en 1s.
      emitHandler('reconnecting', handlersRef.current, { retryInMs: reconnectDelay.current });
      es.close();
      if (esRef.current === es) esRef.current = null;

      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        // Tras varios fallos, avisar desconexión real (antes del siguiente intento).
        if (reconnectDelay.current >= 12_000) {
          emitHandler('disconnected', handlersRef.current, { reason: 'error' });
        }
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
