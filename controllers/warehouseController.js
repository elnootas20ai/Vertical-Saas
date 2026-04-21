import {
  getCatalogDbName,
  buildWarehouseDocument,
  sanitizeWarehouse,
  listWarehousesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureWarehouseOwner(req, userId, warehouseId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, warehouseId);
  if (!doc || doc.type !== 'warehouse' || doc.user_id !== userId) return null;
  return doc;
}

export async function listWarehouses(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const warehouses = await listWarehousesByUser(req, userId);
    return res.json({ ok: true, warehouses: warehouses.map(sanitizeWarehouse) });
  } catch (error) {
    logger.error({ tag: 'WAREHOUSE', err: error?.message }, 'Error listando almacenes');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar almacenes' });
  }
}

export async function createWarehouse(req, res) {
  try {
    const { userId } = req.params;
    const { warehouse } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!warehouse || typeof warehouse !== 'object') return badRequest(res, 'Falta el objeto warehouse en el body');
    if (!warehouse.name?.trim()) return badRequest(res, 'El nombre del almacén es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const existing = await listWarehousesByUser(req, userId);
    const isFirst = existing.length === 0;

    const doc = buildWarehouseDocument(userId, { ...warehouse, isDefault: isFirst ? true : (warehouse.isDefault || false) });

    if (doc.isDefault && !isFirst) {
      for (const wh of existing) {
        if (wh.isDefault) {
          await putDocument(req, db, wh._id, { ...wh, isDefault: false, updatedAt: new Date().toISOString() });
        }
      }
    }

    const result = await putDocument(req, db, doc._id, doc);
    const saved = { ...doc, _rev: result.rev };

    logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName || '', targetUserId: userId,
      type: 'warehouse', action: `Creó almacén "${saved.name}"`,
      entityId: saved._id, entityLabel: saved.name,
    }).catch(() => null);

    return res.status(201).json({ ok: true, warehouse: sanitizeWarehouse(saved) });
  } catch (error) {
    logger.error({ tag: 'WAREHOUSE', err: error?.message }, 'Error creando almacén');
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear almacén' });
  }
}

export async function updateWarehouse(req, res) {
  try {
    const { userId, warehouseId } = req.params;
    const { warehouse } = req.body || {};
    if (!userId || !warehouseId) return badRequest(res, 'Faltan userId o warehouseId');
    if (!warehouse || typeof warehouse !== 'object') return badRequest(res, 'Falta el objeto warehouse en el body');

    const existing = await ensureWarehouseOwner(req, userId, warehouseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Almacén no encontrado' });

    const db = getCatalogDbName();

    if (warehouse.isDefault && !existing.isDefault) {
      const all = await listWarehousesByUser(req, userId);
      for (const wh of all) {
        if (wh.isDefault && wh._id !== warehouseId) {
          await putDocument(req, db, wh._id, { ...wh, isDefault: false, updatedAt: new Date().toISOString() });
        }
      }
    }

    const doc = buildWarehouseDocument(userId, warehouse, existing);
    const result = await putDocument(req, db, doc._id, doc);
    const saved = { ...doc, _rev: result.rev };

    return res.json({ ok: true, warehouse: sanitizeWarehouse(saved) });
  } catch (error) {
    logger.error({ tag: 'WAREHOUSE', err: error?.message }, 'Error actualizando almacén');
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar almacén' });
  }
}

export async function removeWarehouse(req, res) {
  try {
    const { userId, warehouseId } = req.params;
    if (!userId || !warehouseId) return badRequest(res, 'Faltan userId o warehouseId');

    const existing = await ensureWarehouseOwner(req, userId, warehouseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Almacén no encontrado' });

    if (existing.isDefault) {
      return badRequest(res, 'No se puede eliminar el almacén por defecto. Asigna otro como principal primero.');
    }

    const db = getCatalogDbName();
    await softDeleteDocument(req, db, existing._id);

    return res.json({ ok: true });
  } catch (error) {
    logger.error({ tag: 'WAREHOUSE', err: error?.message }, 'Error eliminando almacén');
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar almacén' });
  }
}
