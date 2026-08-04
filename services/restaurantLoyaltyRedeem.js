/**
 * Canje de puntos loyalty en cuentas de mesa (bar/restaurante).
 * 1 punto = 0,10 € de descuento (10 pts = 1 €).
 */
import {
  getClientsDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  buildClientDocument,
} from './couchdb.js';
import logger from './logger.js';

export const LOYALTY_EURO_PER_POINT = 0.1;

export function loyaltyDiscountFromPoints(points) {
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  return Math.round(pts * LOYALTY_EURO_PER_POINT * 100) / 100;
}

export function loyaltyPointsForDiscount(euroAmount) {
  const euros = Math.max(0, Number(euroAmount) || 0);
  if (!(euros > 0) || !(LOYALTY_EURO_PER_POINT > 0)) return 0;
  return Math.ceil(euros / LOYALTY_EURO_PER_POINT);
}

/**
 * Debita puntos del cliente y acumula redeemedPoints (para no reescribir el saldo al sync).
 * @returns {{ client, pointsDebited, discountEuro } | null}
 */
export async function redeemClientLoyaltyPoints(req, userId, {
  clientId,
  points,
  orderId = '',
  reason = '',
}) {
  const cid = String(clientId || '').trim();
  const toRedeem = Math.max(0, Math.floor(Number(points) || 0));
  if (!cid || cid.startsWith('tpv-') || toRedeem <= 0) return null;

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

  const current = Math.max(0, Math.floor(Number(client.loyalty?.points || 0)));
  if (toRedeem > current) {
    const err = new Error(`Solo hay ${current} puntos disponibles`);
    err.code = 'LOYALTY_INSUFFICIENT';
    throw err;
  }

  const discountEuro = loyaltyDiscountFromPoints(toRedeem);
  const prevRedeemed = Math.max(0, Math.floor(Number(client.loyalty?.redeemedPoints || 0)));
  const loyalty = {
    ...(client.loyalty || {}),
    enrolled: true,
    enrolledAt: client.loyalty?.enrolledAt || new Date().toISOString(),
    points: current - toRedeem,
    redeemedPoints: prevRedeemed + toRedeem,
    lastRedeemAt: new Date().toISOString(),
    lastRedeemOrderId: String(orderId || ''),
    lastRedeemReason: String(reason || '').slice(0, 120),
  };

  const doc = buildClientDocument(userId, { ...client, loyalty }, client);
  const saved = await putDocument(req, clientsDb, doc._id, doc);
  logger.info({
    tag: 'DINING_LOYALTY_REDEEM',
    clientId: cid,
    points: toRedeem,
    discountEuro,
    orderId,
  }, 'Canje puntos sala');

  return {
    client: { ...doc, _rev: saved.rev },
    pointsDebited: toRedeem,
    discountEuro,
  };
}

/** Ajusta puntos tras sync por gasto: puntos = max(0, earned - redeemed). */
export function applyRedeemedPointsToLoyalty(loyalty, earnedPoints) {
  const earned = Math.max(0, Math.floor(Number(earnedPoints) || 0));
  const redeemed = Math.max(0, Math.floor(Number(loyalty?.redeemedPoints || 0)));
  const points = Math.max(0, earned - redeemed);
  return {
    ...(loyalty || {}),
    redeemedPoints: redeemed,
    points,
  };
}
