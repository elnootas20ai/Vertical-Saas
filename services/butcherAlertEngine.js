/**
 * Butcher Alert Engine — Motor de alertas especifico de carniceria
 *
 * Ejecuta reglas de alerta sobre: Stock, Lotes/Caducidad, Merma,
 * Precios, Bascula, Caja/TPV, Tickets e Inventario.
 *
 * Ciclo principal: cada 30 min (productos perecederos).
 * Ciclo rapido (bascula): cada 5 min.
 */

import {
  findAccountByUserId,
  getButcherDbName,
  getDeliveryDbName,
  putDocument,
} from './couchdb.js';
import {
  emitGlobalAlert,
  daysBetween,
  minutesBetween,
  fetchAllDocsOfType,
  getBusinessesOfType,
  fakeReq,
} from './alertEmitter.js';
import logger from './logger.js';
import { canEmitPdvCashAlerts } from './pdvAlertUtils.js';
import { shouldRunBackgroundEngine } from './engineIdleGate.js';
import { getButcherOpsDbName } from './butcherStockPipeline.js';

function mapOpsLotToBatchShape(lot) {
  const estado = String(lot.estado || 'activo').toLowerCase();
  const active = estado === 'activo' || estado === 'active';
  return {
    _id: lot._id,
    productId: lot.productoId || '',
    productName: lot.producto || '',
    batchNumber: lot.codigoLote || lot._id,
    expirationDate: lot.fechaCaducidad || '',
    receptionWeightKg: Number(lot.kgRecibidos || 0),
    currentWeightKg: Number(lot.kgDisponibles || 0),
    status: active ? 'active' : (estado === 'caducado' ? 'expired' : 'consumed'),
  };
}

const MAIN_INTERVAL_MS = 30 * 60_000;
const SCALE_INTERVAL_MS = 5 * 60_000;
const STARTUP_DELAY_MS = 20_000;
const TAG = 'BUTCHER_ALERT_ENGINE';

// --- Config -----------------------------------------------------------------

export function getButcherAlertConfig(account) {
  const cfg = account?.alertConfig || {};
  return {
    butcherStockAlertEnabled: cfg.butcherStockAlertEnabled !== false,
    butcherStockCriticalPct: Number(cfg.butcherStockCriticalPct || 50),
    butcherBatchAlertEnabled: cfg.butcherBatchAlertEnabled !== false,
    butcherBatchExpiringDays: Number(cfg.butcherBatchExpiringDays || 3),
    butcherWasteAlertEnabled: cfg.butcherWasteAlertEnabled !== false,
    butcherWasteWarningPct: Number(cfg.butcherWasteWarningPct || 8),
    butcherWasteCriticalPct: Number(cfg.butcherWasteCriticalPct || 15),
    butcherPriceAlertEnabled: cfg.butcherPriceAlertEnabled !== false,
    butcherPriceStaleDays: Number(cfg.butcherPriceStaleDays || 30),
    butcherScaleAlertEnabled: cfg.butcherScaleAlertEnabled !== false,
    butcherScaleTimeoutMinutes: Number(cfg.butcherScaleTimeoutMinutes || 5),
    butcherRegisterAlertEnabled: cfg.butcherRegisterAlertEnabled !== false,
    butcherRegisterMaxHours: Number(cfg.butcherRegisterMaxHours || 10),
    butcherTicketUnpaidMinutes: Number(cfg.butcherTicketUnpaidMinutes || 30),
    butcherInventoryAlertEnabled: cfg.butcherInventoryAlertEnabled !== false,
    butcherInventoryWarningPct: Number(cfg.butcherInventoryWarningPct || 3),
    butcherInventoryCriticalPct: Number(cfg.butcherInventoryCriticalPct || 8),
    butcherWasteHighCostThreshold: Number(cfg.butcherWasteHighCostThreshold || 50),
    butcherWasteRepeatedDays: Number(cfg.butcherWasteRepeatedDays || 7),
    butcherWasteRepeatedCount: Number(cfg.butcherWasteRepeatedCount || 3),
    butcherWasteBatchLossPct: Number(cfg.butcherWasteBatchLossPct || 15),
    butcherPurchaseNoInvoiceGraceHours: Number(cfg.butcherPurchaseNoInvoiceGraceHours || 48),
    butcherPurchaseCostAnomalyThreshold: Number(cfg.butcherPurchaseCostAnomalyThreshold || 0.20),
    butcherOrderAlertEnabled: cfg.butcherOrderAlertEnabled !== false,
  };
}

// --- Emit helper ------------------------------------------------------------

async function emit(ctx, opts) {
  return emitGlobalAlert({
    businessId: ctx.businessId || '',
    userId: ctx.userId || '',
    source: 'carniceria',
    ruleId: opts.category,
    tag: TAG,
    ...opts,
  });
}

// --- Rules 1-3: Stock -------------------------------------------------------

