import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders } from '../lib/authApi';
import { DELIVERY_OPS_LIVE_EVENT } from '../lib/deliveryOpsLive';
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
 * SSE + evento local para pedidos/cobros (cocina, ops, dashboard, ingresos).
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
      'delivery:order_updated': () => onRefresh(),
      'delivery:order_status_changed': () => onRefresh(),
      'delivery:incident_reported': () => onRefresh(),
      'delivery:incident_resolved': () => onRefresh(),
      delivery_order_created: () => onRefresh(),
      delivery_order_updated: () => onRefresh(),
      delivery_order_cancelled: () => onRefresh(),
      delivery_order_reopened: () => onRefresh(),
      delivery_payment_registered: () => onRefresh(),
      tpv_session_updated: () => onRefresh(),
      connected: () => setSseOk(true),
      disconnected: () => setSseOk(false),
      // Cortes breves: mantener live; solo `disconnected` activa poll de respaldo.
      reconnecting: () => {},
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
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      onRefresh();
    }, fallbackPollMs);
    return () => clearInterval(iv);
  }, [enabled, authUserId, fallbackPollMs, sseOk, onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (!document.hidden) onRefresh();
    };
    const onLocalLive = () => onRefresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(DELIVERY_OPS_LIVE_EVENT, onLocalLive);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(DELIVERY_OPS_LIVE_EVENT, onLocalLive);
    };
  }, [enabled, onRefresh]);

  return { sseOk };
}
