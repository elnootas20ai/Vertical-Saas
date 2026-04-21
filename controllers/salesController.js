import {
  getSalesDbName,
  buildSaleDocument,
  sanitizeSale,
  listSalesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureSaleOwner(req, userId, saleId) {
  const db = getSalesDbName();
  await ensureDatabase(req, db);
  const sale = await getDocument(req, db, saleId);
  if (!sale || sale.type !== 'sale' || sale.user_id !== userId) {
    return null;
  }
  return sale;
}

export async function listSales(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listSalesByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeSale), req.query);
    return res.json({ ok: true, sales: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar ventas' });
  }
}

export async function createSale(req, res) {
  try {
    const { userId } = req.params;
    const { sale } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!sale || typeof sale !== 'object') return badRequest(res, 'Falta el objeto sale en el body');
    if (!sale.vehicleId) return badRequest(res, 'Falta vehicleId');
    if (!sale.clientId) return badRequest(res, 'Falta clientId');
    if (!sale.totalPrice && sale.totalPrice !== 0) return badRequest(res, 'Falta totalPrice');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getSalesDbName();
    await ensureDatabase(req, db);
    const doc = buildSaleDocument(userId, sale);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'sale',
      action: `Creó venta para ${doc.clientName} — ${doc.vehicleName}`,
      entityId: doc._id,
      entityLabel: `${doc.vehicleName} → ${doc.clientName}`.trim(),
      metadata: { stage: doc.stage, totalPrice: doc.totalPrice },
    });

    return res.status(201).json({ ok: true, sale: sanitizeSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear venta' });
  }
}

export async function updateSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    const { sale } = req.body || {};

    if (!sale || typeof sale !== 'object') return badRequest(res, 'Faltan datos de la venta');

    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getSalesDbName();
    const doc = buildSaleDocument(userId, { ...existing, ...sale }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'sale',
      action: `Actualizó venta ${doc.vehicleName} → fase ${doc.stage}`,
      entityId: doc._id,
      entityLabel: `${doc.vehicleName} → ${doc.clientName}`.trim(),
      metadata: { stage: doc.stage },
    });

    return res.json({ ok: true, sale: sanitizeSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar venta' });
  }
}

export async function removeSale(req, res) {
  try {
    const { userId, saleId } = req.params;

    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getSalesDbName();
    await softDeleteDocument(req, db, saleId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'sale',
      action: `Eliminó venta ${existing.vehicleName} → ${existing.clientName}`,
      entityId: existing._id,
      entityLabel: `${existing.vehicleName} → ${existing.clientName}`.trim(),
      metadata: {},
    });

    return res.json({ ok: true, id: saleId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar venta' });
  }
}
