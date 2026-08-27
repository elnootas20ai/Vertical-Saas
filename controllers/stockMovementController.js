import {
  findAccountByUserId,
} from '../services/couchdb.js';
import {
  recordMovement,
  listMovementsByUser,
  getMovementsSummary,
} from '../services/stockMovementService.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function listMovements(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { catalogItemId, warehouseId, movementType, dateFrom, dateTo, limit } = req.query;
    const movements = await listMovementsByUser(req, userId, {
      catalogItemId, warehouseId, movementType, dateFrom, dateTo, limit,
    });

    return res.json({ ok: true, movements, total: movements.length });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error listando movimientos');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar movimientos' });
  }
}

export async function getMovementsByItem(req, res) {
  try {
    const { userId, catalogItemId } = req.params;
    if (!userId || !catalogItemId) return badRequest(res, 'Faltan userId o catalogItemId');

    const limit = req.query?.limit;
    const movements = await listMovementsByUser(req, userId, { catalogItemId, limit });
    return res.json({ ok: true, movements, total: movements.length });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error listando movimientos por artículo');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar movimientos' });
  }
}

export async function getMovementsByWarehouse(req, res) {
  try {
    const { userId, warehouseId } = req.params;
    if (!userId || !warehouseId) return badRequest(res, 'Faltan userId o warehouseId');

    const limit = req.query?.limit;
    const movements = await listMovementsByUser(req, userId, { warehouseId, limit });
    return res.json({ ok: true, movements, total: movements.length });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error listando movimientos por almacén');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar movimientos' });
  }
}

export async function getSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { dateFrom, dateTo } = req.query;
    const summary = await getMovementsSummary(req, userId, { dateFrom, dateTo });
    return res.json({ ok: true, summary });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error obteniendo resumen');
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular resumen' });
  }
}

export async function createAdjustment(req, res) {
  try {
    const { userId } = req.params;
    const { catalogItemId, quantity, type, warehouseId, notes } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!catalogItemId) return badRequest(res, 'Falta catalogItemId');
    if (!quantity || quantity <= 0) return badRequest(res, 'La cantidad debe ser mayor que 0');
    if (!notes?.trim()) return badRequest(res, 'Las notas son obligatorias para ajustes');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const movementType = type === 'out' ? 'adjustment_out' : 'adjustment_in';
    const movement = await recordMovement(req, userId, {
      catalogItemId,
      movementType,
      quantity,
      warehouseId: warehouseId || '',
      notes,
      performedBy: account.fullName || userId,
    });

    return res.status(201).json({ ok: true, movement });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error creando ajuste');
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar ajuste' });
  }
}

export async function createTransfer(req, res) {
  try {
    const { userId } = req.params;
    const { catalogItemId, quantity, warehouseFromId, warehouseToId, notes } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!catalogItemId) return badRequest(res, 'Falta catalogItemId');
    if (!quantity || quantity <= 0) return badRequest(res, 'La cantidad debe ser mayor que 0');
    if (!warehouseFromId || !warehouseToId) return badRequest(res, 'Faltan almacenes de origen y destino');
    if (warehouseFromId === warehouseToId) return badRequest(res, 'Los almacenes de origen y destino deben ser diferentes');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const movement = await recordMovement(req, userId, {
      catalogItemId,
      movementType: 'transfer',
      quantity,
      warehouseId: warehouseFromId,
      warehouseToId,
      notes: notes || '',
      performedBy: account.fullName || userId,
    });

    return res.status(201).json({ ok: true, movement });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error creando transferencia');
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar transferencia' });
  }
}

export async function createInternalConsumption(req, res) {
  try {
    const { userId } = req.params;
    const { catalogItemId, quantity, warehouseId, reason, notes } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!catalogItemId) return badRequest(res, 'Falta catalogItemId');
    if (!quantity || quantity <= 0) return badRequest(res, 'La cantidad debe ser mayor que 0');

    const validReasons = ['internal_use', 'sample', 'breakage', 'expiry', 'event', 'other'];
    if (!validReasons.includes(reason)) return badRequest(res, `Motivo inválido. Valores permitidos: ${validReasons.join(', ')}`);

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const movement = await recordMovement(req, userId, {
      catalogItemId,
      movementType: 'internal_consumption',
      quantity,
      warehouseId: warehouseId || '',
      notes: `[${reason}] ${notes || ''}`.trim(),
      performedBy: account.fullName || userId,
    });

    return res.status(201).json({ ok: true, movement });
  } catch (error) {
    logger.error({ tag: 'STOCK_MOVEMENT', err: error?.message }, 'Error registrando consumo interno');
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar consumo interno' });
  }
}