async function checkButcherStock(ctx, products, config) {
  if (!config.butcherStockAlertEnabled) return [];
  const alerts = [];
  const critThreshold = config.butcherStockCriticalPct / 100;

  for (const p of products) {
    if (!p.active || !p.minStockKg || p.minStockKg <= 0) continue;
    const stock = Number(p.stockKg || 0);
    const min = Number(p.minStockKg);

    if (stock <= 0) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherstock-out-${p._id}`, level: 'alert',
        category: 'butcher_product_out_of_stock',
        title: 'Producto agotado',
        message: `"${p.name}" esta AGOTADO. Sin stock disponible.`,
        entityId: p._id, entityType: 'butcher_product',
        route: '/saas/butcher-products',
        metadata: { name: p.name, sku: p.sku, stockKg: stock, minStockKg: min },
        audience: ['manager', 'worker'],
      }));
    } else if (stock <= min * critThreshold) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherstock-critical-${p._id}`, level: 'alert',
        category: 'butcher_stock_critical',
        title: 'Stock critico',
        message: `"${p.name}" tiene solo ${stock.toFixed(1)} kg (minimo: ${min} kg). Reponer urgentemente.`,
        entityId: p._id, entityType: 'butcher_product',
        route: '/saas/butcher-inventory',
        metadata: { name: p.name, sku: p.sku, stockKg: stock, minStockKg: min },
        audience: ['manager', 'worker'],
      }));
    } else if (stock <= min) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherstock-low-${p._id}`, level: 'warning',
        category: 'butcher_stock_low',
        title: 'Stock bajo',
        message: `"${p.name}" tiene ${stock.toFixed(1)} kg (minimo: ${min} kg). Considere reponer.`,
        entityId: p._id, entityType: 'butcher_product',
        route: '/saas/butcher-inventory',
        metadata: { name: p.name, sku: p.sku, stockKg: stock, minStockKg: min },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rules 4-5: Batches / Expiration ----------------------------------------

async function checkButcherBatches(ctx, batches, products, config) {
  if (!config.butcherBatchAlertEnabled) return [];
  const now = new Date();
  const alerts = [];
  const nameMap = Object.fromEntries(products.map((p) => [p._id, p.name]));

  for (const b of batches) {
    if (b.status !== 'active' || !b.expirationDate) continue;
    const exp = new Date(b.expirationDate);
    if (Number.isNaN(exp.getTime())) continue;
    const daysUntil = Math.floor((exp.getTime() - now.getTime()) / 86_400_000);
    const pName = nameMap[b.productId] || b.productName || 'Producto';

    if (daysUntil < 0) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherbatch-expired-${b._id}`, level: 'alert',
        category: 'butcher_batch_expired',
        title: 'Lote CADUCADO',
        message: `Lote ${b.batchNumber} de ${pName} CADUCADO desde el ${exp.toLocaleDateString('es-ES')}. Retirar inmediatamente.`,
        entityId: b._id, entityType: 'butcher_batch',
        route: '/saas/butcher-traceability',
        metadata: { batchNumber: b.batchNumber, productName: pName, expirationDate: b.expirationDate, daysExpired: Math.abs(daysUntil) },
        audience: ['manager', 'worker'],
      }));
    } else if (daysUntil <= config.butcherBatchExpiringDays) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherbatch-expiring-${b._id}`, level: 'warning',
        category: 'butcher_batch_expiring_soon',
        title: 'Lote proximo a caducar',
        message: `Lote ${b.batchNumber} de ${pName} caduca en ${daysUntil} dia${daysUntil !== 1 ? 's' : ''} (${exp.toLocaleDateString('es-ES')}). Priorizar venta.`,
        entityId: b._id, entityType: 'butcher_batch',
        route: '/saas/butcher-traceability',
        metadata: { batchNumber: b.batchNumber, productName: pName, expirationDate: b.expirationDate, daysLeft: daysUntil },
        audience: ['manager', 'worker'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rule 6: Waste anomaly -------------------------------------------------

async function checkButcherWaste(ctx, wasteRecords, batches, config) {
  if (!config.butcherWasteAlertEnabled) return [];
  const alerts = [];
  const today = new Date().toISOString().slice(0, 10);
  const todayRecs = wasteRecords.filter((r) => r.date === today);

  const totalWaste = todayRecs.reduce((s, r) => s + Number(r.wasteKg || 0), 0);
  const totalReception = batches.filter((b) => b.status === 'active').reduce((s, b) => s + Number(b.receptionWeightKg || 0), 0);
  const pct = totalReception > 0 ? (totalWaste / totalReception) * 100 : 0;

  if (totalReception > 0 && pct >= config.butcherWasteCriticalPct) {
    const a = await emit(ctx, {
      dedupKey: `butcherwaste-critical-${ctx.userId}-${today}`, level: 'alert',
      category: 'butcher_waste_critical', title: 'Merma CRITICA',
      message: `Merma del dia: ${totalWaste.toFixed(1)} kg (${pct.toFixed(1)}% sobre recepcion). Umbral critico: ${config.butcherWasteCriticalPct}%.`,
      route: '/saas/butcher-inventory',
      metadata: { totalWasteKg: totalWaste, wastePct: Math.round(pct * 10) / 10, threshold: config.butcherWasteCriticalPct },
      audience: ['manager'],
    });
    if (a) alerts.push(a);
  } else if (totalReception > 0 && pct >= config.butcherWasteWarningPct) {
    const a = await emit(ctx, {
      dedupKey: `butcherwaste-warning-${ctx.userId}-${today}`, level: 'warning',
      category: 'butcher_waste_anomaly', title: 'Merma anomala',
      message: `Merma del dia: ${totalWaste.toFixed(1)} kg (${pct.toFixed(1)}% sobre recepcion). Umbral: ${config.butcherWasteWarningPct}%.`,
      route: '/saas/butcher-inventory',
      metadata: { totalWasteKg: totalWaste, wastePct: Math.round(pct * 10) / 10, threshold: config.butcherWasteWarningPct },
      audience: ['manager'],
    });
    if (a) alerts.push(a);
  }

  // Merma de alto coste individual (registros de hoy)
  const highCostThreshold = config.butcherWasteHighCostThreshold;
  for (const r of todayRecs) {
    if (Number(r.estimatedCost || 0) > highCostThreshold) {
      const a = await emit(ctx, {
        dedupKey: `butcherwaste-highcost-${r._id}`, level: 'alert',
        category: 'butcher_waste_high', title: 'Merma de alto coste',
        message: `Registro de merma de ${Number(r.wasteKg).toFixed(1)} kg con coste ${Number(r.estimatedCost).toFixed(2)} € (umbral: ${highCostThreshold} €). Producto: ${r.catalogItemName || r.productName || 'N/A'}.`,
        entityId: r._id, entityType: 'butcher_waste',
        route: '/saas/butcher-inventory',
        metadata: { wasteId: r._id, estimatedCost: r.estimatedCost, wasteKg: r.wasteKg, productName: r.catalogItemName || r.productName },
        audience: ['manager'],
      });
      if (a) alerts.push(a);
    }
  }

  // Merma repetida (mismo producto N+ veces en X días)
  const repeatedDaysAgo = new Date(Date.now() - config.butcherWasteRepeatedDays * 86_400_000).toISOString().slice(0, 10);
  const recentRecs = wasteRecords.filter((r) => r.date >= repeatedDaysAgo);
  const productCounts = {};
  for (const r of recentRecs) {
    const pid = r.catalogItemId || r.productId;
    if (!pid) continue;
    if (!productCounts[pid]) productCounts[pid] = { count: 0, name: r.catalogItemName || r.productName || pid };
    productCounts[pid].count += 1;
  }
  for (const [pid, info] of Object.entries(productCounts)) {
    if (info.count >= config.butcherWasteRepeatedCount) {
      const a = await emit(ctx, {
        dedupKey: `butcherwaste-repeated-${pid}-${repeatedDaysAgo}`, level: 'warning',
        category: 'butcher_waste_repeated', title: 'Merma repetida en producto',
        message: `"${info.name}" tiene ${info.count} registros de merma en los últimos ${config.butcherWasteRepeatedDays} dias. Revisar causa raiz.`,
        entityId: pid, entityType: 'butcher_waste',
        route: '/saas/butcher-inventory',
        metadata: { productId: pid, occurrences: info.count, period: `${config.butcherWasteRepeatedDays}d` },
        audience: ['manager'],
      });
      if (a) alerts.push(a);
    }
  }

  // Producto caducado desechado hoy
  for (const r of todayRecs) {
    if (r.wasteType === 'caducado') {
      const a = await emit(ctx, {
        dedupKey: `butcherwaste-expired-${r._id}`, level: 'alert',
        category: 'butcher_waste_expired_product', title: 'Producto caducado desechado',
        message: `Merma por caducidad: ${Number(r.wasteKg).toFixed(1)} kg de "${r.catalogItemName || r.productName || 'N/A'}". Coste: ${Number(r.estimatedCost || 0).toFixed(2)} €.`,
        entityId: r._id, entityType: 'butcher_waste',
        route: '/saas/butcher-traceability',
        metadata: { wasteId: r._id, productName: r.catalogItemName || r.productName, wasteKg: r.wasteKg, estimatedCost: r.estimatedCost },
        audience: ['manager'],
      });
      if (a) alerts.push(a);
    }
  }

  // Pérdida elevada por lote
  const batchLossThreshold = config.butcherWasteBatchLossPct;
  const batchWasteMap = {};
  for (const r of wasteRecords) {
    if (!r.batchId) continue;
    if (!batchWasteMap[r.batchId]) batchWasteMap[r.batchId] = 0;
    batchWasteMap[r.batchId] += Number(r.wasteKg || 0);
  }
  for (const b of batches) {
    if (b.status !== 'active' || !b.receptionWeightKg) continue;
    const bId = b._id || b.batchNumber;
    const bWaste = batchWasteMap[bId] || batchWasteMap[b.batchNumber] || 0;
    if (bWaste <= 0) continue;
    const lossPct = (bWaste / Number(b.receptionWeightKg)) * 100;
    if (lossPct > batchLossThreshold) {
      const a = await emit(ctx, {
        dedupKey: `butcherwaste-batchloss-${bId}`, level: 'alert',
        category: 'butcher_waste_batch_loss', title: 'Pérdida elevada en lote',
        message: `Lote ${b.batchNumber || bId}: merma acumulada ${bWaste.toFixed(1)} kg (${lossPct.toFixed(1)}% de recepción). Umbral: ${batchLossThreshold}%.`,
        entityId: bId, entityType: 'butcher_batch',
        route: '/saas/butcher-traceability',
        metadata: { batchId: bId, batchNumber: b.batchNumber, totalWasteKg: bWaste, receptionKg: b.receptionWeightKg, lossPct: Math.round(lossPct * 10) / 10 },
        audience: ['manager'],
      });
      if (a) alerts.push(a);
    }
  }

  return alerts.filter(Boolean);
}

// --- Rule 7: Stale prices --------------------------------------------------

async function checkButcherPrices(ctx, products, config) {
  if (!config.butcherPriceAlertEnabled) return [];
  const now = new Date();
  const alerts = [];
  for (const p of products) {
    if (!p.active || !p.priceUpdatedAt) continue;
    const days = daysBetween(p.priceUpdatedAt, now);
    if (days >= config.butcherPriceStaleDays) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherprice-${p._id}`, level: 'warning',
        category: 'butcher_price_stale', title: 'Precio sin actualizar',
        message: `"${p.name}" lleva ${days} dias sin actualizar precio (ultimo: ${new Date(p.priceUpdatedAt).toLocaleDateString('es-ES')}).`,
        entityId: p._id, entityType: 'butcher_product',
        route: '/saas/butcher-products',
        metadata: { name: p.name, daysSinceUpdate: days, lastUpdate: p.priceUpdatedAt },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rule 8: Scale disconnected --------------------------------------------

