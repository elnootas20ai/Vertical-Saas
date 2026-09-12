import {
  ensureDatabase,
  findAccountByUserId,
  getDocument,
  putDocument,
} from '../couchdb.js';
import {
  addComandaToOrder,
  buildDiningOrderDocument,
  buildDiningTableDocument,
  getSalaDbName,
  listDiningOrdersByUser,
  sanitizeDiningOrder,
  sanitizeDiningTable,
  routeDraftComandasToProductionAreas,
} from '../salaService.js';
import { findDiningTableByQrToken } from '../mesaQrService.js';
import { broadcastToBusiness, broadcastToUser } from '../sseService.js';
import { accountHasRestaurantFeature } from '../../shared/billing/restaurantPlanFeatures.js';

function businessIdOf(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function sourceMarker(publicOrderId) {
  return `[public-order:${publicOrderId}]`;
}

function findSourceComanda(orders, marker) {
  for (const order of orders) {
    const comanda = (order.comandas || []).find((item) => String(item.notes || '').includes(marker));
    if (comanda) return { order, comanda };
  }
  return null;
}

async function restaurantStationRoutingIsPro(req, ownerUserId) {
  const account = await findAccountByUserId(req, ownerUserId).catch(() => null);
  return accountHasRestaurantFeature(account, 'production_stations');
}

function routePublicComanda(diningOrder, added, publicItems, hasProAccess, sentAt) {
  const catalogByProductId = new Map(
    (publicItems || []).map((item) => [
      String(item.id || item.catalogItemId || ''),
      item,
    ]),
  );
  return routeDraftComandasToProductionAreas(
    { ...diningOrder, comandas: added.comandas },
    {
      comandaIds: [added.comanda.id],
      catalogByProductId,
      hasProAccess,
      sentAt,
    },
  );
}

export async function acceptRestaurantPublicOrder(req, context) {
  const { order: publicOrder, ownerUserId, businessId } = context;
  const marker = sourceMarker(publicOrder._id);
  const orders = await listDiningOrdersByUser(req, ownerUserId, {
    businessId,
    maxDocs: 10_000,
  });
  const alreadyLinked = findSourceComanda(orders, marker);
  if (alreadyLinked) {
    return {
      linkedDiningOrderId: alreadyLinked.order._id,
      linkedComandaId: alreadyLinked.comanda.id,
      diningOrder: sanitizeDiningOrder(alreadyLinked.order),
    };
  }

  const table = await findDiningTableByQrToken(req, publicOrder.mesaToken);
  if (
    !table
    || String(table._id) !== String(publicOrder.tableId)
    || businessIdOf(table.businessId) !== businessIdOf(businessId)
    || String(table.user_id || '') !== String(ownerUserId)
  ) {
    const error = new Error('El QR de la mesa ya no es válido');
    error.status = 409;
    throw error;
  }

  const activeStatuses = new Set(['open', 'served', 'pending_payment']);
  let diningOrder = orders.find(
    (item) => String(item.tableId) === String(table._id) && activeStatuses.has(item.status),
  );
  if (!diningOrder) {
    diningOrder = buildDiningOrderDocument(ownerUserId, {
      _id: `dining-public-${publicOrder._id}`,
      businessId,
      tableId: table._id,
      tableNumber: table.number,
      tableName: table.name,
      zone: table.zone,
      guests: Math.max(1, Number(publicOrder.guests || 1)),
      status: 'open',
      createdBy: 'public-qr',
      createdByName: String(publicOrder.customerName || 'Cliente QR'),
    });
  }

  const now = new Date().toISOString();
  const hasProAccess = await restaurantStationRoutingIsPro(req, ownerUserId);
  const added = addComandaToOrder(diningOrder, {
    id: `public-${publicOrder._id}`,
    items: (publicOrder.items || []).map((item) => ({
      productId: item.id,
      name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
      category: item.category,
      taxRate: item.taxRate,
      productionArea: item.productionArea,
      status: 'pending',
    })),
    createdBy: 'public-qr',
    createdByName: String(publicOrder.customerName || 'Cliente QR'),
    notes: `${marker}${publicOrder.notes ? ` ${publicOrder.notes}` : ''}`,
  });
  const routed = routePublicComanda(diningOrder, added, publicOrder.items, hasProAccess, now);
  const updatedOrder = buildDiningOrderDocument(ownerUserId, {
    ...diningOrder,
    comandas: routed.comandas,
    status: 'open',
  }, diningOrder._rev ? diningOrder : null);

  const db = getSalaDbName();
  await ensureDatabase(req, db);
  let savedOrderResult;
  try {
    savedOrderResult = await putDocument(req, db, updatedOrder._id, updatedOrder);
  } catch (error) {
    if (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || ''))) {
      const fresh = await getDocument(req, db, updatedOrder._id);
      const linked = findSourceComanda([fresh], marker);
      if (linked) {
        return {
          linkedDiningOrderId: fresh._id,
          linkedComandaId: linked.comanda.id,
          diningOrder: sanitizeDiningOrder(fresh),
        };
      }
    }
    throw error;
  }
  const savedOrder = { ...updatedOrder, _rev: savedOrderResult.rev };

  const updatedTable = buildDiningTableDocument(
    ownerUserId,
    { ...sanitizeDiningTable(table), status: 'occupied', currentOrderId: savedOrder._id },
    table,
  );
  // La cuenta/comanda es la operación crítica. Un cambio concurrente de la mesa
  // no debe convertir un pedido ya enviado a cocina en un falso error de aceptación.
  await putDocument(req, db, updatedTable._id, updatedTable).catch(() => null);

  const payload = { order: sanitizeDiningOrder(savedOrder), comandaId: added.comanda.id };
  broadcastToUser(ownerUserId, diningOrder._rev ? 'sala_order_updated' : 'sala_order_created', payload.order);
  broadcastToBusiness(businessId, diningOrder._rev ? 'sala:order_updated' : 'sala:order_created', payload);
  broadcastToBusiness(businessId, 'sala:comanda_sent', payload);

  return {
    linkedDiningOrderId: savedOrder._id,
    linkedComandaId: added.comanda.id,
    diningOrder: payload.order,
  };
}

