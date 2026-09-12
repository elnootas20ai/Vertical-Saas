import {
  getCatalogDbName,
  getDeliveryDbName,
  buildPurchaseOrderDocument,
  sanitizePurchaseOrder,
  listPurchaseOrdersByUser,
  normalizePurchaseListLimit,
  assignPurchaseInvoiceNumber,
  listCatalogItemsByUser,
  ensureDatabase,
  getDocument,
  getAllDocuments,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { nextPurchaseOrderNumber } from '../services/purchaseOrderNumber.js';
import { generateAutoOrders } from '../services/autoOrderService.js';
import { sendEmail } from '../services/email.js';
import {
  applyPurchaseMovementCost,
  listMovementsByReference,
  recordMovement,
} from '../services/stockMovementService.js';
import {
  canEmitCatalogStockAlerts,
  filterStockTrackedCatalogItems,
} from '../services/stockAlertUtils.js';
import logger from '../services/logger.js';
import {
  filterDocsForBusiness,
  stampOpsDoc,
  resolveBusinessIdFromRequest,
} from '../shared/scope/opsScope.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function scopePurchaseDocs(req, docs) {
  const businessId = resolveBusinessIdFromRequest(req);
  if (!businessId) return docs;
  const accountBusinessCount = Math.max(
    1,
    Number(req.query?.accountBusinessCount || req.body?.accountBusinessCount) || 1,
  );
  return filterDocsForBusiness(docs, businessId, { accountBusinessCount });
}

const PURCHASE_ROLES = {
  full: ['Admin', 'admin', 'Gerente', 'gerente'],
  create: ['Admin', 'admin', 'Gerente', 'gerente', 'Administración', 'administracion'],
  receive: ['Admin', 'admin', 'Gerente', 'gerente', 'Administración', 'administracion', 'Usuario', 'usuario'],
};

function getUserRole(req) {
  return req.authUser?.role || req.authUser?.teamRole || '';
}

function canPerform(req, action) {
  const role = getUserRole(req);
  const allowed = PURCHASE_ROLES[action] || PURCHASE_ROLES.full;
  return allowed.some((r) => r.toLowerCase() === role.toLowerCase());
}

async function ensurePurchaseOrderOwner(req, userId, orderId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, orderId);
  if (!doc || doc.type !== 'purchase_order' || doc.user_id !== userId) return null;
  return doc;
}

function purchaseDocBusinessId(doc) {
  return String(doc?.businessId || doc?.business_id || '').replace(/^business:/, '').trim();
}

async function assertPurchaseOrderReferences(req, userId, order, businessId) {
  const db = getCatalogDbName();
  const ids = new Map();
  if (order?.supplierId) ids.set(String(order.supplierId), 'supplier');
  for (const item of order?.items || []) {
    if (item?.catalogItemId) ids.set(String(item.catalogItemId), 'catalog_item');
    if (item?.supplierId) ids.set(String(item.supplierId), 'supplier');
  }
  for (const [id, expectedType] of ids) {
    const doc = await getDocument(req, db, id).catch(() => null);
    if (!doc || doc.deletedAt || doc.user_id !== userId || doc.type !== expectedType) {
      const label = expectedType === 'supplier' ? 'proveedor' : 'artículo';
      const err = new Error(`El ${label} seleccionado no pertenece a esta cuenta`);
      err.statusCode = 400;
      throw err;
    }
    const docBusinessId = purchaseDocBusinessId(doc);
    if (businessId && docBusinessId && docBusinessId !== businessId) {
      const err = new Error('El pedido contiene datos de otra empresa');
      err.statusCode = 400;
      throw err;
    }
  }
}

export async function listPurchaseOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const businessId = String(req.query?.businessId || '').trim();
    const accountBusinessCount = Math.max(1, Number(req.query?.accountBusinessCount) || 1);
    const limit = normalizePurchaseListLimit(req.query?.limit);
    const orders = await listPurchaseOrdersByUser(req, userId, {
      businessId: businessId || undefined,
      accountBusinessCount,
      limit,
    });
    const permissions = {
      canCreate: canPerform(req, 'create'),
      canEdit: canPerform(req, 'create'),
      canDelete: canPerform(req, 'full'),
      canApprove: canPerform(req, 'full'),
      canSend: canPerform(req, 'full'),
      canReceive: canPerform(req, 'receive'),
      canAutoGenerate: canPerform(req, 'full'),
    };
    const safe = [];
    for (const order of orders) {
      try {
        const sanitized = sanitizePurchaseOrder(order);
        if (sanitized) safe.push(sanitized);
      } catch (err) {
        logger.warn('[listPurchaseOrders] sanitize failed %s: %s', order?._id, err?.message || err);
      }
    }
    return res.json({ ok: true, orders: safe, permissions });
  } catch (error) {
    logger.error('[listPurchaseOrders] %s', error?.message || error);
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar pedidos de compra' });
  }
}

export async function createPurchaseOrder(req, res) {
  try {
    if (!canPerform(req, 'create')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para crear pedidos' });
    }
    const { userId } = req.params;
    const { order } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const bid = String(
      order.businessId || order.business_id || resolveBusinessIdFromRequest(req) || '',
    ).trim();
    await assertPurchaseOrderReferences(req, userId, order, bid);
    const existingOrders = await listPurchaseOrdersByUser(req, userId, bid ? { businessId: bid } : {});
    const orderNumber = String(order.orderNumber || '').trim()
      || nextPurchaseOrderNumber(existingOrders.map((o) => o.orderNumber));
    const doc = buildPurchaseOrderDocument(userId, stampOpsDoc({ ...order, orderNumber }, {
      ownerUserId: userId,
      businessId: bid,
      salesPointId: order.salesPointId,
      workCenterId: order.workCenterId,
    }));
    const result = await putDocument(req, db, doc._id, doc);
    const saved = { ...doc, _rev: result.rev };

    logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName || '', targetUserId: userId,
      type: 'purchase_order', action: `Creó pedido de compra ${saved.orderNumber}`,
      entityId: saved._id, entityLabel: saved.orderNumber,
      metadata: { supplierId: saved.supplierId, supplierName: saved.supplierName },
    }).catch(() => null);

    return res.status(201).json({ ok: true, order: sanitizePurchaseOrder(saved) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Error al crear pedido de compra' });
  }
}

