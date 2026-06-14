import type { DeliveryConfig, DeliveryOrder, DeliveryOrderStatus, OpsAlert } from './deliveryApi';

function orderPhaseThresholdKey(status: DeliveryOrderStatus): string {
  if (status === 'nuevo') return 'pending';
  if (status === 'cocina') return 'kitchen';
  if (status === 'listo') return 'assembly';
  if (status === 'en_reparto') return 'delivery';
  return 'pending';
}

export function formatOpsDayLabel(opsDate: string, todayKey: string): string {
  if (!opsDate) return 'Hoy';
  if (opsDate === todayKey) return 'Hoy';
  const d = new Date(`${opsDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return opsDate;
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Recalcula minutos de alertas operativas sin volver a pedir el ops-center. */
export function enrichOpsAlertsLive(
  alerts: OpsAlert[],
  orders: DeliveryOrder[],
  cfg: DeliveryConfig | null,
  cashOpenSessions: { _id: string; openedAt?: string; terminalName?: string; pointOfSaleName?: string }[],
  maxCashHours: number,
  nowMs: number,
): OpsAlert[] {
  const deliveryThr = cfg?.delayThresholdMinutes ?? 40;
  const kitchenThr = cfg?.defaultPrepTime ?? 20;
  const phaseThr: Record<string, number> = {
    pending: 5,
    kitchen: kitchenThr,
    assembly: 10,
    delivery: deliveryThr,
  };

  return alerts.map((a) => {
    if (a.type === 'delayed_order' && a.orderId) {
      const o = orders.find((x) => x._id === a.orderId);
      if (!o) return a;
      const status = normalizeOrderStatus(o.status);
      const phaseStart = getOrderPhaseStartIso(o);
      const mins = Math.floor(minutesSinceIso(phaseStart, nowMs));
      const thr = phaseThr[orderPhaseThresholdKey(status)] ?? deliveryThr;
      return {
        ...a,
        severity: mins >= thr * 2 ? 'critical' : 'warning',
        message: `${mins} min en ${status} (umbral CEO: ${thr} min)`,
        createdAt: phaseStart,
      };
    }
    if (a.type === 'cash_pending_close' && a.sessionId) {
      const s = cashOpenSessions.find((x) => x._id === a.sessionId);
      if (!s?.openedAt) return a;
      const hours = minutesSinceIso(s.openedAt, nowMs) / 60;
      const maxH = maxCashHours || 12;
      return {
        ...a,
        severity: hours >= maxH * 1.25 ? 'critical' : 'warning',
        message: `${s.terminalName || 'Terminal'} — ${s.pointOfSaleName || 'PDV'} abierta ${Math.round(hours)}h (máx. CEO: ${maxH}h)`,
        createdAt: s.openedAt,
      };
    }
    return a;
  });
}

const STATUS_ALIASES: Record<string, DeliveryOrderStatus> = {
  pending: 'nuevo',
  preparing: 'nuevo',
  kitchen: 'cocina',
  assembly: 'listo',
  delivery: 'en_reparto',
  delivered: 'entregado',
};

export function normalizeOrderStatus(status: string | undefined): DeliveryOrderStatus {
  const v = String(status || '');
  return (STATUS_ALIASES[v] || v) as DeliveryOrderStatus;
}

/** Inicio de la fase actual (cocina, montaje, reparto…), no siempre createdAt. */
export function getOrderPhaseStartIso(order: DeliveryOrder): string {
  const status = normalizeOrderStatus(order.status);
  if (status === 'cocina' && order.kitchenStartedAt) return order.kitchenStartedAt;
  if (status === 'listo') {
    if (order.assemblyStartedAt) return order.assemblyStartedAt;
    if (order.kitchenCompletedAt) return order.kitchenCompletedAt;
  }
  if (status === 'en_reparto' && order.departedAt) return order.departedAt;
  if (status === 'nuevo') return order.createdAt;

  const history = order.stageHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (normalizeOrderStatus(h.status) === status && h.date) return h.date;
  }
  return order.createdAt;
}

export function minutesSinceIso(iso: string | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (nowMs - t) / 60_000);
}

export function formatElapsedMinutes(minutes: number): string {
  if (minutes < 1) return 'ahora';
  const m = Math.floor(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}h ${rest}m` : `${h}h`;
}

export function formatElapsedFromIso(iso: string | undefined, nowMs: number): string {
  return formatElapsedMinutes(minutesSinceIso(iso, nowMs));
}

export function computeKitchenLiveStats(
  orders: DeliveryOrder[],
  capacity: number,
  nowMs: number,
) {
  const inKitchen = orders.filter((o) => normalizeOrderStatus(o.status) === 'cocina');
  const waits = inKitchen.map((o) => minutesSinceIso(getOrderPhaseStartIso(o), nowMs));
  const oldest = waits.length ? Math.max(...waits) : 0;
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  const cap = capacity > 0 ? capacity : 1;
  return {
    ordersInKitchen: inKitchen.length,
    capacity,
    saturationPercent: Math.round((inKitchen.length / cap) * 1000) / 10,
    oldestOrderMinutes: oldest,
    avgWaitMinutes: avg,
  };
}

export function computeRepartoLiveStats(
  orders: DeliveryOrder[],
  delayThresholdMinutes: number,
  nowMs: number,
) {
  const activeStatuses: DeliveryOrderStatus[] = ['nuevo', 'cocina', 'listo', 'en_reparto', 'incident'];
  const inDelivery = orders.filter(
    (o) => o.status === 'en_reparto' || (o.status === 'listo' && o.assignedDriver),
  );
  const drivers = new Set(inDelivery.map((o) => o.assignedDriver).filter(Boolean));
  const delayedCount = orders.filter(
    (o) =>
      activeStatuses.includes(o.status) &&
      minutesSinceIso(o.createdAt, nowMs) > delayThresholdMinutes,
  ).length;
  return {
    ordersInDelivery: inDelivery.length,
    driversActive: drivers.size,
    delayedCount,
  };
}