async function checkButcherScales(ctx, scales, config) {
  if (!config.butcherScaleAlertEnabled) return [];
  const now = new Date();
  const alerts = [];
  for (const s of scales) {
    if (!s.lastPingAt) continue;
    const mins = minutesBetween(s.lastPingAt, now);
    if (mins >= config.butcherScaleTimeoutMinutes || s.connected === false) {
      if (s.connected !== false) {
        try {
          const db = getButcherDbName();
          await putDocument(fakeReq, db, { ...s, connected: false, updatedAt: now.toISOString() });
        } catch { /* non-critical */ }
      }
      alerts.push(await emit(ctx, {
        dedupKey: `butcherscale-${s.scaleId || s._id}`, level: 'alert',
        category: 'butcher_scale_disconnected', title: 'Bascula desconectada',
        message: `Bascula "${s.name}" desconectada desde hace ${mins} min. Ultimo ping: ${new Date(s.lastPingAt).toLocaleTimeString('es-ES')}.`,
        entityId: s._id, entityType: 'butcher_scale_status',
        route: '/saas/butcher-products',
        metadata: { scaleName: s.name, scaleId: s.scaleId, minutesAgo: mins, lastPing: s.lastPingAt },
        audience: ['worker'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rule 9: Register session pending close --------------------------------

async function checkButcherRegister(ctx, tpvSessions, config, pointsOfSale = []) {
  if (!config.butcherRegisterAlertEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const now = new Date();
  const alerts = [];
  for (const s of tpvSessions.filter((s) => s.status === 'open' && s.openedAt)) {
    const hours = (now.getTime() - new Date(s.openedAt).getTime()) / 3_600_000;
    if (hours >= config.butcherRegisterMaxHours) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherregister-${s._id}`, level: 'warning',
        category: 'butcher_register_pending', title: 'Caja pendiente de cierre',
        message: `Sesion de caja abierta desde ${new Date(s.openedAt).toLocaleTimeString('es-ES')} sin cerrar (${Math.floor(hours)}h).`,
        entityId: s._id, entityType: 'tpv_register_session',
        route: '/saas/worker/tasks',
        metadata: { sessionId: s._id, hoursOpen: Math.floor(hours), pendingTickets: s.pendingTickets || 0 },
        audience: ['worker', 'manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rule 10: Unpaid tickets -----------------------------------------------

async function checkButcherTickets(ctx, tpvSessions, config, pointsOfSale = []) {
  if (!config.butcherRegisterAlertEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const now = new Date();
  const alerts = [];
  for (const session of tpvSessions.filter((s) => s.status === 'open')) {
    const txs = Array.isArray(session.transactions) ? session.transactions : [];
    for (const tx of txs) {
      if (tx.status !== 'pending' || !tx.createdAt) continue;
      const mins = minutesBetween(tx.createdAt, now);
      if (mins >= config.butcherTicketUnpaidMinutes) {
        alerts.push(await emit(ctx, {
          dedupKey: `butcherticket-${tx.id || tx._id || session._id}`, level: 'warning',
          category: 'butcher_ticket_unpaid', title: 'Ticket sin cobro',
          message: `Ticket ${tx.ticketNumber || ''} pendiente de cobro desde hace ${mins} min. Total: ${Number(tx.total || 0).toFixed(2)} EUR.`,
          entityId: session._id, entityType: 'tpv_register_session',
          route: '/saas/worker/tasks',
          metadata: { ticketNumber: tx.ticketNumber, minutes: mins, total: tx.total },
          audience: ['worker'],
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

// --- Rule 11: Inventory discrepancy ----------------------------------------

async function checkButcherInventory(ctx, inventoryCounts, config) {
  if (!config.butcherInventoryAlertEnabled || inventoryCounts.length === 0) return [];
  const latest = inventoryCounts[0];
  const items = Array.isArray(latest.items) ? latest.items : [];
  const alerts = [];

  for (const item of items) {
    const absPct = Math.abs(item.differencePct || 0);
    if (absPct >= config.butcherInventoryCriticalPct) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherinv-critical-${latest._id}-${item.productId}`, level: 'alert',
        category: 'butcher_inventory_critical_discrepancy',
        title: 'Diferencia de inventario CRITICA',
        message: `${item.productName || 'Producto'}: esperado ${item.expectedKg} kg, contado ${item.countedKg} kg (${item.differencePct > 0 ? '+' : ''}${item.differencePct.toFixed(1)}%).`,
        entityType: 'butcher_inventory_count', route: '/saas/butcher-inventory',
        metadata: { productId: item.productId, expectedKg: item.expectedKg, countedKg: item.countedKg, differencePct: item.differencePct, countDate: latest.date },
        audience: ['manager'],
      }));
    } else if (absPct >= config.butcherInventoryWarningPct) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherinv-${latest._id}-${item.productId}`, level: 'warning',
        category: 'butcher_inventory_discrepancy',
        title: 'Diferencia de inventario',
        message: `${item.productName || 'Producto'}: esperado ${item.expectedKg} kg, contado ${item.countedKg} kg (${item.differencePct > 0 ? '+' : ''}${item.differencePct.toFixed(1)}%).`,
        entityType: 'butcher_inventory_count', route: '/saas/butcher-inventory',
        metadata: { productId: item.productId, expectedKg: item.expectedKg, countedKg: item.countedKg, differencePct: item.differencePct, countDate: latest.date },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rules 12-16: Purchase entry alerts ------------------------------------

async function checkButcherPurchases(ctx, purchaseEntries, config) {
  const alerts = [];
  const now = new Date();
  const graceMs = (config.butcherPurchaseNoInvoiceGraceHours || 48) * 3_600_000;
  const costThreshold = config.butcherPurchaseCostAnomalyThreshold || 0.20;

  for (const e of purchaseEntries) {
    if (e.status === 'draft') continue;

    // 12. Purchase without invoice (after grace period)
    if (!e.invoiceId && !e.invoiceNumber && e.confirmedAt) {
      const confirmedMs = new Date(e.confirmedAt).getTime();
      if (now.getTime() - confirmedMs > graceMs) {
        alerts.push(await emit(ctx, {
          dedupKey: `butcherpurchase-noinvoice-${e._id}`, level: 'warning',
          category: 'butcher_purchase_no_invoice', title: 'Compra sin factura',
          message: `Compra de ${e.supplierName || 'proveedor desconocido'} (${new Date(e.entryDate).toLocaleDateString('es-ES')}) sin factura asociada. ${e.totalCost.toFixed(2)}€.`,
          entityId: e._id, entityType: 'butcher_purchase_entry',
          route: `/saas/vertical/carniceria/compras?tab=historial`,
          metadata: { supplierName: e.supplierName, entryDate: e.entryDate, totalCost: e.totalCost },
          audience: ['manager'],
        }));
      }
    }

    // 13. Cost anomaly
    if (e.costAnomaly) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherpurchase-costanomaly-${e._id}`, level: 'warning',
        category: 'butcher_purchase_cost_anomaly', title: 'Coste superior al habitual',
        message: `Coste de ${e.productName}: ${e.costPerUnit.toFixed(2)}€/${e.unit} (+${e.costAnomalyPct}% sobre media de ${e.previousAvgCost.toFixed(2)}€/${e.unit}).`,
        entityId: e._id, entityType: 'butcher_purchase_entry',
        route: `/saas/vertical/carniceria/compras?tab=historial`,
        metadata: { productName: e.productName, costPerUnit: e.costPerUnit, previousAvg: e.previousAvgCost, anomalyPct: e.costAnomalyPct },
        audience: ['manager'],
      }));
    }

    // 14. Incomplete delivery
    if (!e.isComplete && e.quantityPurchased > 0) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherpurchase-incomplete-${e._id}`, level: 'warning',
        category: 'butcher_purchase_incomplete', title: 'Mercancía incompleta',
        message: `Entrega incompleta de ${e.supplierName}: recibidos ${e.quantityReceived}${e.unit} de ${e.quantityPurchased}${e.unit} pedidos (${e.productName}).`,
        entityId: e._id, entityType: 'butcher_purchase_entry',
        route: `/saas/vertical/carniceria/compras?tab=historial`,
        metadata: { supplierName: e.supplierName, received: e.quantityReceived, ordered: e.quantityPurchased, productName: e.productName },
        audience: ['manager'],
      }));
    }

    // 15. Lot without expiration date
    if (e.expirationRequired && !e.expirationDate) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherpurchase-noexpiry-${e._id}`, level: 'alert',
        category: 'butcher_purchase_lot_no_expiry', title: 'Lote sin caducidad',
        message: `Lote ${e.batchCode || 'N/A'} de ${e.productName} sin fecha de caducidad asignada.`,
        entityId: e._id, entityType: 'butcher_purchase_entry',
        route: `/saas/vertical/carniceria/compras?tab=lotes`,
        metadata: { batchCode: e.batchCode, productName: e.productName },
        audience: ['manager', 'worker'],
      }));
    }

    // 16. Unknown supplier (no CIF)
    if (!e.supplierCif && e.supplierName) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherpurchase-unknownsupplier-${e._id}`, level: 'warning',
        category: 'butcher_purchase_unknown_supplier', title: 'Proveedor no identificado',
        message: `Proveedor "${e.supplierName}" sin CIF verificado en compra del ${new Date(e.entryDate).toLocaleDateString('es-ES')}.`,
        entityId: e._id, entityType: 'butcher_purchase_entry',
        route: `/saas/vertical/carniceria/compras?tab=historial`,
        metadata: { supplierName: e.supplierName, entryDate: e.entryDate },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// --- Rules 17-19: Orders (encargos / reservas) -----------------------------

async function checkButcherOrders(ctx, orders, config) {
  if (config.butcherOrderAlertEnabled === false) return [];
  const alerts = [];
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'picked_up' || o.status === 'delivered') continue;

    if (o.status === 'ready' && o.pickupDate && o.pickupDate < today) {
      const daysLate = daysBetween(o.pickupDate, now);
      alerts.push(await emit(ctx, {
        dedupKey: `butcherorder-overdue-${o._id}`, level: 'warning',
        category: 'butcher_order_overdue_pickup',
        title: 'Pedido sin recoger',
        message: `${o.orderNumber || 'Pedido'} de ${o.clientName || 'cliente'} listo desde el ${o.pickupDate} (${daysLate} día${daysLate !== 1 ? 's' : ''} de retraso).`,
        entityId: o._id, entityType: 'butcher_order',
        route: '/saas/butcher-orders',
        metadata: { orderNumber: o.orderNumber, clientName: o.clientName, pickupDate: o.pickupDate, daysLate },
        audience: ['manager', 'worker'],
      }));
    }

    if (o.orderType === 'special' && o.status === 'pending' && o.pickupDate && o.pickupDate <= today) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherorder-special-${o._id}`, level: 'alert',
        category: 'butcher_special_not_prepared',
        title: 'Encargo especial sin preparar',
        message: `Encargo ${o.orderNumber || ''} de ${o.clientName || 'cliente'} para hoy sigue pendiente.`,
        entityId: o._id, entityType: 'butcher_order',
        route: '/saas/butcher-orders',
        metadata: { orderNumber: o.orderNumber, clientName: o.clientName, pickupDate: o.pickupDate },
        audience: ['manager', 'worker'],
      }));
    }

    if (['pending', 'preparing'].includes(o.status) && o.pickupDate && o.pickupDate < today) {
      alerts.push(await emit(ctx, {
        dedupKey: `butcherorder-late-${o._id}`, level: 'alert',
        category: 'butcher_order_late',
        title: 'Pedido atrasado',
        message: `${o.orderNumber || 'Pedido'} de ${o.clientName || 'cliente'} debía recogerse el ${o.pickupDate}.`,
        entityId: o._id, entityType: 'butcher_order',
        route: '/saas/butcher-orders',
        metadata: { orderNumber: o.orderNumber, clientName: o.clientName, pickupDate: o.pickupDate },
        audience: ['manager', 'worker'],
      }));
    }
  }

  const todayReservations = orders.filter(
    (o) => o.orderType === 'reservation' && o.pickupDate === today && !['cancelled', 'picked_up', 'delivered'].includes(o.status),
  );
  if (todayReservations.length > 0) {
    const a = await emit(ctx, {
      dedupKey: `butcherreservations-${ctx.userId}-${today}`, level: 'info',
      category: 'butcher_reservations_today',
      title: 'Reservas de hoy',
      message: `${todayReservations.length} reserva${todayReservations.length !== 1 ? 's' : ''} programada${todayReservations.length !== 1 ? 's' : ''} para hoy.`,
      route: '/saas/butcher-orders',
      metadata: { count: todayReservations.length, orders: todayReservations.map((o) => o.orderNumber) },
      audience: ['manager', 'worker'],
    });
    if (a) alerts.push(a);
  }

  return alerts.filter(Boolean);
}

