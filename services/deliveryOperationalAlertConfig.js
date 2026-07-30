/**
 * Umbrales operativos delivery — fuente CEO (settings alerts:{businessId}).
 * Los motores leen aquí; no hay polling fijo: se evalúa al cruzar umbral o en eventos.
 */

import { findAccountByUserId, saveAccount } from './couchdb.js';

export const DEFAULT_DELIVERY_OPERATIONAL = {
  delayThresholds: {
    pending: 5,
    preparing: 12,
    kitchen: 18,
    assembly: 8,
    delivery: 35,
    /** Pedido activo desde creación — aviso CEO (móvil). Default 1 h. */
    orderTotal: 60,
  },
  kitchenCapacity: 10,
  kitchenWarningPercent: 70,
  kitchenCriticalPercent: 90,
  maxOrdersPerRider: 4,
  riderWarningRatio: 3,
  channelSilenceMinutes: 60,
  lowMarginThresholdPercent: 20,
  failedDeliveryThreshold: 3,
  unpaidGraceMinutes: 30,
  repeatIncidentThreshold: 3,
  repeatIncidentWindowDays: 30,
  driverMismatchThreshold: 5,
};

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeDeliveryOperational(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const dt = src.delayThresholds && typeof src.delayThresholds === 'object' ? src.delayThresholds : {};
  const def = DEFAULT_DELIVERY_OPERATIONAL;

  return {
    delayThresholds: {
      pending: clampNum(dt.pending, 3, 120, def.delayThresholds.pending),
      preparing: clampNum(dt.preparing, 3, 120, def.delayThresholds.preparing),
      kitchen: clampNum(dt.kitchen, 3, 120, def.delayThresholds.kitchen),
      assembly: clampNum(dt.assembly, 3, 120, def.delayThresholds.assembly),
      delivery: clampNum(dt.delivery, 5, 180, def.delayThresholds.delivery),
      orderTotal: clampNum(dt.orderTotal, 15, 240, def.delayThresholds.orderTotal),
    },
    kitchenCapacity: clampNum(src.kitchenCapacity, 1, 50, def.kitchenCapacity),
    kitchenWarningPercent: clampNum(src.kitchenWarningPercent, 30, 95, def.kitchenWarningPercent),
    kitchenCriticalPercent: clampNum(src.kitchenCriticalPercent, 50, 100, def.kitchenCriticalPercent),
    maxOrdersPerRider: clampNum(src.maxOrdersPerRider, 1, 15, def.maxOrdersPerRider),
    riderWarningRatio: clampNum(src.riderWarningRatio, 1, 12, def.riderWarningRatio),
    channelSilenceMinutes: clampNum(src.channelSilenceMinutes, 15, 480, def.channelSilenceMinutes),
    lowMarginThresholdPercent: clampNum(src.lowMarginThresholdPercent, 5, 60, def.lowMarginThresholdPercent),
    failedDeliveryThreshold: clampNum(src.failedDeliveryThreshold, 1, 20, def.failedDeliveryThreshold),
    unpaidGraceMinutes: clampNum(src.unpaidGraceMinutes, 5, 240, def.unpaidGraceMinutes),
    repeatIncidentThreshold: clampNum(src.repeatIncidentThreshold, 2, 15, def.repeatIncidentThreshold),
    repeatIncidentWindowDays: clampNum(src.repeatIncidentWindowDays, 7, 365, def.repeatIncidentWindowDays),
    driverMismatchThreshold: clampNum(src.driverMismatchThreshold, 1, 100, def.driverMismatchThreshold),
  };
}

