/**
 * Delivery Alert Engine — Motor de alertas delivery/restaurante
 *
 * Evalúa umbrales configurados por el CEO (settings) al cruzar condiciones
 * o en eventos (caja, pedido). Barrido de seguridad cada 15 min, no polling 60s.
 */

import {
  ACCOUNTS_DB,
  NOTIFICATIONS_DB,
  ensureDatabase,
  findAccountByUserId,
  getAllDocuments,
  getCatalogDbName,
  getDeliveryDbName,
  putDocument,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { mutateAlertStatus } from './alertHistory.js';
import {
  filterActiveDeliveryOrders,
  getOrderPhase,
  getPhaseStartTime,
  isDeliveredStatus,
  normalizeDeliveryOrderStatus,
  orderHasDeliveryPhase,
} from './deliveryAlertStatusUtils.js';
import {
  canEmitCatalogStockAlerts,
  filterStockTrackedCatalogItems,
} from './stockAlertUtils.js';
import {
  canEmitDriverCashAlerts,
  canEmitPdvCashAlerts,
} from './pdvAlertUtils.js';
import {
  canEmitDeliveryAlerts,
  canEmitRiderAlerts,
} from './moduleAlertUtils.js';
import {
  getBusinessAlertsOperational,
  minutesPastCloseDeadline,
  resolveCashRegisterAlertConfig,
} from './cashRegisterAlertConfig.js';
import { resolveDeliveryAlertConfig } from './deliveryOperationalAlertConfig.js';
import { broadcastToBusiness } from './sseService.js';
import logger from './logger.js';

const TAG = 'DELIVERY_ALERT_ENGINE';
/** Barrido de seguridad (no polling operativo). Eventos + umbrales horarios primero. */
const SAFETY_SWEEP_MS = 15 * 60_000;

/** Rutas del centro operativo / gestión (no legacy /saas/delivery?tab=). */
const DELIVERY_OPS_ROUTE = '/saas/delivery-ops';
const DELIVERY_KITCHEN_ROUTE = '/saas/delivery-kitchen';
const DELIVERY_REPARTO_ROUTE = '/saas/delivery-reparto';
const DELIVERY_CAJA_ROUTE = '/saas/vertical/delivery/caja';
const DELIVERY_CATALOG_ROUTE = '/saas/catalog';
const STARTUP_DELAY_MS = 20_000;
const DEDUP_WINDOW_MS = 5 * 60_000;
const MARGIN_CHECK_INTERVAL = 15;
const ESCALATION_MEDIUM_MS = 15 * 60_000;
const ESCALATION_HIGH_MS = 30 * 60_000;
const fakeReq = { headers: {} };

const dedupCache = new Map();
const escalationTracker = new Map();
let cycleCount = 0;

function isDuplicate(key) {
  const last = dedupCache.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return true;
  dedupCache.set(key, Date.now());
  return false;
}

function cleanCaches() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
  for (const [k, v] of dedupCache) { if (v < cutoff) dedupCache.delete(k); }
  for (const [k, v] of escalationTracker) { if (Date.now() - v > 3_600_000) escalationTracker.delete(k); }
}

function applyEscalation(alertKey, priority, escalable) {
  if (!escalable) return { priority, escalated: false };
  const firstSeen = escalationTracker.get(alertKey);
  const now = Date.now();
  if (!firstSeen) { escalationTracker.set(alertKey, now); return { priority, escalated: false }; }
  const elapsed = now - firstSeen;
  if (elapsed >= ESCALATION_HIGH_MS && priority !== 'high') return { priority: 'high', escalated: true };
  if (elapsed >= ESCALATION_MEDIUM_MS && priority === 'low') return { priority: 'medium', escalated: true };
  return { priority, escalated: false };
}

const ALERT_CLASSIFICATION = {
  delivery_delayed_order:          { defaultPriority: 'medium', escalable: true  },
  delivery_kitchen_saturated:      { defaultPriority: 'high',   escalable: false },
  delivery_queue_overflow:         { defaultPriority: 'high',   escalable: false },
  delivery_product_out_of_stock:   { defaultPriority: 'high',   escalable: false },
  delivery_product_low_stock:      { defaultPriority: 'medium', escalable: true  },
  delivery_rider_saturated:        { defaultPriority: 'high',   escalable: false },
  delivery_no_active_riders:       { defaultPriority: 'high',   escalable: false },
  delivery_unassigned_order:       { defaultPriority: 'medium', escalable: true  },
  delivery_cash_pending_close:     { defaultPriority: 'medium', escalable: true  },
  delivery_register_not_opened:    { defaultPriority: 'medium', escalable: false },
  delivery_channel_silent:         { defaultPriority: 'medium', escalable: false },
  delivery_low_margin:             { defaultPriority: 'medium', escalable: true  },
  delivery_failed_delivery:        { defaultPriority: 'high',   escalable: false },
  delivery_unpaid_order:           { defaultPriority: 'medium', escalable: true  },
  delivery_repeat_incident_client: { defaultPriority: 'low',    escalable: true  },
};

/** @deprecated Usar resolveDeliveryAlertConfig(account, businessOperational) */
export function getDeliveryAlertConfig(account) {
  return resolveDeliveryAlertConfig(account, null);
}

