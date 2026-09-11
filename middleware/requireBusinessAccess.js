import { assertBusinessTeamAccess } from '../services/businessAccess.js';

/**
 * Express middleware: :businessId debe ser accesible por el JWT (miembro/owner).
 * Fail closed. Si no hay :businessId en params, sigue.
 */
export async function requireBusinessAccess(req, res, next) {
  const businessId = req.params?.businessId;
  if (!businessId) return next();
  try {
    const access = await assertBusinessTeamAccess(req, businessId);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        code: access.code || 'FORBIDDEN_BUSINESS',
      });
    }
    req.businessAccess = access;
    return next();
  } catch {
    return res.status(403).json({ ok: false, error: 'No autorizado para esta empresa' });
  }
}

export { assertBusinessTeamAccess };