/** Combina defaults de cuenta con umbrales guardados por el CEO. */
export function resolveDeliveryAlertConfig(account, businessOperational = null) {
  const cfg = account?.alertConfig?.delivery || {};
  const op = businessOperational?.delivery
    ? sanitizeDeliveryOperational(businessOperational.delivery)
    : {};

  const merged = sanitizeDeliveryOperational({
    delayThresholds: {
      pending: op.delayThresholds?.pending ?? cfg.delayThresholds?.pending,
      preparing: op.delayThresholds?.preparing ?? cfg.delayThresholds?.preparing,
      kitchen: op.delayThresholds?.kitchen ?? cfg.delayThresholds?.kitchen,
      assembly: op.delayThresholds?.assembly ?? cfg.delayThresholds?.assembly,
      delivery: op.delayThresholds?.delivery ?? cfg.delayThresholds?.delivery,
      orderTotal: op.delayThresholds?.orderTotal ?? cfg.delayThresholds?.orderTotal,
    },
    kitchenCapacity: op.kitchenCapacity ?? cfg.kitchenCapacity,
    kitchenWarningPercent: op.kitchenWarningPercent ?? cfg.kitchenWarningPercent,
    kitchenCriticalPercent: op.kitchenCriticalPercent ?? cfg.kitchenCriticalPercent,
    maxOrdersPerRider: op.maxOrdersPerRider ?? cfg.maxOrdersPerRider,
    riderWarningRatio: op.riderWarningRatio ?? cfg.riderWarningRatio,
    channelSilenceMinutes: op.channelSilenceMinutes ?? cfg.channelSilenceMinutes,
    lowMarginThresholdPercent: op.lowMarginThresholdPercent ?? cfg.lowMarginThresholdPercent,
    failedDeliveryThreshold: op.failedDeliveryThreshold ?? cfg.failedDeliveryThreshold,
    unpaidGraceMinutes: op.unpaidGraceMinutes ?? cfg.unpaidGraceMinutes,
    repeatIncidentThreshold: op.repeatIncidentThreshold ?? cfg.repeatIncidentThreshold,
    repeatIncidentWindowDays: op.repeatIncidentWindowDays ?? cfg.repeatIncidentWindowDays,
    driverMismatchThreshold: op.driverMismatchThreshold ?? cfg.driverMismatchThreshold,
  });

  return {
    enabled: cfg.enabled !== false,
    delayedOrderEnabled: cfg.delayedOrderEnabled !== false,
    delayThresholds: merged.delayThresholds,
    kitchenSaturationEnabled: cfg.kitchenSaturationEnabled !== false,
    kitchenCapacity: merged.kitchenCapacity,
    kitchenWarningPercent: merged.kitchenWarningPercent,
    kitchenCriticalPercent: merged.kitchenCriticalPercent,
    productOutOfStockEnabled: cfg.productOutOfStockEnabled !== false,
    riderSaturationEnabled: cfg.riderSaturationEnabled !== false,
    maxOrdersPerRider: merged.maxOrdersPerRider,
    riderWarningRatio: merged.riderWarningRatio,
    cashPendingCloseEnabled: cfg.cashPendingCloseEnabled !== false,
    cashCloseDeadline: cfg.cashCloseDeadline || '23:30',
    cashWarningMinutes: Number(cfg.cashWarningMinutes || 30),
    cashMaxOpenHours: Number(cfg.cashMaxOpenHours || 12),
    channelDownEnabled: cfg.channelDownEnabled !== false,
    channelSilenceMinutes: merged.channelSilenceMinutes,
    monitoredChannels: cfg.monitoredChannels || ['web', 'app', 'glovo', 'uber_eats', 'just_eat'],
    lowMarginEnabled: cfg.lowMarginEnabled !== false,
    lowMarginThresholdPercent: merged.lowMarginThresholdPercent,
    failedDeliveryEnabled: cfg.failedDeliveryEnabled !== false,
    failedDeliveryThreshold: merged.failedDeliveryThreshold,
    unpaidOrderEnabled: cfg.unpaidOrderEnabled !== false,
    unpaidGraceMinutes: merged.unpaidGraceMinutes,
    repeatIncidentEnabled: cfg.repeatIncidentEnabled !== false,
    repeatIncidentThreshold: merged.repeatIncidentThreshold,
    repeatIncidentWindowDays: merged.repeatIncidentWindowDays,
    driverMismatchThreshold: merged.driverMismatchThreshold,
  };
}

export async function syncDeliveryAlertsToAccount(req, userId, operational) {
  const account = await findAccountByUserId(req, userId);
  if (!account) return;
  const deliveryOp = sanitizeDeliveryOperational(operational);
  const delivery = {
    ...(account.alertConfig?.delivery || {}),
    delayThresholds: { ...deliveryOp.delayThresholds },
    kitchenCapacity: deliveryOp.kitchenCapacity,
    kitchenWarningPercent: deliveryOp.kitchenWarningPercent,
    kitchenCriticalPercent: deliveryOp.kitchenCriticalPercent,
    maxOrdersPerRider: deliveryOp.maxOrdersPerRider,
    riderWarningRatio: deliveryOp.riderWarningRatio,
    channelSilenceMinutes: deliveryOp.channelSilenceMinutes,
    lowMarginThresholdPercent: deliveryOp.lowMarginThresholdPercent,
    failedDeliveryThreshold: deliveryOp.failedDeliveryThreshold,
    unpaidGraceMinutes: deliveryOp.unpaidGraceMinutes,
    repeatIncidentThreshold: deliveryOp.repeatIncidentThreshold,
    repeatIncidentWindowDays: deliveryOp.repeatIncidentWindowDays,
    driverMismatchThreshold: deliveryOp.driverMismatchThreshold,
  };

  const updated = {
    ...account,
    alertConfig: { ...(account.alertConfig || {}), delivery },
    updatedAt: new Date().toISOString(),
  };
  await saveAccount(req, updated);
}
