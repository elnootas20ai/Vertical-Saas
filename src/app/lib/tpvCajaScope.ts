import type { DeliveryOrder, TpvRegisterSession, TpvRegisterSummary } from './deliveryApi';
import { buildTpvRegisterSummary } from './tpvCajaMath';

const CANCELLED_STATUSES = new Set(['cancelled', 'cancelado']);
const REFUNDED_STATUSES = new Set(['devuelto']);

export function isCancelledDeliveryOrder(order: { status?: string | null }): boolean {
  return CANCELLED_STATUSES.has(String(order.status || '').toLowerCase());
}

export function isRefundedDeliveryOrder(order: { status?: string | null; paymentStatus?: string | null }): boolean {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return true;
  return REFUNDED_STATUSES.has(String(order.status || '').toLowerCase());
}

/** Pedido cobrado (Cobrar y enviar, entrega con pago, etc.). */
export function orderAlreadyCobrado(order: Pick<DeliveryOrder, 'totalAmount' | 'paidAmount' | 'paymentStatus' | 'paymentCollected'>): boolean {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return false;
  const total = Number(order.totalAmount || 0);
  const paid = Number(order.paidAmount || 0);
  if (order.paymentStatus === 'paid' || order.paymentCollected) return true;
  if (paid > 0 && total > 0 && paid >= total) return true;
  return false;
}

/** Tablero TPV «Completados en turno»: solo entregados (montaje → reparto → entregado). */
export function isDeliveredBoardOrder(order: Pick<DeliveryOrder, 'status' | 'paymentStatus'>): boolean {
  if (isCancelledDeliveryOrder(order)) return false;
  if (isRefundedDeliveryOrder(order)) return false;
  return String(order.status || '').toLowerCase() === 'entregado';
}

/**
 * Historial del turno (abajo en TPV): entregados + eliminados + devueltos
 * (aunque se borrara en montaje/reparto y no hubiera llegado a entregado).
 */
export function isCompletedHistoryBoardOrder(
  order: Pick<DeliveryOrder, 'status' | 'paymentStatus' | 'deliveredAt' | 'stageHistory'>,
): boolean {
  if (isDeliveredBoardOrder(order)) return true;
  if (isCancelledDeliveryOrder(order)) return true;
  return String(order.status || '').toLowerCase() === 'devuelto';
}

/** Momento real de cierre del pedido (entregado / eliminado). Sin updatedAt: si no, al tocar el doc vuelve al historial. */
export function orderHistoryCompletionMs(order: {
  deliveredAt?: string;
  cancelledAt?: string;
  stageHistory?: DeliveryOrder['stageHistory'];
}): number | null {
  const candidates = [
    String(order.deliveredAt || '').trim(),
    String(order.cancelledAt || '').trim(),
  ];
  const stages = Array.isArray(order.stageHistory) ? order.stageHistory : [];
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const s = String(stages[i]?.status || '').toLowerCase();
    if (s === 'entregado' || s === 'cancelled' || s === 'cancelado' || s === 'devuelto') {
      candidates.push(String(stages[i]?.date || '').trim());
      break;
    }
  }
  let best: number | null = null;
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isNaN(ms)) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

/**
 * Historial del tablero de ESTA caja abierta.
 * Tras cerrar y abrir otra: no reaparecen completados del turno anterior.
 * Sí entran creados en este turno, o cerrados después de openedAt (Glovo pendiente).
 */
export function orderOnCompletedTpvHistoryBoard(
  order: {
    createdAt?: string;
    status?: string | null;
    paymentStatus?: string | null;
    deliveredAt?: string;
    cancelledAt?: string;
    stageHistory?: DeliveryOrder['stageHistory'];
  },
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'> | null | undefined,
): boolean {
  if (!session || String(session.status || '') !== 'open') return false;
  if (!isCompletedHistoryBoardOrder(order)) return false;
  const createdAt = String(order.createdAt || '').trim();
  const openedAt = String(session.openedAt || '').trim();
  if (!createdAt || !openedAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const openedMs = new Date(openedAt).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(openedMs)) return false;
  const openDayStart = new Date(localDayBoundsForKey(localCalendarDayKey(new Date(openedAt))).from).getTime();
  if (Number.isNaN(openDayStart) || createdMs < openDayStart) return false;
  if (orderInRegisterSession(order, session)) return true;
  const doneMs = orderHistoryCompletionMs(order);
  return doneMs != null && doneMs >= openedMs;
}

