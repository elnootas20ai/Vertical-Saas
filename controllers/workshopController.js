import {
  getWorkshopDbName,
  getPartsDbName,
  buildWorkOrderDocument,
  sanitizeWorkOrder,
  listWorkOrdersByUser,
  buildPartDocument,
  sanitizePart,
  listPartsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureWorkOrderOwner(req, userId, workOrderId) {
  const db = getWorkshopDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, workOrderId);
  if (!doc || doc.type !== 'work_order' || doc.user_id !== userId) return null;
  return doc;
}

async function ensurePartOwner(req, userId, partId) {
  const db = getPartsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, partId);
  if (!doc || doc.type !== 'part' || doc.user_id !== userId) return null;
  return doc;
}

// ─── WORK ORDERS ─────────────────────────────────────────────────────────────

function resolveBusinessId(req, body = {}) {
  return String(
    req.query?.businessId ||
    body?.workOrder?.business_id ||
    body?.part?.business_id ||
    '',
  ).trim() || null;
}

export async function listWorkOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const businessId = resolveBusinessId(req);
    const workOrders = await listWorkOrdersByUser(req, userId, businessId);
    return res.json({ ok: true, workOrders: workOrders.map(sanitizeWorkOrder) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar órdenes de trabajo' });
  }
}

export async function createWorkOrder(req, res) {
  try {
    const { userId } = req.params;
    const { workOrder } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!workOrder || typeof workOrder !== 'object') return badRequest(res, 'Falta el objeto workOrder en el body');
    if (!workOrder.vehiclePlate && !workOrder.clientName) return badRequest(res, 'Falta matrícula o cliente');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getWorkshopDbName();
    await ensureDatabase(req, db);
    const doc = buildWorkOrderDocument(userId, workOrder);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'work_order',
      action: `Creó OT ${doc.woNumber} — ${doc.vehicleBrand} ${doc.vehicleModel} ${doc.vehiclePlate}`,
      entityId: doc._id,
      entityLabel: `${doc.woNumber} ${doc.vehiclePlate}`.trim(),
      metadata: { status: doc.status, serviceType: doc.serviceType },
    });
    return res.status(201).json({ ok: true, workOrder: sanitizeWorkOrder({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear orden de trabajo' });
  }
}

export async function updateWorkOrder(req, res) {
  try {
    const { userId, workOrderId } = req.params;
    const { workOrder } = req.body || {};
    if (!workOrder || typeof workOrder !== 'object') return badRequest(res, 'Faltan datos de la OT');
    const existing = await ensureWorkOrderOwner(req, userId, workOrderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Orden de trabajo no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getWorkshopDbName();
    const doc = buildWorkOrderDocument(userId, { ...existing, ...workOrder }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'work_order',
      action: `Actualizó OT ${doc.woNumber} → estado ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.woNumber} ${doc.vehiclePlate}`.trim(),
      metadata: { status: doc.status },
    });
    return res.json({ ok: true, workOrder: sanitizeWorkOrder({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar orden de trabajo' });
  }
}

export async function removeWorkOrder(req, res) {
  try {
    const { userId, workOrderId } = req.params;
    const existing = await ensureWorkOrderOwner(req, userId, workOrderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Orden de trabajo no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getWorkshopDbName();
    await softDeleteDocument(req, db, workOrderId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'work_order',
      action: `Eliminó OT ${existing.woNumber}`,
      entityId: existing._id,
      entityLabel: existing.woNumber,
      metadata: {},
    });
    return res.json({ ok: true, id: workOrderId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar orden de trabajo' });
  }
}

// ─── PARTS (RECAMBIOS) ────────────────────────────────────────────────────────

export async function listParts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const businessId = resolveBusinessId(req);
    const parts = await listPartsByUser(req, userId, businessId);
    return res.json({ ok: true, parts: parts.map(sanitizePart) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar recambios' });
  }
}

export async function createPart(req, res) {
  try {
    const { userId } = req.params;
    const { part } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!part || typeof part !== 'object') return badRequest(res, 'Falta el objeto part en el body');
    if (!part.name) return badRequest(res, 'Falta el nombre de la pieza');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getPartsDbName();
    await ensureDatabase(req, db);
    const doc = buildPartDocument(userId, part);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'part',
      action: `Añadió recambio ${doc.partNumber} — ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { category: doc.category, stockQuantity: doc.stockQuantity },
    });
    return res.status(201).json({ ok: true, part: sanitizePart({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear recambio' });
  }
}

export async function updatePart(req, res) {
  try {
    const { userId, partId } = req.params;
    const { part } = req.body || {};
    if (!part || typeof part !== 'object') return badRequest(res, 'Faltan datos del recambio');
    const existing = await ensurePartOwner(req, userId, partId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Recambio no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getPartsDbName();
    const doc = buildPartDocument(userId, { ...existing, ...part }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'part',
      action: `Actualizó recambio ${doc.name} → stock ${doc.stockQuantity}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { stockQuantity: doc.stockQuantity },
    });
    return res.json({ ok: true, part: sanitizePart({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar recambio' });
  }
}

export async function removePart(req, res) {
  try {
    const { userId, partId } = req.params;
    const existing = await ensurePartOwner(req, userId, partId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Recambio no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getPartsDbName();
    await softDeleteDocument(req, db, partId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'part',
      action: `Eliminó recambio ${existing.name}`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: {},
    });
    return res.json({ ok: true, id: partId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar recambio' });
  }
}