async function fetchDocsOfType(dbName, type) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch { return []; }
}

async function fetchCatalogInfraDocs(userId) {
  try {
    await ensureDatabase(fakeReq, getCatalogDbName());
    const docs = await getAllDocuments(fakeReq, getCatalogDbName());
    return docs.filter((d) => d.user_id === userId && !d.deletedAt && (d.type === 'warehouse' || d.type === 'stock_movement'));
  } catch { return []; }
}

async function fetchPointsOfSale(userId) {
  return fetchDocsOfType(getDeliveryDbName(), 'point_of_sale').then((d) => d.filter((p) => p.user_id === userId));
}

async function fetchDrivers(userId) {
  return fetchDocsOfType(getDeliveryDbName(), 'driver').then((d) => d.filter((i) => i.user_id === userId && i.active !== false));
}

function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d >= todayStart();
}

async function emitDeliveryAlert({ userId, businessId, alertType, dedupKey, priority, title, message, data, route, targetRoles }) {
  const key = `dalert:${alertType}:${dedupKey}`;
  if (isDuplicate(key)) return null;
  const cls = ALERT_CLASSIFICATION[alertType] || {};
  const basePriority = priority || cls.defaultPriority || 'medium';
  const { priority: finalPriority, escalated } = applyEscalation(key, basePriority, cls.escalable);
  const result = await emitGlobalAlert({
    businessId, userId, source: 'delivery', ruleId: alertType, category: alertType,
    priority: finalPriority, title, message,
    entityId: data?.orderId || data?.itemId || data?.sessionId || '',
    entityType: 'delivery_alert', route: route || DELIVERY_OPS_ROUTE,
    metadata: { ...data, alertType, targetRoles, escalated, dedupKey }, dedupKey,
  });
  if (result && businessId) {
    broadcastToBusiness(businessId, 'delivery:alert_triggered', {
      id: result.id, alertType, priority: finalPriority, escalated,
      title, message, data, route, targetRoles, createdAt: new Date().toISOString(),
    });
  }
  return result;
}

// ─── RULES ──────────────────────────────────────────────────────────────────

const PHASE_ROLES = { pending: ['manager', 'owner'], preparing: ['manager', 'owner', 'kitchen'], kitchen: ['manager', 'owner', 'kitchen'], assembly: ['manager', 'owner', 'kitchen'], delivery: ['manager', 'owner', 'driver'] };

function checkDelayedOrders(orders, config) {
  if (!config.delayedOrderEnabled) return [];
  const now = Date.now();
  const alerts = [];
  for (const o of orders) {
    const status = normalizeDeliveryOrderStatus(o.status);
    const phase = getOrderPhase(o);
    if (!phase) continue;
    const thr = config.delayThresholds[phase];
    if (!thr) continue;
    const start = getPhaseStartTime(o);
    if (Number.isNaN(start.getTime())) continue;
    const mins = (now - start.getTime()) / 60_000;
    if (mins < thr) continue;
    let prio = 'low';
    if (mins >= thr * 2) prio = 'high';
    else if (mins >= thr * 1.5) prio = 'medium';
    alerts.push({
      alertType: 'delivery_delayed_order',
      dedupKey: `del-${o._id}-${status}`,
      priority: prio,
      title: `Pedido ${o.orderNumber || ''} retrasado en ${status}`,
      message: `Lleva ${Math.floor(mins)} min en ${status} (umbral: ${thr} min).`,
      data: { orderId: o._id, orderNumber: o.orderNumber, phase: status, minutesInPhase: Math.floor(mins), threshold: thr },
      route: DELIVERY_OPS_ROUTE,
      targetRoles: PHASE_ROLES[phase] || ['manager', 'owner'],
    });
  }
  return alerts;
}

function checkKitchenSaturation(orders, config) {
  if (!config.kitchenSaturationEnabled) return [];
  const now = Date.now();
  const inK = orders.filter((o) => normalizeDeliveryOrderStatus(o.status) === 'cocina');
  const inP = orders.filter((o) => normalizeDeliveryOrderStatus(o.status) === 'nuevo');
  const cnt = inK.length, cap = config.kitchenCapacity;
  if (cap <= 0 || cnt === 0) return [];
  const pct = (cnt / cap) * 100;
  let oldest = 0, tw = 0;
  for (const o of inK) { const s = o.kitchenStartedAt ? new Date(o.kitchenStartedAt) : new Date(o.createdAt); const m = (now - s.getTime()) / 60_000; tw += m; if (m > oldest) oldest = m; }
  const bd = { ordersInKitchen: cnt, capacity: cap, saturationPercent: Math.round(pct), oldestOrderMinutes: Math.floor(oldest), avgWaitMinutes: cnt > 0 ? Math.round(tw / cnt) : 0 };
  const alerts = [];
  if (pct >= config.kitchenCriticalPercent) {
    alerts.push({ alertType: 'delivery_kitchen_saturated', dedupKey: 'kitchen-crit', priority: 'high', title: 'Cocina saturada', message: `${cnt}/${cap} pedidos (${Math.round(pct)}%). Antiguo: ${Math.floor(oldest)} min.`, data: bd, route: DELIVERY_KITCHEN_ROUTE, targetRoles: ['manager', 'owner', 'kitchen'] });
  } else if (pct >= config.kitchenWarningPercent) {
    alerts.push({ alertType: 'delivery_kitchen_saturated', dedupKey: 'kitchen-warn', priority: 'medium', title: 'Cocina con carga alta', message: `${cnt}/${cap} pedidos (${Math.round(pct)}%).`, data: bd, route: DELIVERY_KITCHEN_ROUTE, targetRoles: ['manager', 'owner', 'kitchen'] });
  }
  if (cnt + inP.length > cap * 1.5) {
    alerts.push({ alertType: 'delivery_queue_overflow', dedupKey: 'q-overflow', priority: 'high', title: 'Cola cocina desbordada', message: `${cnt + inP.length} pedidos cola+cocina (cap: ${cap}).`, data: { ...bd, ordersInPreparing: inP.length, totalQueue: cnt + inP.length }, route: DELIVERY_KITCHEN_ROUTE, targetRoles: ['manager', 'owner', 'kitchen'] });
  }
  return alerts;
}

