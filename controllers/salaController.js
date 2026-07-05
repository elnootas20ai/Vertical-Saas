import {
  getSalaDbName,
  buildDiningTableDocument,
  sanitizeDiningTable,
  listDiningTablesByUser,
  buildDiningWallDocument,
  sanitizeDiningWall,
  listDiningWallsByUser,
  buildFloorConfigDocument,
  sanitizeFloorConfig,
  getFloorConfigByUser,
  buildDiningOrderDocument,
  sanitizeDiningOrder,
  listDiningOrdersByUser,
  getDiningOrderById,
  addComandaToOrder,
  updateComandaInOrder,
  shouldAutoTransitionTable,
  listDiningTableTicketStatsByUser,
  sanitizeDiningTableTicketStat,
} from '../services/salaService.js';
import {
  ensureDatabase,
  getDocument,
  putDocument,
  bulkPutDocuments,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getDeliveryDbName,
  getAllDocuments,
} from '../services/couchdb.js';
import { broadcastToBusiness, broadcastToUser } from '../services/sseService.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureDiningTableOwner(req, userId, tableId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, tableId);
  if (!doc || doc.type !== 'dining_table' || doc.user_id !== userId) return null;
  return doc;
}

async function ensureDiningOrderOwner(req, userId, orderId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, orderId);
  if (!doc || doc.type !== 'dining_order' || doc.user_id !== userId) return null;
  return doc;
}

// ─── DINING TABLES ───────────────────────────────────────────────────────────