/** Fase en la que estaba el pedido al eliminarlo (para la etiqueta del historial). */
export function cancelledOrderBoardPhase(
  order: Pick<DeliveryOrder, 'deliveredAt' | 'stageHistory' | 'status'>,
): 'entregado' | 'reparto' | 'montaje' {
  if (String(order.deliveredAt || '').trim()) return 'entregado';
  const stages = Array.isArray(order.stageHistory) ? order.stageHistory : [];
  let sawEntregado = false;
  let sawReparto = false;
  let sawMontaje = false;
  for (const row of stages) {
    const s = String(row?.status || '').toLowerCase();
    if (s === 'entregado') sawEntregado = true;
    else if (s === 'en_reparto') sawReparto = true;
    else if (s === 'nuevo' || s === 'cocina' || s === 'listo') sawMontaje = true;
  }
  if (sawEntregado) return 'entregado';
  if (sawReparto) return 'reparto';
  if (sawMontaje) return 'montaje';
  return 'montaje';
}

/** Etiqueta corta en el historial del tablero. */
export function cancelledOrderHistoryLabel(
  order: Pick<DeliveryOrder, 'deliveredAt' | 'stageHistory' | 'status'>,
): string {
  const phase = cancelledOrderBoardPhase(order);
  if (phase === 'entregado') return 'Eliminado · entregado';
  if (phase === 'reparto') return 'Eliminado · reparto';
  return 'Eliminado · montaje';
}

/** Recuento caja / ventas del turno: entregados o ya cobrados en TPV. */
export function isCompletedShiftOrder(order: Pick<DeliveryOrder, 'status' | 'totalAmount' | 'paidAmount' | 'paymentStatus' | 'paymentCollected'>): boolean {
  if (isCancelledDeliveryOrder(order)) return false;
  if (isRefundedDeliveryOrder(order)) return false;
  return String(order.status || '').toLowerCase() === 'entregado' || orderAlreadyCobrado(order);
}

/** Día local del navegador (YYYY-MM-DD). Una sola fuente para TPV, Caja y gerente. */
export function localCalendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDayBounds(d = new Date()): { from: string; to: string; dayKey: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString(), dayKey: localCalendarDayKey(d) };
}

export function localDayBoundsForKey(dayKey: string): { from: string; to: string } {
  const parts = String(dayKey || '').split('-').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return localDayBounds();
  }
  const [y, m, d] = parts;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function isLocalCalendarDay(iso: string | undefined, dayKey: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return localCalendarDayKey(d) === dayKey;
}