export async function acceptRestaurantTakeawayPublicOrder(req, context) {
  const { order: publicOrder, ownerUserId, businessId } = context;
  const marker = sourceMarker(publicOrder._id);
  const orders = await listDiningOrdersByUser(req, ownerUserId, {
    businessId,
    maxDocs: 10_000,
  });
  const alreadyLinked = findSourceComanda(orders, marker);
  if (alreadyLinked) {
    return {
      linkedDiningOrderId: alreadyLinked.order._id,
      linkedComandaId: alreadyLinked.comanda.id,
      diningOrder: sanitizeDiningOrder(alreadyLinked.order),
    };
  }

  const now = new Date().toISOString();
  const hasProAccess = await restaurantStationRoutingIsPro(req, ownerUserId);
  const channelLabel = publicOrder.orderType === 'delivery' ? 'A domicilio' : 'Recogida';
  const diningOrder = buildDiningOrderDocument(ownerUserId, {
    _id: `dining-takeaway-public-${publicOrder._id}`,
    businessId,
    tableId: '',
    tableNumber: 0,
    tableName: `${channelLabel} · ${publicOrder.orderNumber || 'WEB'}`,
    zone: channelLabel,
    guests: 1,
    status: 'open',
    createdBy: 'public-web',
    createdByName: String(publicOrder.customerName || 'Cliente web'),
    clientName: String(publicOrder.customerName || ''),
    notes: [
      publicOrder.customerPhone ? `Tel. ${publicOrder.customerPhone}` : '',
      publicOrder.customerAddress || '',
      publicOrder.notes || '',
    ].filter(Boolean).join(' · '),
  });
  const added = addComandaToOrder(diningOrder, {
    id: `public-${publicOrder._id}`,
    items: (publicOrder.items || []).map((item) => ({
      productId: item.id,
      name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
      category: item.category,
      taxRate: item.taxRate,
      productionArea: item.productionArea,
      status: 'pending',
    })),
    createdBy: 'public-web',
    createdByName: String(publicOrder.customerName || 'Cliente web'),
    notes: marker,
  });
  const routed = routePublicComanda(diningOrder, added, publicOrder.items, hasProAccess, now);
  const doc = buildDiningOrderDocument(ownerUserId, {
    ...diningOrder,
    comandas: routed.comandas,
  });
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  let result;
  try {
    result = await putDocument(req, db, doc._id, doc);
  } catch (error) {
    if (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || ''))) {
      const fresh = await getDocument(req, db, doc._id);
      const linked = findSourceComanda([fresh], marker);
      if (linked) {
        return {
          linkedDiningOrderId: fresh._id,
          linkedComandaId: linked.comanda.id,
          diningOrder: sanitizeDiningOrder(fresh),
        };
      }
    }
    throw error;
  }
  const saved = sanitizeDiningOrder({ ...doc, _rev: result.rev });
  const payload = { order: saved, comandaId: added.comanda.id };
  broadcastToUser(ownerUserId, 'sala_order_created', saved);
  broadcastToBusiness(businessId, 'sala:order_created', payload);
  broadcastToBusiness(businessId, 'sala:comanda_sent', payload);
  return {
    linkedDiningOrderId: saved._id,
    linkedComandaId: added.comanda.id,
    diningOrder: saved,
  };
}