export async function listTables(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const tables = await listDiningTablesByUser(req, userId);
    return res.json({ ok: true, tables: tables.map(sanitizeDiningTable) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar mesas' });
  }
}

export async function createTable(req, res) {
  try {
    const { userId } = req.params;
    const { table } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!table || typeof table !== 'object') return badRequest(res, 'Falta el objeto table en el body');
    if (!table.number && table.number !== 0) return badRequest(res, 'Falta el número de mesa');

    const db = getSalaDbName();
    await ensureDatabase(req, db);
    const doc = buildDiningTableDocument(userId, table);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningTable({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:table_created', sanitized);

    return res.status(201).json({ ok: true, table: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear mesa' });
  }
}

export async function updateTable(req, res) {
  try {
    const { userId, tableId } = req.params;
    const { table } = req.body || {};
    if (!table || typeof table !== 'object') return badRequest(res, 'Faltan datos de la mesa');

    const existing = await ensureDiningTableOwner(req, userId, tableId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });

    const db = getSalaDbName();
    const doc = buildDiningTableDocument(userId, table, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningTable({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:table_updated', sanitized);

    return res.json({ ok: true, table: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar mesa' });
  }
}

export async function bulkUpdateTables(req, res) {
  try {
    const { userId } = req.params;
    const { tables } = req.body || {};
    if (!Array.isArray(tables)) return badRequest(res, 'Se espera un array de mesas');

    const db = getSalaDbName();
    await ensureDatabase(req, db);

    const docs = [];
    for (const t of tables) {
      if (!t._id) continue;
      const existing = await getDocument(req, db, t._id);
      if (!existing || existing.type !== 'dining_table' || existing.user_id !== userId) continue;
      docs.push(buildDiningTableDocument(userId, t, existing));
    }

    if (docs.length > 0) {
      await bulkPutDocuments(req, db, docs);
    }

    broadcastToUser(userId, 'sala:tables_bulk_updated', { count: docs.length });

    return res.json({ ok: true, updated: docs.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar mesas' });
  }
}

export async function bulkCreateTables(req, res) {
  try {
    const { userId } = req.params;
    const { tables } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(tables) || tables.length === 0) return badRequest(res, 'Se espera un array de mesas');

    const db = getSalaDbName();
    await ensureDatabase(req, db);

    const docs = tables.map((table) => buildDiningTableDocument(userId, table));
    await bulkPutDocuments(req, db, docs);
    const sanitized = docs.map((doc) => sanitizeDiningTable(doc));

    broadcastToUser(userId, 'sala:tables_bulk_created', { count: sanitized.length });

    return res.status(201).json({ ok: true, created: sanitized.length, tables: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear mesas' });
  }
}

export async function removeTable(req, res) {
  try {
    const { userId, tableId } = req.params;
    const existing = await ensureDiningTableOwner(req, userId, tableId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });

    const db = getSalaDbName();
    await softDeleteDocument(req, db, tableId);

    broadcastToUser(userId, 'sala:table_removed', { tableId });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar mesa' });
  }
}

export async function changeTableStatus(req, res) {
  try {
    const { userId, tableId } = req.params;
    const { status, currentGuests, occupiedBy } = req.body || {};
    if (!status) return badRequest(res, 'Falta el status');

    const existing = await ensureDiningTableOwner(req, userId, tableId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });

    const now = new Date().toISOString();
    const updates = { status };

    if (status === 'occupied' && existing.status !== 'occupied') {
      updates.occupiedAt = now;
      updates.occupiedBy = occupiedBy || '';
      if (currentGuests) updates.currentGuests = currentGuests;
    }

    if (status === 'available') {
      updates.occupiedAt = '';
      updates.occupiedBy = '';
      updates.currentGuests = 0;
    }

    const db = getSalaDbName();
    const doc = buildDiningTableDocument(userId, updates, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningTable({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:table_status_changed', sanitized);

    return res.json({ ok: true, table: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cambiar estado de mesa' });
  }
}

// ─── DINING WALLS ────────────────────────────────────────────────────────────

export async function listWalls(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const walls = await listDiningWallsByUser(req, userId);
    return res.json({ ok: true, walls: walls.map(sanitizeDiningWall) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar muros' });
  }
}

export async function createWall(req, res) {
  try {
    const { userId } = req.params;
    const { wall } = req.body || {};
    if (!wall || typeof wall !== 'object') return badRequest(res, 'Falta el objeto wall');

    const db = getSalaDbName();
    await ensureDatabase(req, db);
    const doc = buildDiningWallDocument(userId, wall);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningWall({ ...doc, _rev: saved.rev });

    return res.status(201).json({ ok: true, wall: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear muro' });
  }
}

export async function removeWall(req, res) {
  try {
    const { userId, wallId } = req.params;
    const db = getSalaDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, wallId);
    if (!doc || doc.type !== 'dining_wall' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Muro no encontrado' });
    }
    await softDeleteDocument(req, db, wallId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar muro' });
  }
}

// ─── FLOOR CONFIG ────────────────────────────────────────────────────────────

export async function getFloorConfig(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const config = await getFloorConfigByUser(req, userId);
    if (!config) {
      return res.json({ ok: true, config: null });
    }
    return res.json({ ok: true, config: sanitizeFloorConfig(config) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar configuración de plano' });
  }
}

export async function saveFloorConfig(req, res) {
  try {
    const { userId } = req.params;
    const { config } = req.body || {};
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta el objeto config');

    const db = getSalaDbName();
    await ensureDatabase(req, db);
    const existing = await getFloorConfigByUser(req, userId);
    const doc = buildFloorConfigDocument(userId, config, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeFloorConfig({ ...doc, _rev: saved.rev });

    return res.json({ ok: true, config: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al guardar configuración de plano' });
  }
}

// ─── DINING ORDERS ───────────────────────────────────────────────────────────

export async function listOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const { status, tableId, dateFrom, dateTo } = req.query || {};
    const filters = {};
    if (status) filters.status = status.split(',');
    if (tableId) filters.tableId = tableId;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const orders = await listDiningOrdersByUser(req, userId, filters);
    return res.json({ ok: true, orders: orders.map(sanitizeDiningOrder) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar pedidos de sala' });
  }
}

export async function getOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const order = await getDiningOrderById(req, userId, orderId);
    if (!order) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    return res.json({ ok: true, order: sanitizeDiningOrder(order) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar pedido' });
  }
}

export async function createOrder(req, res) {
  try {
    const { userId } = req.params;
    const { order } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order');
    if (!order.tableId) return badRequest(res, 'Falta tableId');

    const db = getSalaDbName();
    await ensureDatabase(req, db);

    const doc = buildDiningOrderDocument(userId, { ...order, status: 'open' });
    const saved = await putDocument(req, db, doc._id, doc);

    // Auto-transition table to occupied
    const table = await getDocument(req, db, order.tableId);
    if (table && table.type === 'dining_table' && table.user_id === userId) {
      const now = new Date().toISOString();
      const updatedTable = buildDiningTableDocument(userId, {
        status: 'occupied',
        occupiedAt: now,
        occupiedBy: order.createdBy || '',
        currentGuests: order.guests || table.currentGuests || 1,
      }, table);
      await putDocument(req, db, updatedTable._id, updatedTable);
      broadcastToUser(userId, 'sala:table_status_changed', sanitizeDiningTable({ ...updatedTable, _rev: updatedTable._rev }));
    }

    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
    broadcastToUser(userId, 'sala:order_created', sanitized);

    return res.status(201).json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear pedido de sala' });
  }
}

export async function updateOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { order } = req.body || {};
    if (!order || typeof order !== 'object') return badRequest(res, 'Faltan datos del pedido');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, order, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:order_updated', sanitized);

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar pedido' });
  }
}

export async function addComanda(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { comanda } = req.body || {};
    if (!comanda || typeof comanda !== 'object') return badRequest(res, 'Falta el objeto comanda');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status === 'closed' || existing.status === 'cancelled') {
      return badRequest(res, 'No se puede añadir comanda a un pedido cerrado o cancelado');
    }

    const result = addComandaToOrder(existing, comanda);
    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, {
      comandas: result.comandas,
      subtotal: result.subtotal,
      discount: result.discount,
      tax: result.tax,
      total: result.total,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:order_updated', sanitized);

    return res.status(201).json({ ok: true, order: sanitized, comanda: result.comanda });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al añadir comanda' });
  }
}

export async function updateComanda(req, res) {
  try {
    const { userId, orderId, comandaId } = req.params;
    const { comanda } = req.body || {};
    if (!comanda || typeof comanda !== 'object') return badRequest(res, 'Faltan datos de la comanda');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const found = (existing.comandas || []).find((c) => c.id === comandaId);
    if (!found) return res.status(404).json({ ok: false, error: 'Comanda no encontrada' });

    const result = updateComandaInOrder(existing, comandaId, comanda);
    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, {
      comandas: result.comandas,
      subtotal: result.subtotal,
      discount: result.discount,
      tax: result.tax,
      total: result.total,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:order_updated', sanitized);

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar comanda' });
  }
}

export async function sendComandaToKitchen(req, res) {
  try {
    const { userId, orderId, comandaId } = req.params;
    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const comanda = (existing.comandas || []).find((c) => c.id === comandaId);
    if (!comanda) return res.status(404).json({ ok: false, error: 'Comanda no encontrada' });
    if (comanda.status !== 'draft') return badRequest(res, 'Solo se pueden enviar comandas en borrador');

    const now = new Date().toISOString();
    const result = updateComandaInOrder(existing, comandaId, {
      status: 'sent_to_kitchen',
      sentToKitchenAt: now,
      items: comanda.items.map((i) => ({ ...i, status: i.status === 'pending' ? 'pending' : i.status })),
    });

    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, { comandas: result.comandas }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:comanda_sent', {
      orderId: doc._id,
      comandaId,
      tableNumber: doc.tableNumber,
      tableName: doc.tableName,
      zone: doc.zone,
      items: comanda.items,
    });

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar comanda a cocina' });
  }
}

export async function cancelComanda(req, res) {
  try {
    const { userId, orderId, comandaId } = req.params;
    const { reason } = req.body || {};

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const comanda = (existing.comandas || []).find((c) => c.id === comandaId);
    if (!comanda) return res.status(404).json({ ok: false, error: 'Comanda no encontrada' });
    if (comanda.status === 'cancelled') return badRequest(res, 'La comanda ya está cancelada');
    if (comanda.status !== 'draft' && !reason) return badRequest(res, 'Se requiere motivo para cancelar una comanda enviada');

    const result = updateComandaInOrder(existing, comandaId, {
      status: 'cancelled',
      items: comanda.items.map((i) => ({
        ...i,
        status: 'cancelled',
        cancelledReason: reason || '',
      })),
    });

    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, {
      comandas: result.comandas,
      subtotal: result.subtotal,
      discount: result.discount,
      tax: result.tax,
      total: result.total,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:comanda_cancelled', { orderId: doc._id, comandaId, reason: reason || '' });

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar comanda' });
  }
}

export async function payOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { payment } = req.body || {};
    if (!payment || typeof payment !== 'object') return badRequest(res, 'Falta el objeto payment');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status === 'closed' || existing.status === 'cancelled') {
      return badRequest(res, 'No se puede pagar un pedido cerrado o cancelado');
    }

    const now = new Date().toISOString();
    const payments = [...(existing.payments || []), { ...payment, paidAt: now }];
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const isPaid = totalPaid >= existing.total;

    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, {
      payments,
      status: isPaid ? 'paid' : existing.status,
      paidAt: isPaid ? now : existing.paidAt,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:order_updated', sanitized);

    return res.json({ ok: true, order: sanitized, fullyPaid: isPaid });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar pago' });
  }
}

export async function closeOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { force, reason } = req.body || {};

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const totalPaid = (existing.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const hasPendingComandas = (existing.comandas || []).some((c) =>
      ['sent_to_kitchen', 'in_preparation'].includes(c.status));

    if (!force) {
      if (totalPaid < existing.total) {
        return badRequest(res, `Pago pendiente: faltan ${(existing.total - totalPaid).toFixed(2)}€`);
      }
      if (hasPendingComandas) {
        return badRequest(res, 'Hay comandas pendientes en cocina');
      }
    }

    const now = new Date().toISOString();
    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, {
      status: 'closed',
      closedAt: now,
      notes: force && reason ? `${existing.notes ? existing.notes + ' | ' : ''}Cierre forzado: ${reason}` : existing.notes,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    // Free the table
    if (existing.tableId) {
      const table = await getDocument(req, db, existing.tableId);
      if (table && table.type === 'dining_table' && table.user_id === userId) {
        const updatedTable = buildDiningTableDocument(userId, {
          status: 'available',
          occupiedAt: '',
          occupiedBy: '',
          currentGuests: 0,
        }, table);
        await putDocument(req, db, updatedTable._id, updatedTable);
        broadcastToUser(userId, 'sala:table_status_changed', sanitizeDiningTable(updatedTable));
      }
    }

    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
    broadcastToUser(userId, 'sala:order_closed', sanitized);

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cerrar pedido' });
  }
}

export async function cancelOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { reason } = req.body || {};
    if (!reason) return badRequest(res, 'Se requiere motivo de cancelación');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status === 'closed') return badRequest(res, 'No se puede cancelar un pedido cerrado');

    const now = new Date().toISOString();
    const db = getSalaDbName();

    const cancelledComandas = (existing.comandas || []).map((c) => ({
      ...c,
      status: c.status === 'cancelled' ? 'cancelled' : 'cancelled',
      items: c.items.map((i) => ({ ...i, status: 'cancelled', cancelledReason: reason })),
    }));

    const doc = buildDiningOrderDocument(userId, {
      status: 'cancelled',
      comandas: cancelledComandas,
      notes: `${existing.notes ? existing.notes + ' | ' : ''}Cancelado: ${reason}`,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    // Free the table
    if (existing.tableId) {
      const table = await getDocument(req, db, existing.tableId);
      if (table && table.type === 'dining_table' && table.user_id === userId) {
        const updatedTable = buildDiningTableDocument(userId, {
          status: 'available',
          occupiedAt: '',
          occupiedBy: '',
          currentGuests: 0,
        }, table);
        await putDocument(req, db, updatedTable._id, updatedTable);
        broadcastToUser(userId, 'sala:table_status_changed', sanitizeDiningTable(updatedTable));
      }
    }

    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
    broadcastToUser(userId, 'sala:order_cancelled', sanitized);

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar pedido' });
  }
}

// ─── SPLIT & MERGE ───────────────────────────────────────────────────────────

export async function splitOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { mode, parts, assignments } = req.body || {};
    if (!mode) return badRequest(res, 'Falta el modo de división');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const db = getSalaDbName();
    let splitCount = 0;

    if (mode === 'equal') {
      splitCount = Number(parts || 2);
      if (splitCount < 2) return badRequest(res, 'Mínimo 2 partes');
      const perPart = Math.round(existing.total / splitCount * 100) / 100;
      const remainder = Math.round((existing.total - perPart * splitCount) * 100) / 100;

      const doc = buildDiningOrderDocument(userId, {
        splitMode: 'equal',
        splitCount,
      }, existing);
      const saved = await putDocument(req, db, doc._id, doc);
      const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
      return res.json({ ok: true, order: sanitized, splitAmounts: Array.from({ length: splitCount }, (_, i) => i === 0 ? perPart + remainder : perPart) });
    }

    if (mode === 'by_item') {
      if (!assignments || typeof assignments !== 'object') return badRequest(res, 'Faltan asignaciones por ítem');
      const doc = buildDiningOrderDocument(userId, {
        splitMode: 'by_item',
        splitCount: Object.keys(assignments).length,
      }, existing);
      const saved = await putDocument(req, db, doc._id, doc);
      const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
      return res.json({ ok: true, order: sanitized });
    }

    if (mode === 'custom') {
      if (!Array.isArray(parts)) return badRequest(res, 'Se esperan importes personalizados');
      const sum = parts.reduce((s, p) => s + Number(p || 0), 0);
      if (Math.abs(sum - existing.total) > 0.02) {
        return badRequest(res, `La suma (${sum.toFixed(2)}€) no coincide con el total (${existing.total.toFixed(2)}€)`);
      }
      const doc = buildDiningOrderDocument(userId, {
        splitMode: 'custom',
        splitCount: parts.length,
      }, existing);
      const saved = await putDocument(req, db, doc._id, doc);
      const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
      return res.json({ ok: true, order: sanitized, splitAmounts: parts });
    }

    return badRequest(res, 'Modo de división no válido (equal, by_item, custom)');
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al dividir cuenta' });
  }
}

export async function mergeOrders(req, res) {
  try {
    const { userId } = req.params;
    const { sourceOrderIds, targetOrderId } = req.body || {};
    if (!targetOrderId) return badRequest(res, 'Falta targetOrderId');
    if (!Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) return badRequest(res, 'Faltan sourceOrderIds');

    const db = getSalaDbName();
    await ensureDatabase(req, db);

    const target = await getDocument(req, db, targetOrderId);
    if (!target || target.type !== 'dining_order' || target.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido destino no encontrado' });
    }

    const mergedComandas = [...(target.comandas || [])];
    const tablesToFree = [];

    for (const sourceId of sourceOrderIds) {
      if (sourceId === targetOrderId) continue;
      const source = await getDocument(req, db, sourceId);
      if (!source || source.type !== 'dining_order' || source.user_id !== userId) continue;
      if (!['open', 'served'].includes(source.status)) continue;

      mergedComandas.push(...(source.comandas || []));

      // Close source order
      const closedSource = buildDiningOrderDocument(userId, {
        status: 'cancelled',
        notes: `${source.notes ? source.notes + ' | ' : ''}Unido al pedido de mesa #${target.tableNumber}`,
      }, source);
      await putDocument(req, db, closedSource._id, closedSource);

      if (source.tableId && source.tableId !== target.tableId) {
        tablesToFree.push(source.tableId);
      }
    }

    // Renumber comandas
    mergedComandas.forEach((c, i) => { c.orderNumber = i + 1; });

    const doc = buildDiningOrderDocument(userId, {
      comandas: mergedComandas,
      guests: (target.guests || 0) + sourceOrderIds.length,
    }, target);
    const saved = await putDocument(req, db, doc._id, doc);

    // Free source tables
    for (const tableId of tablesToFree) {
      const table = await getDocument(req, db, tableId);
      if (table && table.type === 'dining_table' && table.user_id === userId) {
        const freed = buildDiningTableDocument(userId, {
          status: 'available', occupiedAt: '', occupiedBy: '', currentGuests: 0,
        }, table);
        await putDocument(req, db, freed._id, freed);
        broadcastToUser(userId, 'sala:table_status_changed', sanitizeDiningTable(freed));
      }
    }

    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });
    broadcastToUser(userId, 'sala:order_updated', sanitized);

    return res.json({ ok: true, order: sanitized, freedTables: tablesToFree.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al unir pedidos' });
  }
}

// ─── KITCHEN INTEGRATION (comanda status from kitchen) ───────────────────────

export async function updateComandaStatus(req, res) {
  try {
    const { userId, orderId, comandaId } = req.params;
    const { status } = req.body || {};
    if (!status) return badRequest(res, 'Falta el status');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const comanda = (existing.comandas || []).find((c) => c.id === comandaId);
    if (!comanda) return res.status(404).json({ ok: false, error: 'Comanda no encontrada' });

    const now = new Date().toISOString();
    const updates = { status };
    if (status === 'ready') updates.readyAt = now;
    if (status === 'served') updates.servedAt = now;
    if (status === 'in_preparation') {
      updates.items = comanda.items.map((i) => ({
        ...i,
        status: i.status === 'pending' ? 'in_preparation' : i.status,
      }));
    }
    if (status === 'ready') {
      updates.items = comanda.items.map((i) => ({
        ...i,
        status: ['pending', 'in_preparation'].includes(i.status) ? 'ready' : i.status,
      }));
    }
    if (status === 'served') {
      updates.items = comanda.items.map((i) => ({
        ...i,
        status: ['pending', 'in_preparation', 'ready'].includes(i.status) ? 'served' : i.status,
      }));
    }

    const result = updateComandaInOrder(existing, comandaId, updates);
    const db = getSalaDbName();

    const orderUpdates = { comandas: result.comandas };
    const updatedOrder = { ...existing, comandas: result.comandas };
    const autoStatus = shouldAutoTransitionTable(updatedOrder);
    if (autoStatus === 'served' && existing.status === 'open') {
      orderUpdates.status = 'served';
      orderUpdates.servedAt = now;
    } else if (autoStatus === 'pending_payment' && ['open', 'served'].includes(existing.status)) {
      orderUpdates.status = 'pending_payment';
    }

    const doc = buildDiningOrderDocument(userId, orderUpdates, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    broadcastToUser(userId, 'sala:comanda_status_changed', {
      orderId: doc._id,
      comandaId,
      status,
      tableNumber: doc.tableNumber,
    });

    // Auto-transition table status
    if (autoStatus && existing.tableId) {
      const table = await getDocument(req, db, existing.tableId);
      if (table && table.type === 'dining_table' && table.user_id === userId) {
        const newTableStatus = autoStatus === 'served' ? 'served' : 'pending_payment';
        const updatedTable = buildDiningTableDocument(userId, { status: newTableStatus }, table);
        await putDocument(req, db, updatedTable._id, updatedTable);
        broadcastToUser(userId, 'sala:table_status_changed', sanitizeDiningTable(updatedTable));
      }
    }

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar estado de comanda' });
  }
}

// ─── TABLE TICKET STATS ──────────────────────────────────────────────────────

export async function listTableTicketStats(req, res) {
  try {
    const { userId } = req.params;
    const { businessId, tableId, dateFrom, dateTo, pdvId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const stats = await listDiningTableTicketStatsByUser(req, userId, {
      businessId: businessId ? String(businessId) : '',
      tableId: tableId ? String(tableId) : '',
      dateFrom: dateFrom ? String(dateFrom) : '',
      dateTo: dateTo ? String(dateTo) : '',
      pdvId: pdvId ? String(pdvId) : '',
    });
    return res.json({ ok: true, stats });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar estadísticas de mesa' });
  }
}

// ─── PICKUP (Recogida local) ─────────────────────────────────────────────────

export async function listPickupOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const db = getDeliveryDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);

    const pickups = docs
      .filter((d) =>
        d?.type === 'delivery_order' &&
        !d?.deletedAt &&
        d?.user_id === userId &&
        d?.deliveryType === 'recogida' &&
        !['delivered', 'cancelled'].includes(d?.status)
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({ ok: true, pickups: pickups.map((d) => ({
      _id: d._id,
      orderNumber: d.orderNumber || '',
      customerName: d.customerName || '',
      customerPhone: d.customerPhone || '',
      status: d.status || 'nuevo',
      channel: d.channel || 'direct',
      items: (d.items || []).map((i) => ({ name: i.name, quantity: i.quantity })),
      totalAmount: d.totalAmount || 0,
      scheduledAt: d.scheduledAt || d.requestedTime || '',
      createdAt: d.createdAt || '',
      notes: d.notes || d.kitchenNotes || '',
    })) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar recogidas' });
  }
}

// ─── LINK CRM CLIENT ────────────────────────────────────────────────────────

export async function linkClientToOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { clientId, clientName } = req.body || {};
    if (!clientId) return badRequest(res, 'Falta clientId');

    const existing = await ensureDiningOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const db = getSalaDbName();
    const doc = buildDiningOrderDocument(userId, { clientId, clientName: clientName || '' }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeDiningOrder({ ...doc, _rev: saved.rev });

    return res.json({ ok: true, order: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al vincular cliente' });
  }
}
