/**
 * Traspasos de stock entre tiendas (PDV → PDV, misma cuenta/empresa).
 * Flujo: enviar (en camino, stock sale del origen) → recibir (stock entra en destino,
 * se calcula el tiempo en tránsito) o cancelar (el stock vuelve al origen).
 * Sin automatismos de servidor: solo eventos al crear/recibir/cancelar.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  getCatalogDbName,
  getDeliveryDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  getAllDocuments,
  listPointsOfSaleByUser,
  pdvDocMatchesUser,
  buildNotificationDocument,
  saveNotification,
  sanitizeNotification,
  NOTIFICATIONS_DB,
} from './couchdb.js';
import { recordMovement } from './stockMovementService.js';
import { resolveWarehouseIdForSalesPoint } from './storeWarehouseService.js';
import { broadcastToUser, broadcastToBusiness } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

export const STORE_TRANSFER_STATUSES = ['in_transit', 'received', 'cancelled'];

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function sanitizeTransferItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((it) => ({
      catalogItemId: String(it?.catalogItemId || '').trim(),
      name: String(it?.name || '').trim(),
      sku: String(it?.sku || '').trim(),
      unit: String(it?.unit || '').trim(),
      quantity: Math.abs(Number(it?.quantity || 0)),
    }))
    .filter((it) => it.catalogItemId && it.quantity > 0);
}

export function sanitizeStoreTransfer(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    id: doc._id,
    type: 'store_transfer',
    user_id: doc.user_id,
    businessId: doc.businessId || '',
    status: STORE_TRANSFER_STATUSES.includes(doc.status) ? doc.status : 'in_transit',
    fromPdvId: doc.fromPdvId || '',
    fromPdvName: doc.fromPdvName || '',
    fromWarehouseId: doc.fromWarehouseId || '',
    toPdvId: doc.toPdvId || '',
    toPdvName: doc.toPdvName || '',
    toWarehouseId: doc.toWarehouseId || '',
    items: sanitizeTransferItems(doc.items),
    notes: doc.notes || '',
    sentAt: doc.sentAt || doc.createdAt || '',
    sentBy: doc.sentBy || '',
    receivedAt: doc.receivedAt || null,
    receivedBy: doc.receivedBy || '',
    cancelledAt: doc.cancelledAt || null,
    cancelledBy: doc.cancelledBy || '',
    transitSeconds: Number(doc.transitSeconds || 0),
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

async function loadOwnedPdv(req, userId, pdvId) {
  const id = String(pdvId || '').trim();
  if (!id) return null;
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, id);
  if (!doc || doc.type !== 'point_of_sale' || doc.deletedAt) return null;
  if (!pdvDocMatchesUser(doc, userId)) return null;
  return doc;
}

function pdvLabel(pdv) {
  const name = String(pdv?.name || '').trim();
  const code = String(pdv?.code || '').trim();
  if (name && code) return `${name} · ${code}`;
  return name || code || 'Tienda';
}

/**
 * Notificación persistente + SSE + push. kind: 'incoming' | 'received' | 'cancelled'.
 * SSE dedicado 'store_transfer_updated' para que el TPV suene/refresque;
 * 'notification' para la campana del SaaS.
 */
async function notifyStoreTransfer(req, userId, transfer, kind) {
  try {
    const itemsSummary = transfer.items
      .slice(0, 3)
      .map((it) => `${it.quantity} × ${it.name || 'artículo'}`)
      .join(', ');
    const more = transfer.items.length > 3 ? ` y ${transfer.items.length - 3} más` : '';

    let title;
    let message;
    let level = 'info';
    if (kind === 'incoming') {
      title = `Traspaso en camino a ${transfer.toPdvName || 'tienda'}`;
      message = `${transfer.fromPdvName || 'Otra tienda'} envía: ${itemsSummary}${more}`;
    } else if (kind === 'received') {
      const mins = Math.max(1, Math.round(Number(transfer.transitSeconds || 0) / 60));
      title = `Traspaso recibido en ${transfer.toPdvName || 'tienda'}`;
      message = `Recibido en ${mins} min · ${itemsSummary}${more}`;
      level = 'success';
    } else {
      title = `Traspaso cancelado (${transfer.fromPdvName || 'tienda'})`;
      message = `El stock vuelve al origen · ${itemsSummary}${more}`;
      level = 'warning';
    }

    const notification = buildNotificationDocument({
      userId,
      level,
      category: 'store_transfer',
      source: 'stock',
      businessId: transfer.businessId || '',
      title,
      message,
      entityId: transfer._id,
      entityType: 'store_transfer',
      route: '/saas/compras-stock?tab=movimientos',
      metadata: {
        kind: `store_transfer_${kind}`,
        fromPdvId: transfer.fromPdvId,
        toPdvId: transfer.toPdvId,
        transitSeconds: transfer.transitSeconds || 0,
      },
    });
    await ensureDatabase(req, NOTIFICATIONS_DB);
    const saved = await saveNotification(req, notification);
    const sanitizedNotif = sanitizeNotification(saved);
    broadcastToUser(userId, 'notification', sanitizedNotif);

    const payload = { ...sanitizeStoreTransfer(transfer), kind };
    broadcastToUser(userId, 'store_transfer_updated', payload);
    const bid = normalizeBusinessScopeId(transfer.businessId);
    if (bid) {
      // El TPV puede conectarse con businessId bare o prefijado; el dueño ya recibió el suyo.
      broadcastToBusiness(bid, 'store_transfer_updated', payload, userId);
      broadcastToBusiness(`business:${bid}`, 'store_transfer_updated', payload, userId);
    }

    sendPushToUser(req, userId, {
      title,
      body: message,
      data: { route: '/saas/compras-stock?tab=movimientos', notificationId: sanitizedNotif.id },
    }).catch(() => null);
  } catch (err) {
    logger.warn({ tag: 'STORE_TRANSFER', err: err?.message }, 'Error notificando traspaso');
  }
}