function parseDayKey(dayKey: string): number {
  const t = new Date(`${dayKey}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Día de trabajo del turno = día local de apertura (cierres a la madrugada / día siguiente). */
export function sessionWorkDayKey(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt'> | null | undefined,
): string {
  const opened = String(session?.openedAt || '').trim();
  if (opened) {
    const d = new Date(opened);
    if (!Number.isNaN(d.getTime())) return localCalendarDayKey(d);
  }
  const closed = String(session?.closedAt || '').trim();
  if (closed) {
    const d = new Date(closed);
    if (!Number.isNaN(d.getTime())) return localCalendarDayKey(d);
  }
  return '';
}

/** Turno activo en un día del calendario (desde apertura hasta cierre o hoy si sigue abierto). */
export function sessionActiveOnCalendarDay(
  session: TpvRegisterSession,
  dayKey: string,
  now = new Date(),
): boolean {
  const openedAt = String(session.openedAt || '').trim();
  if (!openedAt) return false;
  const openKey = localCalendarDayKey(new Date(openedAt));
  const endIso = session.status === 'open' ? now.toISOString() : String(session.closedAt || now.toISOString());
  const closeKey = localCalendarDayKey(new Date(endIso));
  const target = parseDayKey(dayKey);
  return target >= parseDayKey(openKey) && target <= parseDayKey(closeKey);
}

/**
 * Listado Caja por día:
 * - Cerrada → solo el día que se abrió (aunque cierren al día siguiente).
 * - Abierta → sigue visible en los días del turno (para poder cerrarla).
 */
export function sessionBelongsToCajaDay(
  session: TpvRegisterSession,
  dayKey: string,
  now = new Date(),
): boolean {
  if (String(session.status || '').toLowerCase() === 'closed') {
    const workDay = sessionWorkDayKey(session);
    return Boolean(workDay) && workDay === dayKey;
  }
  return sessionActiveOnCalendarDay(session, dayKey, now);
}

/** Pedido dentro del turno de caja (desde apertura hasta cierre). Sin caja abierta → ninguno. */
export function orderInRegisterSession(
  order: { createdAt?: string },
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'> | null | undefined,
): boolean {
  const createdAt = String(order.createdAt || '').trim();
  if (!createdAt) return false;
  const openedAt = String(session?.openedAt || '').trim();
  if (!openedAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const openedMs = new Date(openedAt).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(openedMs)) return false;
  if (createdMs < openedMs) return false;
  if (session?.status === 'closed') {
    const closedAt = String(session.closedAt || '').trim();
    if (closedAt) {
      const closedMs = new Date(closedAt).getTime();
      if (!Number.isNaN(closedMs) && createdMs > closedMs) return false;
    }
  }
  return true;
}

const OPEN_OPS_STATUSES = new Set(['nuevo', 'cocina', 'listo', 'en_reparto']);

/** Pedido aún operativo (montaje / reparto), no cerrado. */
export function isOpenOperationalDeliveryStatus(status?: string | null): boolean {
  return OPEN_OPS_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * Tablero TPV (montaje/reparto): solo pedidos de ESTA caja (createdAt ≥ openedAt).
 * Así, al cerrar y abrir otra, no reaparecen montajes/listos del turno anterior.
 */
export function orderOnOpenTpvOpsBoard(
  order: { createdAt?: string; status?: string | null },
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'> | null | undefined,
): boolean {
  if (!session || String(session.status || '') !== 'open') return false;
  if (!isOpenOperationalDeliveryStatus(order.status)) return false;
  return orderInRegisterSession(order, session);
}

/** Montaje en tablero TPV (listo sin montaje cerrado sigue aquí). Recogida no pasa a reparto. */
export function isTpvMontajeBoardOrder(order: {
  status?: string | null;
  assemblyCompletedAt?: string | null;
  deliveryType?: string | null;
}): boolean {
  const status = String(order.status || '').toLowerCase();
  const isPickup = String(order.deliveryType || '').toLowerCase() === 'recogida';
  // Recogida: se queda en montaje hasta el botón verde (Entregar → entregado).
  if (isPickup) {
    return status === 'nuevo' || status === 'cocina' || status === 'listo' || status === 'en_reparto';
  }
  if (status === 'nuevo' || status === 'cocina') return true;
  if (status === 'listo' && !order.assemblyCompletedAt) return true;
  return false;
}

/** Reparto en tablero TPV (en_reparto o listo ya montado). No aplica a recogida en tienda. */
export function isTpvRepartoBoardOrder(order: {
  status?: string | null;
  assemblyCompletedAt?: string | null;
  deliveryType?: string | null;
}): boolean {
  if (String(order.deliveryType || '').toLowerCase() === 'recogida') return false;
  const status = String(order.status || '').toLowerCase();
  if (status === 'en_reparto') return true;
  if (status === 'listo' && Boolean(order.assemblyCompletedAt)) return true;
  return false;
}

export function transactionOnCalendarDay(tx: { date?: string }, dayKey: string): boolean {
  return isLocalCalendarDay(tx.date, dayKey);
}

export function filterSessionTransactionsForDay(
  session: TpvRegisterSession,
  dayKey: string,
): TpvRegisterSession['transactions'] {
  return (session.transactions || []).filter((tx) => transactionOnCalendarDay(tx, dayKey));
}

export function buildTpvRegisterSummaryForDay(
  session: TpvRegisterSession,
  dayKey: string,
): TpvRegisterSummary {
  // Cierre → totales del turno completo en el día de apertura (no partir por medianoche).
  if (
    String(session.status || '').toLowerCase() === 'closed'
    && sessionWorkDayKey(session) === dayKey
  ) {
    return buildTpvRegisterSummary(session);
  }
  return buildTpvRegisterSummary({
    ...session,
    transactions: filterSessionTransactionsForDay(session, dayKey),
  });
}

/**
 * Rango API para el tablero TPV: desde el inicio del día local de apertura
 * (no el reloj exacto de openedAt), para no perder montaje/reparto tras re-login.
 */
export function orderLoadBoundsForOpenSession(sessionOpenedAt: string | null | undefined): {
  from: string;
  to: string;
} {
  const today = localDayBounds();
  const openedAt = String(sessionOpenedAt || '').trim();
  if (!openedAt) return { from: today.from, to: today.to };
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) return { from: today.from, to: today.to };
  const openDay = localDayBoundsForKey(localCalendarDayKey(opened));
  return { from: openDay.from, to: today.to };
}

/** Rango de pedidos para recuento de cierre (abierta o cerrada). */
export function registerSessionOrderLoadBounds(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>,
  now = new Date(),
): { from: string; to: string } {
  const openedAt = String(session.openedAt || '').trim();
  const to = session.status === 'closed'
    ? String(session.closedAt || now.toISOString())
    : orderLoadBoundsForOpenSession(openedAt).to;
  if (!openedAt) return localDayBounds(now);
  return { from: openedAt, to };
}

export function normalizeTpvSessionBusinessId(
  session: Pick<{ business_id?: string; businessId?: string }, 'business_id' | 'businessId'> | null | undefined,
): string {
  if (!session) return '';
  return String(session.business_id || session.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

/** Sesión de caja pertenece a la empresa activa (legacy: solo si el PDV es de esa empresa). */
export function tpvSessionBelongsToBusiness(
  session: Pick<{ business_id?: string; businessId?: string; pointOfSaleId?: string }, 'business_id' | 'businessId' | 'pointOfSaleId'>,
  businessId: string,
  scopedPdvIds?: Iterable<string>,
): boolean {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return true;
  const sessionBid = normalizeTpvSessionBusinessId(session);
  if (sessionBid) return sessionBid === bid;
  const pdvId = String(session.pointOfSaleId || '').trim();
  if (!pdvId) return false;
  if (!scopedPdvIds) return false;
  for (const id of scopedPdvIds) {
    if (String(id || '').trim() === pdvId) return true;
  }
  return false;
}

export function registerSessionSpansMultipleDays(
  session: Pick<TpvRegisterSession, 'openedAt' | 'status' | 'closedAt'>,
  now = new Date(),
): boolean {
  const openedAt = String(session.openedAt || '').trim();
  if (!openedAt) return false;
  const openKey = localCalendarDayKey(new Date(openedAt));
  const endKey = session.status === 'open'
    ? localCalendarDayKey(now)
    : localCalendarDayKey(new Date(session.closedAt || now));
  return openKey !== endKey;
}

/** IDs de tienda (PDV + workCenter) para matchear sesiones de caja. */
export function collectScopedStoreRefIds(
  scopedPdvs: Array<{ _id: string; workCenterId?: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const p of scopedPdvs || []) {
    const id = String(p._id || '').trim();
    const wc = String(p.workCenterId || '').trim();
    if (id) ids.add(id);
    if (wc) ids.add(wc);
  }
  return ids;
}

/** Filtra sesiones TPV a las de la tienda del código tablet. */
export function filterSessionsForTabletStore(
  sessions: TpvRegisterSession[],
  tabletPdvId: string,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }> = [],
  tabletWorkCenterId?: string | null,
): TpvRegisterSession[] {
  const pick = String(tabletPdvId || '').trim();
  if (!pick) return Array.isArray(sessions) ? sessions : [];
  const pdvs = Array.isArray(pointsOfSale) ? pointsOfSale : [];
  const alternateRefs = resolveTpvStoreAlternateRefs({
    pickId: pick,
    pointsOfSale: pdvs,
    tabletWorkCenterId,
  });
  return (Array.isArray(sessions) ? sessions : []).filter((s) => {
    const pid = String(s.pointOfSaleId || '').trim();
    if (!pid) return true;
    return tpvSessionMatchesStoreRef(s, pick, pdvs, alternateRefs);
  });
}

export function shouldKeepTpvSessionInClientList(
  session: TpvRegisterSession,
  scopedPdvs: Array<{ _id: string; workCenterId?: string }>,
  businessId?: string,
): boolean {
  const pid = String(session.pointOfSaleId || '').trim();
  const matchesScopedPdv = () =>
    Boolean(
      pid
      && (
        scopedPdvs.some((p) => p._id === pid)
        || scopedPdvs.some((p) => String(p.workCenterId || '').trim() === pid)
      ),
    );
  if (scopedPdvs.length === 0) return true;
  // Caja abierta o cierre de una tienda visible (fondo mañana), aunque business_id esté mal.
  if (matchesScopedPdv()) return true;
  const scopedRefIds = collectScopedStoreRefIds(scopedPdvs);
  if (businessId && !tpvSessionBelongsToBusiness(session, businessId, scopedRefIds)) {
    return false;
  }
  if (!pid) return !businessId;
  return false;
}

/**
 * Al refrescar/recargar sesiones de caja, no tirar una caja abierta local
 * si el servidor la omite un momento (filtro businessId, PDVs aún vacíos, glitch de red).
 * Si el servidor la devuelve cerrada, se respeta el cierre.
 */
export function mergeTpvRegisterSessionsPreservingOpen(
  prev: TpvRegisterSession[],
  next: TpvRegisterSession[],
): TpvRegisterSession[] {
  const prevList = Array.isArray(prev) ? prev : [];
  const nextList = Array.isArray(next) ? next : [];
  if (nextList.length === 0 && prevList.length > 0) return prevList;

  const nextById = new Map(
    nextList
      .filter((s) => s && String(s._id || '').trim())
      .map((s) => [String(s._id).trim(), s] as const),
  );
  const merged = [...nextList];

  for (const prevSession of prevList) {
    if (!prevSession || !isTpvRegisterSessionOpenStatus(prevSession)) continue;
    const id = String(prevSession._id || '').trim();
    if (!id) continue;
    if (nextById.has(id)) continue;
    const storeRef = String(prevSession.pointOfSaleId || '').trim();
    const openedAt = String(prevSession.openedAt || prevSession.createdAt || '').trim();
    const hasNewerCloseForStore = storeRef && nextList.some((s) => {
      if (String(s?.status || '').toLowerCase() !== 'closed') return false;
      if (String(s?.pointOfSaleId || '').trim() !== storeRef) return false;
      const closedAt = String(s?.closedAt || s?.updatedAt || '').trim();
      return Boolean(closedAt && openedAt && closedAt >= openedAt);
    });
    if (hasNewerCloseForStore) continue;
    merged.push(prevSession);
  }
  return merged;
}

function isTpvRegisterSessionOpenStatus(session: Pick<TpvRegisterSession, 'status'> | null | undefined): boolean {
  return Boolean(session && String(session.status || '').toLowerCase() === 'open');
}

/** Limpia estado local de caja (recarga / cierre remoto). */
export function clearTpvRegisterLocalSessionState(): void {
  writeTpvOpenRegisterLatch(null);
}

export function isTpvRegisterSessionClosed(
  session: Pick<TpvRegisterSession, 'status'> | null | undefined,
): boolean {
  return Boolean(session && String(session.status || '').toLowerCase() === 'closed');
}

/**
 * ¿La sesión cerrada remota afecta a nuestra tienda operativa?
 */
export function remoteClosedSessionAffectsStore(
  closedSession: Pick<TpvRegisterSession, 'pointOfSaleId' | 'status'>,
  storePickId: string,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }> = [],
  alternateRefIds: string[] = [],
): boolean {
  if (!isTpvRegisterSessionClosed(closedSession)) return false;
  const pick = String(storePickId || '').trim();
  if (!pick) return false;
  return tpvSessionMatchesStoreRef(closedSession, pick, pointsOfSale, alternateRefIds);
}

/** Latch de caja abierta: sobrevive parpadeos del Context React (HMR / refresh). */
const TPV_OPEN_REGISTER_LATCH_KEY = 'vertial.tpv.openRegisterLatch';

export function writeTpvOpenRegisterLatch(
  session: Pick<TpvRegisterSession, '_id' | 'status'> | null | undefined,
): void {
  try {
    const id = String(session?._id || '').trim();
    const open = Boolean(id) && String(session?.status || '').toLowerCase() === 'open';
    if (open) sessionStorage.setItem(TPV_OPEN_REGISTER_LATCH_KEY, id);
    else sessionStorage.removeItem(TPV_OPEN_REGISTER_LATCH_KEY);
  } catch {
    /* private mode / SSR */
  }
}

export function hasTpvOpenRegisterLatch(): boolean {
  try {
    return Boolean(String(sessionStorage.getItem(TPV_OPEN_REGISTER_LATCH_KEY) || '').trim());
  } catch {
    return false;
  }
}

/** Tablero TPV operativo: caja en Context, sticky o latch (parpadeos React / tablet). */
export function canEnterTpvOrderFlow(signals?: {
  registerOpen?: boolean;
  stickyOpen?: boolean;
  boardReady?: boolean;
  /** Modo consulta: tablero visible sin sesión de caja abierta. */
  browseOnly?: boolean;
}): boolean {
  if (signals?.browseOnly) return false;
  if (signals?.registerOpen || signals?.stickyOpen || signals?.boardReady) return true;
  return hasTpvOpenRegisterLatch();
}

/** PDV id o workCenterId de la sesión ↔ tienda elegida (tablet/CEO). */
export function tpvSessionMatchesStoreRef(
  session: Pick<TpvRegisterSession, 'pointOfSaleId'>,
  refId: string,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }>,
  /** Refs extra (p. ej. workCenterId del binding tablet antes de hidratar el PDV). */
  alternateRefIds: string[] = [],
): boolean {
  const pick = String(refId || '').trim();
  const sp = String(session.pointOfSaleId || '').trim();
  if (!pick || !sp) return false;
  if (sp === pick) return true;
  for (const alt of alternateRefIds) {
    const a = String(alt || '').trim();
    if (a && sp === a) return true;
  }
  const pdv = pointsOfSale.find((p) => p._id === pick);
  if (pdv && sp === String(pdv.workCenterId || '').trim()) return true;
  const byWc = pointsOfSale.find((p) => String(p.workCenterId || '').trim() === sp);
  if (byWc && byWc._id === pick) return true;
  return false;
}

/**
 * Resuelve la caja activa del TPV.
 * Si el pick de tienda parpadea o no matchea un instante, conserva la última caja abierta
 * (sobre todo en tablet / a mitad de pedido) para no volver a «Abrir caja».
 *
 * Si hay varias cajas abiertas para la misma tienda, gana siempre la más reciente
 * por `openedAt` (evita reenganchar una caja fantasma del 6 de julio al salir del TPV).
 */
export function resolveActiveTpvRegisterSession(params: {
  sessions: TpvRegisterSession[];
  sticky: TpvRegisterSession | null;
  pickId: string | null | undefined;
  pointsOfSale: Array<{ _id: string; workCenterId?: string }>;
  /** tablet, trabajador o pedido en curso: no soltar la caja abierta por un pick raro. */
  holdStickyWhileOpen: boolean;
  alternateRefIds?: string[];
}): { session: TpvRegisterSession | null; nextSticky: TpvRegisterSession | null } {
  const sessions = Array.isArray(params.sessions) ? params.sessions : [];
  const open = sessions.filter((s) => isTpvRegisterSessionOpenStatus(s));
  const pick = String(params.pickId || '').trim();
  const pdvs = params.pointsOfSale || [];
  const altRefs = params.alternateRefIds || [];

  let found: TpvRegisterSession | null = null;
  if (pick) {
    found = pickNewestOpenRegisterSessionForStore(open, pick, pdvs, altRefs);
  } else if (open.length === 1) {
    found = open[0];
  } else if (open.length > 1 && params.sticky?._id) {
    const stickyLive = open.find((s) => s._id === params.sticky?._id) || null;
    if (stickyLive) {
      const storeRef = String(stickyLive.pointOfSaleId || '').trim();
      found =
        pickNewestOpenRegisterSessionForStore(open, storeRef, pdvs, altRefs) || stickyLive;
    }
  }

  // Mientras status=open: siempre recordar/reenganchar (Salir del TPV no cierra caja).
  if (found) {
    return { session: found, nextSticky: found };
  }

  const sticky = params.sticky;
  if (!sticky?._id) {
    return { session: null, nextSticky: null };
  }

  const live = sessions.find((s) => s._id === sticky._id) || null;
  if (live && !isTpvRegisterSessionOpenStatus(live)) {
    return { session: null, nextSticky: null };
  }

  const candidate = isTpvRegisterSessionOpenStatus(live)
    ? live
    : isTpvRegisterSessionOpenStatus(sticky)
      ? sticky
      : null;
  if (!candidate) {
    return { session: null, nextSticky: null };
  }

  if (params.holdStickyWhileOpen) {
    return { session: candidate, nextSticky: candidate };
  }
  if (!pick || tpvSessionMatchesStoreRef(candidate, pick, pdvs)) {
    return { session: candidate, nextSticky: candidate };
  }

  // Sin PDVs cargados (o pick desconocido) el match WC↔PDV puede fallar un frame
  // y soltar la caja → parpadeo «Recuperando caja…». Solo soltar si el pick es
  // otra tienda real conocida (cambio deliberado del CEO).
  if (pdvs.length === 0) {
    return { session: candidate, nextSticky: candidate };
  }
  const pickIsKnownStore = pdvs.some(
    (p) =>
      p._id === pick || String(p.workCenterId || '').trim() === pick,
  );
  if (!pickIsKnownStore) {
    return { session: candidate, nextSticky: candidate };
  }

  // Pick apunta a otra tienda sin caja abierta → OpeningScreen, pero no olvidar la sticky.
  return { session: null, nextSticky: candidate };
}

/** Compara dos sesiones: la de `openedAt` más reciente gana. */
export function compareTpvSessionsByOpenedAtDesc(
  a: Pick<TpvRegisterSession, 'openedAt'>,
  b: Pick<TpvRegisterSession, 'openedAt'>,
): number {
  return String(b.openedAt || '').localeCompare(String(a.openedAt || ''));
}

/**
 * Entre cajas abiertas de la misma tienda (PDV o workCenter), la más nueva.
 * «Salir del TPV» no cierra caja: sin esto un `find` puede reenganchar una abierta antigua.
 */
/** Refs extra (tablet workCenterId, pick) para matchear caja antes de hidratar PDVs. */
export function resolveTpvStoreAlternateRefs(params: {
  pickId?: string | null;
  pointsOfSale?: Array<{ _id: string; workCenterId?: string }>;
  tabletWorkCenterId?: string | null;
}): string[] {
  const out = new Set<string>();
  const pick = String(params.pickId || '').trim();
  if (pick) out.add(pick);
  const wcBinding = String(params.tabletWorkCenterId || '').trim();
  if (wcBinding) out.add(wcBinding);
  for (const p of params.pointsOfSale || []) {
    const id = String(p._id || '').trim();
    const wc = String(p.workCenterId || '').trim();
    if (pick && (id === pick || wc === pick)) {
      if (id) out.add(id);
      if (wc) out.add(wc);
    }
  }
  return [...out].filter(Boolean);
}

export function pickNewestOpenRegisterSessionForStore(
  sessions: TpvRegisterSession[],
  storeRefId: string,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }> = [],
  alternateRefIds: string[] = [],
): TpvRegisterSession | null {
  const pick = String(storeRefId || '').trim();
  if (!pick) return null;
  const matches = (Array.isArray(sessions) ? sessions : []).filter(
    (s) =>
      isTpvRegisterSessionOpenStatus(s)
      && tpvSessionMatchesStoreRef(s, pick, pointsOfSale, alternateRefIds),
  );
  if (matches.length === 0) return null;
  return [...matches].sort(compareTpvSessionsByOpenedAtDesc)[0] || null;
}

/** true si la caja se abrió en un día local distinto de hoy. */
export function isTpvRegisterSessionFromPriorCalendarDay(
  session: Pick<TpvRegisterSession, 'openedAt'> | null | undefined,
  now = new Date(),
): boolean {
  const openedAt = String(session?.openedAt || '').trim();
  if (!openedAt) return false;
  const openDay = localCalendarDayKey(new Date(openedAt));
  return Boolean(openDay) && openDay !== localCalendarDayKey(now);
}

/**
 * Caja abierta demasiado antigua para reenganchar al entrar al TPV.
 * Permite turno de noche (pasa de medianoche) y bloquea fantasmas de hace días.
 */
export const TPV_STALE_OPEN_SESSION_MAX_AGE_HOURS = 18;

export function isTpvRegisterSessionStaleOpen(
  session: Pick<TpvRegisterSession, 'openedAt'> | null | undefined,
  now = new Date(),
  maxAgeHours = TPV_STALE_OPEN_SESSION_MAX_AGE_HOURS,
): boolean {
  const openedAt = String(session?.openedAt || '').trim();
  if (!openedAt) return false;
  const openedMs = new Date(openedAt).getTime();
  if (!Number.isFinite(openedMs)) return false;
  const ageHours = (now.getTime() - openedMs) / (1000 * 60 * 60);
  return ageHours > maxAgeHours;
}

/** Una caja abierta por tienda (la más reciente si hay duplicados). */
export function dedupeOpenRegisterSessions(sessions: TpvRegisterSession[]): TpvRegisterSession[] {
  const byPdv = new Map<string, TpvRegisterSession>();
  for (const s of sessions) {
    if (s.status !== 'open') continue;
    const pdv = String(s.pointOfSaleId || '_').trim() || '_';
    const prev = byPdv.get(pdv);
    if (!prev || String(s.openedAt).localeCompare(String(prev.openedAt)) > 0) {
      byPdv.set(pdv, s);
    }
  }
  return [...byPdv.values()].sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)));
}

function registerSessionDisplayRank(session: TpvRegisterSession): number {
  if (session.status === 'open') return 0;
  if (session.closingValidationStatus === 'pending') return 1;
  if (session.closingValidationStatus === 'rejected') return 2;
  return 3;
}

/** Orden de turnos: abiertos → pendientes → cerrados (más reciente primero). */
export function sortRegisterSessionsForDisplay(sessions: TpvRegisterSession[]): TpvRegisterSession[] {
  return [...sessions].sort((a, b) => {
    const ra = registerSessionDisplayRank(a);
    const rb = registerSessionDisplayRank(b);
    if (ra !== rb) return ra - rb;
    return String(b.openedAt).localeCompare(String(a.openedAt));
  });
}

/**
 * Último cierre de caja de una tienda.
 * Prefiere el mismo terminal; si no hay, usa el cierre más reciente de esa PDV
 * (tablet vs TPV-1 suelen diferir de terminal pero el cajón es el mismo).
 */
export function findLastClosedTpvSession(
  sessions: TpvRegisterSession[],
  pdvId: string,
  terminalId?: string | null,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }> = [],
  alternateRefIds: string[] = [],
): TpvRegisterSession | null {
  const pid = String(pdvId || '').trim();
  const tid = String(terminalId || '').trim();
  if (!pid) return null;

  const closedForStore = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => String(s.status || '') === 'closed')
    .filter((s) => {
      if (pointsOfSale.length > 0 || alternateRefIds.length > 0) {
        return tpvSessionMatchesStoreRef(s, pid, pointsOfSale, alternateRefIds);
      }
      return String(s.pointOfSaleId || '').trim() === pid;
    })
    .sort(
      (a, b) =>
        new Date(b.closedAt || b.updatedAt || 0).getTime()
        - new Date(a.closedAt || a.updatedAt || 0).getTime(),
    );

  if (closedForStore.length === 0) return null;
  if (tid) {
    const sameTerminal = closedForStore.find((s) => String(s.terminalId || '').trim() === tid);
    if (sameTerminal) return sameTerminal;
  }
  return closedForStore[0];
}

/** YYYY-MM-DD en Europe/Madrid (día operativo de bares ES). */
export function calendarDayMadrid(value?: string | Date | null): string {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Última caja cerrada hoy o ayer (Madrid) en esa tienda — candidata a reapertura por error.
 * Prefiere mismo terminal; si no, el cierre más reciente de la PDV.
 */
export function findReopenableClosedTpvSession(
  sessions: TpvRegisterSession[],
  pdvId: string,
  terminalId?: string | null,
  pointsOfSale: Array<{ _id: string; workCenterId?: string }> = [],
  alternateRefIds: string[] = [],
): TpvRegisterSession | null {
  const last = findLastClosedTpvSession(sessions, pdvId, terminalId, pointsOfSale, alternateRefIds);
  if (!last || String(last.status || '') !== 'closed') return null;
  const closedDay = calendarDayMadrid(last.closedAt || last.openedAt);
  const today = calendarDayMadrid(new Date());
  const parts = today.split('-').map((x) => Number(x));
  const yesterday =
    parts.length === 3 && parts.every((n) => Number.isFinite(n))
      ? calendarDayMadrid(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - 1, 12)))
      : '';
  if (!closedDay || (closedDay !== today && closedDay !== yesterday)) return null;
  return last;
}

/** Efectivo sugerido al abrir: prioridad al fondo dejado al cerrar. */
export function resolvePreviousCloseCashAmount(session: TpvRegisterSession | null | undefined): number | null {
  if (!session || String(session.status || '') !== 'closed') return null;
  if (session.nextDayInitialCash != null) {
    const leave = Number(session.nextDayInitialCash);
    if (Number.isFinite(leave) && leave >= 0) {
      return Math.round(leave * 100) / 100;
    }
  }
  const fromFinal = Number(session.finalCashAmount);
  if (Number.isFinite(fromFinal) && fromFinal >= 0) {
    return Math.round(fromFinal * 100) / 100;
  }
  return null;
}

/** true si el fondo sugerido viene del importe dejado al cerrar (no del contado total). */
export function previousCloseCashIsNextDayInitial(
  session: TpvRegisterSession | null | undefined,
): boolean {
  if (!session || String(session.status || '') !== 'closed') return false;
  if (session.nextDayInitialCash == null) return false;
  const leave = Number(session.nextDayInitialCash);
  return Number.isFinite(leave) && leave >= 0;
}

/**
 * Efectivo retirado al cierre = contado − fondo que queda.
 * Misma fórmula que «se retira» en ClosingScreen. null si no hay cierre con fondo declarado.
 */
export function cashWithdrawnAtClose(
  session: TpvRegisterSession | null | undefined,
): number | null {
  if (!session || String(session.status || '') !== 'closed') return null;
  if (session.nextDayInitialCash == null) return null;
  const counted = Number(session.finalCashAmount);
  const leave = Number(session.nextDayInitialCash);
  if (!Number.isFinite(counted) || !Number.isFinite(leave) || leave < 0) return null;
  return Math.round(Math.max(0, counted - leave) * 100) / 100;
}

/** Suma retirados de cierres (opcional: filtrar por predicado, p. ej. día / mes / PDV). */
export function sumCashWithdrawnAtClose(
  sessions: TpvRegisterSession[] | null | undefined,
  predicate?: (session: TpvRegisterSession) => boolean,
): number {
  let sum = 0;
  for (const s of sessions || []) {
    if (predicate && !predicate(s)) continue;
    const w = cashWithdrawnAtClose(s);
    if (w != null) sum += w;
  }
  return Math.round(sum * 100) / 100;
}
