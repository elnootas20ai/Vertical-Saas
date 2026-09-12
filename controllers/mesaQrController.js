import {
  ensureMesaQrTokensForBusiness,
  rotateMesaQrToken,
  findDiningTableByQrToken,
  buildPublicMesaPayload,
} from '../services/mesaQrService.js';
import { findAccountByUserId, findBusinessById } from '../services/couchdb.js';
import { accountHasRestaurantFeature } from '../shared/billing/restaurantPlanFeatures.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function errorMsg(error) {
  return error instanceof Error ? error.message : 'Error inesperado';
}

async function restaurantQrOrderingAllowed(req, businessId) {
  const business = await findBusinessById(req, businessId).catch(() => null);
  if (!business) return false;
  if (String(business.businessType || '').trim() !== 'restaurant') return true;
  const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
  const account = await findAccountByUserId(req, ownerUserId).catch(() => null);
  return accountHasRestaurantFeature(account, 'table_qr_orders');
}

/** Público: resuelve token opaco → mesa + tienda (sin abrir mesas por URL adivinable). */
export async function getPublicMesaByToken(req, res) {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return badRequest(res, 'Falta token');

    const table = await findDiningTableByQrToken(req, token);
    if (!table) {
      return res.status(404).json({ ok: false, error: 'QR no válido o mesa no encontrada' });
    }
    if (!(await restaurantQrOrderingAllowed(req, table.businessId))) {
      return res.status(404).json({ ok: false, error: 'QR no válido o mesa no encontrada' });
    }

    const mesa = await buildPublicMesaPayload(req, table);
    if (!mesa?.token) {
      return res.status(404).json({ ok: false, error: 'QR no válido o mesa no encontrada' });
    }

    return res.json({ ok: true, mesa });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** Autenticado: genera tokens faltantes para las mesas de la empresa. */
export async function ensureMesaQrTokens(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.body?.businessId || req.query?.businessId || '').trim();
    if (!userId) return badRequest(res, 'Falta userId');
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await restaurantQrOrderingAllowed(req, businessId))) {
      return res.status(403).json({ ok: false, error: 'Los pedidos QR requieren el plan Pro' });
    }

    const result = await ensureMesaQrTokensForBusiness(req, userId, businessId);
    return res.json({
      ok: true,
      created: result.created,
      tables: result.tables,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** Autenticado: regenera el token de una mesa. */
export async function regenerateMesaQrToken(req, res) {
  try {
    const { userId, tableId } = req.params;
    if (!userId || !tableId) return badRequest(res, 'Faltan parámetros');
    const account = await findAccountByUserId(req, userId).catch(() => null);
    if (!accountHasRestaurantFeature(account, 'table_qr_orders')) {
      return res.status(403).json({ ok: false, error: 'Los pedidos QR requieren el plan Pro' });
    }

    const table = await rotateMesaQrToken(req, userId, tableId);
    if (!table) {
      return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });
    }
    return res.json({ ok: true, table });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}