function checkDeliveryStock(catalogItems, activeOrders, config, catalogInfraDocs = []) {
  if (!config.productOutOfStockEnabled || !canEmitCatalogStockAlerts(catalogItems, catalogInfraDocs)) return [];
  const alerts = [];
  for (const it of filterStockTrackedCatalogItems(catalogItems)) {
    if (it.stockQuantity == null || it.stockQuantity === '') continue;
    const qty = Number(it.stockQuantity);
    const min = Number(it.minStock || 0);
    if (!Number.isFinite(qty) || min <= 0) continue;
    const imp = activeOrders.filter((o) => (o.items || []).some((i) => i.catalogItemId === it._id)).length;
    if (qty <= 0) {
      alerts.push({ alertType: 'delivery_product_out_of_stock', dedupKey: `oos-${it._id}`, priority: 'high', title: `Producto agotado: ${it.name}`, message: `"${it.name}" sin stock.${imp > 0 ? ` ${imp} pedido(s) afectado(s).` : ''}`, data: { itemId: it._id, itemName: it.name, itemSku: it.sku, stockQuantity: qty, minStock: min, impactedOrders: imp }, route: `${DELIVERY_CATALOG_ROUTE}`, targetRoles: ['manager', 'owner', 'kitchen'] });
    } else if (qty > 0 && min > 0 && qty <= min) {
      const dem = activeOrders.reduce((s, o) => { const oi = (o.items || []).find((i) => i.catalogItemId === it._id); return s + (oi ? Number(oi.quantity || 0) : 0); }, 0);
      alerts.push({ alertType: 'delivery_product_low_stock', dedupKey: `ls-${it._id}`, priority: dem > qty ? 'high' : 'medium', title: `Stock bajo: ${it.name}`, message: `${qty} ${it.unit || 'ud'} (min: ${min}). Demanda: ${dem}.`, data: { itemId: it._id, itemName: it.name, stockQuantity: qty, minStock: min, pendingDemand: dem }, route: DELIVERY_CATALOG_ROUTE, targetRoles: ['manager', 'owner', 'kitchen'] });
    }
  }
  return alerts;
}

function checkRiderSaturation(orders, driverSessions, config, drivers = []) {
  if (!config.riderSaturationEnabled || !canEmitRiderAlerts({ drivers })) return [];
  const alerts = [];
  const ad = driverSessions.filter((s) => s.status === 'open').length;
  const inD = orders.filter((o) => normalizeDeliveryOrderStatus(o.status) === 'en_reparto');
  const wt = orders.filter((o) => normalizeDeliveryOrderStatus(o.status) === 'listo');
  if (ad === 0 && (inD.length > 0 || wt.length > 0)) {
    alerts.push({ alertType: 'delivery_no_active_riders', dedupKey: 'no-riders', priority: 'high', title: 'Sin repartidores activos', message: `${inD.length + wt.length} pedido(s) esperando y 0 riders.`, data: { driversActive: 0, ordersInDelivery: inD.length, ordersWaitingPickup: wt.length }, route: DELIVERY_REPARTO_ROUTE, targetRoles: ['manager', 'owner', 'driver'] });
    return alerts;
  }
  if (ad === 0) return [];
  const r = inD.length / ad;
  if (r >= config.maxOrdersPerRider) alerts.push({ alertType: 'delivery_rider_saturated', dedupKey: 'rid-sat', priority: 'high', title: 'Reparto saturado', message: `${inD.length} pedidos / ${ad} riders (${r.toFixed(1)}, max: ${config.maxOrdersPerRider}).`, data: { driversActive: ad, ordersInDelivery: inD.length, ratioOrdersPerDriver: Math.round(r * 10) / 10 }, route: DELIVERY_REPARTO_ROUTE, targetRoles: ['manager', 'owner', 'driver'] });
  else if (r >= config.riderWarningRatio) alerts.push({ alertType: 'delivery_rider_saturated', dedupKey: 'rid-warn', priority: 'medium', title: 'Reparto carga alta', message: `${inD.length} pedidos / ${ad} riders (${r.toFixed(1)}).`, data: { driversActive: ad, ordersInDelivery: inD.length, ratioOrdersPerDriver: Math.round(r * 10) / 10 }, route: DELIVERY_REPARTO_ROUTE, targetRoles: ['manager', 'owner', 'driver'] });
  const un = inD.filter((o) => !o.assignedDriver && !o.driverId);
  if (un.length > 0) alerts.push({ alertType: 'delivery_unassigned_order', dedupKey: `una-${un.length}`, priority: 'medium', title: `${un.length} pedido(s) sin repartidor`, message: `Sin asignar: ${un.map((o) => o.orderNumber).join(', ')}.`, data: { unassignedOrders: un.map((o) => ({ orderId: o._id, orderNumber: o.orderNumber })) }, route: DELIVERY_REPARTO_ROUTE, targetRoles: ['manager', 'owner'] });
  return alerts;
}

