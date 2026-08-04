/**
 * CRM stats bar/restaurante desde cuentas de mesa (dining_order).
 * Aislado de deliveryClientSync — no mezclar lógica de reparto.
 */
import { listDiningOrdersByUser } from './salaService.js';
import { enrichClientRowWithLiveDeliveryStats } from './deliveryClientSync.js';
import { applyRedeemedPointsToLoyalty } from './restaurantLoyaltyRedeem.js';
import {
  getClientsDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  buildClientDocument,
} from './couchdb.js';
import logger from './logger.js';

function normalizeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function diningOrderMatchesClient(order, clientId, clientPhone) {
  const oid = String(order?.clientId || '').trim();
  if (oid && oid === String(clientId || '').trim()) return true;
  const phone = String(clientPhone || '').replace(/\D/g, '');
  const orderPhone = String(order?.clientPhone || order?.customerPhone || '').replace(/\D/g, '');
  return Boolean(phone && orderPhone && phone.length >= 9 && phone === orderPhone);
}

function isClosedDiningOrder(order) {
  const st = String(order?.status || '').toLowerCase();
  return st === 'closed' || st === 'paid' || st === 'cancelled';
}

function diningOrderRevenue(order) {
  const total = Number(order?.total || 0);
  if (Number.isFinite(total) && total > 0) return total;
  const paid = (order?.payments || []).reduce((s, p) => s + Number(p?.amount || 0), 0);
  return Number.isFinite(paid) ? paid : 0;
}

/** Pedidos de mesa facturables para CRM (pagados/cerrados). */
export function filterCrmDiningOrders(orders, businessId) {
  const bid = normalizeId(businessId);
  return (orders || []).filter((o) => {
    if (!o || o.deletedAt) return false;
    const st = String(o.status || '').toLowerCase();
    if (st === 'cancelled') return false;
    if (!(st === 'closed' || st === 'paid' || Number(o.paidAmount || 0) > 0 || (o.payments || []).length > 0)) {
      return false;
    }
    if (!bid) return true;
    return normalizeId(o.businessId || o.business_id) === bid;
  });
}

export function computeClientDiningMetrics(client, orders) {
  const clientId = String(client._id || client.id || '').trim();
  const phone = client.phone;
  const matched = (orders || []).filter((o) => diningOrderMatchesClient(o, clientId, phone));

  const totalSpent = matched.reduce((s, o) => s + diningOrderRevenue(o), 0);
  const dates = matched
    .map((o) => o.closedAt || o.paidAt || o.updatedAt || o.createdAt)
    .filter(Boolean)
    .sort();
  const lastOrderDate = dates.length > 0 ? dates[dates.length - 1] : null;

  // Adaptar a forma delivery para reutilizar enrichClientRowWithLiveDeliveryStats shape
  const pseudoOrders = matched.map((o) => ({
    clientId,
    customerPhone: phone,
    totalAmount: diningOrderRevenue(o),
    status: 'entregado',
    createdAt: o.closedAt || o.paidAt || o.createdAt,
    deliveryType: 'sala',
  }));

  return { matched, pseudoOrders, totalSpent, lastOrderDate };
}

export function enrichClientRowWithLiveDiningStats(clientRow, diningOrders) {
  const { pseudoOrders } = computeClientDiningMetrics(
    {
      _id: clientRow.id,
      id: clientRow.id,
      phone: clientRow.phone,
      stats: clientRow.stats,
      loyalty: clientRow.loyalty,
      createdAt: clientRow.createdAt,
    },
    diningOrders,
  );
  if (pseudoOrders.length === 0) return clientRow;
  return enrichClientRowWithLiveDeliveryStats(clientRow, pseudoOrders);
}