/** PDVs destino válidos: activos, de la misma cuenta y (si se conoce) misma empresa que el origen. */
export async function listStoreTransferDestinations(req, userId, fromPdvId) {
  const pdvs = await listPointsOfSaleByUser(req, userId);
  const active = (pdvs || []).filter((p) => p && !p.deletedAt && p.active !== false);
  const from = active.find((p) => p._id === String(fromPdvId || '').trim()) || null;
  const fromBid = normalizeBusinessScopeId(from?.businessId || from?.business_id);
  return active
    .filter((p) => p._id !== String(fromPdvId || '').trim())
    .filter((p) => {
      if (!fromBid) return true;
      const bid = normalizeBusinessScopeId(p.businessId || p.business_id);
      // PDVs legacy sin empresa: se permiten (cuentas de una sola empresa).
      return !bid || bid === fromBid;
    })
    .map((p) => ({
      pdvId: p._id,
      name: p.name || '',
      code: p.code || '',
      businessId: normalizeBusinessScopeId(p.businessId || p.business_id),
    }));
}

export async function listStoreTransfersByUser(req, userId, filters = {}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);

  let transfers = docs.filter(
    (doc) => doc?.type === 'store_transfer' && doc?.user_id === userId,
  );

  const pdvId = String(filters.pdvId || '').trim();
  if (pdvId) {
    transfers = transfers.filter((t) => t.fromPdvId === pdvId || t.toPdvId === pdvId);
  }
  if (filters.status) {
    transfers = transfers.filter((t) => t.status === filters.status);
  }

  return transfers
    .sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')))
    .map(sanitizeStoreTransfer);
}

export async function createStoreTransfer(req, userId, data = {}) {
  const fromPdvId = String(data.fromPdvId || '').trim();
  const toPdvId = String(data.toPdvId || '').trim();
  const items = sanitizeTransferItems(data.items);
  const performedBy = String(data.performedBy || '').trim();

  if (!fromPdvId || !toPdvId) throw new Error('Faltan tienda de origen y destino');
  if (fromPdvId === toPdvId) throw new Error('La tienda de origen y destino deben ser distintas');
  if (items.length === 0) throw new Error('Añade al menos un artículo con cantidad');

  const [fromPdv, toPdv] = await Promise.all([
    loadOwnedPdv(req, userId, fromPdvId),
    loadOwnedPdv(req, userId, toPdvId),
  ]);
  if (!fromPdv) throw new Error('Tienda de origen no encontrada');
  if (!toPdv) throw new Error('Tienda de destino no encontrada');

  const fromBid = normalizeBusinessScopeId(fromPdv.businessId || fromPdv.business_id);
  const toBid = normalizeBusinessScopeId(toPdv.businessId || toPdv.business_id);
  if (fromBid && toBid && fromBid !== toBid) {
    throw new Error('No se puede traspasar stock entre empresas distintas');
  }

  const [fromWarehouseId, toWarehouseId] = await Promise.all([
    resolveWarehouseIdForSalesPoint(req, userId, fromPdvId),
    resolveWarehouseIdForSalesPoint(req, userId, toPdvId),
  ]);
  if (!fromWarehouseId) throw new Error('La tienda de origen no tiene almacén');
  if (!toWarehouseId) throw new Error('La tienda de destino no tiene almacén');

  const now = new Date().toISOString();
  const transferId = `stransfer-${uuidv4()}`;
  const doc = {
    _id: transferId,
    type: 'store_transfer',
    id: transferId,
    user_id: userId,
    businessId: fromBid || toBid || '',
    status: 'in_transit',
    fromPdvId,
    fromPdvName: pdvLabel(fromPdv),
    fromWarehouseId,
    toPdvId,
    toPdvName: pdvLabel(toPdv),
    toWarehouseId,
    items,
    notes: String(data.notes || '').trim(),
    sentAt: now,
    sentBy: performedBy,
    receivedAt: null,
    receivedBy: '',
    cancelledAt: null,
    cancelledBy: '',
    transitSeconds: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Salida del origen al enviar: el stock «en camino» ya no está en la tienda origen.
  for (const item of items) {
    await recordMovement(req, userId, {
      catalogItemId: item.catalogItemId,
      movementType: 'transfer_out',
      quantity: item.quantity,
      warehouseId: fromWarehouseId,
      warehouseToId: toWarehouseId,
      referenceId: transferId,
      referenceType: 'store_transfer',
      notes: `Traspaso a ${doc.toPdvName}`,
      performedBy,
    });
  }

  const catalogDb = getCatalogDbName();
  await ensureDatabase(req, catalogDb);
  await putDocument(req, catalogDb, doc._id, doc);

  logger.info(
    { tag: 'STORE_TRANSFER', transferId, fromPdvId, toPdvId, items: items.length, userId },
    'Traspaso creado (en camino)',
  );

  await notifyStoreTransfer(req, userId, doc, 'incoming');
  return sanitizeStoreTransfer(doc);
}

async function loadOwnedTransfer(req, userId, transferId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, String(transferId || '').trim());
  if (!doc || doc.type !== 'store_transfer' || doc.user_id !== userId) return null;
  return doc;
}