function checkCashPendingClose(tpvSessions, driverSessions, orders, cashCfg, pointsOfSale = [], drivers = []) {
  if (!cashCfg?.cashPendingCloseEnabled) return [];
  const alerts = [];
  const now = new Date();
  const deadline = cashCfg.cashCloseDeadline || '23:30';
  const warnMin = Number(cashCfg.cashWarningMinutes || 30);
  const maxHours = Number(cashCfg.cashMaxOpenHours || 12);
  const cajaRoute = '/saas/vertical/delivery/caja';
  const pdvReady = canEmitPdvCashAlerts(pointsOfSale);
  const driverCashReady = canEmitDriverCashAlerts(drivers);

  if (pdvReady) for (const s of tpvSessions) {
    if (s.status !== 'open') continue;
    const op = new Date(s.openedAt || s.createdAt);
    const hrs = (now.getTime() - op.getTime()) / 3_600_000;
    const label = s.pointOfSaleName || s.terminalName || 'Caja';

    if (hrs >= maxHours) {
      alerts.push({
        alertType: 'delivery_cash_pending_close', dedupKey: `tpv-old-${s._id}`, priority: 'high',
        title: 'Caja olvidada',
        message: `${label} lleva ${Math.floor(hrs)}h abierta (máx. ${maxHours}h).`,
        data: { sessionType: 'tpv', sessionId: s._id, pointOfSale: s.pointOfSaleName, hoursOpen: Math.round(hrs * 10) / 10, maxHours },
        route: cajaRoute, targetRoles: ['manager', 'owner', 'cashier'],
      });
      continue;
    }

    const mp = minutesPastCloseDeadline(now, deadline);
    if (mp > 0) {
      let p = 'low';
      if (mp > warnMin * 2) p = 'high';
      else if (mp > warnMin) p = 'medium';
      alerts.push({
        alertType: 'delivery_cash_pending_close', dedupKey: `tpv-lt-${s._id}`, priority: p,
        title: 'Caja pendiente de cierre',
        message: `${label} sigue abierta desde ${op.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (límite ${deadline}).`,
        data: {
          sessionType: 'tpv', sessionId: s._id, pointOfSale: s.pointOfSaleName,
          hoursOpen: Math.round(hrs * 10) / 10, deadline, minutesPastDeadline: Math.floor(mp),
        },
        route: cajaRoute, targetRoles: ['manager', 'owner', 'cashier'],
      });
    }
  }

  if (driverCashReady) for (const s of driverSessions) {
    if (s.status !== 'open') continue;
    const hrs = (now.getTime() - new Date(s.openedAt || s.createdAt).getTime()) / 3_600_000;
    if (hrs > 2 && !orders.some((o) => normalizeDeliveryOrderStatus(o.status) === 'en_reparto' && (o.assignedDriver === s.driverName || o.driverId === s.driverId))) {
      alerts.push({
        alertType: 'delivery_cash_pending_close', dedupKey: `drv-${s._id}`, priority: 'medium',
        title: 'Caja repartidor sin actividad',
        message: `${s.driverName || 'Repartidor'} lleva ${Math.floor(hrs)}h sin pedidos activos.`,
        data: { sessionType: 'driver', sessionId: s._id, driverName: s.driverName, hoursOpen: Math.round(hrs * 10) / 10 },
        route: DELIVERY_CAJA_ROUTE, targetRoles: ['manager', 'owner', 'driver'],
      });
    }
  }
  return alerts;
}