export async function updatePurchaseOrder(req, res) {
  try {
    if (!canPerform(req, 'create')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para editar pedidos' });
    }
    const { userId, orderId } = req.params;
    const { order } = req.body || {};
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');
    if (!order || typeof order !== 'object') return badRequest(res, 'Falta el objeto order en el body');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (existing.status !== 'draft') {
      return badRequest(res, 'Solo se pueden editar pedidos en borrador');
    }
    const bid = purchaseDocBusinessId(existing) || resolveBusinessIdFromRequest(req);
    await assertPurchaseOrderReferences(req, userId, order, bid);

    const db = getCatalogDbName();
    const doc = buildPurchaseOrderDocument(
      userId,
      { ...order, businessId: bid, business_id: bid },
      existing,
    );
    const result = await putDocument(req, db, doc._id, doc);
    const saved = { ...doc, _rev: result.rev };

    return res.json({ ok: true, order: sanitizePurchaseOrder(saved) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Error al actualizar pedido de compra' });
  }
}

export async function removePurchaseOrder(req, res) {
  try {
    if (!canPerform(req, 'full')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para eliminar pedidos' });
    }
    const { userId, orderId } = req.params;
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (!['draft', 'cancelled'].includes(String(existing.status || ''))) {
      return res.status(409).json({
        ok: false,
        error: 'No se puede eliminar un pedido enviado o recibido; debe conservarse su trazabilidad',
      });
    }

    const db = getCatalogDbName();
    await softDeleteDocument(req, db, existing._id);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar pedido de compra' });
  }
}

export async function triggerAutoOrders(req, res) {
  try {
    if (!canPerform(req, 'full')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para generar pedidos' });
    }
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const result = await generateAutoOrders(req, userId);

    logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName || '', targetUserId: userId,
      type: 'purchase_order', action: `Generó ${result.created} pedido(s) automático(s)`,
      entityId: '', entityLabel: 'auto_orders',
      metadata: { created: result.created },
    }).catch(() => null);

    return res.json({
      ok: true,
      created: result.created,
      orders: result.orders.map(sanitizePurchaseOrder),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar pedidos automáticos' });
  }
}

export async function getLowStockReport(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const items = scopePurchaseDocs(req, await listCatalogItemsByUser(req, userId));
    const lowStock = items
      .filter((item) => {
        if (!item.active || item.deletedAt) return false;
        if (item.minStock > 0 && item.stockQuantity < item.minStock) return true;
        if (Array.isArray(item.warehouseStock)) {
          return item.warehouseStock.some((ws) => ws.minStock > 0 && Number(ws.quantity || 0) < ws.minStock);
        }
        return false;
      })
      .map((item) => {
        const warehouseAlerts = (item.warehouseStock || [])
          .filter((ws) => ws.minStock > 0 && Number(ws.quantity || 0) < ws.minStock)
          .map((ws) => ({
            warehouseId: ws.warehouseId,
            warehouseName: ws.warehouseName || ws.warehouseId,
            quantity: Number(ws.quantity || 0),
            minStock: ws.minStock,
            deficit: ws.minStock - Number(ws.quantity || 0),
          }));

        return {
          _id: item._id, name: item.name, sku: item.sku,
          stockQuantity: item.stockQuantity, minStock: item.minStock,
          reorderQuantity: item.reorderQuantity || 0, autoReorder: item.autoReorder || false,
          supplierId: item.supplierId, supplierName: item.supplierName,
          deficit: Math.max(0, (item.minStock || 0) - item.stockQuantity),
          isCritical: item.isCritical || false,
          workCenterId: item.workCenterId || '', workCenterName: item.workCenterName || '',
          warehouseAlerts,
        };
      });

    return res.json({ ok: true, items: lowStock, total: lowStock.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener reporte de stock bajo' });
  }
}

export async function markOrderReceived(req, res) {
  try {
    if (!canPerform(req, 'receive')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para recibir pedidos' });
    }
    const { userId, orderId } = req.params;
    const { receivedItems } = req.body || {};
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (!['pending', 'sent', 'partial'].includes(String(existing.status || ''))) {
      return badRequest(res, `No se puede recibir un pedido en estado "${existing.status || 'draft'}"`);
    }

    const db = getCatalogDbName();
    const now = new Date().toISOString();

    const updatedItems = (existing.items || []).map((item) => {
      const received = Array.isArray(receivedItems)
        ? receivedItems.find((r) => r.catalogItemId === item.catalogItemId)
        : null;
      const nextReceived = Array.isArray(receivedItems)
        ? (received ? Number(received.quantity ?? 0) : Number(item.received || 0))
        : Number(item.quantity || 0);
      if (!Number.isFinite(nextReceived) || nextReceived < Number(item.received || 0)) {
        throw new Error(`La recepción de "${item.name || item.catalogItemId}" no puede reducir lo ya recibido`);
      }
      const nextUnitCost =
        received && received.unitCost != null && Number(received.unitCost) >= 0
          ? Number(received.unitCost)
          : Number(item.unitCost || 0);
      return { ...item, received: nextReceived, unitCost: nextUnitCost };
    });

    const allReceived = updatedItems.every(
      (item) => Number(item.received || 0) >= Number(item.quantity || 0),
    );
    const shouldApplyStock = allReceived || Array.isArray(receivedItems);
    let account = null;
    let warehouseId = '';
    if (shouldApplyStock) {
      account = await findAccountByUserId(req, userId);
      warehouseId = String(req.body?.warehouseId || existing.warehouseId || '').trim();
      try {
        const { resolvePurchaseReceptionWarehouseId } = await import('../services/storeWarehouseService.js');
        warehouseId = await resolvePurchaseReceptionWarehouseId(req, userId, {
          warehouseId,
          salesPointId: req.body?.salesPointId || existing.salesPointId || '',
          workCenterId: req.body?.workCenterId || existing.workCenterId || '',
        });
      } catch (resolveErr) {
        logger.warn(
          { tag: 'PO_RECEIVE', err: resolveErr?.message },
          'No se pudo resolver almacén de recepción',
        );
        return badRequest(res, resolveErr?.message || 'Almacén de recepción no válido');
      }
      if (!warehouseId) {
        return badRequest(res, 'Selecciona el almacén de la tienda antes de recibir el pedido');
      }
    }

    const doc = buildPurchaseOrderDocument(userId, {
      ...existing,
      items: updatedItems,
      // Se confirma como recibido al final, cuando stock y costes han quedado aplicados.
      status: shouldApplyStock ? 'partial' : (allReceived ? 'received' : 'partial'),
      receivedAt: now,
      receptionMovementsVersion: 1,
      salesPointId: req.body?.salesPointId || existing.salesPointId || '',
      workCenterId: req.body?.workCenterId || existing.workCenterId || '',
      warehouseId,
    }, existing);
    const result = await putDocument(req, db, doc._id, doc);

    if (shouldApplyStock) {
      const priorMovements = (await listMovementsByReference(
        req,
        userId,
        existing._id,
        'purchase_order',
        { movementTypes: ['purchase_reception'], maxDocs: 2000 },
      )).filter((movement) => movement.applied !== false);
      const receptionMovements = [...priorMovements];
      const appliedByCatalog = new Map();
      for (const movement of priorMovements) {
        const key = String(movement.catalogItemId || '');
        if (!key) continue;
        appliedByCatalog.set(
          key,
          (appliedByCatalog.get(key) || 0) + Number(movement.quantity || 0),
        );
      }
      // Compatibilidad con pedidos históricos que se recibieron antes de registrar movimientos.
      if (!existing.receptionMovementsVersion && priorMovements.length === 0) {
        for (const item of existing.items || []) {
          const key = String(item.catalogItemId || '');
          if (key) {
            appliedByCatalog.set(
              key,
              (appliedByCatalog.get(key) || 0) + Number(item.received || 0),
            );
          }
        }
      }
      let stockUpdated = 0;
      let stockFailed = 0;
      let stockUnits = 0;
      let expectedStockLines = 0;
      const targetByCatalog = new Map();

      for (const item of updatedItems) {
        if (!item.catalogItemId) continue;
        const catalogKey = String(item.catalogItemId);
        const targetReceived = Number(item.received || 0);
        if (targetReceived > 0) expectedStockLines += 1;
        const cumulativeTarget = Math.round(
          ((targetByCatalog.get(catalogKey) || 0) + targetReceived) * 1_000_000,
        ) / 1_000_000;
        targetByCatalog.set(catalogKey, cumulativeTarget);
        const alreadyApplied = appliedByCatalog.get(catalogKey) || 0;
        const delta = cumulativeTarget - alreadyApplied;
        if (delta <= 0) continue;
        try {
          const movement = await recordMovement(req, userId, {
            catalogItemId: item.catalogItemId,
            movementType: 'purchase_reception',
            quantity: delta,
            unitCost: Number(item.unitCost || 0),
            warehouseId,
            referenceId: existing._id,
            referenceType: 'purchase_order',
            idempotencyKey: `purchase-order:${existing._id}:${catalogKey}:${cumulativeTarget}`,
            notes: `Recepción pedido ${existing.orderNumber || existing._id.slice(-8)}`,
            performedBy: account?.fullName || userId,
          });
          receptionMovements.push(movement);
          stockUpdated += 1;
          stockUnits += delta;
          appliedByCatalog.set(catalogKey, alreadyApplied + delta);
        } catch (err) {
          stockFailed += 1;
          logger.warn({ tag: 'PO_RECEIVE', err: err?.message, catalogItemId: item.catalogItemId }, 'Error registrando movimiento de stock');
        }
      }

      for (const movement of receptionMovements.sort(
        (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      )) {
        try {
          await applyPurchaseMovementCost(req, userId, movement);
        } catch (err) {
          stockFailed += 1;
          logger.warn({ tag: 'PO_RECEIVE', err: err?.message }, 'Error actualizando coste medio');
        }
      }

      // Escandallo: precio de factura → baseCost de ingredientes (mismo nombre).
      try {
        const deliveryDb = getDeliveryDbName();
        const configId = `dlvconf-${userId}`;
        const cfg = await getDocument(req, deliveryDb, configId).catch(() => null);
        if (cfg?.type === 'delivery_config' && Array.isArray(cfg.storeIngredients)) {
          const norm = (v) =>
            String(v || '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/\p{M}/gu, '')
              .replace(/\s+/g, ' ')
              .trim();
          const costByName = new Map();
          const costByCatalogId = new Map();
          for (const item of updatedItems) {
            if (!item.received || !(Number(item.unitCost) > 0)) continue;
            const key = norm(item.name);
            if (key) costByName.set(key, Number(item.unitCost));
            if (item.catalogItemId) {
              costByCatalogId.set(String(item.catalogItemId), Number(item.unitCost));
            }
          }
          let changed = false;
          const nextIngredients = cfg.storeIngredients.map((ing) => {
            const ingredientCatalogId = String(
              ing.catalogItemId || ing.stockItemId || '',
            ).trim();
            const cost = ingredientCatalogId
              ? costByCatalogId.get(ingredientCatalogId)
              : costByName.get(norm(ing.name));
            if (cost == null) return ing;
            changed = true;
            return { ...ing, baseCost: Math.round(cost * 100) / 100 };
          });
          if (changed) {
            await putDocument(req, deliveryDb, cfg._id, {
              ...cfg,
              storeIngredients: nextIngredients,
              updatedAt: now,
            });
          }
        }
      } catch (err) {
        logger.warn({ tag: 'PO_RECEIVE', err: err?.message }, 'Error actualizando escandallo ingredientes');
      }

      const stockComplete = expectedStockLines > 0 && stockFailed === 0;
      let responseDoc = doc;
      let responseRev = result.rev;
      if (stockComplete && allReceived) {
        const finalized = buildPurchaseOrderDocument(
          userId,
          { ...doc, status: 'received', receivedAt: now },
          { ...doc, _rev: result.rev },
        );
        const finalizedSave = await putDocument(req, db, finalized._id, finalized);
        responseDoc = finalized;
        responseRev = finalizedSave.rev;
      }

      return res.json({
        ok: true,
        order: sanitizePurchaseOrder({ ...responseDoc, _rev: responseRev }),
        stockUpdated,
        stockUnits,
        stockFailed,
        stockComplete,
        warehouseId: warehouseId || '',
      });
    }

    return res.json({ ok: true, order: sanitizePurchaseOrder({ ...doc, _rev: result.rev }), stockUpdated: 0, stockUnits: 0, stockFailed: 0, warehouseId: '' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al marcar pedido como recibido' });
  }
}

export async function approvePurchaseOrder(req, res) {
  try {
    if (!canPerform(req, 'full')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para aprobar pedidos' });
    }
    const { userId, orderId } = req.params;
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    if (existing.status !== 'draft') {
      return badRequest(res, 'Solo se pueden aprobar pedidos en borrador');
    }

    const db = getCatalogDbName();
    const now = new Date().toISOString();
    const approverName = req.authUser?.fullName || req.authUser?.name || '';

    const doc = buildPurchaseOrderDocument(userId, {
      ...existing,
      status: 'pending',
      approvedBy: req.authUser?.id || req.authUser?.userId || userId,
      approvedAt: now,
    }, existing);
    const result = await putDocument(req, db, doc._id, doc);
    const saved = { ...doc, _rev: result.rev };

    logAccountActivity(req, {
      actorUserId: userId, actorName: approverName, targetUserId: userId,
      type: 'purchase_order', action: `Aprobó pedido de compra ${saved.orderNumber}`,
      entityId: saved._id, entityLabel: saved.orderNumber,
      metadata: { supplierId: saved.supplierId, supplierName: saved.supplierName },
    }).catch(() => null);

    return res.json({ ok: true, order: sanitizePurchaseOrder(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aprobar pedido' });
  }
}

export async function receiveWithInvoice(req, res) {
  // Flujo legado inseguro: sumaba el acumulado directamente al stock y podía duplicarlo.
  // La UI usa /receive (delta + movimientos) y después persiste el albarán.
  return res.status(410).json({
    ok: false,
    code: 'LEGACY_RECEIVE_DISABLED',
    error: 'Usa el flujo de comprobación de albarán para recibir el pedido',
  });
  try {
    const { userId, orderId } = req.params;
    const { ocrResult, receivedItems, createInvoice } = req.body || {};
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

    const db = getCatalogDbName();
    const now = new Date().toISOString();

    const matchedItems = [];
    const unmatchedOcrLines = [];
    const unmatchedOrderItems = [];
    const ocrLines = ocrResult?.lines || [];

    const orderItemsCopy = [...(existing.items || [])];

    for (const ocrLine of ocrLines) {
      const ocrName = (ocrLine.name || ocrLine.description || '').toLowerCase().trim();
      if (!ocrName) { unmatchedOcrLines.push(ocrLine); continue; }

      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < orderItemsCopy.length; i++) {
        const orderItem = orderItemsCopy[i];
        const orderName = (orderItem.name || '').toLowerCase().trim();

        const words1 = new Set(ocrName.split(/\s+/));
        const words2 = new Set(orderName.split(/\s+/));
        const intersection = [...words1].filter((w) => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;
        const score = union > 0 ? intersection / union : 0;

        if (score > bestScore && score >= 0.3) {
          bestScore = score;
          bestMatch = { idx: i, orderItem };
        }
      }

      if (bestMatch) {
        matchedItems.push({
          orderItemId: bestMatch.orderItem.id,
          catalogItemId: bestMatch.orderItem.catalogItemId,
          orderItemName: bestMatch.orderItem.name,
          ocrLine,
          matchConfidence: Math.round(bestScore * 100) / 100,
          quantityOrdered: bestMatch.orderItem.quantity,
          quantityOcr: Number(ocrLine.quantity || ocrLine.qty || 0),
          unitCostOcr: Number(ocrLine.unitPrice || ocrLine.price || 0),
        });
        orderItemsCopy.splice(bestMatch.idx, 1);
      } else {
        unmatchedOcrLines.push(ocrLine);
      }
    }

    for (const remaining of orderItemsCopy) {
      unmatchedOrderItems.push(remaining);
    }

    const updatedItems = (existing.items || []).map((item) => {
      const received = Array.isArray(receivedItems)
        ? receivedItems.find((r) => r.catalogItemId === item.catalogItemId)
        : null;
      const matched = matchedItems.find((m) => m.orderItemId === item.id);
      const qty = received ? Number(received.quantity) : (matched ? matched.quantityOcr || item.quantity : item.quantity);
      return { ...item, received: qty };
    });

    const allReceived = updatedItems.every((item) => item.received >= item.quantity);

    const doc = buildPurchaseOrderDocument(userId, {
      ...existing,
      items: updatedItems,
      status: allReceived ? 'received' : 'partial',
      receivedAt: now,
    }, existing);
    const orderResult = await putDocument(req, db, doc._id, doc);

    for (const item of updatedItems) {
      if (!item.catalogItemId) continue;
      try {
        const catItem = await getDocument(req, db, item.catalogItemId);
        if (catItem && catItem.type === 'catalog_item' && catItem.user_id === userId) {
          const newStock = Number(catItem.stockQuantity || 0) + Number(item.received || 0);
          await putDocument(req, db, catItem._id, {
            ...catItem,
            stockQuantity: newStock,
            updatedAt: now,
          });
        }
      } catch (_) { /* item may have been deleted */ }
    }

    let invoice = null;
    if (createInvoice && ocrResult) {
      const { buildPurchaseInvoiceDocument, sanitizePurchaseInvoice } = await import('../services/couchdb.js');
      const docKind = ocrResult.documentType || 'factura_proveedor';
      const invoiceNumber = await assignPurchaseInvoiceNumber(req, userId, {
        invoiceNumber: ocrResult.invoiceNumber || ocrResult.documentNumber || '',
        documentKind: docKind,
        ocrData: ocrResult,
      });
      const invoiceData = {
        supplierId: existing.supplierId,
        supplierName: existing.supplierName,
        invoiceNumber,
        invoiceDate: ocrResult.date || now,
        dueDate: ocrResult.dueDate || '',
        documentKind: docKind,
        lines: (ocrResult.lines || []).map((l, idx) => ({
          id: `pinvl-${idx}`,
          description: l.name || l.description || '',
          quantity: Number(l.quantity || l.qty || 0),
          unitPrice: Number(l.unitPrice || l.price || 0),
          total: Number(l.total || 0),
        })),
        subtotal: Number(ocrResult.subtotal || 0),
        taxRate: Number(ocrResult.taxRate || existing.taxRate || 21),
        taxAmount: Number(ocrResult.taxAmount || 0),
        total: Number(ocrResult.total || 0),
        status: 'pending',
        purchaseOrderId: existing._id,
        linkedPurchaseOrderId: existing._id,
        linkedPurchaseOrderNumber: existing.orderNumber || existing.number || '',
        entryMethod: 'ocr',
        ocrData: ocrResult,
      };

      if (typeof buildPurchaseInvoiceDocument === 'function') {
        const invoiceDoc = buildPurchaseInvoiceDocument(userId, invoiceData);
        const invoiceResult = await putDocument(req, db, invoiceDoc._id, invoiceDoc);
        invoice = typeof sanitizePurchaseInvoice === 'function'
          ? sanitizePurchaseInvoice({ ...invoiceDoc, _rev: invoiceResult.rev })
          : { ...invoiceDoc, _rev: invoiceResult.rev };

        const linkedDoc = buildPurchaseOrderDocument(userId, {
          ...doc,
          purchaseInvoiceId: invoiceDoc._id,
        }, { ...doc, _rev: orderResult.rev });
        await putDocument(req, db, linkedDoc._id, linkedDoc);
      }
    }

    return res.json({
      ok: true,
      order: sanitizePurchaseOrder({ ...doc, _rev: orderResult.rev }),
      matchedItems,
      unmatchedOcrLines,
      unmatchedOrderItems,
      invoice,
    });
  } catch (error) {
    logger.error({ tag: 'PO_RECEIVE_OCR', err: error?.message }, 'Error en recepción con factura');
    return res.status(500).json({ ok: false, error: error.message || 'Error al procesar recepción con factura' });
  }
}

export async function getSalesForecast(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const deliveryDb = getDeliveryDbName();
    await ensureDatabase(req, deliveryDb);
    const deliveryDocs = await getAllDocuments(req, deliveryDb);

    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const deliveredOrders = scopePurchaseDocs(req, deliveryDocs).filter(
      (d) => d?.type === 'delivery_order' && d?.user_id === userId && !d?.deletedAt
        && d?.status === 'delivered' && d?.createdAt >= fourWeeksAgo,
    );

    const itemConsumption = {};
    for (const order of deliveredOrders) {
      for (const item of (order.items || [])) {
        const key = item.name?.toLowerCase().trim();
        if (!key) continue;
        if (!itemConsumption[key]) {
          itemConsumption[key] = { name: item.name, totalQty: 0, orderCount: 0 };
        }
        itemConsumption[key].totalQty += Number(item.quantity || 0);
        itemConsumption[key].orderCount += 1;
      }
    }

    const weeksSpan = Math.max(1, Math.ceil(
      (Date.now() - new Date(fourWeeksAgo).getTime()) / (7 * 24 * 60 * 60 * 1000),
    ));

    const catalogItems = scopePurchaseDocs(req, await listCatalogItemsByUser(req, userId));
    const forecast = catalogItems
      .filter((item) => item.active && !item.deletedAt)
      .map((item) => {
        const key = item.name?.toLowerCase().trim();
        const consumption = itemConsumption[key];
        const weeklyAvg = consumption ? consumption.totalQty / weeksSpan : 0;
        const weeksOfStock = weeklyAvg > 0 ? item.stockQuantity / weeklyAvg : 999;
        const suggestedOrder = weeklyAvg > 0
          ? Math.max(0, Math.ceil(weeklyAvg * 2 - item.stockQuantity))
          : 0;
        const needsReorder = item.stockQuantity < item.minStock || weeksOfStock < 2;

        return {
          _id: item._id,
          name: item.name,
          sku: item.sku || '',
          stockQuantity: item.stockQuantity,
          minStock: item.minStock,
          costPrice: item.costPrice || 0,
          supplierId: item.supplierId || '',
          supplierName: item.supplierName || '',
          weeklyAvg: Math.round(weeklyAvg * 100) / 100,
          weeksOfStock: Math.round(weeksOfStock * 10) / 10,
          suggestedOrder,
          needsReorder,
          reorderQuantity: item.reorderQuantity || 0,
          autoReorder: item.autoReorder || false,
        };
      })
      .filter((item) => item.needsReorder)
      .sort((a, b) => a.weeksOfStock - b.weeksOfStock);

    return res.json({ ok: true, forecast, weeksAnalyzed: weeksSpan });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular previsión de ventas' });
  }
}

export async function getPurchaseKpis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const rawDocs = await getAllDocuments(req, db);
    const allDocs = scopePurchaseDocs(req, rawDocs);

    const catalogItems = allDocs.filter((d) => d?.type === 'catalog_item' && d?.user_id === userId && !d?.deletedAt && d?.active);
    const orders = allDocs.filter((d) => d?.type === 'purchase_order' && d?.user_id === userId && !d?.deletedAt);
    const catalogItemIds = new Set(catalogItems.map((item) => item._id));
    const scopedWarehouses = new Set(
      allDocs.filter((doc) => doc?.type === 'warehouse').map((doc) => doc._id),
    );
    const stockInfra = rawDocs.filter(
      (doc) =>
        doc?.user_id === userId
        && !doc?.deletedAt
        && (
          (doc.type === 'warehouse' && scopedWarehouses.has(doc._id))
          || (doc.type === 'stock_movement' && catalogItemIds.has(doc.catalogItemId))
        ),
    );

    const now = new Date();
    const pendingStatuses = ['draft', 'pending', 'sent'];
    const pending = orders.filter((o) => pendingStatuses.includes(o.status));
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const kpis = {
      pendingOrders: pending.length,
      pendingValue: Math.round(pending.reduce((s, o) => s + Number(o.total || 0), 0) * 100) / 100,
      monthlySpend: Math.round(orders.filter((o) => o.status === 'received' && o.receivedAt >= firstOfMonth).reduce((s, o) => s + Number(o.total || 0), 0) * 100) / 100,
      lowStockCount: (() => {
        if (!canEmitCatalogStockAlerts(catalogItems, stockInfra)) return 0;
        return filterStockTrackedCatalogItems(catalogItems).filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) < i.minStock).length;
      })(),
      criticalProducts: (() => {
        if (!canEmitCatalogStockAlerts(catalogItems, stockInfra)) return 0;
        return filterStockTrackedCatalogItems(catalogItems).filter((i) => i.isCritical && i.minStock > 0 && Number(i.stockQuantity || 0) < i.minStock).length;
      })(),
      overdueDeliveries: orders.filter((o) => o.status === 'sent' && o.expectedDate && new Date(o.expectedDate) < now).length,
      upcomingDeliveries: orders
        .filter((o) => o.status === 'sent' && o.expectedDate && new Date(o.expectedDate) >= now)
        .sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime())
        .slice(0, 5)
        .map((o) => ({ id: o._id, orderNumber: o.orderNumber, supplierName: o.supplierName, expectedDate: o.expectedDate, total: o.total })),
      totalOrders: orders.length,
      receivedThisMonth: orders.filter((o) => o.status === 'received' && o.receivedAt >= firstOfMonth).length,
    };

    return res.json({ ok: true, kpis });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener KPIs de compras' });
  }
}

export async function getSmartPurchaseList(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const allDocs = scopePurchaseDocs(req, await getAllDocuments(req, db));

    const catalogItems = allDocs.filter((d) => d?.type === 'catalog_item' && d?.user_id === userId && !d?.deletedAt && d?.active);
    const existingOrders = allDocs.filter((d) => d?.type === 'purchase_order' && d?.user_id === userId && !d?.deletedAt);
    const promotions = allDocs.filter((d) => d?.type === 'promotion' && d?.user_id === userId && !d?.deletedAt);

    const deliveryDb = getDeliveryDbName();
    let deliveryOrders = [];
    try {
      await ensureDatabase(req, deliveryDb);
      const deliveryDocs = await getAllDocuments(req, deliveryDb);
      const fourWeeksAgo = new Date(Date.now() - 28 * 86_400_000).toISOString();
      deliveryOrders = scopePurchaseDocs(req, deliveryDocs).filter(
        (d) => d?.type === 'delivery_order' && d?.user_id === userId && !d?.deletedAt
          && d?.status === 'delivered' && d?.createdAt >= fourWeeksAgo,
      );
    } catch { /* delivery DB may not exist */ }

    const consumption = {};
    for (const order of deliveryOrders) {
      for (const item of (order.items || [])) {
        const key = item.name?.toLowerCase().trim();
        if (!key) continue;
        if (!consumption[key]) consumption[key] = { total: 0, weekday: 0, weekend: 0, weekdayDays: new Set(), weekendDays: new Set() };
        const d = new Date(order.createdAt);
        const dayOfWeek = d.getDay();
        const dateKey = d.toISOString().slice(0, 10);
        const qty = Number(item.quantity || 0);
        consumption[key].total += qty;
        if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
          consumption[key].weekend += qty;
          consumption[key].weekendDays.add(dateKey);
        } else {
          consumption[key].weekday += qty;
          consumption[key].weekdayDays.add(dateKey);
        }
      }
    }

    const weeksSpan = Math.max(1, Math.ceil(28 / 7));
    const now = new Date();
    const isPreWeekend = now.getDay() === 3 || now.getDay() === 4;

    const activeOrderItemIds = new Set();
    for (const order of existingOrders) {
      if (!['draft', 'pending', 'sent'].includes(order.status)) continue;
      for (const item of (order.items || [])) {
        if (item.catalogItemId) activeOrderItemIds.add(item.catalogItemId);
      }
    }

    const activePromos = promotions.filter((p) => {
      if (!p.active && p.status !== 'active') return false;
      const start = p.startDate ? new Date(p.startDate) : null;
      const end = p.endDate ? new Date(p.endDate) : null;
      if (start && start > now) return false;
      if (end && end < now) return false;
      return true;
    });

    const smartList = catalogItems
      .map((item) => {
        const key = item.name?.toLowerCase().trim();
        const cons = consumption[key] || { total: 0, weekday: 0, weekend: 0, weekdayDays: new Set(), weekendDays: new Set() };
        const weeklyAvg = cons.total / weeksSpan;
        const weekdayDays = Math.max(cons.weekdayDays?.size || 1, 1);
        const weekendDays = Math.max(cons.weekendDays?.size || 1, 1);
        const weekendAvg = cons.weekend / weekendDays;
        const weekdayAvgDay = cons.weekday / weekdayDays;

        const stock = Number(item.stockQuantity || 0);
        const min = Number(item.minStock || 0);

        let urgency = 'normal';
        if (stock === 0 || item.isCritical) urgency = 'critical';
        else if (min > 0 && stock < min * 0.5) urgency = 'high';
        else if (min > 0 && stock < min) urgency = 'normal';

        const weeksOfStock = weeklyAvg > 0 ? stock / weeklyAvg : 999;
        const needsReorder = stock < min || weeksOfStock < 2;
        if (!needsReorder && urgency === 'normal') return null;

        let suggestedQty = weeklyAvg > 0
          ? Math.max(0, Math.ceil(weeklyAvg * 2 - stock))
          : Math.max(0, (item.reorderQuantity || min * 2) - stock);

        let weekendMultiplier = 1;
        if (isPreWeekend && weekdayAvgDay > 0) {
          weekendMultiplier = Math.max(1, weekendAvg / weekdayAvgDay);
          suggestedQty = Math.ceil(suggestedQty * weekendMultiplier);
        }

        let campaignBoost = 1;
        const matchedCampaigns = activePromos.filter((p) => {
          const ids = p.productIds || p.catalogItemIds || [];
          const cats = p.categories || [];
          return ids.includes(item._id) || cats.includes(item.category);
        });
        if (matchedCampaigns.length > 0) {
          campaignBoost = 1.3;
          suggestedQty = Math.ceil(suggestedQty * campaignBoost);
        }

        suggestedQty = Math.max(suggestedQty, 1);

        const reasons = [];
        if (stock < min) reasons.push('stock_bajo');
        if (weekendMultiplier > 1) reasons.push('prevision_finde');
        if (matchedCampaigns.length > 0) reasons.push('campaña_activa');
        if (weeklyAvg > 0 && weeksOfStock < 2) reasons.push('historico');
        if (reasons.length === 0) reasons.push('stock_bajo');

        const alreadyOrdered = activeOrderItemIds.has(item._id);

        return {
          catalogItemId: item._id,
          name: item.name,
          sku: item.sku || '',
          currentStock: stock,
          minStock: min,
          weeklyAvg: Math.round(weeklyAvg * 100) / 100,
          weekendAvg: Math.round(weekendAvg * 100) / 100,
          suggestedQuantity: suggestedQty,
          recommendationReasons: reasons,
          urgency,
          supplierId: item.supplierId || '',
          supplierName: item.supplierName || '',
          costPrice: item.costPrice || 0,
          estimatedTotal: suggestedQty * (item.costPrice || 0),
          isCritical: item.isCritical || false,
          activeCampaigns: matchedCampaigns.map((p) => p.name || p.title || ''),
          alreadyOrdered,
          workCenterId: item.workCenterId || '',
          workCenterName: item.workCenterName || '',
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2 };
        return (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
      });

    return res.json({ ok: true, items: smartList, isPreWeekend, total: smartList.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar lista sugerida' });
  }
}

export async function getSuggestions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const catalogItems = scopePurchaseDocs(req, await listCatalogItemsByUser(req, userId));
    const activeProducts = catalogItems.filter((i) => i.active && !i.deletedAt && i.itemType === 'product');

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const allDocs = await getAllDocuments(req, db);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const activeProductIds = new Set(activeProducts.map((item) => item._id));
    const recentMovements = allDocs.filter(
      (d) =>
        d?.type === 'stock_movement'
        && d?.user_id === userId
        && d?.createdAt >= thirtyDaysAgo
        && d?.applied !== false
        && activeProductIds.has(d.catalogItemId),
    );

    const consumptionById = {};
    const outboundTypes = new Set(['sale', 'internal_consumption', 'adjustment_out', 'return_supplier']);
    for (const mov of recentMovements) {
      if (!outboundTypes.has(mov.movementType)) continue;
      const id = mov.catalogItemId;
      if (!id) continue;
      consumptionById[id] = (consumptionById[id] || 0) + Number(mov.quantity || 0);
    }

    const weeksSpan = Math.max(1, 30 / 7);
    const coverageWeeks = 2;

    const suggestions = activeProducts
      .map((item) => {
        const consumed30d = consumptionById[item._id] || 0;
        const weeklyAvg = consumed30d / weeksSpan;
        const weeksOfStock = weeklyAvg > 0 ? item.stockQuantity / weeklyAvg : 999;
        const suggestedQty = weeklyAvg > 0
          ? Math.max(0, Math.ceil(weeklyAvg * coverageWeeks - item.stockQuantity))
          : 0;

        const needsReorder =
          (item.minStock > 0 && item.stockQuantity <= item.minStock) ||
          (weeklyAvg > 0 && weeksOfStock < coverageWeeks);

        return {
          _id: item._id, name: item.name, sku: item.sku || '', category: item.category || '',
          stockQuantity: item.stockQuantity, minStock: item.minStock, maxStock: item.maxStock || 0,
          costPrice: item.costPrice || 0, supplierId: item.supplierId || '', supplierName: item.supplierName || '',
          consumed30d, weeklyAvg: Math.round(weeklyAvg * 100) / 100,
          weeksOfStock: Math.round(weeksOfStock * 10) / 10,
          suggestedQty, needsReorder,
          reorderQuantity: item.reorderQuantity || 0, autoReorder: item.autoReorder || false,
          estimatedCost: Math.round(suggestedQty * (item.costPrice || 0) * 100) / 100,
        };
      })
      .filter((item) => item.needsReorder)
      .sort((a, b) => a.weeksOfStock - b.weeksOfStock);

    const bySupplier = {};
    for (const s of suggestions) {
      const key = s.supplierId || '__no_supplier__';
      if (!bySupplier[key]) {
        bySupplier[key] = { supplierId: s.supplierId, supplierName: s.supplierName || 'Sin proveedor', items: [], totalCost: 0 };
      }
      bySupplier[key].items.push(s);
      bySupplier[key].totalCost += s.estimatedCost;
    }

    return res.json({
      ok: true, suggestions, bySupplier: Object.values(bySupplier),
      totalItems: suggestions.length,
      totalEstimatedCost: Math.round(suggestions.reduce((s, i) => s + i.estimatedCost, 0) * 100) / 100,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular sugerencias de compra' });
  }
}

function buildOrderEmailHtml(order, supplierInfo, businessName) {
  const itemRows = (order.items || []).map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${item.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${Number(item.unitCost).toFixed(2)}€</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:600;">${Number(item.total).toFixed(2)}€</td>
    </tr>`).join('');

  return `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="background:#000;padding:24px 32px;">
    <span style="color:#fff;font-size:22px;font-weight:bold;">${businessName || 'Vertial'}</span>
    <span style="color:#999;font-size:14px;float:right;line-height:30px;">Pedido de compra</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 8px;color:#111;font-size:20px;">Pedido ${order.orderNumber}</h2>
    <p style="color:#666;margin:0 0 24px;font-size:14px;">
      Fecha: ${new Date().toLocaleDateString('es-ES')}
      ${order.expectedDate ? ` · Entrega esperada: ${new Date(order.expectedDate).toLocaleDateString('es-ES')}` : ''}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;">Artículo</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;">Cant.</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;">Precio</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table width="100%" style="margin-top:16px;">
      <tr><td style="text-align:right;padding:4px 12px;color:#666;font-size:14px;">Subtotal:</td>
          <td style="text-align:right;padding:4px 12px;width:100px;font-size:14px;">${Number(order.subtotal).toFixed(2)}€</td></tr>
      <tr><td style="text-align:right;padding:4px 12px;color:#666;font-size:14px;">IVA (${order.taxRate}%):</td>
          <td style="text-align:right;padding:4px 12px;width:100px;font-size:14px;">${Number(order.taxAmount).toFixed(2)}€</td></tr>
      <tr><td style="text-align:right;padding:8px 12px;font-size:18px;font-weight:700;border-top:2px solid #111;">Total:</td>
          <td style="text-align:right;padding:8px 12px;width:100px;font-size:18px;font-weight:700;border-top:2px solid #111;">${Number(order.total).toFixed(2)}€</td></tr>
    </table>
    ${order.notes ? `<div style="margin-top:20px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e;"><strong>Notas:</strong> ${order.notes}</div>` : ''}
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#aaa;font-size:12px;">${businessName || 'Vertial'} · Pedido generado automáticamente</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildOrderWhatsAppText(order) {
  const lines = [`*Pedido ${order.orderNumber}*`, ''];
  for (const item of (order.items || [])) {
    lines.push(`▸ ${item.name} × ${item.quantity} — ${Number(item.unitCost).toFixed(2)}€/u`);
  }
  lines.push('', `*Total: ${Number(order.total).toFixed(2)}€*`);
  if (order.expectedDate) {
    lines.push(`Entrega esperada: ${new Date(order.expectedDate).toLocaleDateString('es-ES')}`);
  }
  if (order.notes) lines.push('', `Notas: ${order.notes}`);
  return lines.join('\n');
}

export async function sendPurchaseOrder(req, res) {
  try {
    if (!canPerform(req, 'full')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para enviar pedidos' });
    }
    const { userId, orderId } = req.params;
    const { method, email: targetEmail } = req.body || {};
    if (!userId || !orderId) return badRequest(res, 'Faltan userId o orderId');
    if (!method) return badRequest(res, 'Falta el método de envío (email, whatsapp, portal)');

    const existing = await ensurePurchaseOrderOwner(req, userId, orderId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (!['draft', 'pending'].includes(String(existing.status || ''))) {
      return badRequest(res, `No se puede enviar un pedido en estado "${existing.status}"`);
    }

    const account = await findAccountByUserId(req, userId);
    const businessName = account?.businessName || account?.fullName || 'Vertial';

    const db = getCatalogDbName();
    let supplierDoc = null;
    if (existing.supplierId) {
      try { supplierDoc = await getDocument(req, db, existing.supplierId); } catch (_) {}
    }

    const recipientEmail = targetEmail || supplierDoc?.email;
    const supplierPhone = supplierDoc?.phone || '';

    if (method === 'email') {
      if (!recipientEmail) return badRequest(res, 'El proveedor no tiene email configurado');
      const html = buildOrderEmailHtml(existing, supplierDoc, businessName);
      await sendEmail({
        to: recipientEmail,
        subject: `Pedido de compra ${existing.orderNumber} — ${businessName}`,
        html,
      });
    }

    if (method === 'whatsapp') {
      const text = buildOrderWhatsAppText(existing);
      const phone = supplierPhone.replace(/[^0-9+]/g, '');
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      const now = new Date().toISOString();
      const doc = buildPurchaseOrderDocument(userId, {
        ...existing, status: 'sent', sentAt: now, sentVia: 'whatsapp',
      }, existing);
      const result = await putDocument(req, db, doc._id, doc);
      return res.json({ ok: true, waUrl, order: sanitizePurchaseOrder({ ...doc, _rev: result.rev }) });
    }

    if (method === 'portal') {
      const now = new Date().toISOString();
      const doc = buildPurchaseOrderDocument(userId, {
        ...existing, status: 'sent', sentAt: now, sentVia: 'portal',
      }, existing);
      const result = await putDocument(req, db, doc._id, doc);
      return res.json({ ok: true, order: sanitizePurchaseOrder({ ...doc, _rev: result.rev }) });
    }

    const now = new Date().toISOString();
    const doc = buildPurchaseOrderDocument(userId, {
      ...existing, status: 'sent', sentAt: now, sentVia: method,
    }, existing);
    const result = await putDocument(req, db, doc._id, doc);

    logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || '', targetUserId: userId,
      type: 'purchase_order', action: `Envió pedido ${existing.orderNumber} vía ${method}`,
      entityId: existing._id, entityLabel: existing.orderNumber,
      metadata: { method, supplierName: existing.supplierName },
    }).catch(() => null);

    return res.json({ ok: true, order: sanitizePurchaseOrder({ ...doc, _rev: result.rev }) });
  } catch (error) {
    logger.error({ tag: 'PO_SEND', err: error?.message }, 'Error enviando pedido');
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar pedido' });
  }
}

export async function createBulkPurchaseOrders(req, res) {
  try {
    if (!canPerform(req, 'create')) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para crear pedidos' });
    }
    const { userId } = req.params;
    const { orders: orderDataList } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(orderDataList) || orderDataList.length === 0) {
      return badRequest(res, 'Falta el array de pedidos');
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const createdOrders = [];
    const usedNumbers = (await listPurchaseOrdersByUser(req, userId)).map((o) => o.orderNumber);
    for (const orderData of orderDataList) {
      const businessId = String(
        orderData.businessId
        || orderData.business_id
        || resolveBusinessIdFromRequest(req)
        || '',
      ).trim();
      await assertPurchaseOrderReferences(req, userId, orderData, businessId);
      const orderNumber = String(orderData.orderNumber || '').trim()
        || nextPurchaseOrderNumber(usedNumbers);
      usedNumbers.push(orderNumber);
      const scopedOrder = stampOpsDoc({ ...orderData, orderNumber }, {
        ownerUserId: userId,
        businessId,
        salesPointId: orderData.salesPointId,
        workCenterId: orderData.workCenterId,
      });
      const doc = buildPurchaseOrderDocument(userId, scopedOrder);
      const result = await putDocument(req, db, doc._id, doc);
      createdOrders.push(sanitizePurchaseOrder({ ...doc, _rev: result.rev }));
    }

    logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName || '', targetUserId: userId,
      type: 'purchase_order', action: `Creó ${createdOrders.length} pedido(s) de compra en lote`,
      entityId: '', entityLabel: 'bulk_orders',
      metadata: { count: createdOrders.length },
    }).catch(() => null);

    return res.status(201).json({ ok: true, orders: createdOrders, created: createdOrders.length });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Error al crear pedidos en lote' });
  }
}
