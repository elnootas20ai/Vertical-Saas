/**
 * Avisos al CEO/gerentes al cerrar caja TPV (OK o con descuadre) → in-app + push.
 */
import {
  findBusinessById,
  findAccountByUserId,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import logger from './logger.js';

const DELIVERY_CAJA_ROUTE = '/saas/vertical/delivery/caja';

function isManagerRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'owner' || r === 'gerente' || r === 'manager' || r === 'encargado';
}

/**
 * Destinatarios: dueño + admins/gerentes (no el que cierra, si es distinto).
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
  // El que cierra también puede ser CEO; no lo excluimos: debe enterarse en otros dispositivos.
  // Si solo hay un destinatario y es el closer, igual notificamos (su iPhone).
  if (closer && recipients.size > 1) {
    // keep closer if owner; still notify everyone including closer when they are manager
  }
  return Array.from(recipients);
}

function formatDiff(diff) {
  const n = Number(diff) || 0;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}€`;
}

/**
 * @param {object} params
 * @param {object} params.req
 * @param {string} params.dataUserId — dueño de datos (account)
 * @param {string} params.actorUserId — quien cerró
 * @param {object} params.session — sesión TPV ya cerrada
 */
export async function notifyTpvRegisterClosed({ req, dataUserId, actorUserId, session }) {
  try {
    if (!session?._id || session.status !== 'closed') return;

    const account = await findAccountByUserId(req, dataUserId);
    const businessId = String(
      session.business_id
      || session.businessId
      || account?.business_id
      || account?.businessId
      || '',
    ).trim();

    let business = null;
    if (businessId) {
      business = await findBusinessById(req, businessId).catch(() => null);
    }

    const store = String(session.pointOfSaleName || session.terminalName || 'TPV').trim();
    const worker = String(session.workerName || 'Equipo').trim();
    const diff = Math.round((Number(session.difference) || 0) * 100) / 100;
    const hasDiscrepancy = Math.abs(diff) >= 0.01;
    const ruleId = hasDiscrepancy
      ? 'delivery_register_closed_discrepancy'
      : 'delivery_register_closed_ok';
    const title = hasDiscrepancy
      ? `Caja cerrada con descuadre · ${formatDiff(diff)}`
      : 'Caja cerrada correctamente';
    const message = hasDiscrepancy
      ? `${worker} cerró ${store}. Diferencia: ${formatDiff(diff)}.`
      : `${worker} cerró ${store} sin descuadre.`;

    // emitGlobalAlert resuelve recipients por business; fuerza push a dueño.
    await emitGlobalAlert({
      businessId: businessId || undefined,
      userId: business?.owner_user_id || dataUserId,
      source: 'delivery',
      ruleId,
      category: ruleId,
      priority: hasDiscrepancy ? 'critical' : 'medium',
      level: hasDiscrepancy ? 'warning' : 'info',
      title,
      message,
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