function checkRegisterNotOpened(tpvSessions, pointsOfSale, cashCfg) {
  if (!cashCfg?.registerNotOpenedEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const now = new Date();
  if (now.getHours() < Number(cashCfg.registerNotOpenedCheckHour || 10)) return [];
  const todayStr = now.toISOString().slice(0, 10);
  const todaySessions = tpvSessions.filter((s) => String(s.openedAt || '').startsWith(todayStr));
  const alerts = [];

  for (const pdv of pointsOfSale) {
    const activeTerminals = (pdv.terminals || []).filter((t) => t.active);
    for (const terminal of activeTerminals) {
      const hasSession = todaySessions.some(
        (s) => s.terminalId === terminal.id || s.terminalName === terminal.name,
      );
      if (!hasSession) {
        alerts.push({
          alertType: 'delivery_register_not_opened',
          dedupKey: `reg-notopen-${pdv._id}-${terminal.id}-${todayStr}`,
          priority: 'medium',
          title: 'Caja sin abrir',
          message: `La caja "${terminal.name}" de ${pdv.name} no se ha abierto hoy.`,
          data: { pdvName: pdv.name, terminalName: terminal.name, pdvId: pdv._id, terminalId: terminal.id },
          route: '/saas/vertical/delivery/caja',
          targetRoles: ['manager', 'owner', 'cashier'],
        });
      }
    }
  }
  return alerts;
}

const CH_LABELS = { direct: 'Directa', phone: 'Tel', web: 'Web', app: 'App', glovo: 'Glovo', uber_eats: 'Uber Eats', just_eat: 'Just Eat' };
function isInActiveSlot(dc) { if (!dc?.activeTimeSlots?.length) return true; const hm = new Date().getHours() * 60 + new Date().getMinutes(); return dc.activeTimeSlots.some((s) => { const [sh, sm] = (s.start || '00:00').split(':').map(Number); const [eh, em] = (s.end || '23:59').split(':').map(Number); return hm >= sh * 60 + sm && hm <= eh * 60 + em; }); }

function checkChannelHealth(orders, config, dc) {
  if (!config.channelDownEnabled || !isInActiveSlot(dc)) return [];
  const now = Date.now(), td = orders.filter((o) => isToday(o.createdAt)), alerts = [];
  for (const ch of config.monitoredChannels) { const co = td.filter((o) => o.channel === ch); if (!co.length) continue; const lt = Math.max(...co.map((o) => new Date(o.createdAt).getTime())); const si = (now - lt) / 60_000;
    if (si >= config.channelSilenceMinutes) alerts.push({ alertType: 'delivery_channel_silent', dedupKey: `ch-${ch}`, priority: 'medium', title: `Canal ${CH_LABELS[ch] || ch} sin actividad`, message: `Sin pedidos hace ${Math.floor(si)} min.`, data: { channel: ch, channelLabel: CH_LABELS[ch] || ch, minutesSilent: Math.floor(si), threshold: config.channelSilenceMinutes }, route: DELIVERY_OPS_ROUTE, targetRoles: ['manager', 'owner'] }); }
  return alerts;
}

function checkLowMargin(orders, catalogItems, config) {
  if (!config.lowMarginEnabled) return [];
  const comp = orders.filter((o) => ['entregado', 'en_reparto'].includes(normalizeDeliveryOrderStatus(o.status)) && isToday(o.createdAt));
  if (comp.length < 3) return [];
  const cm = new Map(); for (const it of catalogItems) { if (it.costPrice > 0) cm.set(it._id, Number(it.costPrice)); }
  if (cm.size === 0) return [];
  let rev = 0, cost = 0;
  for (const o of comp) { rev += Number(o.totalAmount || 0); for (const it of (o.items || [])) { const c = cm.get(it.catalogItemId); if (c) cost += c * Number(it.quantity || 1); } }
  if (rev <= 0) return [];
  const mg = ((rev - cost) / rev) * 100, alerts = [], md = { totalRevenue: rev, estimatedCost: cost, marginPercent: Math.round(mg * 10) / 10, threshold: config.lowMarginThresholdPercent, ordersAnalyzed: comp.length };
  if (mg < config.lowMarginThresholdPercent / 2) alerts.push({ alertType: 'delivery_low_margin', dedupKey: 'mg-crit', priority: 'high', title: 'Margen muy bajo', message: `Margen: ${mg.toFixed(1)}% (umbral: ${config.lowMarginThresholdPercent}%).`, data: md, route: '/saas/finance', targetRoles: ['manager', 'owner'] });
  else if (mg < config.lowMarginThresholdPercent) alerts.push({ alertType: 'delivery_low_margin', dedupKey: 'mg-warn', priority: 'medium', title: 'Margen bajo', message: `Margen: ${mg.toFixed(1)}% (umbral: ${config.lowMarginThresholdPercent}%).`, data: md, route: '/saas/finance', targetRoles: ['manager', 'owner'] });
  return alerts;
}

function checkFailedDeliveries(orders, config) {
  if (!config.failedDeliveryEnabled) return [];
  const fl = orders.filter((o) => (o.status === 'incident' || o.status === 'cancelled') && orderHasDeliveryPhase(o)).filter((o) => isToday(o.updatedAt || o.createdAt));
  const alerts = [];
  if (fl.length >= config.failedDeliveryThreshold) alerts.push({ alertType: 'delivery_failed_delivery', dedupKey: `fb-${fl.length}`, priority: 'high', title: `${fl.length} entregas fallidas`, message: `Umbral superado (${config.failedDeliveryThreshold}).`, data: { failedOrders: fl.map((o) => ({ orderId: o._id, orderNumber: o.orderNumber, status: o.status })), totalFailed: fl.length, threshold: config.failedDeliveryThreshold }, route: DELIVERY_OPS_ROUTE, targetRoles: ['manager', 'owner', 'driver'] });
  else for (const o of fl) alerts.push({ alertType: 'delivery_failed_delivery', dedupKey: `f-${o._id}`, priority: 'low', title: `Entrega fallida: ${o.orderNumber || ''}`, message: `Paso a ${o.status} tras reparto.`, data: { orderId: o._id, orderNumber: o.orderNumber, status: o.status }, route: DELIVERY_OPS_ROUTE, targetRoles: ['manager', 'owner', 'driver'] });
  return alerts;
}

function checkUnpaidOrders(orders, config) {
  if (!config.unpaidOrderEnabled) return [];
  const now = Date.now();
  const up = orders.filter((o) => isDeliveredStatus(o.status) && o.paymentStatus !== 'paid' && !o.paymentMethod && (now - new Date(o.deliveredAt || o.updatedAt || o.createdAt).getTime()) / 60_000 > config.unpaidGraceMinutes);
  if (!up.length) return [];
  const tot = up.reduce((s, o) => s + Number(o.totalAmount || 0), 0), alerts = [];
  if (up.length >= 5) alerts.push({ alertType: 'delivery_unpaid_order', dedupKey: `ub-${up.length}`, priority: 'high', title: `${up.length} pedidos sin cobrar`, message: `Pendiente: ${tot.toFixed(2)} EUR.`, data: { totalUnpaid: up.length, totalAmount: tot }, route: DELIVERY_CAJA_ROUTE, targetRoles: ['manager', 'owner', 'cashier'] });
  else for (const o of up) alerts.push({ alertType: 'delivery_unpaid_order', dedupKey: `u-${o._id}`, priority: 'medium', title: `Pedido ${o.orderNumber || ''} sin cobrar`, message: `Importe: ${Number(o.totalAmount || 0).toFixed(2)} EUR.`, data: { orderId: o._id, orderNumber: o.orderNumber, total: o.totalAmount }, route: DELIVERY_CAJA_ROUTE, targetRoles: ['manager', 'owner', 'cashier'] });
  return alerts;
}

function checkRepeatIncidentClients(orders, config) {
  if (!config.repeatIncidentEnabled) return [];
  const wMs = config.repeatIncidentWindowDays * 86_400_000, now = Date.now();
  const rec = orders.filter((o) => !Number.isNaN(new Date(o.createdAt).getTime()) && (now - new Date(o.createdAt).getTime()) <= wMs);
  const mp = new Map();
  for (const o of rec) { if (o.status !== 'incident') continue; const k = o.clientId || o.customerPhone || o.customerName; if (!k) continue; if (!mp.has(k)) mp.set(k, { name: o.customerName, phone: o.customerPhone, incidents: [] }); mp.get(k).incidents.push({ orderId: o._id, orderNumber: o.orderNumber, date: o.createdAt }); }
  const alerts = [];
  for (const [, d] of mp) { if (d.incidents.length >= config.repeatIncidentThreshold) alerts.push({ alertType: 'delivery_repeat_incident_client', dedupKey: `rp-${d.phone || d.name}`, priority: 'medium', title: `Cliente reincidente: ${d.name || '?'}`, message: `${d.incidents.length} incidencias en ${config.repeatIncidentWindowDays} dias.`, data: { clientName: d.name, clientPhone: d.phone, incidentCount: d.incidents.length, windowDays: config.repeatIncidentWindowDays, recentIncidents: d.incidents.slice(0, 5) }, route: '/saas/crm/clientes', targetRoles: ['manager', 'owner'] }); }
  return alerts;
}

// ─── RECONCILIACIÓN ─────────────────────────────────────────────────────────

function parseNotificationDedupKey(notifId) {
  if (!notifId || !String(notifId).startsWith('alert:')) return null;
  const parts = String(notifId).split(':');
  if (parts.length < 3) return null;
  const category = parts[1];
  if (parts.length === 3) {
    return { category, dedupKey: parts[2], key: `${category}:${parts[2]}` };
  }
  const dedupKey = parts.slice(2, -1).join(':');
  return { category, dedupKey, key: `${category}:${dedupKey}` };
}

function isDeliveryNotification(doc) {
  const cat = String(doc?.category || '');
  const src = String(doc?.source || '');
  return cat.startsWith('delivery_') || src === 'delivery';
}

async function reconcileDeliveryAlerts(businessId, userId, activeAlerts) {
  if (!businessId && !userId) return 0;
  const activeKeys = new Set(activeAlerts.map((a) => `${a.alertType}:${a.dedupKey}`));
  let resolved = 0;
  const now = new Date().toISOString();

  try {
    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const docs = await getAllDocuments(fakeReq, NOTIFICATIONS_DB);

    for (const doc of docs) {
      if (doc.type !== 'notification' || doc.deletedAt || !isDeliveryNotification(doc)) continue;
      if (businessId && doc.businessId !== businessId) continue;
      if (!businessId && doc.user_id !== userId) continue;

      const status = doc.status || (doc.read ? 'seen' : 'new');
      if (status === 'resolved') continue;

      const parsed = parseNotificationDedupKey(doc._id);
      const metaKey = doc.metadata?.alertType && doc.metadata?.dedupKey
        ? `${doc.metadata.alertType}:${doc.metadata.dedupKey}`
        : null;
      const key = parsed?.key || metaKey;
      if (!key || activeKeys.has(key)) continue;

      const updated = mutateAlertStatus(doc, { status: 'resolved', userId: null, now });
      updated.resolvedBy = 'system';
      updated.statusHistory = [
        ...(Array.isArray(updated.statusHistory) ? updated.statusHistory : []),
        { action: 'auto_resolved', from: status, to: 'resolved', at: now, by: null, meta: { reason: 'condition_cleared' } },
      ].slice(-50);
      await putDocument(fakeReq, NOTIFICATIONS_DB, doc._id, updated);
      resolved++;
    }
  } catch (e) {
    logger.warn({ tag: TAG, businessId, userId, err: e?.message }, 'Error reconciliando alertas delivery');
  }

  return resolved;
}

// ─── ENGINE LOOP ────────────────────────────────────────────────────────────

async function getAllUserIds() {
  try { await ensureDatabase(fakeReq, ACCOUNTS_DB); const docs = await getAllDocuments(fakeReq, ACCOUNTS_DB); return [...new Set(docs.filter((d) => d?.type === 'account' && d?.user_id).map((d) => d.user_id))]; }
  catch { return []; }
}

async function runForUser(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  if (!account) return 0;
  const bId = account.businessId || '';
  const businessOp = bId ? await getBusinessAlertsOperational(fakeReq, bId) : null;
  const config = resolveDeliveryAlertConfig(account, businessOp);
  if (!config.enabled) return 0;
  const [allOrders, catItems, catalogInfraDocs, tpvS, drvS, pointsOfSale, drivers] = await Promise.all([
    fetchDocsOfType(getDeliveryDbName(), 'delivery_order').then((d) => d.filter((o) => o.user_id === userId)),
    fetchDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === userId && i.active)),
    fetchCatalogInfraDocs(userId),
    fetchDocsOfType(getDeliveryDbName(), 'tpv_register_session').then((d) => d.filter((s) => s.user_id === userId)),
    fetchDocsOfType(getDeliveryDbName(), 'driver_cash_session').then((d) => d.filter((s) => s.user_id === userId)),
    fetchPointsOfSale(userId),
    fetchDrivers(userId),
  ]);
  const active = filterActiveDeliveryOrders(allOrders);
  const today = allOrders.filter((o) => isToday(o.createdAt));
  const dc = account.deliveryConfig || null;
  if (!canEmitDeliveryAlerts({ deliveryOrders: allOrders, pointsOfSale, deliveryConfig: dc })) {
    await reconcileDeliveryAlerts(bId, userId, []);
    return 0;
  }
  const cashCfg = resolveCashRegisterAlertConfig(account, businessOp);
  const allPending = collectDeliveryAlerts({
    active, today, allOrders, catItems, catalogInfraDocs, tpvS, drvS, pointsOfSale, drivers, config, dc, cashCfg,
    includeMargin: cycleCount % MARGIN_CHECK_INTERVAL === 0,
  });
  const reconciled = await reconcileDeliveryAlerts(bId, userId, allPending);
  let cnt = 0;
  for (const a of allPending) { if (await emitDeliveryAlert({ userId, businessId: bId, ...a })) cnt++; }
  if (reconciled > 0) logger.info({ tag: TAG, userId, businessId: bId, reconciled }, 'Alertas delivery obsoletas resueltas');
  return cnt;
}

