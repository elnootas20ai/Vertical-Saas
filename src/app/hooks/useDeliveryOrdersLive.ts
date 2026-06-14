import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders } from '../lib/authApi';
import { useSSE } from './useSSE';

interface UseDeliveryOrdersLiveOptions {
  /** Usuario autenticado (SSE), no el data-user del tenant. */
  authUserId: string | null;
  businessId?: string | null;
  onRefresh: () => void;
  enabled?: boolean;
  /** Polling de respaldo solo si SSE no está conectado. 0 = sin polling. */
  fallbackPollMs?: number;
}

/**
 * SSE en vivo para pedidos delivery (cocina, montaje, reparto).
 * Escucha eventos de negocio + legacy del owner.
 */
export function useDeliveryOrdersLive({
  authUserId,
  businessId,
  onRefresh,
  enabled = true,
  fallbackPollMs = 30_000,
}: UseDeliveryOrdersLiveOptions) {
  const [sseOk, setSseOk] = useState(false);

  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [authUserId]);

  const handlers = useMemo(
    () => ({
      'delivery:order_created': () => onRefresh(),
      'delivery:order_status_changed': () => onRefresh(),
      'delivery:incident_reported': () => onRefresh(),
      'delivery:incident_resolved': () => onRefresh(),
      delivery_order_created: () => onRefresh(),
      delivery_order_updated: () => onRefresh(),
      delivery_order_cancelled: () => onRefresh(),
      delivery_order_reopened: () => onRefresh(),
      connected: () => setSseOk(true),
      disconnected: () => setSseOk(false),
      reconnecting: () => setSseOk(false),
    }),
    [onRefresh],
  );

  useSSE({
    userId: authUserId,
    token: sseToken,
    businessId,
    handlers,
    enabled: enabled && !!authUserId && !!sseToken,
  });

  useEffect(() => {
    if (!enabled || !authUserId || fallbackPollMs <= 0 || sseOk) return;
    const iv = setInterval(onRefresh, fallbackPollMs);
    return () => clearInterval(iv);
  }, [enabled, authUserId, fallbackPollMs, sseOk, onRefresh]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) onRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onRefresh]);

  return { sseOk };
}
