import { resolveDataOwnerUserId } from '../services/couchdb.js';

function normalizeUserIdParam(value) {
  const v = String(value || '').trim();
  return v.startsWith('account:') ? v.slice('account:'.length) : v;
}

/**
 * Atar :userId de la URL al JWT (userId). Fail closed.
 * Workers invitados: OK si operan sobre el owner (callerUserId del router
 * delivery, o resolveDataOwnerUserId).
 *
 * @returns {Promise<boolean>} true si puede continuar; si false ya envió 403.
 */
export async function assertUserScope(req, res, userId) {
  const authId = String(
    req.authUser?.userId || req.authUser?.user_id || req.authUser?.id || '',
  ).trim();
  const paramId = String(userId || '').trim();
  if (!authId || !paramId) {
    res.status(403).json({ ok: false, error: 'Acceso denegado' });
    return false;
  }

  const authNormalized = normalizeUserIdParam(authId);
  const paramNormalized = normalizeUserIdParam(paramId);
  if (authNormalized === paramNormalized) return true;

  // deliveryRouter.param: worker → callerUserId = JWT; :userId ya es el owner.
  const callerId = String(req.callerUserId || '').trim();
  if (callerId && authNormalized === normalizeUserIdParam(callerId)) return true;

  try {
    const authResolution = await resolveDataOwnerUserId(req, authId);
    if (
      authResolution.isInvited
      && authResolution.ownerUserId
      && normalizeUserIdParam(authResolution.ownerUserId) === paramNormalized
    ) {
      return true;
    }
  } catch {
    /* fail closed abajo */
  }

  res.status(403).json({ ok: false, error: 'Acceso denegado' });
  return false;
}
