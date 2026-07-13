import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import { buildAdminClientUsage } from '../services/adminClientUsage.js';

function requireSuperAdmin(req, res) {
  const email = String(req.authUser?.email || '').trim();
  if (!isVertialSuperAdminEmail(email)) {
    res.status(403).json({ ok: false, error: 'Solo superadmin Vertial' });
    return false;
  }
  return true;
}

export async function getClientUsage(req, res) {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'Falta userId' });
    }

    const usage = await buildAdminClientUsage(req, userId);
    if (!usage) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    return res.json({ ok: true, usage });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener uso del cliente',
    });
  }
}