export async function runDeliveryAlerts() {
  const ms = Date.now(); cycleCount++;
  if (cycleCount % 30 === 0) cleanCaches();
  try {
    const uids = await getAllUserIds(); if (!uids.length) return;
    let tot = 0;
    for (const u of uids) { try { tot += await runForUser(u); } catch (e) { logger.warn({ tag: TAG, userId: u, err: e?.message }, 'Error alertas delivery'); } }
    const el = Date.now() - ms;
    if (tot > 0 || el > 5000) logger.info({ tag: TAG, users: uids.length, alerts: tot, ms: el, cycle: cycleCount }, 'Ciclo delivery alerts');
  } catch (e) { logger.error({ tag: TAG, err: e?.message }, 'Error motor alertas delivery'); }
}

export async function getDeliveryAlertSummary(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  if (!account) return { alerts: [], summary: { total: 0, byPriority: {}, byType: {} } };
  const bId = account.businessId || '';
  const businessOp = bId ? await getBusinessAlertsOperational(fakeReq, bId) : null;
  const config = resolveDeliveryAlertConfig(account, businessOp);
  if (!config.enabled) return { alerts: [], summary: { total: 0, byPriority: {}, byType: {} } };
  const [allOrders, catItems, catalogInfraDocs, tpvS, drvS, pointsOfSale, drivers] = await Promise.all([
    fetchDocsOfType(getDeliveryDbName(), 'delivery_order').then((d) => d.filter((o) => o.user_id === userId)),
    fetchDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === userId && i.active)),
    fetchCatalogInfraDocs(userId),
    fetchDocsOfType(getDeliveryDbName(), 'tpv_register_session').then((d) => d.filter((s) => s.user_id === userId)),
    fetchDocsOfType(getDeliveryDbName(), 'driver_cash_session').then((d) => d.filter((s) => s.user_id === userId)),
    fetchPointsOfSale(userId),
    fetchDrivers(userId),
  ]);
  const active = filterActiveDeliveryOrders(allOrders);
  const today = allOrders.filter((o) => isToday(o.createdAt));
  const dc = account.deliveryConfig || null;
  if (!canEmitDeliveryAlerts({ deliveryOrders: allOrders, pointsOfSale, deliveryConfig: dc })) {
    return { alerts: [], summary: { total: 0, byPriority: {}, byType: {} } };
  }
  const cashCfg = resolveCashRegisterAlertConfig(account, businessOp);
  const pending = collectDeliveryAlerts({
    active, today, allOrders, catItems, catalogInfraDocs, tpvS, drvS, pointsOfSale, drivers, config, dc, cashCfg,
    includeMargin: true,
  });
  const byP = { high: 0, medium: 0, low: 0 }, byT = {};
  for (const a of pending) { byP[a.priority] = (byP[a.priority] || 0) + 1; byT[a.alertType] = (byT[a.alertType] || 0) + 1; }
  return { alerts: pending, summary: { total: pending.length, active: pending.length, byPriority: byP, byType: byT } };
}