// --- Main engine per business -----------------------------------------------

async function runButcherAlertsForBusiness(business) {
  const ownerId = business.owner_user_id;
  if (!ownerId) return 0;
  const account = await findAccountByUserId(fakeReq, ownerId);
  if (!account) return 0;

  const businessId = business._id?.replace('business:', '') || '';
  const config = getButcherAlertConfig(account);
  const ctx = { businessId, userId: ownerId };
  const results = [];

  const bDb = getButcherDbName();
  const dDb = getDeliveryDbName();
  const opsDb = getButcherOpsDbName();

  const [products, legacyBatches, opsLots, waste, scales, invCounts, tpvSessions, pointsOfSale, purchaseEntries, orders] = await Promise.all([
    fetchAllDocsOfType(bDb, 'butcher_product').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(bDb, 'butcher_batch').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(opsDb, 'bt_lote').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []),
    fetchAllDocsOfType(bDb, 'butcher_waste').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(bDb, 'butcher_scale_status').then((d) => d.filter((i) => i.business_id === businessId)),
    fetchAllDocsOfType(bDb, 'butcher_inventory_count').then((d) =>
      d.filter((i) => i.user_id === ownerId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    ),
    fetchAllDocsOfType(dDb, 'tpv_register_session').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(dDb, 'point_of_sale').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(bDb, 'butcher_purchase_entry').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)),
    fetchAllDocsOfType(bDb, 'butcher_order').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)),
  ]);

  // Preferir bt_lote (FEFO); legacy butcher_batch solo si no hay ops lotes
  const batches = opsLots.length > 0
    ? opsLots.map(mapOpsLotToBatchShape)
    : legacyBatches;

  if (products.length === 0 && batches.length === 0 && orders.length === 0) return 0;

  results.push(...await checkButcherStock(ctx, products, config));
  results.push(...await checkButcherBatches(ctx, batches, products, config));
  results.push(...await checkButcherWaste(ctx, waste, batches, config));
  results.push(...await checkButcherPrices(ctx, products, config));
  results.push(...await checkButcherScales(ctx, scales, config));
  results.push(...await checkButcherRegister(ctx, tpvSessions, config, pointsOfSale));
  results.push(...await checkButcherTickets(ctx, tpvSessions, config, pointsOfSale));
  results.push(...await checkButcherInventory(ctx, invCounts, config));
  results.push(...await checkButcherPurchases(ctx, purchaseEntries, config));
  results.push(...await checkButcherOrders(ctx, orders, config));

  try {
    const { runButcherAutoReorderForUser } = await import('./butcherAutoReorder.js');
    await runButcherAutoReorderForUser(fakeReq, ownerId);
  } catch { /* non-blocking */ }

  return results.length;
}

