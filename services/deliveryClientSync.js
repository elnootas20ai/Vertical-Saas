import {
  getClientsDbName,
  getDeliveryDbName,
  getDocument,
  putDocument,
  buildClientDocument,
  buildDeliveryOrderDocument,
  listDeliveryOrdersByUser,
  listScopedPointsOfSaleForBusiness,
  searchClientsByPhone,
  ensureDatabase,
} from './couchdb.js';
import {
  deliveryOrderMatchesClient,
  deliveryOrderRevenue,
  isCancelledDeliveryOrder,
} from '../shared/clients/deliveryClientMatch.js';
import { orderMatchesBusinessPdvs } from '../controllers/deliveryController.js';

function normalizeClientBusinessId(client) {
  return String(client?.businessId || client?.business_id || '').replace(/^business:/, '').trim();
}

/** Pedidos de la misma empresa que el cliente (evita mezclar demo/otras verticales). */
export async function scopeDeliveryOrdersToClientBusiness(req, userId, client, orders) {
  const bid = normalizeClientBusinessId(client);
  if (!bid) return orders;
  const businessPdvs = await listScopedPointsOfSaleForBusiness(req, userId, bid, { includeInactive: true });
  if (!businessPdvs.length) return [];
  return orders.filter((o) => orderMatchesBusinessPdvs(o, businessPdvs));
}

export async function scopeDeliveryOrdersToBusinessId(req, userId, businessId, orders) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return orders;
  const businessPdvs = await listScopedPointsOfSaleForBusiness(req, userId, bid, { includeInactive: true });
  if (!businessPdvs.length) return [];
  return orders.filter((o) => orderMatchesBusinessPdvs(o, businessPdvs));
}

const LOYALTY_THRESHOLDS = { silver: 100, gold: 300, platinum: 600 };

function computeLoyaltyLevel(points) {
  if (points >= LOYALTY_THRESHOLDS.platinum) return 'platinum';
  if (points >= LOYALTY_THRESHOLDS.gold) return 'gold';
  if (points >= LOYALTY_THRESHOLDS.silver) return 'silver';
  return 'bronze';
}

function computeOrderFrequencyDays(dates) {
  if (dates.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < dates.length; i += 1) {
    gaps.push((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
  }
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

export async function linkOrphanOrdersToClient(req, userId, clientId, clientPhone, ordersOpt) {
  const deliveryDb = getDeliveryDbName();
  await ensureDatabase(req, deliveryDb);
  const orders = ordersOpt ?? await listDeliveryOrdersByUser(req, userId);
  let linked = 0;
  for (const order of orders) {
    if (String(order?.clientId || '').trim() || isCancelledDeliveryOrder(order)) continue;
    if (!deliveryOrderMatchesClient(order, clientId, clientPhone)) continue;
    const updated = buildDeliveryOrderDocument(userId, { ...order, clientId }, order);
    await putDocument(req, deliveryDb, updated._id, updated);
    linked += 1;
  }
  return linked;
}

export function computeClientDeliveryMetrics(client, orders) {
  const clientId = String(client._id || client.id || '').trim();
  const phone = client.phone;
  const matched = (orders || []).filter(
    (o) => deliveryOrderMatchesClient(o, clientId, phone) && !isCancelledDeliveryOrder(o),
  );

  const totalSpent = matched.reduce((s, o) => s + deliveryOrderRevenue(o), 0);
  const dates = matched.map((o) => o.createdAt).filter(Boolean).sort();
  const lastOrderDate = dates.length > 0 ? dates[dates.length - 1] : null;
  const deliveredOrders = matched.filter((o) => String(o.status || '').toLowerCase() === 'entregado');
  const deliveredRevenue = deliveredOrders.reduce((s, o) => s + deliveryOrderRevenue(o), 0);
  const points = Math.floor(deliveredRevenue);
  const storedPoints = Number(client.loyalty?.points || 0);
  const effectivePoints = storedPoints > points ? storedPoints : points;

  const stats = {
    totalOrders: matched.length,
    lastOrderDate,
    orderFrequencyDays: computeOrderFrequencyDays(dates),
    favoriteAddressId: client.stats?.favoriteAddressId || null,
    totalSpent: Number(totalSpent.toFixed(2)),
    createdFrom: client.stats?.createdFrom || 'crm',
  };

  const loyalty = {
    enrolled: Boolean(client.loyalty?.enrolled || matched.length > 0),
    enrolledAt: client.loyalty?.enrolledAt || (matched.length > 0 ? (client.createdAt || new Date().toISOString()) : null),
    points: effectivePoints,
    level: computeLoyaltyLevel(effectivePoints),
    totalVisits: deliveredOrders.length,
  };

  return { stats, loyalty };
}

/** Enriquece fila de listado (sanitizeClientSummary) con stats reales desde pedidos. */
export function enrichClientRowWithLiveDeliveryStats(clientRow, orders) {
  const { stats, loyalty } = computeClientDeliveryMetrics(
    {
      _id: clientRow.id,
      id: clientRow.id,
      phone: clientRow.phone,
      stats: clientRow.stats,
      loyalty: clientRow.loyalty,
      createdAt: clientRow.createdAt,
    },
    orders,
  );
  return {
    ...clientRow,
    stats: {
      totalOrders: stats.totalOrders,
      lastOrderDate: stats.lastOrderDate,
      totalSpent: stats.totalSpent,
    },
    loyalty: {
      enrolled: loyalty.enrolled,
      points: loyalty.points,
      level: loyalty.level,
    },
  };
}

export async function syncClientFromDeliveryOrders(req, userId, clientId) {
  const clientsDb = getClientsDbName();
  await ensureDatabase(req, clientsDb);

  let client;
  try {
    client = await getDocument(req, clientsDb, clientId);
  } catch {
    return null;
  }
  if (!client || client.type !== 'client' || client.user_id !== userId || client.deletedAt) {
    return null;
  }

  const allOrders = await listDeliveryOrdersByUser(req, userId);
  const scopedOrders = await scopeDeliveryOrdersToClientBusiness(req, userId, client, allOrders);

  await linkOrphanOrdersToClient(req, userId, clientId, client.phone, scopedOrders);

  const orders = scopedOrders.filter(
    (o) => deliveryOrderMatchesClient(o, clientId, client.phone) && !isCancelledDeliveryOrder(o),
  );

  const { stats, loyalty } = computeClientDeliveryMetrics(client, orders);

  const doc = buildClientDocument(userId, { ...client, stats, loyalty }, client);
  const saved = await putDocument(req, clientsDb, doc._id, doc);
  return { ...doc, _rev: saved.rev };
}

export async function syncClientAfterDeliveryOrder(req, userId, order) {
  if (!order) return null;

  let clientId = String(order.clientId || '').trim();

  if (!clientId && order.customerPhone) {
    const matches = await searchClientsByPhone(req, userId, order.customerPhone, 5);
    if (matches.length === 1) {
      clientId = matches[0]._id || matches[0].id;
      const deliveryDb = getDeliveryDbName();
      await ensureDatabase(req, deliveryDb);
      const linked = buildDeliveryOrderDocument(userId, { ...order, clientId }, order);
      await putDocument(req, deliveryDb, linked._id, linked);
    }
  }

  if (!clientId) return null;
  return syncClientFromDeliveryOrders(req, userId, clientId);
}