export async function receiveStoreTransfer(req, userId, transferId, data = {}) {
  const doc = await loadOwnedTransfer(req, userId, transferId);
  if (!doc) throw new Error('Traspaso no encontrado');
  if (doc.status !== 'in_transit') throw new Error('Este traspaso ya no está en camino');

  const performedBy = String(data.performedBy || '').trim();
  const items = sanitizeTransferItems(doc.items);

  for (const item of items) {
    await recordMovement(req, userId, {
      catalogItemId: item.catalogItemId,
      movementType: 'transfer_in',
      quantity: item.quantity,
      warehouseId: doc.toWarehouseId,
      referenceId: doc._id,
      referenceType: 'store_transfer',
      notes: `Traspaso desde ${doc.fromPdvName || 'otra tienda'}`,
      performedBy,
    });
  }

  const now = new Date();
  const sentAtMs = Date.parse(doc.sentAt || doc.createdAt || '') || now.getTime();
  const updated = {
    ...doc,
    status: 'received',
    receivedAt: now.toISOString(),
    receivedBy: performedBy,
    transitSeconds: Math.max(0, Math.round((now.getTime() - sentAtMs) / 1000)),
    updatedAt: now.toISOString(),
  };

  const db = getCatalogDbName();
  await putDocument(req, db, updated._id, updated);

  logger.info(
    { tag: 'STORE_TRANSFER', transferId: updated._id, transitSeconds: updated.transitSeconds, userId },
    'Traspaso recibido',
  );

  await notifyStoreTransfer(req, userId, updated, 'received');
  return sanitizeStoreTransfer(updated);
}

export async function cancelStoreTransfer(req, userId, transferId, data = {}) {
  const doc = await loadOwnedTransfer(req, userId, transferId);
  if (!doc) throw new Error('Traspaso no encontrado');
  if (doc.status !== 'in_transit') throw new Error('Solo se puede cancelar un traspaso en camino');

  const performedBy = String(data.performedBy || '').trim();
  const items = sanitizeTransferItems(doc.items);

  // El stock vuelve al almacén de origen.
  for (const item of items) {
    await recordMovement(req, userId, {
      catalogItemId: item.catalogItemId,
      movementType: 'transfer_in',
      quantity: item.quantity,
      warehouseId: doc.fromWarehouseId,
      referenceId: doc._id,
      referenceType: 'store_transfer',
      notes: `Traspaso cancelado (vuelve a ${doc.fromPdvName || 'origen'})`,
      performedBy,
    });
  }

  const now = new Date().toISOString();
  const updated = {
    ...doc,
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: performedBy,
    updatedAt: now,
  };

  const db = getCatalogDbName();
  await putDocument(req, db, updated._id, updated);

  logger.info(
    { tag: 'STORE_TRANSFER', transferId: updated._id, userId },
    'Traspaso cancelado',
  );

  await notifyStoreTransfer(req, userId, updated, 'cancelled');
  return sanitizeStoreTransfer(updated);
}
