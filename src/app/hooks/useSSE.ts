import { useEffect, useRef, useState } from 'react';
import { getApiBase } from '../lib/apiBase';
import { resolveSseAccessToken } from '../lib/sseToken';
import {
  refreshSharedSseHandlers,
  subscribeSharedSse,
  unsubscribeSharedSse,
  type SSEEventMap,
} from '../lib/sseShared';

export type { SSEEventHandler, SSEEventMap } from '../lib/sseShared';

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

/**
 * Hook SSE — una sola conexión compartida por usuario/negocio (Ola 2).
 */
export function useSSE({ userId, token, businessId, handlers, enabled = true }: UseSSEOptions) {
  const handlersRef = useRef(handlers);
  const [resolvedToken, setResolvedToken] = useState<string | null>(token ?? null);

  useEffect(() => {
    handlersRef.current = handlers;
    refreshSharedSseHandlers();
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

  useEffect(() => {
    if (!enabled || !userId) return;
    if (!token && !resolvedToken && getApiBase() !== '') return;

    const id = subscribeSharedSse({
      userId,
      token: token || resolvedToken,
      businessId,
      handlersRef,
    });

    const onVis = () => {
      if (document.visibilityState === 'visible') refreshSharedSseHandlers();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      unsubscribeSharedSse(id);
    };
  }, [userId, token, resolvedToken, businessId, enabled]);
}