/** Combina stats delivery + sala sin pisar el mayor gasto. */
export function mergeClientLiveStats(baseRow, fromDelivery, fromDining) {
  const a = fromDelivery?.stats || baseRow.stats || {};
  const b = fromDining?.stats || {};
  const totalOrders = Number(a.totalOrders || 0) + Number(b.totalOrders || 0);
  const totalSpent = Number(a.totalSpent || 0) + Number(b.totalSpent || 0);
  const dates = [a.lastOrderDate, b.lastOrderDate].filter(Boolean).sort();
  const lastOrderDate = dates.length ? dates[dates.length - 1] : null;
  const loyaltyPts = Math.max(
    Number(fromDelivery?.loyalty?.points || 0),
    Number(fromDining?.loyalty?.points || 0),
    Math.floor(totalSpent),
  );
  return {
    ...baseRow,
    ...(fromDelivery || {}),
    ...(fromDining || {}),
    stats: {
      ...(baseRow.stats || {}),
      ...a,
      ...b,
      totalOrders,
      totalSpent: Number(totalSpent.toFixed(2)),
      lastOrderDate,
    },
    loyalty: {
      ...(baseRow.loyalty || {}),
      ...(fromDelivery?.loyalty || {}),
      ...(fromDining?.loyalty || {}),
      enrolled: Boolean(
        fromDelivery?.loyalty?.enrolled
        || fromDining?.loyalty?.enrolled
        || totalOrders > 0,
      ),
      points: loyaltyPts,
    },
  };
}

export async function loadDiningOrdersForClientCrm(req, userId, businessId) {
  const all = await listDiningOrdersByUser(req, userId, {});
  return filterCrmDiningOrders(all, businessId);
}

/** Recalcula stats/loyalty del cliente desde cuentas de mesa cobradas. */
export async function syncClientFromDiningOrders(req, userId, clientId) {
  const cid = String(clientId || '').trim();
  if (!cid || cid.startsWith('tpv-')) return null;

  const clientsDb = getClientsDbName();
  await ensureDatabase(req, clientsDb);
  let client;
  try {
    client = await getDocument(req, clientsDb, cid);
  } catch {
    return null;
  }
  if (!client || client.type !== 'client' || client.user_id !== userId || client.deletedAt) {
    return null;
  }

  const businessId = normalizeId(client.businessId || client.business_id);
  const all = await listDiningOrdersByUser(req, userId, {});
  const diningOrders = filterCrmDiningOrders(all, businessId);
  const enriched = enrichClientRowWithLiveDiningStats(
    {
      id: cid,
      phone: client.phone,
      stats: client.stats,
      loyalty: client.loyalty,
      createdAt: client.createdAt,
    },
    diningOrders,
  );

  // Puntos ganados ≈ € cobrados; canjes restan vía redeemedPoints (no reescribir al sync).
  const earned = Math.max(
    0,
    Math.floor(Number(enriched.stats?.totalSpent || client.stats?.totalSpent || 0)),
  );
  const loyalty = applyRedeemedPointsToLoyalty(
    {
      ...(enriched.loyalty || {}),
      ...(client.loyalty || {}),
      enrolled: Boolean(enriched.loyalty?.enrolled || client.loyalty?.enrolled || earned > 0),
      redeemedPoints: Number(client.loyalty?.redeemedPoints || 0),
    },
    earned,
  );

  const doc = buildClientDocument(
    userId,
    {
      ...client,
      stats: enriched.stats || client.stats,
      loyalty,
    },
    client,
  );
  const saved = await putDocument(req, clientsDb, doc._id, doc);
  return { ...doc, _rev: saved.rev };
}

/** Tras cobrar cuenta de mesa: actualiza puntos CRM si hay cliente vinculado. */
export async function syncClientAfterDiningOrder(req, userId, order) {
  if (!order) return null;
  const clientId = String(order.clientId || '').trim();
  if (!clientId || clientId.startsWith('tpv-')) return null;
  try {
    return await syncClientFromDiningOrders(req, userId, clientId);
  } catch (err) {
    logger.warn({
      tag: 'DINING_LOYALTY',
      orderId: order._id,
      err: err?.message,
    }, 'No se pudo sync loyalty mesa');
    return null;
  }
}

export { isClosedDiningOrder, diningOrderMatchesClient, diningOrderRevenue };