async function runScaleChecksForBusiness(business) {
  const ownerId = business.owner_user_id;
  if (!ownerId) return 0;
  const account = await findAccountByUserId(fakeReq, ownerId);
  if (!account) return 0;

  const businessId = business._id?.replace('business:', '') || '';
  const config = getButcherAlertConfig(account);
  const ctx = { businessId, userId: ownerId };

  const scales = await fetchAllDocsOfType(getButcherDbName(), 'butcher_scale_status')
    .then((d) => d.filter((i) => i.business_id === businessId));
  if (scales.length === 0) return 0;

  const results = await checkButcherScales(ctx, scales, config);
  return results.length;
}

// --- Public API -------------------------------------------------------------

export async function runButcherAlertEngine() {
  // Desactivado de momento (solo delivery / eventos / bar). No reactivar sin OK.
  return;
}

export async function runButcherScaleChecks() {
  // Desactivado de momento (mismo criterio que el motor principal).
  return;
}

// --- On-demand summary ------------------------------------------------------

export async function getButcherAlertSummary(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  const config = getButcherAlertConfig(account);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const bDb = getButcherDbName();
  const dDb = getDeliveryDbName();
  const opsDb = getButcherOpsDbName();

  const [products, legacyBatches, opsLots, waste, scales, invCounts, tpvSessions, purchaseEntries] = await Promise.all([
    fetchAllDocsOfType(bDb, 'butcher_product').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(bDb, 'butcher_batch').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(opsDb, 'bt_lote').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    fetchAllDocsOfType(bDb, 'butcher_waste').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(bDb, 'butcher_scale_status'),
    fetchAllDocsOfType(bDb, 'butcher_inventory_count').then((d) =>
      d.filter((i) => i.user_id === userId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    ),
    fetchAllDocsOfType(dDb, 'tpv_register_session').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(bDb, 'butcher_purchase_entry').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)),
  ]);

  const batches = opsLots.length > 0
    ? opsLots.map(mapOpsLotToBatchShape)
    : legacyBatches;

  const active = products.filter((p) => p.active);
  const outOfStock = active.filter((p) => p.minStockKg > 0 && Number(p.stockKg || 0) <= 0);
  const critStock = active.filter((p) => p.minStockKg > 0 && Number(p.stockKg || 0) > 0 && Number(p.stockKg) <= p.minStockKg * (config.butcherStockCriticalPct / 100));
  const lowStock = active.filter((p) => p.minStockKg > 0 && Number(p.stockKg || 0) > p.minStockKg * (config.butcherStockCriticalPct / 100) && Number(p.stockKg) <= p.minStockKg);

  const activeBatches = batches.filter((b) => b.status === 'active');
  const expired = activeBatches.filter((b) => b.expirationDate && new Date(b.expirationDate) < now);
  const expSoon = activeBatches.filter((b) => {
    if (!b.expirationDate) return false;
    const d = Math.floor((new Date(b.expirationDate).getTime() - now.getTime()) / 86_400_000);
    return d >= 0 && d <= config.butcherBatchExpiringDays;
  });

  const todayWaste = waste.filter((r) => r.date === today);
  const todayWasteKg = todayWaste.reduce((s, r) => s + Number(r.wasteKg || 0), 0);
  const totalRecKg = activeBatches.reduce((s, b) => s + Number(b.receptionWeightKg || 0), 0);
  const todayWastePct = totalRecKg > 0 ? Math.round((todayWasteKg / totalRecKg) * 1000) / 10 : 0;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekWasteKg = waste.filter((r) => r.date >= weekAgo).reduce((s, r) => s + Number(r.wasteKg || 0), 0);
  const weekAvgKg = Math.round((weekWasteKg / 7) * 100) / 100;

  const stalePrice = active.filter((p) => p.priceUpdatedAt && daysBetween(p.priceUpdatedAt, now) >= config.butcherPriceStaleDays);
  const connScales = scales.filter((s) => s.connected && minutesBetween(s.lastPingAt, now) < config.butcherScaleTimeoutMinutes);
  const discScales = scales.filter((s) => !s.connected || minutesBetween(s.lastPingAt, now) >= config.butcherScaleTimeoutMinutes);
  const openSessions = tpvSessions.filter((s) => s.status === 'open');
  const latestCount = invCounts[0] || null;
  const discreps = latestCount ? (latestCount.items || []).filter((i) => Math.abs(i.differencePct || 0) >= config.butcherInventoryWarningPct) : [];

  const confirmedEntries = purchaseEntries.filter((e) => e.status !== 'draft');
  const purchaseNoInvoice = confirmedEntries.filter((e) => !e.invoiceId && !e.invoiceNumber && e.confirmedAt && (now.getTime() - new Date(e.confirmedAt).getTime() > (config.butcherPurchaseNoInvoiceGraceHours || 48) * 3_600_000));
  const purchaseCostAnomaly = confirmedEntries.filter((e) => e.costAnomaly);
  const purchaseIncomplete = confirmedEntries.filter((e) => !e.isComplete && e.quantityPurchased > 0);
  const purchaseNoExpiry = confirmedEntries.filter((e) => e.expirationRequired && !e.expirationDate);
  const purchaseUnknownSupplier = confirmedEntries.filter((e) => !e.supplierCif && e.supplierName);

  const critical = outOfStock.length + expired.length + discScales.length + critStock.length
    + (todayWastePct >= config.butcherWasteCriticalPct ? 1 : 0) + purchaseNoExpiry.length;
  const warning = lowStock.length + expSoon.length + stalePrice.length + discreps.length
    + openSessions.filter((s) => (now.getTime() - new Date(s.openedAt).getTime()) / 3_600_000 >= config.butcherRegisterMaxHours).length
    + (todayWastePct >= config.butcherWasteWarningPct && todayWastePct < config.butcherWasteCriticalPct ? 1 : 0)
    + purchaseNoInvoice.length + purchaseCostAnomaly.length + purchaseIncomplete.length + purchaseUnknownSupplier.length;

  return {
    updatedAt: now.toISOString(), config,
    totals: { critical, warning, total: critical + warning },
    stock: {
      outOfStock: outOfStock.map((p) => ({ id: p._id, name: p.name, stockKg: Number(p.stockKg || 0), minStockKg: p.minStockKg })),
      critical: critStock.map((p) => ({ id: p._id, name: p.name, stockKg: Number(p.stockKg || 0), minStockKg: p.minStockKg })),
      lowStock: lowStock.map((p) => ({ id: p._id, name: p.name, stockKg: Number(p.stockKg || 0), minStockKg: p.minStockKg })),
    },
    batches: {
      expired: expired.map((b) => ({ id: b._id, batchNumber: b.batchNumber, product: b.productName, expirationDate: b.expirationDate, daysExpired: Math.abs(daysBetween(b.expirationDate, now)) })),
      expiringSoon: expSoon.map((b) => ({ id: b._id, batchNumber: b.batchNumber, product: b.productName, expirationDate: b.expirationDate, daysLeft: Math.floor((new Date(b.expirationDate).getTime() - now.getTime()) / 86_400_000) })),
    },
    waste: { todayKg: Math.round(todayWasteKg * 100) / 100, todayPct: todayWastePct, weekAvgKg, isAnomaly: todayWastePct >= config.butcherWasteWarningPct, threshold: config.butcherWasteWarningPct },
    prices: { staleProducts: stalePrice.map((p) => ({ id: p._id, name: p.name, lastUpdate: p.priceUpdatedAt, daysSinceUpdate: daysBetween(p.priceUpdatedAt, now) })) },
    scales: { connected: connScales.length, disconnected: discScales.map((s) => ({ scaleId: s.scaleId, name: s.name, lastPing: s.lastPingAt, minutesAgo: minutesBetween(s.lastPingAt, now) })) },
    register: { pendingSessions: openSessions.map((s) => ({ sessionId: s._id, openedAt: s.openedAt, hoursOpen: Math.floor((now.getTime() - new Date(s.openedAt).getTime()) / 3_600_000), pendingTickets: s.pendingTickets || 0 })) },
    inventory: { lastCountDate: latestCount?.date || null, discrepancies: discreps.map((i) => ({ productId: i.productId, name: i.productName, expectedKg: i.expectedKg, countedKg: i.countedKg, differencePct: i.differencePct })) },
    purchases: {
      noInvoice: purchaseNoInvoice.length,
      costAnomalies: purchaseCostAnomaly.length,
      incomplete: purchaseIncomplete.length,
      noExpiry: purchaseNoExpiry.length,
      unknownSupplier: purchaseUnknownSupplier.length,
      total: confirmedEntries.length,
    },
  };
}

// --- Scheduler --------------------------------------------------------------

let mainTimer = null;
let scaleTimer = null;

export function startButcherAlertEngine() {
  logger.info({ tag: TAG }, 'Motor alertas carniceria DESACTIVADO (no arranca ciclo)');
}

export function stopButcherAlertEngine() {
  if (mainTimer) { clearInterval(mainTimer); mainTimer = null; }
  if (scaleTimer) { clearInterval(scaleTimer); scaleTimer = null; }
}
