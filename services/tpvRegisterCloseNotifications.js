/**
 * Cierre de caja TPV:
 * - Con descuadre → alerta (Centro + push)
 * - Sin descuadre → notificación de actividad (campana), no alerta
 *
 * businessId SIEMPRE de la sesión / PDV. Nunca account.business_id
 * (en cuentas multi-empresa colgaba el descuadre en la empresa “por defecto”, p. ej. PAUNILPOL).
 */
import {
  findBusinessById,
  findWorkCenterById,
  getDocument,
  getDeliveryDbName,
} from './couchdb.js';
import { emitGlobalAlert, emitPositiveAlert } from './alertEmitter.js';
import logger from './logger.js';

const DELIVERY_CAJA_ROUTE = '/saas/vertical/delivery/caja';

function bareId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function isManagerRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'owner' || r === 'gerente' || r === 'manager' || r === 'encargado';
}

/**
 * Destinatarios: dueño + admins/gerentes.
 */
export function resolveTpvCloseNotificationRecipients(business, closerUserId) {
  const recipients = new Set();
  const closer = String(closerUserId || '').trim();
  const ownerId = String(business?.owner_user_id || '').trim();
  if (ownerId) recipients.add(ownerId);
  for (const m of business?.members || []) {
    const uid = String(m?.user_id || '').trim();
    if (!uid) continue;
    if (isManagerRole(m.role)) recipients.add(uid);
  }
  if (closer && recipients.size === 0) recipients.add(closer);
  return Array.from(recipients);
}

function formatDiff(diff) {
  const n = Number(diff) || 0;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}€`;
}

async function resolveBusinessIdForTpvSession(req, session) {
  const fromSession = bareId(session?.business_id || session?.businessId);
  if (fromSession) return fromSession;

  const pdvId = String(session?.pointOfSaleId || '').trim();
  if (!pdvId) return '';

  try {
    const db = getDeliveryDbName();
    const pdv = await getDocument(req, db, pdvId).catch(() => null);
    const fromPdv = bareId(pdv?.businessId || pdv?.business_id);
    if (fromPdv) return fromPdv;
    const wcId = String(pdv?.workCenterId || '').trim();
    if (wcId) {
      const wc = await findWorkCenterById(req, wcId).catch(() => null);
      const fromWc = bareId(wc?.business_id || wc?.businessId);
      if (fromWc) return fromWc;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * @param {object} params
 * @param {object} params.req
 * @param {string} params.dataUserId
 * @param {string} params.actorUserId
 * @param {object} params.session
 */
export async function notifyTpvRegisterClosed({ req, dataUserId, actorUserId, session }) {
  try {
    if (!session?._id || session.status !== 'closed') return;

    const businessId = await resolveBusinessIdForTpvSession(req, session);
    if (!businessId) {
      logger.warn?.(
        '[TPV close notify] sin businessId de sesión/PDV — no se emite alerta (evita colgarla en otra empresa)',
      );
      return;
    }

    const business = await findBusinessById(req, businessId).catch(() => null);

    const store = String(session.pointOfSaleName || session.terminalName || 'TPV').trim();
    const worker = String(session.workerName || 'Equipo').trim();
    const diff = Math.round((Number(session.difference) || 0) * 100) / 100;
    const hasDiscrepancy = Math.abs(diff) >= 0.01;
    const counted = Math.round((Number(session.finalCashAmount) || 0) * 100) / 100;
    const leaveForTomorrow = session.nextDayInitialCash != null
      ? Math.round((Number(session.nextDayInitialCash) || 0) * 100) / 100
      : null;
    const needsAddCash = leaveForTomorrow != null && leaveForTomorrow - counted > 0.009;
    const addCash = needsAddCash
      ? Math.round((leaveForTomorrow - counted) * 100) / 100
      : 0;

    // Inicial mañana > contado: hay que meter dinero. Solo CEO (owner).
    if (needsAddCash) {
      await emitGlobalAlert({
        businessId,
        userId: business?.owner_user_id || dataUserId,
        source: 'delivery',
        ruleId: 'delivery_register_next_day_initial_over',
        category: 'delivery_register_next_day_initial_over',
        priority: 'high',
        level: 'warning',
        title: `Inicial mañana > contado · +${addCash.toFixed(2)}€`,
        message: `${worker} cerró ${store} dejando ${leaveForTomorrow.toFixed(2)}€ para mañana con solo ${counted.toFixed(2)}€ contados. Hay que añadir ${addCash.toFixed(2)}€ al cajón.`,
        entityId: session._id,
        entityType: 'tpv_register_session',
        route: DELIVERY_CAJA_ROUTE,
        metadata: {
          finalCashAmount: counted,
          nextDayInitialCash: leaveForTomorrow,
          addCashAmount: addCash,
          pointOfSaleId: session.pointOfSaleId,
          pointOfSaleName: session.pointOfSaleName,
          terminalName: session.terminalName,
          workerName: session.workerName,
          actorUserId,
          closedAt: session.closedAt,
        },
        dedupKey: `tpv-close-initial-over-${session._id}`,
        force: true,
      });
    }

    if (!hasDiscrepancy) {
      const recipients = resolveTpvCloseNotificationRecipients(business, actorUserId);
      const list = recipients.length
        ? recipients
        : [String(business?.owner_user_id || dataUserId || '').trim()].filter(Boolean);
      if (list.length === 0) return;

      await emitPositiveAlert({
        userIds: list,
        businessId,
        category: 'tpv_register_closed_ok',
        source: 'delivery',
        title: 'Caja cerrada correctamente',
        message: `${worker} cerró ${store} sin descuadre.`,
        entityId: session._id,
        entityType: 'tpv_register_session',
        route: DELIVERY_CAJA_ROUTE,
        dedupKey: `tpv-close-ok-${session._id}`,
        metadata: {
          difference: 0,
          pointOfSaleId: session.pointOfSaleId,
          pointOfSaleName: session.pointOfSaleName,
          terminalName: session.terminalName,
          workerName: session.workerName,
          actorUserId,
          closedAt: session.closedAt,
        },
      });
      return;
    }

    await emitGlobalAlert({
      businessId,
      userId: business?.owner_user_id || dataUserId,
      source: 'delivery',
      ruleId: 'delivery_register_closed_discrepancy',
      category: 'delivery_register_closed_discrepancy',
      priority: 'critical',
      level: 'warning',
      title: `Caja cerrada con descuadre · ${formatDiff(diff)}`,
      message: `${worker} cerró ${store}. Diferencia: ${formatDiff(diff)}.`,
      entityId: session._id,
      entityType: 'tpv_register_session',
      route: DELIVERY_CAJA_ROUTE,
      metadata: {
        difference: diff,
        pointOfSaleId: session.pointOfSaleId,
        pointOfSaleName: session.pointOfSaleName,
        terminalName: session.terminalName,
        workerName: session.workerName,
        actorUserId,
        closedAt: session.closedAt,
      },
      dedupKey: `tpv-close-${session._id}`,
      force: true,
    });
  } catch (err) {
    logger.warn?.('[TPV close notify]', err?.message) || console.warn('[TPV close notify]', err?.message);
  }
}
