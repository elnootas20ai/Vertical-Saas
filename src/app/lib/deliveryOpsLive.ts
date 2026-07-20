/**
 * Bus local: al cobrar/crear pedido, refrescar ops + dashboard aunque el SSE
 * tarde o falle en la misma pestaña.
 */
export const DELIVERY_OPS_LIVE_EVENT = 'vertial:delivery-ops-live';

export type DeliveryOpsLiveDetail = {
  reason?: string;
  businessId?: string | null;
};

export function notifyDeliveryOpsLive(detail: DeliveryOpsLiveDetail = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_OPS_LIVE_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}
