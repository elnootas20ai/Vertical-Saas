/**
 * Cierre de caja TPV → UNA sola notificación (campana + push):
 * resumen del turno + OK o descuadre, todo junto.
 *
 * businessId SIEMPRE de la sesión / PDV. Nunca account.business_id
 * (en cuentas multi-empresa colgaba el descuadre en la empresa “por defecto”).
 */
import {
  findBusinessById,
  findWorkCenterById,
  getDocument,
  getDeliveryDbName,
} from './couchdb.js';
import { emitCeoDigestForClosedSession } from './ceoDailyDigest.js';
import logger from './logger.js';

function bareId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function isManagerRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    r === 'admin'
    || r === 'administrador'
    || r === 'owner'
    || r === 'gerente'
    || r === 'gerentogrupo'
    || r === 'manager'
    || r === 'gestor'
    || r === 'superadmin'
  );
}

/**
 * Destinatarios legacy (owner + admins/gerentes).
 * El aviso unificado de cierre usa resolveCeoDailyDigestRecipients (owner + admin).
 */
export function resolveTpvCloseNotificationRecipients(business) {
  const recipients = new Set();
  const ownerId = String(business?.owner_user_id || '').trim();
  if (ownerId) recipients.add(ownerId);
  for (const m of business?.members || []) {
    const uid = String(m?.user_id || '').trim();
    if (!uid) continue;
    if (isManagerRole(m.role)) recipients.add(uid);
  }
  return Array.from(recipients);
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
        '[TPV close notify] sin businessId de sesión/PDV — no se emite aviso (evita colgarlo en otra empresa)',
      );
      return;
    }

    const business = await findBusinessById(req, businessId).catch(() => null);

    // Una sola: resumen + OK/descuadre (campana y push).
    await emitCeoDigestForClosedSession({
      business,
      session: { ...session, business_id: businessId, businessId },
    });
  } catch (err) {
    logger.warn?.('[TPV close notify]', err?.message) || console.warn('[TPV close notify]', err?.message);
  }
}