function collectDeliveryAlerts({
  active, today, allOrders, catItems, catalogInfraDocs, tpvS, drvS, pointsOfSale, drivers, config, dc, cashCfg,
  includeMargin = cycleCount % MARGIN_CHECK_INTERVAL === 0,
}) {
  return [
    ...checkDelayedOrders(active, config),
    ...checkKitchenSaturation(active, config),
    ...checkDeliveryStock(catItems, active, config, catalogInfraDocs),
    ...checkRiderSaturation(active, drvS, config, drivers),
    ...checkCashPendingClose(tpvS, drvS, active, cashCfg, pointsOfSale, drivers),
    ...checkRegisterNotOpened(tpvS, pointsOfSale, cashCfg),
    ...checkChannelHealth(today, config, dc),
    ...(includeMargin ? checkLowMargin(today, catItems, config) : []),
    ...checkFailedDeliveries(allOrders, config),
    ...checkUnpaidOrders(today, config),
    ...checkRepeatIncidentClients(allOrders, config),
  ];
}

export async function runDeliveryAlertsForUser(userId) {
  if (!userId) return 0;
  return runForUser(userId);
}

export async function triggerReactiveAlert(userId, eventType, payload) {
  try {
    const reactiveTypes = new Set([
      'order_created',
      'order_status_changed',
      'stock_updated',
      'cash_session_changed',
    ]);
    if (!reactiveTypes.has(eventType)) return;

    if (eventType === 'cash_session_changed') {
      const account = await findAccountByUserId(fakeReq, userId);
      if (!account) return;
      const bId = account.businessId || '';
      const businessOp = bId ? await getBusinessAlertsOperational(fakeReq, bId) : null;
      const config = resolveDeliveryAlertConfig(account, businessOp);
      if (!config.enabled) return;
      const db = getDeliveryDbName();
      if ((payload?.action === 'closed' || payload?.action === 'pending_review') && payload?.sessionType === 'driver') {
        const drivers = await fetchDrivers(userId);
        if (canEmitDriverCashAlerts(drivers)) {
          const ds = await fetchDocsOfType(db, 'driver_cash_session').then((d) => d.filter((s) => s.user_id === userId));
          const sess = ds.find((s) => s._id === payload?.sessionId);
          if (sess && Math.abs(sess.difference || 0) >= (config.driverMismatchThreshold || 5)) {
            await emitDeliveryAlert({
              userId,
              businessId: bId,
              alertType: 'delivery_driver_mismatch',
              dedupKey: `drv-mismatch-${sess._id}`,
              priority: Math.abs(sess.difference) >= (config.driverMismatchThreshold || 5) * 3 ? 'high' : 'medium',
              title: 'Descuadre de caja repartidor',
              message: `${sess.driverName || 'Repartidor'} cerró caja con diferencia de ${sess.difference >= 0 ? '+' : ''}${Number(sess.difference).toFixed(2)}€`,
              data: { sessionType: 'driver', sessionId: sess._id, driverName: sess.driverName, difference: sess.difference },
              route: DELIVERY_CAJA_ROUTE,
              targetRoles: ['manager', 'owner'],
            });
          }
        }
      }
    }

    await runDeliveryAlertsForUser(userId);
  } catch (e) { logger.warn({ tag: TAG, userId, eventType, err: e?.message }, 'Error alerta reactiva'); }
}

let engineTimer = null;
export function startDeliveryAlertEngine() {
  logger.info({ tag: TAG }, `Motor alertas delivery — eventos + barrido cada ${SAFETY_SWEEP_MS / 60_000} min`);
  setTimeout(() => { runDeliveryAlerts().catch(() => null); engineTimer = setInterval(() => runDeliveryAlerts().catch(() => null), SAFETY_SWEEP_MS); }, STARTUP_DELAY_MS);
}
export function stopDeliveryAlertEngine() { if (engineTimer) { clearInterval(engineTimer); engineTimer = null; } }
