/**
 * Alert Engine — Motor unificado de inteligencia operativa (Fase 2)
 *
 * Ejecuta reglas de alerta periódicamente sobre los dominios:
 * Compras, Stock, Ventas, Operación, Equipo, Documentación, OCR y Conciliación.
 *
 * Fase 2: distribución por rol, nuevas reglas (equipo, docs, finanzas, verticales),
 * integración con emitGlobalAlert para canales, quietHours y dedup unificados.
 */

import {
  canEmitCatalogStockAlerts,
  filterStockTrackedCatalogItems,
  filterStockTrackedParts,
  hasPartsStockSetup,
} from './stockAlertUtils.js';
import { canEmitPdvCashAlerts } from './pdvAlertUtils.js';
import {
  canEmitCleaningAlerts,
  canEmitConstructionAlerts,
  canEmitCompraventaAlerts,
  canEmitDeliveryAlerts,
  usesDeliveryAlertMotor,
  canEmitDocumentsAlerts,
  canEmitFinanceAlerts,
  canEmitFleetAlerts,
  canEmitHrAlerts,
  canEmitPurchaseAlerts,
  canEmitScrapyardAlerts,
  canEmitVehicleAlerts,
  canEmitWebOrderAlerts,
  canEmitWorkshopAlerts,
} from './moduleAlertUtils.js';
import {
  ACCOUNTS_DB,
  BUSINESSES_DB,
  VEHICLES_DB,
  FLEET_DB,
  couchRequest,
  ensureDatabase,
  findAccountByUserId,
  getAllDocuments,
  getCatalogDbName,
  getClockinsDbName,
  getDeliveryDbName,
  getFinanceDbName,
  getPartsDbName,
  getWebDbName,
  getWorkshopDbName,
  getOcrLogsDbName,
  getDocumentsDbName,
  getInvoicesDbName,
  getCleaningDbName,
  getCleaningContractsDbName,
  getConstructionDbName,
  getScrapyardDbName,
  getScrapyardSalesDbName,
  getSalesDbName,
  getLeadsDbName,
} from './couchdb.js';
import { getSalaDbName } from './salaService.js';
import { getButcherDbName } from './butcherShop.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { runCompraventaAlerts, getCompraventaAlertConfig } from './compraventaAlertEngine.js';
import { runScrapyardAlerts, getScrapyardAlertConfig } from './scrapyardAlertEngine.js';
import { expireOverdueRequests, sendScheduledReminders } from './signatureAutomation.js';
import logger from './logger.js';

const ALERT_INTERVAL_MS = 3_600_000;
const STARTUP_DELAY_MS = 15_000;
const DEDUP_WINDOW_MS = 24 * 3_600_000;

const fakeReq = { headers: {} };

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(dateStr, now) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

async function fetchAllDocsOfType(dbName, type) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch {
    return [];
  }
}

async function fetchAllDocs(dbName) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
  } catch {
    return [];
  }
}

// ─── Alert emission helper (delegates to emitGlobalAlert) ────────────────────

async function emitAlert({ businessId, userId, category, source, priority, level, dedupKey, title, message, entityId, entityType, route, metadata, ruleId }) {
  return emitGlobalAlert({
    businessId: businessId || '',
    userId: userId || '',
    source: source || '',
    ruleId: ruleId || category,
    category,
    priority: priority || undefined,
    level: level || 'warning',
    title,
    message,
    entityId: entityId || '',
    entityType: entityType || '',
    route: route || '',
    metadata: metadata || {},
    dedupKey,
  });
}

const emit = emitAlert;

// ─── Config ──────────────────────────────────────────────────────────────────

function getAlertConfig(account) {
  const cfg = account?.alertConfig || {};
  return {
    lowStockEnabled: cfg.lowStockEnabled !== false,
    outOfStockEnabled: cfg.outOfStockEnabled !== false,
    partsLowStockEnabled: cfg.partsLowStockEnabled !== false,

    overdueInvoicesEnabled: cfg.overdueInvoicesEnabled !== false,
    highPayablesEnabled: cfg.highPayablesEnabled !== false,
    highPayablesThreshold: Number(cfg.highPayablesThreshold || 5000),
    pendingValidationAlertEnabled: cfg.pendingValidationAlertEnabled !== false,
    pendingValidationDays: Number(cfg.pendingValidationDays || 3),
    duplicateInvoiceAlertEnabled: cfg.duplicateInvoiceAlertEnabled !== false,
    missingDocumentAlertEnabled: cfg.missingDocumentAlertEnabled !== false,

    staleWebOrdersEnabled: cfg.staleWebOrdersEnabled !== false,
    staleWebOrderDays: Number(cfg.staleWebOrderDays || 2),
    staleDeliveryEnabled: cfg.staleDeliveryEnabled !== false,
    staleDeliveryMinutes: Number(cfg.staleDeliveryMinutes || 60),
    deliveryUnattendedEnabled: cfg.deliveryUnattendedEnabled !== false,
    deliveryUnattendedMinutes: Number(cfg.deliveryUnattendedMinutes || 5),
    deliveryUnpaidEnabled: cfg.deliveryUnpaidEnabled !== false,
    deliveryUnpaidMinutes: Number(cfg.deliveryUnpaidMinutes || 30),
    deliveryNoAddressEnabled: cfg.deliveryNoAddressEnabled !== false,
    deliveryChannelIncidentEnabled: cfg.deliveryChannelIncidentEnabled !== false,
    deliveryChannelIncidentThreshold: Number(cfg.deliveryChannelIncidentThreshold || 3),
    lowSalesEnabled: cfg.lowSalesEnabled !== false,
    lowSalesThreshold: Number(cfg.lowSalesThreshold || 0),

    vehicleStockAlertEnabled: cfg.vehicleStockAlertEnabled !== false,
    vehicleStockAlertDays: Number(cfg.vehicleStockAlertDays || account?.stockAlertDays || 30),
    vehicleLowMarginEnabled: cfg.vehicleLowMarginEnabled !== false,
    vehicleLowMarginThreshold: Number(cfg.vehicleLowMarginThreshold || 500),
    vehicleNoPhotosEnabled: cfg.vehicleNoPhotosEnabled !== false,
    vehicleNoPhotosAfterDays: Number(cfg.vehicleNoPhotosAfterDays || 2),
    vehicleIncompleteDataEnabled: cfg.vehicleIncompleteDataEnabled !== false,

    vehicleEntryAlertsEnabled: cfg.vehicleEntryAlertsEnabled !== false,
    vehicleMissingDocsAlertDays: Number(cfg.vehicleMissingDocsAlertDays || 7),
    vehicleMissingPriceAlertEnabled: cfg.vehicleMissingPriceAlertEnabled !== false,
    vehicleDuplicateAlertEnabled: cfg.vehicleDuplicateAlertEnabled !== false,

    staleWorkOrderEnabled: cfg.staleWorkOrderEnabled !== false,
    staleWorkOrderDays: Number(cfg.staleWorkOrderDays || 7),

    // Compras avanzadas
    weeklyPurchaseCheckEnabled: cfg.weeklyPurchaseCheckEnabled !== false,
    supplierNotDeliveringEnabled: cfg.supplierNotDeliveringEnabled !== false,
    supplierNotDeliveringDays: Number(cfg.supplierNotDeliveringDays || 3),
    pendingReceptionEnabled: cfg.pendingReceptionEnabled !== false,
    pendingReceptionDays: Number(cfg.pendingReceptionDays || 5),
    criticalProductAlertEnabled: cfg.criticalProductAlertEnabled !== false,

    pendingOrderEnabled: cfg.pendingOrderEnabled !== false,
    pendingOrderDaysThreshold: Number(cfg.pendingOrderDaysThreshold || 7),
    negativeStockEnabled: cfg.negativeStockEnabled !== false,

    // Equipo
    noClockInEnabled: cfg.noClockInEnabled !== false,
    noClockInCheckHour: Number(cfg.noClockInCheckHour || 10),
    lateClockInEnabled: cfg.lateClockInEnabled !== false,
    lateClockInToleranceMinutes: Number(cfg.lateClockInToleranceMinutes || 15),
    overtimeEnabled: cfg.overtimeEnabled ?? false,
    overtimeWeeklyMaxHours: Number(cfg.overtimeWeeklyMaxHours || 40),
    contractExpiringEnabled: cfg.contractExpiringEnabled !== false,
    contractExpiringDays: Number(cfg.contractExpiringDays || 30),

    // Documentación
    documentExpiryEnabled: cfg.documentExpiryEnabled !== false,
    documentExpiryDays: Number(cfg.documentExpiryDays || 30),
    missingRequiredDocsEnabled: cfg.missingRequiredDocsEnabled !== false,
    fleetItvAlertEnabled: cfg.fleetItvAlertEnabled !== false,
    fleetInsuranceAlertEnabled: cfg.fleetInsuranceAlertEnabled !== false,

    // Finanzas avanzado
    clientPaymentOverdueEnabled: cfg.clientPaymentOverdueEnabled !== false,
    negativeCashFlowEnabled: cfg.negativeCashFlowEnabled ?? false,

    // Facturacion clientes
    overdueClientInvoicesEnabled: cfg.overdueClientInvoicesEnabled !== false,
    unpaidClientInvoiceEnabled: cfg.unpaidClientInvoiceEnabled !== false,
    unpaidClientInvoiceDays: Number(cfg.unpaidClientInvoiceDays || 7),
    clientMultiplePendingEnabled: cfg.clientMultiplePendingEnabled !== false,
    clientMultiplePendingThreshold: Number(cfg.clientMultiplePendingThreshold || 3),

    // Pedidos de compra
    purchaseOrderDelayedEnabled: cfg.purchaseOrderDelayedEnabled !== false,

    // Facturas proveedor por email
    supplierInvoicePendingReviewEnabled: cfg.supplierInvoicePendingReviewEnabled !== false,
    supplierInvoicePendingReviewDays: Number(cfg.supplierInvoicePendingReviewDays || 3),
    supplierInvoiceOverdueEnabled: cfg.supplierInvoiceOverdueEnabled !== false,
    supplierInvoiceDuplicateAlertEnabled: cfg.supplierInvoiceDuplicateAlertEnabled !== false,
    supplierInvoiceUnknownSupplierEnabled: cfg.supplierInvoiceUnknownSupplierEnabled !== false,

    // Firma digital
    signaturePendingEnabled: cfg.signaturePendingEnabled !== false,
    signaturePendingDays: Number(cfg.signaturePendingDays || 3),
    signatureExpiredEnabled: cfg.signatureExpiredEnabled !== false,
    signatureRejectedEnabled: cfg.signatureRejectedEnabled !== false,

    // Materiales de limpieza
    materialNotDeliveredEnabled: cfg.materialNotDeliveredEnabled !== false,
    abnormalConsumptionEnabled: cfg.abnormalConsumptionEnabled !== false,
    abnormalConsumptionThreshold: Number(cfg.abnormalConsumptionThreshold || 2),
    materialExpiringEnabled: cfg.materialExpiringEnabled !== false,
    materialExpiringDays: Number(cfg.materialExpiringDays || 30),

    // Alertas vertical limpieza (ALLP-02)
    cleaning: {
      enabled: cfg.cleaning?.enabled !== false,
      serviceUncoveredEnabled: cfg.cleaning?.serviceUncoveredEnabled !== false,
      serviceUncoveredHoursBefore: Number(cfg.cleaning?.serviceUncoveredHoursBefore || 2),
      workerAbsentEnabled: cfg.cleaning?.workerAbsentEnabled !== false,
      workerAbsentGraceMinutes: Number(cfg.cleaning?.workerAbsentGraceMinutes || 15),
      clockinPendingEnabled: cfg.cleaning?.clockinPendingEnabled !== false,
      clockinPendingMinutesBefore: Number(cfg.cleaning?.clockinPendingMinutesBefore || 10),
      incidentOpenEnabled: cfg.cleaning?.incidentOpenEnabled !== false,
      incidentOpenEscalationHours: Number(cfg.cleaning?.incidentOpenEscalationHours || 4),
      incidentCriticalTypes: cfg.cleaning?.incidentCriticalTypes || ['ausencia', 'urgencia_extra', 'acceso_no_permitido'],
      clientUnpaidEnabled: cfg.cleaning?.clientUnpaidEnabled !== false,
      clientUnpaidGraceDays: Number(cfg.cleaning?.clientUnpaidGraceDays || 15),
      clientUnpaidHighThresholdDays: Number(cfg.cleaning?.clientUnpaidHighThresholdDays || 30),
      contractRenewalEnabled: cfg.cleaning?.contractRenewalEnabled !== false,
      contractRenewalDays: Number(cfg.cleaning?.contractRenewalDays || 30),
      contractRenewalHighDays: Number(cfg.cleaning?.contractRenewalHighDays || 7),
      materialCriticalEnabled: cfg.cleaning?.materialCriticalEnabled !== false,
      materialCriticalDaysLookahead: Number(cfg.cleaning?.materialCriticalDaysLookahead || 7),
      routeDelayEnabled: cfg.cleaning?.routeDelayEnabled !== false,
      routeDelayThresholdMinutes: Number(cfg.cleaning?.routeDelayThresholdMinutes || 15),
      routeDelayHighMinutes: Number(cfg.cleaning?.routeDelayHighMinutes || 30),
      excessHoursEnabled: cfg.cleaning?.excessHoursEnabled !== false,
      excessHoursWeeklyMax: Number(cfg.cleaning?.excessHoursWeeklyMax || 40),
      excessHoursDailyMax: Number(cfg.cleaning?.excessHoursDailyMax || 10),
      excessHoursWarningPercent: Number(cfg.cleaning?.excessHoursWarningPercent || 90),
      noPhotosEnabled: cfg.cleaning?.noPhotosEnabled ?? false,
      incompleteChecklistEnabled: cfg.cleaning?.incompleteChecklistEnabled ?? false,
      serviceOvertimeEnabled: cfg.cleaning?.serviceOvertimeEnabled !== false,
      serviceOvertimeThresholdMinutes: Number(cfg.cleaning?.serviceOvertimeThresholdMinutes || 30),
      engineIntervalSeconds: Number(cfg.cleaning?.engineIntervalSeconds || 120),
    },

    // Scrapyard / Desguace — piezas y despiece
    scrapyard: {
      partMissingPriceEnabled: cfg.scrapyard?.partMissingPriceEnabled !== false,
      partMissingLocationEnabled: cfg.scrapyard?.partMissingLocationEnabled !== false,
      partDuplicateReferenceEnabled: cfg.scrapyard?.partDuplicateReferenceEnabled !== false,
      partMissingPhotosEnabled: cfg.scrapyard?.partMissingPhotosEnabled !== false,
      dismantlingStalledEnabled: cfg.scrapyard?.dismantlingStalledEnabled !== false,
      dismantlingStalledDays: Number(cfg.scrapyard?.dismantlingStalledDays || 7),
    },

    // Rentabilidad compraventa (IR-08)
    lowAvgMarginEnabled: cfg.lowAvgMarginEnabled !== false,
    lowAvgMarginThreshold: Number(cfg.lowAvgMarginThreshold || 8),
    lowAvgMarginWindow: Number(cfg.lowAvgMarginWindow || 10),
    excessPrepCostEnabled: cfg.excessPrepCostEnabled !== false,
    excessPrepCostThreshold: Number(cfg.excessPrepCostThreshold || 1500),
  };
}

// ─── STOCK RULES ─────────────────────────────────────────────────────────────

async function checkLowStock(ctx, items, config, catalogInfraDocs = []) {
  if (!config.lowStockEnabled || !canEmitCatalogStockAlerts(items, catalogInfraDocs)) return [];
  const alerts = [];

  for (const item of filterStockTrackedCatalogItems(items)) {
    if (!item.minStock || item.minStock <= 0) continue;
    const qty = Number(item.stockQuantity || 0);
    const min = Number(item.minStock);

    if (qty <= 0 && config.outOfStockEnabled) {
      alerts.push(await emit({
        ...ctx, dedupKey: `outofstock-${item._id}`, level: 'alert', category: 'out_of_stock',
        source: 'stock', title: 'Producto sin stock',
        message: `"${item.name}" (${item.sku}) está agotado. Stock: 0 ${item.unit || 'ud'}.`,
        entityId: item._id, entityType: 'catalog_item', route: `/saas/catalog/${item._id}`,
        metadata: { sku: item.sku, name: item.name, stockQuantity: qty, minStock: min },
      }));
    } else if (qty > 0 && qty <= min) {
      alerts.push(await emit({
        ...ctx, dedupKey: `lowstock-${item._id}`, level: 'warning', category: 'low_stock',
        source: 'stock', title: 'Stock bajo',
        message: `"${item.name}" (${item.sku}) tiene ${qty} ${item.unit || 'ud'} (mínimo: ${min}).`,
        entityId: item._id, entityType: 'catalog_item', route: `/saas/catalog/${item._id}`,
        metadata: { sku: item.sku, name: item.name, stockQuantity: qty, minStock: min },
      }));
    }

    if (Array.isArray(item.warehouseStock)) {
      for (const ws of item.warehouseStock) {
        const wsQty = Number(ws.quantity || 0);
        const wsMin = Number(ws.minStock || 0);
        if (wsMin > 0 && wsQty > 0 && wsQty <= wsMin) {
          alerts.push(await emit({
            ...ctx, dedupKey: `lowstock-wh-${item._id}-${ws.warehouseId}`, level: 'warning', category: 'low_stock',
            source: 'stock', title: 'Stock bajo en almacén',
            message: `"${item.name}" tiene ${wsQty} ${item.unit || 'ud'} en ${ws.warehouseName || ws.warehouseId} (mínimo: ${wsMin}).`,
            entityId: item._id, entityType: 'catalog_item', route: '/saas/catalog?tab=stock',
            metadata: { sku: item.sku, name: item.name, warehouseId: ws.warehouseId, warehouseName: ws.warehouseName, stockQuantity: wsQty, minStock: wsMin },
          }));
        }
      }
    }
  }
  return alerts.filter(Boolean);
}

async function checkPartsLowStock(ctx, parts, config) {
  if (!config.partsLowStockEnabled || !hasPartsStockSetup(parts)) return [];
  const alerts = [];

  for (const part of filterStockTrackedParts(parts)) {
    const qty = Number(part.stockQuantity || 0);
    const min = Number(part.minStock);

    if (qty <= min) {
      alerts.push(await emit({
        ...ctx, dedupKey: `partlow-${part._id}`, level: qty <= 0 ? 'alert' : 'warning',
        category: 'parts_low_stock', source: 'stock',
        title: qty <= 0 ? 'Repuesto agotado' : 'Repuesto bajo stock',
        message: `"${part.name}" (${part.partNumber || part.reference || ''}) — stock: ${qty} (mín: ${min}).`,
        entityId: part._id, entityType: 'part', route: '/saas/workshop/parts',
        metadata: { partNumber: part.partNumber, name: part.name, stockQuantity: qty, minStock: min },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkNegativeStock(ctx, items, config, catalogInfraDocs = []) {
  if (!config.negativeStockEnabled || !canEmitCatalogStockAlerts(items, catalogInfraDocs)) return [];
  const alerts = [];

  for (const item of filterStockTrackedCatalogItems(items)) {
    const qty = Number(item.stockQuantity || 0);
    if (qty < 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `negstock-${item._id}`, level: 'alert', category: 'negative_stock',
        source: 'stock', title: 'Stock negativo',
        message: `"${item.name}" (${item.sku}) tiene stock negativo: ${qty} ${item.unit || 'ud'}.`,
        entityId: item._id, entityType: 'catalog_item', route: `/saas/catalog?tab=stock&itemId=${item._id}`,
        metadata: { sku: item.sku, name: item.name, stockQuantity: qty },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── FINANCE RULES ───────────────────────────────────────────────────────────

async function checkOverdueInvoices(ctx, invoices, config) {
  if (!config.overdueInvoicesEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const inv of invoices.filter((i) => i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now)) {
    const daysLate = daysBetween(inv.dueDate, now);
    alerts.push(await emit({
      ...ctx, dedupKey: `overdueinv-${inv._id}`, level: daysLate > 30 ? 'alert' : 'warning',
      category: 'overdue_purchase', source: 'finanzas', title: 'Factura de compra vencida',
      message: `Factura ${inv.invoiceNumber} de ${inv.supplierName || 'proveedor'} venció hace ${daysLate} días. Importe: ${inv.total?.toFixed(2) || '0.00'} €.`,
      entityId: inv._id, entityType: 'purchase_invoice', route: '/saas/suppliers/facturas',
      metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, total: inv.total, daysLate },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkSupplierInvoiceEmailAlerts(ctx, invoices, config) {
  const now = new Date();
  const alerts = [];
  const emailInvoices = invoices.filter((i) => i.source === 'email');

  // Facturas pendientes de revisión por mucho tiempo
  if (config.supplierInvoicePendingReviewEnabled) {
    const threshold = config.supplierInvoicePendingReviewDays || 3;
    for (const inv of emailInvoices.filter((i) => i.status === 'pending_review')) {
      const days = daysBetween(inv.createdAt, now);
      if (days >= threshold) {
        alerts.push(await emit({
          ...ctx, dedupKey: `sinv-pending-${inv._id}`, level: days > 7 ? 'alert' : 'warning',
          category: 'supplier_invoice_pending', source: 'facturas_proveedor',
          title: 'Factura de proveedor pendiente de revisar',
          message: `La factura ${inv.invoiceNumber || '(sin número)'} de ${inv.supplierName || inv.sourceEmailFrom || 'desconocido'} lleva ${days} días sin revisar.`,
          entityId: inv._id, entityType: 'purchase_invoice', route: `/saas/suppliers/facturas?invoiceId=${inv._id}`,
          metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, from: inv.sourceEmailFrom, days },
        }));
      }
    }
  }

  // Facturas con proveedor no identificado
  if (config.supplierInvoiceUnknownSupplierEnabled) {
    for (const inv of emailInvoices.filter((i) => i.flags?.supplierNotFound && i.status === 'pending_review')) {
      alerts.push(await emit({
        ...ctx, dedupKey: `sinv-unknown-${inv._id}`, level: 'warning',
        category: 'supplier_invoice_unknown', source: 'facturas_proveedor',
        title: 'Factura de proveedor no identificado',
        message: `Se recibió factura desde ${inv.sourceEmailFrom || 'email desconocido'} pero no se encontró proveedor registrado. Asigna manualmente.`,
        entityId: inv._id, entityType: 'purchase_invoice', route: `/saas/suppliers/facturas?invoiceId=${inv._id}`,
        metadata: { from: inv.sourceEmailFrom, emitter: inv.ocrData?.emitter, cif: inv.supplierCif },
      }));
    }
  }

  // Facturas posiblemente duplicadas
  if (config.supplierInvoiceDuplicateAlertEnabled) {
    for (const inv of emailInvoices.filter((i) => i.flags?.duplicate)) {
      alerts.push(await emit({
        ...ctx, dedupKey: `sinv-dup-${inv._id}`, level: 'warning',
        category: 'supplier_invoice_duplicate', source: 'facturas_proveedor',
        title: 'Posible factura duplicada',
        message: `La factura ${inv.invoiceNumber} de ${inv.supplierName || 'proveedor'} por ${inv.total?.toFixed(2) || '0.00'}€ podría estar duplicada.`,
        entityId: inv._id, entityType: 'purchase_invoice', route: `/saas/suppliers/facturas?invoiceId=${inv._id}`,
        metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, total: inv.total, duplicateOf: inv.flags?.duplicateOf },
      }));
    }
  }

  // Facturas por email vencidas
  if (config.supplierInvoiceOverdueEnabled) {
    for (const inv of emailInvoices.filter((i) => i.status === 'approved' && i.paymentStatus !== 'paid' && i.dueDate)) {
      const due = new Date(inv.dueDate);
      if (Number.isNaN(due.getTime()) || due >= now) continue;
      const daysLate = daysBetween(inv.dueDate, now);
      alerts.push(await emit({
        ...ctx, dedupKey: `sinv-overdue-${inv._id}`, level: daysLate > 15 ? 'critical' : 'warning',
        category: 'supplier_invoice_overdue', source: 'facturas_proveedor',
        title: 'Factura de proveedor vencida',
        message: `La factura ${inv.invoiceNumber} de ${inv.supplierName} por ${inv.total?.toFixed(2) || '0.00'}€ venció hace ${daysLate} días.`,
        entityId: inv._id, entityType: 'purchase_invoice', route: `/saas/suppliers/facturas?invoiceId=${inv._id}`,
        metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, total: inv.total, dueDate: inv.dueDate, daysLate },
      }));
    }
  }

  return alerts.filter(Boolean);
}

async function checkHighPayables(ctx, invoices, config) {
  if (!config.highPayablesEnabled || config.highPayablesThreshold <= 0) return [];

  const pendingTotal = invoices.filter((inv) => inv.status !== 'paid').reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  if (pendingTotal >= config.highPayablesThreshold) {
    const alert = await emit({
      ...ctx, dedupKey: `highpay-${ctx.userId}`, level: 'warning', category: 'high_payables',
      source: 'finanzas', title: 'Cuentas por pagar elevadas',
      message: `Total pendiente a proveedores: ${pendingTotal.toFixed(2)} € (umbral: ${config.highPayablesThreshold.toFixed(2)} €).`,
      entityType: 'purchase_invoice', route: '/saas/compras-stock/facturas-proveedor',
      metadata: { pendingTotal, threshold: config.highPayablesThreshold },
    });
    return alert ? [alert] : [];
  }
  return [];
}

async function checkPendingValidationInvoices(ctx, invoices, config) {
  if (!config.pendingValidationAlertEnabled) return [];
  const now = new Date();
  const alerts = [];
  const threshold = config.pendingValidationDays || 3;
  for (const inv of invoices) {
    const vs = inv.validationStatus || inv.status || 'pending_validation';
    if ((vs === 'pending_validation' || vs === 'pending') && inv.createdAt) {
      const days = daysBetween(inv.createdAt, now);
      if (days >= threshold) {
        alerts.push(await emit({
          ...ctx, dedupKey: `pendvalid-${inv._id}`, level: days > 7 ? 'alert' : 'warning',
          category: 'pending_validation_invoice', source: 'compras', title: 'Factura pendiente de validar',
          message: `Factura ${inv.invoiceNumber || 'sin num.'} de ${inv.supplierName || 'proveedor'} lleva ${days} dias sin validar.`,
          entityId: inv._id, entityType: 'purchase_invoice', route: '/saas/compras-stock/facturas-proveedor?tab=pending_validation',
          metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, days },
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

async function checkDuplicateInvoices(ctx, invoices, config) {
  if (!config.duplicateInvoiceAlertEnabled) return [];
  const alerts = [];
  for (const inv of invoices.filter((i) => i.duplicateWarning && !i.duplicateReviewed)) {
    alerts.push(await emit({
      ...ctx, dedupKey: `dupinv-${inv._id}`, level: 'warning',
      category: 'duplicate_invoice', source: 'compras', title: 'Posible factura duplicada',
      message: `Factura ${inv.invoiceNumber || 'sin num.'} de ${inv.supplierName || 'proveedor'} puede ser un duplicado.`,
      entityId: inv._id, entityType: 'purchase_invoice', route: '/saas/compras-stock/facturas-proveedor',
      metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, duplicateOf: inv.duplicateOf },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkMissingDocumentInvoices(ctx, invoices, config) {
  if (!config.missingDocumentAlertEnabled) return [];
  const alerts = [];
  for (const inv of invoices) {
    const vs = inv.validationStatus || inv.status;
    if ((vs === 'validated' || vs === 'paid') && !inv.pdfUrl) {
      alerts.push(await emit({
        ...ctx, dedupKey: `missdoc-${inv._id}`, level: 'info',
        category: 'invoice_missing_document', source: 'compras', title: 'Factura sin documento adjunto',
        message: `Factura ${inv.invoiceNumber || 'sin num.'} de ${inv.supplierName || 'proveedor'} no tiene PDF adjunto.`,
        entityId: inv._id, entityType: 'purchase_invoice', route: '/saas/compras-stock/facturas-proveedor',
        metadata: { invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkClientPaymentOverdue(ctx, financeDocs, config) {
  if (!config.clientPaymentOverdueEnabled) return [];
  const now = new Date();
  const alerts = [];

  const overdue = financeDocs.filter((d) =>
    d.type === 'cobro' && d.status === 'pending' && d.dueDate && new Date(d.dueDate) < now,
  );

  for (const doc of overdue) {
    const daysLate = daysBetween(doc.dueDate, now);
    alerts.push(await emit({
      ...ctx, dedupKey: `clientoverdue-${doc._id}`, level: daysLate > 30 ? 'alert' : 'warning',
      category: 'client_payment_overdue', source: 'finanzas', title: 'Impago de cliente',
      message: `Cobro pendiente de ${doc.clientName || 'cliente'} vencido hace ${daysLate} días. Importe: ${Number(doc.totalAmount || 0).toFixed(2)} €.`,
      entityId: doc._id, entityType: 'finance_movement', route: '/saas/finance',
      metadata: { clientName: doc.clientName, totalAmount: doc.totalAmount, daysLate },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkNegativeCashFlow(ctx, financeDocs, config) {
  if (!config.negativeCashFlowEnabled) return [];
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);

  const incomeMonth = financeDocs
    .filter((d) => d.type === 'cobro' && String(d.date || '').startsWith(monthStr))
    .reduce((s, d) => s + Number(d.totalAmount || 0), 0);
  const expenseMonth = financeDocs
    .filter((d) => d.type === 'pago' && String(d.date || '').startsWith(monthStr))
    .reduce((s, d) => s + Number(d.totalAmount || 0), 0);

  if (incomeMonth > 0 && expenseMonth > incomeMonth * 1.2) {
    const alert = await emit({
      ...ctx, dedupKey: `negcashflow-${ctx.userId}-${monthStr}`, level: 'alert',
      category: 'negative_cash_flow', source: 'finanzas', title: 'Flujo de caja negativo',
      message: `Gastos (${expenseMonth.toFixed(0)} €) superan ingresos (${incomeMonth.toFixed(0)} €) en un ${Math.round(((expenseMonth - incomeMonth) / incomeMonth) * 100)}% este mes.`,
      route: '/saas/finance', metadata: { incomeMonth, expenseMonth },
    });
    return alert ? [alert] : [];
  }
  return [];
}

async function checkTaxDeadline(ctx, financeDocs, config) {
  if (!config.taxDeadlineEnabled) return [];
  const now = new Date();
  const alerts = [];

  const obligations = financeDocs.filter((d) => d.type === 'tax_obligation' && !d.deletedAt);
  for (const ob of obligations) {
    if (ob.status === 'filed' || ob.status === 'paid' || !ob.dueDate) continue;
    const due = new Date(ob.dueDate);
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
    const remind = Number(ob.reminderDaysBefore || 7);

    if (daysLeft <= 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `taxoverdue-${ob._id}`, level: 'alert',
        category: 'tax_deadline_overdue', source: 'finanzas',
        title: 'Impuesto vencido',
        message: `${ob.modelName || ob.model} (${ob.periodLabel || ob.period}) venció hace ${Math.abs(daysLeft)} días.`,
        entityId: ob._id, entityType: 'tax_obligation', route: '/saas/taxes',
        metadata: { model: ob.model, period: ob.period, daysLeft },
      }));
    } else if (daysLeft <= remind) {
      alerts.push(await emit({
        ...ctx, dedupKey: `taxdue-${ob._id}`, level: 'warning',
        category: 'tax_deadline_approaching', source: 'finanzas',
        title: 'Vencimiento fiscal cercano',
        message: `${ob.modelName || ob.model} (${ob.periodLabel || ob.period}) vence en ${daysLeft} día(s).`,
        entityId: ob._id, entityType: 'tax_obligation', route: '/saas/taxes',
        metadata: { model: ob.model, period: ob.period, daysLeft },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkExpenseWithoutDocument(ctx, financeDocs, config) {
  if (!config.expenseDocumentEnabled) return [];
  const now = new Date();
  const graceDays = Number(config.expenseDocumentGraceDays || 7);
  const alerts = [];

  const expenses = financeDocs.filter((d) => d.type === 'pago' && !d.deletedAt);
  for (const exp of expenses) {
    const hasDoc = (Array.isArray(exp.linkedDocuments) && exp.linkedDocuments.length > 0)
      || exp.attachmentUrl
      || exp.linkedInvoiceId;
    if (hasDoc) continue;

    const created = new Date(exp.createdAt || exp.date);
    const daysOld = Math.ceil((now.getTime() - created.getTime()) / 86400000);
    if (daysOld < graceDays) continue;

    alerts.push(await emit({
      ...ctx, dedupKey: `expdoc-${exp._id}`, level: 'info',
      category: 'expense_without_document', source: 'finanzas',
      title: 'Gasto sin documento justificativo',
      message: `"${exp.concept}" (${Number(exp.totalAmount || 0).toFixed(2)} €) no tiene documento adjunto tras ${daysOld} días.`,
      entityId: exp._id, entityType: 'finance_movement', route: '/saas/income-expenses',
      metadata: { concept: exp.concept, totalAmount: exp.totalAmount, daysOld },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── SALES / OPERATIONS RULES ────────────────────────────────────────────────

async function checkStaleWebOrders(ctx, webOrders, config) {
  if (!config.staleWebOrdersEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const order of webOrders.filter((o) => ['pending', 'processing'].includes(o.status) && daysBetween(o.createdAt, now) >= config.staleWebOrderDays)) {
    const days = daysBetween(order.createdAt, now);
    alerts.push(await emit({
      ...ctx, dedupKey: `staleweb-${order._id}`, level: 'warning',
      category: 'stale_web_order', source: 'verticales', title: 'Pedido web sin procesar',
      message: `Pedido ${order.orderNumber || order._id.slice(-8)} lleva ${days} días pendiente.`,
      entityId: order._id, entityType: 'web_order', route: '/saas/web/orders',
      metadata: { orderNumber: order.orderNumber, days },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkStaleDeliveryOrders(ctx, deliveryOrders, config) {
  if (!config.staleDeliveryEnabled) return [];
  const now = new Date();
  const alerts = [];
  const activeStatuses = ['nuevo', 'cocina', 'listo'];

  const stale = deliveryOrders.filter((o) => {
    if (!activeStatuses.includes(o.status)) return false;
    const created = new Date(o.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    return (now.getTime() - created.getTime()) / 60_000 >= config.staleDeliveryMinutes;
  });

  for (const order of stale) {
    const minutes = Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 60_000);
    alerts.push(await emit({
      ...ctx, dedupKey: `staledeliv-${order._id}`, level: minutes > 120 ? 'alert' : 'warning',
      category: 'stale_delivery', source: 'delivery', title: 'Pedido delivery retrasado',
      message: `Pedido ${order.orderNumber || ''} lleva ${minutes} min en estado "${order.status}".`,
      entityId: order._id, entityType: 'delivery_order', route: '/saas/delivery-ops',
      metadata: { orderNumber: order.orderNumber, minutes, status: order.status },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDeliveryUnattended(ctx, deliveryOrders, config) {
  if (!config.deliveryUnattendedEnabled) return [];
  const now = new Date();
  const alerts = [];
  for (const order of deliveryOrders) {
    if (order.status !== 'nuevo') continue;
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
    if (minutes < config.deliveryUnattendedMinutes) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `unattended-${order._id}`, level: 'warning',
      category: 'delivery_unattended', source: 'delivery', title: 'Pedido nuevo sin atender',
      message: `Pedido ${order.orderNumber || ''} lleva ${minutes} min sin atender.`,
      entityId: order._id, entityType: 'delivery_order', route: '/saas/delivery-ops',
      metadata: { orderNumber: order.orderNumber, minutes },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDeliveryUnpaid(ctx, deliveryOrders, config) {
  if (!config.deliveryUnpaidEnabled) return [];
  const now = new Date();
  const alerts = [];
  for (const order of deliveryOrders) {
    if (order.status !== 'entregado') continue;
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') continue;
    const delivered = new Date(order.deliveredAt || order.updatedAt);
    if (Number.isNaN(delivered.getTime())) continue;
    const minutes = Math.floor((now.getTime() - delivered.getTime()) / 60_000);
    if (minutes < config.deliveryUnpaidMinutes) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `unpaid-${order._id}`, level: 'warning',
      category: 'delivery_unpaid', source: 'delivery', title: 'Pedido sin cobro',
      message: `Pedido ${order.orderNumber || ''} entregado hace ${minutes} min sin cobrar (${Number(order.totalAmount || 0).toFixed(2)}€).`,
      entityId: order._id, entityType: 'delivery_order', route: '/saas/delivery-ops',
      metadata: { orderNumber: order.orderNumber, totalAmount: order.totalAmount, minutes },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDeliveryNoAddress(ctx, deliveryOrders, config) {
  if (!config.deliveryNoAddressEnabled) return [];
  const alerts = [];
  for (const order of deliveryOrders) {
    if (order.status === 'cancelled' || order.status === 'entregado') continue;
    if (order.deliveryType !== 'domicilio') continue;
    if (order.customerAddress && order.customerAddress.trim()) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `noaddr-${order._id}`, level: 'alert',
      category: 'delivery_no_address', source: 'delivery', title: 'Pedido a domicilio sin dirección',
      message: `Pedido ${order.orderNumber || ''} es a domicilio pero no tiene dirección.`,
      entityId: order._id, entityType: 'delivery_order', route: '/saas/delivery-ops',
      metadata: { orderNumber: order.orderNumber },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDeliveryChannelIncident(ctx, deliveryOrders, config) {
  if (!config.deliveryChannelIncidentEnabled) return [];
  const now = new Date();
  const twoHoursAgo = now.getTime() - 2 * 3_600_000;
  const recentIncidents = deliveryOrders.filter((o) =>
    o.status === 'incident' && new Date(o.updatedAt || o.createdAt).getTime() >= twoHoursAgo
  );
  const byChannel = {};
  for (const o of recentIncidents) {
    const ch = o.channel || 'direct';
    byChannel[ch] = (byChannel[ch] || 0) + 1;
  }
  const alerts = [];
  for (const [channel, count] of Object.entries(byChannel)) {
    if (count < config.deliveryChannelIncidentThreshold) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `chincident-${channel}`, level: 'alert',
      category: 'delivery_channel_incident', source: 'delivery', title: 'Canal con incidencias',
      message: `Canal "${channel}" tiene ${count} pedidos con incidencia en las últimas 2 horas.`,
      entityType: 'delivery_order', route: '/saas/delivery-ops',
      metadata: { channel, count },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkVehicleStockAging(ctx, vehicles, config) {
  if (!config.vehicleStockAlertEnabled) return [];
  const now = new Date();
  const threshold = config.vehicleStockAlertDays;
  const alerts = [];

  for (const vehicle of vehicles.filter((v) => v.status === 'available' && v.active !== false)) {
    const baseDate = vehicle.purchaseDate || vehicle.createdAt;
    const days = daysBetween(baseDate, now);
    if (days < threshold) continue;
    if (vehicle.stockAlertSentAt && (now.getTime() - new Date(vehicle.stockAlertSentAt).getTime()) < DEDUP_WINDOW_MS) continue;

    const alert = await emit({
      ...ctx, dedupKey: `vehstock-${vehicle._id}`, level: days > threshold * 2 ? 'alert' : 'warning',
      category: 'vehicle_stock_aging', source: 'stock', title: 'Vehículo sin vender',
      message: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''}) lleva ${days} días en stock.`,
      entityId: vehicle._id, entityType: 'vehicle', route: `/saas/vehicles/${vehicle._id}`,
      metadata: { brand: vehicle.brand, model: vehicle.model, plate: vehicle.registrationPlate, days },
    });

    if (alert) {
      alerts.push(alert);
      try {
        const updated = { ...vehicle, stockAlertSentAt: now.toISOString(), updatedAt: now.toISOString() };
        await couchRequest(fakeReq, `/${encodeURIComponent(VEHICLES_DB)}/${encodeURIComponent(vehicle._id)}`, {
          method: 'PUT', body: JSON.stringify(updated),
        });
      } catch { /* non-critical */ }
    }
  }
  return alerts.filter(Boolean);
}

// ─── Vehicle entry alerts ────────────────────────────────────────────────────

const DEDUP_WINDOW_DOCS_MS = 48 * 3_600_000;
const DEDUP_WINDOW_PRICE_MS = 24 * 3_600_000;
const DEDUP_WINDOW_DUP_MS = 7 * 24 * 3_600_000;

async function checkVehiclesMissingDocs(ctx, vehicles, config) {
  if (config.vehicleEntryAlertsEnabled === false) return [];
  const now = new Date();
  const thresholdDays = config.vehicleMissingDocsAlertDays || 7;
  const alerts = [];

  for (const v of vehicles) {
    if (v.active === false || v.deletedAt) continue;
    if (v.status === 'sold' || v.status === 'scrapped') continue;
    const age = daysBetween(v.createdAt, now);
    if (age < thresholdDays) continue;
    const docs = Array.isArray(v.documents) ? v.documents : [];
    if (docs.length > 0) continue;

    alerts.push(await emitAlert({
      ...ctx, dedupKey: `vehmissdocs-${v._id}`, level: 'warning',
      category: 'vehicle_missing_docs', source: 'vehicle_entry',
      title: 'Vehículo sin documentación',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || ''}) no tiene documentación adjunta.`,
      entityId: v._id, entityType: 'vehicle', route: `/saas/vehicles/${v._id}`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate, days: age },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkVehiclesMissingPrice(ctx, vehicles, config) {
  if (config.vehicleMissingPriceAlertEnabled === false) return [];
  const alerts = [];

  for (const v of vehicles) {
    if (v.active === false || v.deletedAt) continue;
    if (v.status === 'sold' || v.status === 'scrapped') continue;
    if (v.purchasePrice && Number(v.purchasePrice) > 0) continue;

    alerts.push(await emitAlert({
      ...ctx, dedupKey: `vehmissprce-${v._id}`, level: 'alert',
      category: 'vehicle_missing_price', source: 'vehicle_entry',
      title: 'Vehículo sin precio de compra',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || ''}) no tiene precio de compra registrado.`,
      entityId: v._id, entityType: 'vehicle', route: `/saas/vehicles/${v._id}`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDuplicatePlates(ctx, vehicles) {
  const plateMap = {};
  for (const v of vehicles) {
    if (v.active === false || v.deletedAt) continue;
    const plate = (v.registrationPlate || '').toUpperCase().trim();
    if (!plate) continue;
    if (!plateMap[plate]) plateMap[plate] = [];
    plateMap[plate].push(v);
  }

  const alerts = [];
  for (const [plate, dupes] of Object.entries(plateMap)) {
    if (dupes.length < 2) continue;
    const labels = dupes.map((d) => `${d.brand} ${d.model}`).join(', ');
    alerts.push(await emitAlert({
      ...ctx, dedupKey: `vehduplate-${plate}`, level: 'alert', priority: 'critical',
      category: 'vehicle_duplicate_plate', source: 'vehicle_entry',
      title: 'Matrícula duplicada',
      message: `La matrícula ${plate} está registrada en más de un vehículo: ${labels}.`,
      entityId: dupes[0]._id, entityType: 'vehicle', route: '/saas/vehicles',
      metadata: { plate, count: dupes.length, vehicleIds: dupes.map((d) => d._id) },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDuplicateVins(ctx, vehicles) {
  const vinMap = {};
  for (const v of vehicles) {
    if (v.active === false || v.deletedAt) continue;
    const vin = (v.vin || '').toUpperCase().trim();
    if (!vin) continue;
    if (!vinMap[vin]) vinMap[vin] = [];
    vinMap[vin].push(v);
  }

  const alerts = [];
  for (const [vin, dupes] of Object.entries(vinMap)) {
    if (dupes.length < 2) continue;
    const labels = dupes.map((d) => `${d.brand} ${d.model} (${d.registrationPlate})`).join(', ');
    alerts.push(await emitAlert({
      ...ctx, dedupKey: `vehduvin-${vin}`, level: 'alert', priority: 'critical',
      category: 'vehicle_duplicate_vin', source: 'vehicle_entry',
      title: 'Bastidor duplicado',
      message: `El bastidor ${vin} está registrado en más de un vehículo: ${labels}.`,
      entityId: dupes[0]._id, entityType: 'vehicle', route: '/saas/vehicles',
      metadata: { vin, count: dupes.length, vehicleIds: dupes.map((d) => d._id) },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkStaleWorkOrders(ctx, workOrders, config) {
  if (!config.staleWorkOrderEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const wo of workOrders.filter((w) => ['pending', 'in_progress'].includes(w.status) && daysBetween(w.createdAt, now) >= config.staleWorkOrderDays)) {
    const days = daysBetween(wo.createdAt, now);
    alerts.push(await emit({
      ...ctx, dedupKey: `stalewo-${wo._id}`, level: days > config.staleWorkOrderDays * 2 ? 'alert' : 'warning',
      category: 'stale_work_order', source: 'taller', title: 'Orden de taller estancada',
      message: `OT ${wo.woNumber || wo._id.slice(-8)} lleva ${days} días en estado "${wo.status}".`,
      entityId: wo._id, entityType: 'work_order', route: '/saas/workshop',
      metadata: { woNumber: wo.woNumber, days, status: wo.status },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkLowSalesVelocity(ctx, vehicles, config) {
  if (!config.lowSalesEnabled) return [];
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();
  if (dayOfMonth < 7) return [];

  const userVehicles = vehicles.filter((v) => v.active !== false);
  const soldThisMonth = userVehicles.filter((v) => v.status === 'sold' && v.soldAt && new Date(v.soldAt) >= firstOfMonth).length;

  const last3Months = [];
  for (let m = 1; m <= 3; m++) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59);
    last3Months.push(userVehicles.filter((v) => v.status === 'sold' && v.soldAt && new Date(v.soldAt) >= start && new Date(v.soldAt) <= end).length);
  }

  const avgMonthly = last3Months.reduce((a, b) => a + b, 0) / (last3Months.length || 1);
  const threshold = config.lowSalesThreshold > 0 ? config.lowSalesThreshold : avgMonthly;
  if (threshold <= 0) return [];

  const projectedRate = (soldThisMonth / dayOfMonth) * 30;
  if (projectedRate < threshold * 0.5) {
    const alert = await emit({
      ...ctx, dedupKey: `lowsales-${ctx.userId}-${now.getFullYear()}-${now.getMonth()}`,
      level: 'warning', category: 'low_sales_velocity', source: 'finanzas',
      title: 'Velocidad de ventas baja',
      message: `${soldThisMonth} ventas este mes (proyección: ~${Math.round(projectedRate)}). Media últimos 3 meses: ${avgMonthly.toFixed(1)}.`,
      entityType: 'vehicle', route: '/saas/vehicles',
      metadata: { soldThisMonth, projectedRate: Math.round(projectedRate), avgMonthly: Math.round(avgMonthly * 10) / 10 },
    });
    return alert ? [alert] : [];
  }
  return [];
}

async function checkLowAvgMargin(ctx, vehicles, config) {
  if (!config.lowAvgMarginEnabled) return [];
  const soldVehicles = vehicles.filter(v => v.status === 'sold' && v.salePrice && v.active !== false);
  const recent = soldVehicles.slice(-config.lowAvgMarginWindow);
  if (recent.length < 3) return [];

  const totalRevenue = recent.reduce((s, v) => s + (v.salePrice || 0), 0);
  const totalMargin = recent.reduce((s, v) => s + ((v.salePrice || 0) - (v.purchasePrice || 0)), 0);
  const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  if (avgMarginPct < config.lowAvgMarginThreshold) {
    const now = new Date();
    const alert = await emit({
      ...ctx, dedupKey: `lowavgmargin-${ctx.userId}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`,
      level: avgMarginPct < config.lowAvgMarginThreshold / 2 ? 'high' : 'warning',
      category: 'low_avg_margin', source: 'informes',
      title: 'Margen medio por debajo del objetivo',
      message: `Margen medio ${avgMarginPct.toFixed(1)}% en las últimas ${recent.length} ventas (objetivo: ≥ ${config.lowAvgMarginThreshold}%).`,
      entityType: 'vehicle', route: '/saas/vertical/compraventa/informes',
      metadata: { avgMarginPct: Math.round(avgMarginPct * 10) / 10, window: recent.length, threshold: config.lowAvgMarginThreshold },
    });
    return alert ? [alert] : [];
  }
  return [];
}

async function checkExcessPreparationCost(ctx, vehicles, config) {
  if (!config.excessPrepCostEnabled) return [];
  const now = new Date();
  const threshold = config.excessPrepCostThreshold;
  const alerts = [];

  const offenders = vehicles.filter(v => {
    if (v.active === false || v.status === 'scrapped') return false;
    const costs = (v.associatedCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
    return costs > threshold;
  });

  if (offenders.length === 0) return [];

  const topOffenders = offenders.sort((a, b) => {
    const ca = (a.associatedCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
    const cb = (b.associatedCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
    return cb - ca;
  }).slice(0, 5);

  const alert = await emit({
    ...ctx, dedupKey: `excessprepcos-${ctx.userId}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`,
    level: offenders.length >= 5 ? 'high' : 'warning',
    category: 'excess_preparation_cost', source: 'informes',
    title: `${offenders.length} vehículo(s) con gastos de preparación excesivos`,
    message: `Superan el umbral de ${threshold} €. El más alto: ${topOffenders[0]?.registrationPlate || '?'} con ${(topOffenders[0]?.associatedCosts || []).reduce((s, c) => s + (c.amount || 0), 0)} €.`,
    entityType: 'vehicle', route: '/saas/vertical/compraventa/informes',
    metadata: { count: offenders.length, threshold, topPlates: topOffenders.map(v => v.registrationPlate) },
  });
  if (alert) alerts.push(alert);
  return alerts;
}

async function checkPendingPurchaseOrders(ctx, purchaseOrders, config) {
  if (!config.purchaseOrderDelayedEnabled) return [];
  const now = new Date();
  const alerts = [];
  const threshold = config.pendingOrderDaysThreshold || 7;

  const pending = purchaseOrders.filter((po) => {
    if (!['sent', 'pending', 'partial'].includes(po.status)) return false;
    if (po.expectedDate) return new Date(po.expectedDate) < now;
    if (po.sentAt) return daysBetween(po.sentAt, now) >= threshold;
    return daysBetween(po.createdAt, now) >= threshold;
  });

  for (const po of pending) {
    const refDate = po.expectedDate || po.sentAt || po.createdAt;
    const daysLate = daysBetween(refDate, now);
    alerts.push(await emit({
      ...ctx, dedupKey: `pendingpo-${po._id}`, level: daysLate > threshold * 2 ? 'alert' : 'warning',
      category: 'purchase_order_delayed', source: 'stock', title: 'Pedido de compra retrasado',
      message: `Pedido ${po.orderNumber} a ${po.supplierName || 'proveedor'} lleva ${daysLate} días sin recibirse.`,
      entityId: po._id, entityType: 'purchase_order', route: `/saas/compras-stock?tab=pedidos&orderId=${po._id}`,
      metadata: { orderNumber: po.orderNumber, supplierName: po.supplierName, daysLate, status: po.status },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── EQUIPO RULES ────────────────────────────────────────────────────────────

async function checkWorkerNoClockIn(ctx, members, clockinDocs, config) {
  if (!config.noClockInEnabled) return [];
  const now = new Date();
  if (now.getHours() < config.noClockInCheckHour) return [];

  const todayStr = now.toISOString().slice(0, 10);
  const todayClockins = clockinDocs.filter((d) => d.type === 'clockin' && d.date === todayStr);
  const clockedUserIds = new Set(todayClockins.map((d) => d.user_id));
  const alerts = [];

  for (const member of members) {
    if (!member.user_id || member.status === 'inactive') continue;
    if (clockedUserIds.has(member.user_id)) continue;

    alerts.push(await emit({
      ...ctx, dedupKey: `noclockin-${member.user_id}-${todayStr}`, level: 'warning',
      category: 'worker_no_clockin', source: 'equipo', title: 'Trabajador no fichó',
      message: `${member.name || member.email || member.user_id} no ha fichado hoy.`,
      entityId: member.user_id, entityType: 'team_member', route: '/saas/clockins',
      metadata: { memberName: member.name, date: todayStr },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkContractExpiring(ctx, members, config) {
  if (!config.contractExpiringEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const member of members) {
    if (!member.contractEndDate || member.status === 'inactive') continue;
    const daysLeft = daysBetween(now.toISOString(), new Date(member.contractEndDate));
    if (daysLeft < 0) continue;

    const daysUntilExpiry = Math.abs(daysBetween(member.contractEndDate, now));
    if (new Date(member.contractEndDate) > now && daysUntilExpiry <= config.contractExpiringDays) {
      alerts.push(await emit({
        ...ctx, dedupKey: `contract-${member.user_id}`, level: daysUntilExpiry <= 7 ? 'alert' : 'warning',
        category: 'contract_expiring', source: 'equipo', title: 'Contrato próximo a vencer',
        message: `El contrato de ${member.name || member.email} vence en ${daysUntilExpiry} días (${new Date(member.contractEndDate).toLocaleDateString('es-ES')}).`,
        entityId: member.user_id, entityType: 'team_member', route: '/saas/team',
        metadata: { memberName: member.name, contractEndDate: member.contractEndDate, daysUntilExpiry },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── DOCUMENTACIÓN RULES ─────────────────────────────────────────────────────

async function checkFleetDocumentExpiry(ctx, fleetVehicles, config) {
  if (!config.fleetItvAlertEnabled && !config.fleetInsuranceAlertEnabled) return [];
  const now = new Date();
  const threshold = config.documentExpiryDays || 30;
  const alerts = [];

  for (const vehicle of fleetVehicles) {
    if (vehicle.active === false) continue;
    const label = `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.plate || vehicle.registrationPlate || ''})`.trim();

    if (config.fleetItvAlertEnabled && vehicle.itvDate) {
      const itvDate = new Date(vehicle.itvDate);
      const daysUntil = Math.floor((itvDate.getTime() - now.getTime()) / 86_400_000);

      if (daysUntil < 0) {
        alerts.push(await emit({
          ...ctx, dedupKey: `itv-expired-${vehicle._id}`, level: 'alert',
          category: 'fleet_itv_expiring', source: 'documentacion', title: 'ITV caducada',
          message: `${label} tiene la ITV caducada desde hace ${Math.abs(daysUntil)} días.`,
          entityId: vehicle._id, entityType: 'fleet_vehicle', route: '/saas/fleet',
          metadata: { vehicleLabel: label, itvDate: vehicle.itvDate, daysOverdue: Math.abs(daysUntil) },
        }));
      } else if (daysUntil <= threshold) {
        alerts.push(await emit({
          ...ctx, dedupKey: `itv-expiring-${vehicle._id}`, level: 'warning',
          category: 'fleet_itv_expiring', source: 'documentacion', title: 'ITV próxima a vencer',
          message: `${label} — ITV vence en ${daysUntil} días (${itvDate.toLocaleDateString('es-ES')}).`,
          entityId: vehicle._id, entityType: 'fleet_vehicle', route: '/saas/fleet',
          metadata: { vehicleLabel: label, itvDate: vehicle.itvDate, daysUntil },
        }));
      }
    }

    if (config.fleetInsuranceAlertEnabled && vehicle.insuranceExpiryDate) {
      const insDate = new Date(vehicle.insuranceExpiryDate);
      const daysUntil = Math.floor((insDate.getTime() - now.getTime()) / 86_400_000);

      if (daysUntil < 0) {
        alerts.push(await emit({
          ...ctx, dedupKey: `ins-expired-${vehicle._id}`, level: 'alert',
          category: 'fleet_insurance_expiring', source: 'documentacion', title: 'Seguro caducado',
          message: `${label} tiene el seguro caducado desde hace ${Math.abs(daysUntil)} días.`,
          entityId: vehicle._id, entityType: 'fleet_vehicle', route: '/saas/fleet',
          metadata: { vehicleLabel: label, insuranceExpiryDate: vehicle.insuranceExpiryDate, daysOverdue: Math.abs(daysUntil) },
        }));
      } else if (daysUntil <= threshold) {
        alerts.push(await emit({
          ...ctx, dedupKey: `ins-expiring-${vehicle._id}`, level: 'warning',
          category: 'fleet_insurance_expiring', source: 'documentacion', title: 'Seguro próximo a vencer',
          message: `${label} — seguro vence en ${daysUntil} días (${insDate.toLocaleDateString('es-ES')}).`,
          entityId: vehicle._id, entityType: 'fleet_vehicle', route: '/saas/fleet',
          metadata: { vehicleLabel: label, insuranceExpiryDate: vehicle.insuranceExpiryDate, daysUntil },
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

async function checkDocumentExpiry(ctx, documents, config) {
  if (!config.documentExpiryEnabled) return [];
  const now = new Date();
  const threshold = config.documentExpiryDays || 30;
  const alerts = [];

  for (const doc of documents) {
    const expiryField = doc.expiresAt || doc.expiryDate || doc.expirationDate || doc.validUntil;
    if (!expiryField) continue;

    const expiryDate = new Date(expiryField);
    if (Number.isNaN(expiryDate.getTime())) continue;
    const daysUntil = Math.floor((expiryDate.getTime() - now.getTime()) / 86_400_000);
    const docId = doc.id || doc._id;
    const docRoute = docId ? `/saas/documents/${encodeURIComponent(docId)}` : '/saas/documents';

    if (daysUntil < 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `docexp-${doc._id}`, level: 'alert',
        category: 'document_expired', source: 'documentacion', title: 'Documento caducado',
        message: `"${doc.name || doc.title || doc._id}" caducó hace ${Math.abs(daysUntil)} días.`,
        entityId: doc._id, entityType: doc.type || 'document', route: docRoute,
        metadata: { documentName: doc.name || doc.title, expiryDate: expiryField, daysOverdue: Math.abs(daysUntil) },
      }));
    } else if (daysUntil <= threshold) {
      alerts.push(await emit({
        ...ctx, dedupKey: `docexpiring-${doc._id}`, level: 'warning',
        category: 'document_expiring_soon', source: 'documentacion', title: 'Documento próximo a caducar',
        message: `"${doc.name || doc.title || doc._id}" caduca en ${daysUntil} días (${expiryDate.toLocaleDateString('es-ES')}).`,
        entityId: doc._id, entityType: doc.type || 'document', route: docRoute,
        metadata: { documentName: doc.name || doc.title, expiryDate: expiryField, daysUntil },
      }));
    }
  }
  return alerts.filter(Boolean);
}

const REQUIRED_DOCS_BY_CATEGORY = {
  society: ['Estatutos', 'CIF', 'IAE'],
  licenses: ['Licencia de Apertura', 'Licencia de Actividad'],
};

const REQUIRED_DOC_CATEGORY_LABELS = {
  society: 'Sociedad',
  licenses: 'Licencias',
};

async function checkMissingRequiredDocs(ctx, documents, config) {
  if (config.missingRequiredDocsEnabled === false) return [];
  const existingNames = documents.map((d) => (d.name || '').toLowerCase().trim());
  const alerts = [];

  for (const [category, required] of Object.entries(REQUIRED_DOCS_BY_CATEGORY)) {
    for (const reqName of required) {
      if (existingNames.includes(reqName.toLowerCase())) continue;
      alerts.push(await emit({
        ...ctx,
        dedupKey: `missreq-${category}-${reqName.toLowerCase().replace(/\s+/g, '-')}`,
        level: 'info',
        category: 'document_missing_required',
        source: 'documentacion',
        title: 'Documento obligatorio faltante',
        message: `Falta "${reqName}" en ${REQUIRED_DOC_CATEGORY_LABELS[category] || category}.`,
        entityType: 'document',
        route: `/saas/documents?tab=${category}`,
        metadata: { requiredName: reqName, docCategory: category },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── COMPRAVENTA DOCUMENT RULES ───────────────────────────────────────────────

const REQUIRED_VEHICLE_DOC_SUBS = [
  'permiso_circulacion', 'ficha_tecnica', 'contrato_compra', 'factura_compra', 'itv',
];

const DOC_SUB_LABELS = {
  permiso_circulacion: 'Permiso de circulación',
  ficha_tecnica: 'Ficha técnica',
  contrato_compra: 'Contrato de compra',
  factura_compra: 'Factura de compra',
  itv: 'ITV',
};

async function checkMissingVehicleDocs(ctx, documents, config) {
  if (!config.missingVehicleDocsEnabled) return [];
  const alerts = [];
  const byVehicle = {};
  for (const doc of documents) {
    if (!doc.vehicleId) continue;
    if (!byVehicle[doc.vehicleId]) byVehicle[doc.vehicleId] = { plate: doc.registrationPlate || doc.vehicleName || doc.vehicleId, docs: [] };
    byVehicle[doc.vehicleId].docs.push(doc);
  }
  for (const [vid, info] of Object.entries(byVehicle)) {
    const presentSubs = new Set(info.docs.map(d => d.docSubCategory));
    const missing = REQUIRED_VEHICLE_DOC_SUBS.filter(s => !presentSubs.has(s));
    if (missing.length === 0) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `missvdocs-${vid}`, level: 'warning',
      category: 'missing_vehicle_docs', source: 'documentacion', title: 'Documentos de vehículo faltantes',
      message: `${info.plate}: faltan ${missing.length} docs obligatorios (${missing.map(m => DOC_SUB_LABELS[m] || m).join(', ')}).`,
      entityId: vid, entityType: 'vehicle', route: `/saas/documents?vehicleId=${vid}`,
      metadata: { vehicleId: vid, plate: info.plate, missing },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkItvExpiry(ctx, documents, config) {
  if (!config.itvExpiryEnabled) return [];
  const now = new Date();
  const threshold = config.itvExpiryDays || 30;
  const alerts = [];
  for (const doc of documents) {
    if (doc.docSubCategory !== 'itv' || !doc.itvExpiryDate) continue;
    const exp = new Date(doc.itvExpiryDate);
    if (Number.isNaN(exp.getTime())) continue;
    const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86_400_000);
    const label = doc.registrationPlate || doc.vehicleName || doc.name;
    if (daysLeft < 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `itvexp-${doc._id}`, level: 'alert',
        category: 'itv_expired', source: 'documentacion', title: 'ITV caducada',
        message: `ITV caducada hace ${Math.abs(daysLeft)} días — ${label}.`,
        entityId: doc.vehicleId || doc._id, entityType: 'vehicle', route: doc.vehicleId ? `/saas/vehicles/${doc.vehicleId}` : '/saas/documents',
        metadata: { registrationPlate: doc.registrationPlate, itvExpiryDate: doc.itvExpiryDate, daysOverdue: Math.abs(daysLeft) },
      }));
    } else if (daysLeft <= threshold) {
      alerts.push(await emit({
        ...ctx, dedupKey: `itvexpiring-${doc._id}`, level: 'warning',
        category: 'itv_expiring', source: 'documentacion', title: 'ITV próxima a caducar',
        message: `ITV caduca en ${daysLeft} días — ${label}.`,
        entityId: doc.vehicleId || doc._id, entityType: 'vehicle', route: doc.vehicleId ? `/saas/vehicles/${doc.vehicleId}` : '/saas/documents',
        metadata: { registrationPlate: doc.registrationPlate, itvExpiryDate: doc.itvExpiryDate, daysUntil: daysLeft },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkPendingContracts(ctx, documents, config) {
  if (!config.pendingContractsEnabled) return [];
  const now = new Date();
  const thresholdHours = config.pendingContractHours || 48;
  const alerts = [];
  for (const doc of documents) {
    if (!['contrato_compra', 'contrato_venta'].includes(doc.docSubCategory)) continue;
    if (doc.status !== 'draft') continue;
    const created = new Date(doc.createdAt);
    const hoursOld = (now.getTime() - created.getTime()) / 3_600_000;
    if (hoursOld < thresholdHours) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `pendingcontract-${doc._id}`, level: 'warning',
      category: 'contract_pending_sign', source: 'documentacion', title: 'Contrato pendiente de firma',
      message: `"${doc.name}" lleva ${Math.floor(hoursOld / 24)} días sin firmar.`,
      entityId: doc._id, entityType: 'document', route: `/saas/documents/${doc._id}`,
      metadata: { documentName: doc.name, hoursOld: Math.round(hoursOld) },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkIncompleteOcr(ctx, documents, config) {
  if (!config.incompleteOcrEnabled) return [];
  const now = new Date();
  const maxDays = config.incompleteOcrMaxDays || 7;
  const threshold = config.incompleteOcrThreshold || 60;
  const alerts = [];
  for (const doc of documents) {
    if (!doc.ocrData || !doc.ocrConfidence) continue;
    if (doc.ocrConfidence >= threshold) continue;
    const created = new Date(doc.createdAt);
    const daysOld = Math.ceil((now.getTime() - created.getTime()) / 86_400_000);
    if (daysOld > maxDays) continue;
    alerts.push(await emit({
      ...ctx, dedupKey: `incompleteocr-${doc._id}`, level: 'info',
      category: 'ocr_incomplete', source: 'documentacion', title: 'OCR con baja confianza',
      message: `"${doc.name}" tiene OCR al ${doc.ocrConfidence}% — revisa manualmente.`,
      entityId: doc._id, entityType: 'document', route: `/saas/documents/${doc._id}`,
      metadata: { documentName: doc.name, ocrConfidence: doc.ocrConfidence },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── SIGNATURE RULES ─────────────────────────────────────────────────────────

async function checkPendingSignatures(ctx, signatureRequests, config) {
  if (!config.signaturePendingEnabled) return [];
  const now = new Date();
  const alerts = [];

  const pending = signatureRequests.filter((sr) => ['pending', 'partially_signed'].includes(sr.status));

  for (const sr of pending) {
    const sentEvt = sr.events?.find((e) => e.action === 'sent');
    const sentDate = sentEvt ? new Date(sentEvt.timestamp) : new Date(sr.createdAt);
    const daysSince = Math.floor((now.getTime() - sentDate.getTime()) / 86_400_000);
    if (daysSince < config.signaturePendingDays) continue;

    const ps = sr.signers.filter((s) => s.role === 'signer' && s.status === 'pending');

    alerts.push(await emit({
      ...ctx, dedupKey: `sigpending-${sr._id}`,
      level: daysSince > config.signaturePendingDays * 2 ? 'alert' : 'warning',
      category: 'signature_pending', source: 'documentacion',
      title: 'Documento pendiente de firma',
      message: `"${sr.documentName}" lleva ${daysSince} d\u00edas pendiente. ${ps.length} firmante(s) sin firmar.`,
      entityId: sr._id, entityType: 'signature_request',
      route: '/saas/documents?signature=' + sr._id,
      metadata: { documentName: sr.documentName, daysSince, pendingCount: ps.length },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkRejectedSignatures(ctx, signatureRequests, config) {
  if (!config.signatureRejectedEnabled) return [];
  const alerts = [];

  const rejected = signatureRequests.filter((sr) => sr.status === 'rejected');

  for (const sr of rejected) {
    const rejSigner = sr.signers.find((s) => s.status === 'rejected');
    if (!rejSigner) continue;

    alerts.push(await emit({
      ...ctx, dedupKey: `sigrejected-${sr._id}`, level: 'alert',
      category: 'signature_rejected', source: 'documentacion',
      title: 'Firma rechazada',
      message: `"${sr.documentName}" fue rechazada por ${rejSigner.name}${rejSigner.rejectionReason ? ': "' + rejSigner.rejectionReason + '"' : ''}.`,
      entityId: sr._id, entityType: 'signature_request',
      route: '/saas/documents?signature=' + sr._id,
      metadata: { documentName: sr.documentName, rejectedBy: rejSigner.name, reason: rejSigner.rejectionReason || '' },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkExpiringSignatures(ctx, signatureRequests, config) {
  if (!config.signatureExpiredEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const sr of signatureRequests) {
    if (!['pending', 'partially_signed'].includes(sr.status) || !sr.expiresAt) continue;
    const hoursLeft = (new Date(sr.expiresAt).getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft > 48 || hoursLeft <= 0) continue;

    const ps = sr.signers.filter((s) => s.role === 'signer' && s.status === 'pending');
    const timeLabel = hoursLeft < 24 ? Math.floor(hoursLeft) + 'h' : Math.ceil(hoursLeft / 24) + ' d\u00edas';

    alerts.push(await emit({
      ...ctx, dedupKey: `sigexpiring-${sr._id}`,
      level: hoursLeft < 24 ? 'alert' : 'warning',
      category: 'signature_expiring', source: 'documentacion',
      title: 'Firma a punto de caducar',
      message: `"${sr.documentName}" caduca en ${timeLabel}. ${ps.length} firmante(s) pendiente(s).`,
      entityId: sr._id, entityType: 'signature_request',
      route: '/saas/documents?signature=' + sr._id,
      metadata: { documentName: sr.documentName, hoursLeft: Math.floor(hoursLeft), expiresAt: sr.expiresAt },
    }));
  }
  return alerts.filter(Boolean);
}

// ── 10. Falta compra semanal ─────────────────────────────────────────────────

async function checkWeeklyPurchaseMissing(userId, purchaseOrders, catalogItems, config) {
  if (!config.weeklyPurchaseCheckEnabled) return [];
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const recentOrders = purchaseOrders.filter((o) => {
    const created = new Date(o.createdAt);
    return !Number.isNaN(created.getTime()) && created >= oneWeekAgo;
  });

  if (recentOrders.length > 0) return [];

  if (!canEmitCatalogStockAlerts(catalogItems)) return [];

  const lowStockCount = filterStockTrackedCatalogItems(catalogItems)
    .filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) < i.minStock).length;
  if (lowStockCount === 0) return [];

  const alert = await emitAlert({
    userId,
    dedupKey: `weeklypurchase-${userId}`,
    level: 'warning',
    category: 'weekly_purchase_missing',
    title: 'Sin compras esta semana',
    message: `No se ha creado ningún pedido de compra en los últimos 7 días y hay ${lowStockCount} producto(s) con stock bajo.`,
    entityType: 'purchase_order',
    route: '/saas/suppliers/ordenes-compra',
    metadata: { lowStockCount },
  });
  return alert ? [alert] : [];
}

// ── 11. Proveedor sin servir ─────────────────────────────────────────────────

async function checkSupplierNotDelivering(userId, purchaseOrders, config) {
  if (!config.supplierNotDeliveringEnabled) return [];
  const now = new Date();
  const alerts = [];

  const overdue = purchaseOrders.filter((o) => {
    if (o.status !== 'sent' || !o.expectedDate) return false;
    const expected = new Date(o.expectedDate);
    return !Number.isNaN(expected.getTime()) && expected < now;
  });

  for (const order of overdue) {
    const daysLate = Math.floor((now.getTime() - new Date(order.expectedDate).getTime()) / 86_400_000);
    if (daysLate < config.supplierNotDeliveringDays) continue;

    alerts.push(await emitAlert({
      userId,
      dedupKey: `suppliernodeliv-${order._id}`,
      level: daysLate > 7 ? 'alert' : 'warning',
      category: 'supplier_not_delivering',
      title: 'Proveedor sin servir',
      message: `El pedido ${order.orderNumber} a ${order.supplierName || 'proveedor'} debió llegar hace ${daysLate} día(s) y no se ha registrado recepción.`,
      entityId: order._id,
      entityType: 'purchase_order',
      route: '/saas/suppliers/ordenes-compra',
      metadata: { orderNumber: order.orderNumber, supplierName: order.supplierName, daysLate },
    }));
  }

  return alerts.filter(Boolean);
}

// ── 12. Compra pendiente de recibir ──────────────────────────────────────────

async function checkPendingReception(userId, purchaseOrders, config) {
  if (!config.pendingReceptionEnabled) return [];
  const now = new Date();

  const pending = purchaseOrders.filter((o) => {
    if (!['sent', 'partial'].includes(o.status)) return false;
    const sent = new Date(o.sentAt || o.createdAt);
    if (Number.isNaN(sent.getTime())) return false;
    const days = Math.floor((now.getTime() - sent.getTime()) / 86_400_000);
    return days >= config.pendingReceptionDays;
  });

  if (pending.length === 0) return [];

  const totalValue = pending.reduce((s, o) => s + Number(o.total || 0), 0);
  const alert = await emitAlert({
    userId,
    dedupKey: `pendingreception-${userId}`,
    level: 'warning',
    category: 'pending_reception',
    title: 'Pedidos pendientes de recibir',
    message: `Hay ${pending.length} pedido(s) enviado(s) pendientes de confirmar recepción (${totalValue.toFixed(2)} €).`,
    entityType: 'purchase_order',
    route: '/saas/suppliers/ordenes-compra',
    metadata: { count: pending.length, totalValue },
  });
  return alert ? [alert] : [];
}

// ── 13. Producto clave sin pedir ─────────────────────────────────────────────

async function checkCriticalProductNotOrdered(userId, catalogItems, purchaseOrders, config) {
  if (!config.criticalProductAlertEnabled || !canEmitCatalogStockAlerts(catalogItems)) return [];
  const alerts = [];

  const activeOrderItemIds = new Set();
  for (const order of purchaseOrders) {
    if (!['draft', 'pending', 'sent'].includes(order.status)) continue;
    for (const item of (order.items || [])) {
      if (item.catalogItemId) activeOrderItemIds.add(item.catalogItemId);
    }
  }

  const criticalLow = filterStockTrackedCatalogItems(catalogItems).filter((i) =>
    i.isCritical && i.minStock > 0 && Number(i.stockQuantity || 0) < i.minStock && !activeOrderItemIds.has(i._id),
  );

  for (const item of criticalLow) {
    alerts.push(await emitAlert({
      userId,
      dedupKey: `critnotordered-${item._id}`,
      level: 'alert',
      category: 'critical_product_not_ordered',
      title: 'Producto clave sin pedir',
      message: `"${item.name}" tiene stock bajo (${Number(item.stockQuantity || 0)} ${item.unit || 'ud'}, mín: ${item.minStock}) y no hay pedido en curso.`,
      entityId: item._id,
      entityType: 'catalog_item',
      route: '/saas/suppliers/ordenes-compra',
      metadata: { name: item.name, sku: item.sku, stockQuantity: Number(item.stockQuantity || 0), minStock: item.minStock },
    }));
  }

  return alerts.filter(Boolean);
}

// ─── MAIN ENGINE ────────────────────────────────────────────────────────────

async function getAllBusinesses() {
  try {
    const docs = await fetchAllDocs(BUSINESSES_DB);
    return docs.filter((d) => d.type === 'business' && !d.deletedAt);
  } catch {
    return [];
  }
}

async function getAllUserIds() {
  try {
    const docs = await fetchAllDocs(ACCOUNTS_DB);
    return [...new Set(docs.filter((d) => d.type === 'account' && d.user_id).map((d) => d.user_id))];
  } catch {
    return [];
  }
}

async function runAlertsForBusiness(business) {
  const ownerId = business.owner_user_id;
  if (!ownerId) return { businessId: business._id, alerts: 0 };

  const account = await findAccountByUserId(fakeReq, ownerId);
  if (!account) return { businessId: business._id, alerts: 0 };

  const businessId = business._id?.replace('business:', '') || '';
  const config = getAlertConfig(account);
  const ctx = { businessId, userId: ownerId };
  const results = [];

  const members = Array.isArray(business.members) ? business.members : [];

  const [catalogItems, catalogInfraDocs, purchaseInvoices, parts, vehicles, webOrders, deliveryOrders, workOrders, purchaseOrders, clockinDocs, financeDocs, fleetDocs, prepExpenses, pointsOfSale] = await Promise.all([
    fetchAllDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocs(getCatalogDbName()).then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt && (i.type === 'warehouse' || i.type === 'stock_movement'))),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_invoice').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(getPartsDbName(), 'part').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === ownerId)),
    fetchAllDocsOfType(getWebDbName(), 'web_order').then((d) => d.filter((i) => i.user_id === ownerId || i.business_id === businessId)),
    fetchAllDocsOfType(getDeliveryDbName(), 'delivery_order').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(getWorkshopDbName(), 'work_order').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_order').then((d) => d.filter((i) => i.user_id === ownerId)),
    fetchAllDocs(getClockinsDbName()).then((d) => d.filter((i) => i.type === 'clockin')).catch(() => []),
    fetchAllDocs(getFinanceDbName()).then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []),
    fetchAllDocs(FLEET_DB).then((d) => d.filter((i) => i.type === 'fleet_vehicle' && i.user_id === ownerId)).catch(() => []),
    fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'preparation_expense' && i.active !== false && !i.deletedAt && i.user_id === ownerId)).catch(() => []),
    fetchAllDocsOfType(getDeliveryDbName(), 'point_of_sale').then((d) => d.filter((i) => i.user_id === ownerId)),
  ]);

  const deliveryReady = canEmitDeliveryAlerts({ deliveryOrders, pointsOfSale, deliveryConfig: account?.deliveryConfig });
  const deliveryMotorActive = usesDeliveryAlertMotor(account, business);
  const financeReady = canEmitFinanceAlerts({ financeDocs, purchaseInvoices });
  const purchaseReady = canEmitPurchaseAlerts({ purchaseOrders, purchaseInvoices });
  const webReady = canEmitWebOrderAlerts({ webOrders });
  const workshopReady = canEmitWorkshopAlerts({ workOrders, parts });
  const vehiclesReady = canEmitVehicleAlerts({ vehicles });
  const hrReady = canEmitHrAlerts({ members, clockinDocs });
  const fleetReady = canEmitFleetAlerts({ fleetDocs });

  // Stock
  results.push(...await checkLowStock(ctx, catalogItems, config, catalogInfraDocs));
  results.push(...await checkPartsLowStock(ctx, parts, config));
  results.push(...await checkNegativeStock(ctx, catalogItems, config, catalogInfraDocs));

  // Finanzas
  if (financeReady) {
    results.push(...await checkOverdueInvoices(ctx, purchaseInvoices, config));
    results.push(...await checkHighPayables(ctx, purchaseInvoices, config));
    results.push(...await checkClientPaymentOverdue(ctx, financeDocs, config));
    results.push(...await checkNegativeCashFlow(ctx, financeDocs, config));
    results.push(...await checkTaxDeadline(ctx, financeDocs, config));
    results.push(...await checkExpenseWithoutDocument(ctx, financeDocs, config));
  }

  // Ventas / Operaciones
  if (webReady) results.push(...await checkStaleWebOrders(ctx, webOrders, config));
  if (deliveryReady) {
    if (!deliveryMotorActive) {
      results.push(...await checkStaleDeliveryOrders(ctx, deliveryOrders, config));
      results.push(...await checkDeliveryUnattended(ctx, deliveryOrders, config));
      results.push(...await checkDeliveryUnpaid(ctx, deliveryOrders, config));
    }
    results.push(...await checkDeliveryNoAddress(ctx, deliveryOrders, config));
    results.push(...await checkDeliveryChannelIncident(ctx, deliveryOrders, config));
  }
  if (vehiclesReady && business.businessType !== 'carDealership') {
    results.push(...await checkVehicleStockAging(ctx, vehicles, config));
    results.push(...await checkVehicleLowMargin(ctx, vehicles, config));
    results.push(...await checkVehicleNoPhotos(ctx, vehicles, config));
    results.push(...await checkVehicleIncompleteData(ctx, vehicles, config));
    results.push(...await checkVehiclesMissingDocs(ctx, vehicles, config));
    results.push(...await checkVehiclesMissingPrice(ctx, vehicles, config));
    results.push(...await checkDuplicatePlates(ctx, vehicles));
    results.push(...await checkDuplicateVins(ctx, vehicles));
    results.push(...await checkLowSalesVelocity(ctx, vehicles, config));
    results.push(...await checkLowAvgMargin(ctx, vehicles, config));
    results.push(...await checkExcessPreparationCost(ctx, vehicles, config));
  }
  if (workshopReady) results.push(...await checkStaleWorkOrders(ctx, workOrders, config));
  if (purchaseReady) results.push(...await checkPendingPurchaseOrders(ctx, purchaseOrders, config));

  // Gastos de preparación
  if (vehiclesReady && prepExpenses.length > 0) {
    results.push(...await checkExpensesWithoutDocument(ctx.userId, prepExpenses, config));
    results.push(...await checkPendingExpenses(ctx.userId, prepExpenses, config));
    results.push(...await checkVehicleHighPreparationCost(ctx.userId, vehicles, prepExpenses, config));
    results.push(...await checkDuplicateExpenseInvoices(ctx.userId, prepExpenses, config));
  }

  // Equipo
  if (hrReady) {
    results.push(...await checkWorkerNoClockIn(ctx, members, clockinDocs, config));
    results.push(...await checkContractExpiring(ctx, members, config));
  }

  // Sala
  results.push(...await runSalaAlerts(ctx, ownerId, config));

  // Documentación
  if (fleetReady) results.push(...await checkFleetDocumentExpiry(ctx, fleetDocs, config));

  // Documentación compraventa
  const userDocs = await fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []);
  const sigReqs = await fetchAllDocsOfType(getDocumentsDbName(), 'signature_request').then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []);
  results.push(...await checkMissingRequiredDocs(ctx, userDocs, config));
  if (canEmitDocumentsAlerts({ documents: userDocs, signatureRequests: sigReqs })) {
    results.push(...await checkDocumentExpiry(ctx, userDocs, config));
    results.push(...await checkMissingVehicleDocs(ctx, userDocs, config));
    results.push(...await checkItvExpiry(ctx, userDocs, config));
    results.push(...await checkPendingContracts(ctx, userDocs, config));
    results.push(...await checkIncompleteOcr(ctx, userDocs, config));
    results.push(...await checkPendingSignatures(ctx, sigReqs, config));
    results.push(...await checkRejectedSignatures(ctx, sigReqs, config));
    results.push(...await checkExpiringSignatures(ctx, sigReqs, config));
  }

  // Scrapyard (desguaces)
  if (business.businessType === 'scrapyard') {
    try {
      const scrapConfig = getScrapyardAlertConfig(account);
      const [scrapParts, scrapSessions, scrapSales, scrapDocs, scrapWorkers, scrapTasks] = await Promise.all([
        fetchAllDocsOfType(getScrapyardDbName(), 'scrapyard_part').then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []),
        fetchAllDocsOfType(getScrapyardDbName(), 'dismantling_session').then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []),
        fetchAllDocs(getScrapyardSalesDbName()).then((d) => d.filter((i) => i.type === 'scrapyard_sale' && i.user_id === ownerId && !i.deletedAt)).catch(() => []),
        fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []),
        fetchAllDocsOfType(getScrapyardDbName(), 'scrapyard_worker').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt && i.status === 'active')).catch(() => []),
        fetchAllDocsOfType(getScrapyardDbName(), 'scrapyard_task').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []),
      ]);
      if (canEmitScrapyardAlerts({ parts: scrapParts, sessions: scrapSessions, sales: scrapSales, vehicles })) {
        results.push(...await runScrapyardAlerts(ctx, scrapConfig, vehicles, scrapParts, scrapSessions, scrapSales, scrapDocs));
        results.push(...await checkPartsWithoutPrice(ctx, scrapParts, config));
        results.push(...await checkPartsWithoutLocation(ctx, scrapParts, config));
        results.push(...await checkDuplicatePartReferences(ctx, scrapParts, config));
        results.push(...await checkPartsWithoutPhotos(ctx, scrapParts, config));
        results.push(...await checkIncompleteDismantling(ctx, scrapSessions, config));
        results.push(...await checkScrapyardWorkerAlerts(ctx, scrapWorkers, scrapTasks, clockinDocs));
      }
    } catch (err) {
      logger.warn({ tag: 'ALERT_ENGINE', err: err?.message, businessId }, 'Error ejecutando alertas desguace');
    }
  }

  // Compraventa (carDealership)
  if (business.businessType === 'carDealership') {
    try {
      const cvConfig = getCompraventaAlertConfig(account);
      const [cvSales, cvLeads, cvDocuments] = await Promise.all([
        fetchAllDocsOfType(getSalesDbName(), 'sale').then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []),
        fetchAllDocsOfType(getLeadsDbName(), 'lead').then((d) => d.filter((i) => i.user_id === ownerId || i.responsible === ownerId)).catch(() => []),
        fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === ownerId && !i.deletedAt)).catch(() => []),
      ]);
      if (canEmitCompraventaAlerts({ vehicles, sales: cvSales, leads: cvLeads })) {
        results.push(...await runCompraventaAlerts(ctx, cvConfig, vehicles, cvSales, cvLeads, cvDocuments));
      }
    } catch (err) {
      logger.warn({ tag: 'ALERT_ENGINE', err: err?.message, businessId }, 'Error ejecutando alertas compraventa');
    }
  }

  // Onboarding
  results.push(...await checkOnboardingAlerts(ownerId));

  // OCR Transversal
  results.push(...await checkOcrAlerts(ctx, ownerId, config));

  // Caja: descuadre y devoluciones (apertura/cierre en vivo → deliveryAlertEngine cada 60s)
  try {
    const { getBusinessAlertsOperational, resolveCashRegisterAlertConfig } = await import('./cashRegisterAlertConfig.js');
    const businessOp = businessId ? await getBusinessAlertsOperational(fakeReq, businessId) : null;
    const cashCfg = resolveCashRegisterAlertConfig(account, businessOp);
    if (cashCfg.discrepancyEnabled || cashCfg.highReturnEnabled) {
      const deliveryDb = getDeliveryDbName();
      const [tpvSessions, pointsOfSale] = await Promise.all([
        fetchAllDocsOfType(deliveryDb, 'tpv_register_session').then((d) => d.filter((i) => i.user_id === ownerId)),
        fetchAllDocsOfType(deliveryDb, 'point_of_sale').then((d) => d.filter((i) => i.user_id === ownerId)),
      ]);
      if (canEmitPdvCashAlerts(pointsOfSale)) {
        if (cashCfg.discrepancyEnabled) results.push(...await checkRegisterDiscrepancy(ctx, tpvSessions, cashCfg, pointsOfSale));
        if (cashCfg.highReturnEnabled) results.push(...await checkHighReturnInRegister(ctx, tpvSessions, cashCfg, pointsOfSale));
      }
    }
  } catch { /* cash register not active */ }

  return { businessId, alerts: results.length };
}

// ─── SCRAPYARD SALES ALERTS ──────────────────────────────────────────────────

async function checkScrapyardSalesAlerts(ctx, scrapyardSales) {
  const now = new Date();
  const alerts = [];

  for (const sale of scrapyardSales) {
    if (sale.deletedAt || sale.estado === 'cancelada') continue;
    const createdMs = new Date(sale.createdAt || 0).getTime();
    const hoursOld = (now.getTime() - createdMs) / 3_600_000;

    if (sale.reservaExpira && sale.estado !== 'entregada') {
      const expiresAt = new Date(sale.reservaExpira);
      if (expiresAt < now) {
        alerts.push(await emitAlert({
          userId: ctx.userId,
          dedupKey: `scrap-reserva-${sale._id}`,
          level: 'alert',
          category: 'scrapyard_reservation_expired',
          title: 'Reserva de pieza vencida',
          message: `La reserva de la venta ${sale.numVenta} para ${sale.clientName} ha expirado.`,
          entityId: sale._id, entityType: 'scrapyard_sale', route: '/saas/scrapyard-sales',
          metadata: { numVenta: sale.numVenta, clientName: sale.clientName },
        }));
      }
    }

    if (sale.estado === 'lista' && hoursOld > 24) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-pendship-${sale._id}`,
        level: 'warning',
        category: 'scrapyard_order_pending_ship',
        title: 'Pedido pendiente de enviar',
        message: `La venta ${sale.numVenta} está lista pero no se ha enviado/entregado.`,
        entityId: sale._id, entityType: 'scrapyard_sale', route: '/saas/scrapyard-sales',
        metadata: { numVenta: sale.numVenta, hoursReady: Math.round(hoursOld) },
      }));
    }

    if (sale.estado === 'entregada' && sale.estadoPago !== 'cobrada' && hoursOld > 48) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-unpaid-${sale._id}`,
        level: 'alert',
        category: 'scrapyard_sale_unpaid',
        title: 'Venta sin cobrar',
        message: `La venta ${sale.numVenta} fue entregada pero no está cobrada (${sale.importeConIva}€).`,
        entityId: sale._id, entityType: 'scrapyard_sale', route: '/saas/scrapyard-sales',
        metadata: { numVenta: sale.numVenta, importe: sale.importeConIva },
      }));
    }

    if (['confirmada', 'preparando', 'lista', 'enviada'].includes(sale.estado) && hoursOld > 72) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-notdeliv-${sale._id}`,
        level: 'warning',
        category: 'scrapyard_sold_not_delivered',
        title: 'Pieza vendida no entregada',
        message: `La venta ${sale.numVenta} lleva más de 72h sin entregar.`,
        entityId: sale._id, entityType: 'scrapyard_sale', route: '/saas/scrapyard-sales',
        metadata: { numVenta: sale.numVenta, estado: sale.estado, hoursOld: Math.round(hoursOld) },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── SCRAPYARD WORKER / TASK ALERTS ──────────────────────────────────────────

async function checkScrapyardWorkerAlerts(ctx, workers, tasks, clockins) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const alerts = [];

  for (const worker of workers) {
    const todayClockins = (clockins || []).filter(c =>
      c.teamMemberId === worker.teamMemberId && c.date === today
    );
    const hasClockedIn = todayClockins.length > 0;

    if (!hasClockedIn && worker.status === 'active') {
      const shiftStart = worker.schedule?.split('–')[0]?.trim() || worker.schedule?.split('-')[0]?.trim() || '';
      if (shiftStart) {
        const [h, m] = shiftStart.split(':').map(Number);
        const shiftTime = new Date(now);
        shiftTime.setHours(h || 0, m || 0, 0, 0);
        if (now > shiftTime && (now.getTime() - shiftTime.getTime()) > 30 * 60_000) {
          alerts.push(await emitAlert({
            userId: ctx.userId,
            dedupKey: `scrap-wk-noclk-${worker._id}-${today}`,
            level: 'alert',
            category: 'scrapyard_worker_no_clockin',
            title: 'Trabajador sin fichar',
            message: `${worker.name} (${worker.role}) no ha fichado — Su turno empezaba a las ${shiftStart}.`,
            entityId: worker._id, entityType: 'scrapyard_worker', route: '/saas/vertical/desguaces/trabajadores',
            metadata: { workerName: worker.name, shift: worker.schedule },
          }));
        }
      }
    }

    const workerHours = todayClockins.reduce((acc, c) => acc + (c.totalHours || 0), 0);
    if (workerHours > (worker.weeklyHours / 5) * 1.25) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-wk-overtime-${worker._id}-${today}`,
        level: 'warning',
        category: 'scrapyard_worker_overtime',
        title: 'Exceso de horas',
        message: `${worker.name} acumula ${workerHours.toFixed(1)}h hoy, superando el límite recomendado.`,
        entityId: worker._id, entityType: 'scrapyard_worker', route: '/saas/vertical/desguaces/trabajadores',
        metadata: { workerName: worker.name, hours: workerHours },
      }));
    }

    const expiredDocs = (worker.documents || []).filter(d => d.status === 'expired' || (d.expiresAt && new Date(d.expiresAt) < now));
    for (const doc of expiredDocs) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-wk-doc-${worker._id}-${doc.type}`,
        level: 'warning',
        category: 'scrapyard_worker_doc_expired',
        title: 'Documentación caducada',
        message: `${worker.name}: ${doc.type} caducado — Requiere renovación.`,
        entityId: worker._id, entityType: 'scrapyard_worker', route: '/saas/vertical/desguaces/trabajadores',
        metadata: { workerName: worker.name, docType: doc.type },
      }));
    }

    const workerTasks = tasks.filter(t => t.assignedWorkerId === worker._id && t.scheduledDate === today);
    const completed = workerTasks.filter(t => t.status === 'completed').length;
    const total = workerTasks.length;
    if (total >= 3 && completed / total < 0.3 && workerHours > 4) {
      alerts.push(await emitAlert({
        userId: ctx.userId,
        dedupKey: `scrap-wk-lowperf-${worker._id}-${today}`,
        level: 'warning',
        category: 'scrapyard_worker_low_perf',
        title: 'Bajo rendimiento',
        message: `${worker.name} ha completado solo ${completed}/${total} tareas con ${workerHours.toFixed(1)}h trabajadas.`,
        entityId: worker._id, entityType: 'scrapyard_worker', route: '/saas/vertical/desguaces/trabajadores',
        metadata: { workerName: worker.name, completed, total },
      }));
    }
  }

  const todayTasks = tasks.filter(t => t.scheduledDate === today && !t.deletedAt);
  const overduePending = todayTasks.filter(t => {
    if (t.status !== 'pending' && t.status !== 'assigned') return false;
    if (!t.scheduledStartTime) return false;
    const [h, m] = t.scheduledStartTime.split(':').map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(h || 0, m || 0, 0, 0);
    return now.getTime() - scheduled.getTime() > 60 * 60_000;
  });

  for (const task of overduePending) {
    alerts.push(await emitAlert({
      userId: ctx.userId,
      dedupKey: `scrap-tk-overdue-${task._id}`,
      level: 'warning',
      category: 'scrapyard_task_pending_overdue',
      title: 'Tarea pendiente retrasada',
      message: `"${task.title}" lleva más de 1h de retraso sin iniciarse.`,
      entityId: task._id, entityType: 'scrapyard_task', route: '/saas/vertical/desguaces/trabajadores',
      metadata: { taskTitle: task.title, taskType: task.taskType },
    }));
  }

  const unassigned = todayTasks.filter(t => !t.assignedWorkerId && (t.status === 'pending'));
  if (unassigned.length > 0) {
    alerts.push(await emitAlert({
      userId: ctx.userId,
      dedupKey: `scrap-tk-unassigned-${today}`,
      level: 'info',
      category: 'scrapyard_task_unassigned',
      title: 'Tareas sin asignar',
      message: `${unassigned.length} tarea(s) de hoy sin trabajador asignado.`,
      entityId: unassigned[0]._id, entityType: 'scrapyard_task', route: '/saas/vertical/desguaces/trabajadores',
      metadata: { count: unassigned.length },
    }));
  }

  return alerts.filter(Boolean);
}

// ─── SCRAPYARD PART / DISMANTLING ALERTS ─────────────────────────────────────

async function checkPartsWithoutPrice(ctx, scrapyardParts, config) {
  if (!config.scrapyard?.partMissingPriceEnabled) return [];
  const alerts = [];
  const now = Date.now();
  const threshold = 24 * 3_600_000;

  for (const part of scrapyardParts) {
    if (!part.active || part.estado !== 'disponible') continue;
    if (Number(part.precioVenta || 0) > 0) continue;
    const age = now - new Date(part.createdAt || 0).getTime();
    if (age < threshold) continue;

    alerts.push(await emitAlert({
      userId: ctx.userId,
      businessId: ctx.businessId,
      dedupKey: `scrap-noprice-${part._id}`,
      level: 'warning',
      category: 'part_missing_price',
      source: 'desguaces',
      title: 'Pieza sin precio de venta',
      message: `La pieza ${part.nombre} (${part.codigoInterno}) no tiene precio de venta asignado`,
      entityId: part._id,
      entityType: 'scrapyard_part',
      route: '/saas/scrapyard-parts',
      metadata: { nombre: part.nombre, codigoInterno: part.codigoInterno },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkPartsWithoutLocation(ctx, scrapyardParts, config) {
  if (!config.scrapyard?.partMissingLocationEnabled) return [];
  const alerts = [];
  const now = Date.now();
  const threshold = 24 * 3_600_000;

  for (const part of scrapyardParts) {
    if (!part.active || part.estado !== 'disponible') continue;
    if (part.ubicacion && String(part.ubicacion).trim()) continue;
    const age = now - new Date(part.createdAt || 0).getTime();
    if (age < threshold) continue;

    alerts.push(await emitAlert({
      userId: ctx.userId,
      businessId: ctx.businessId,
      dedupKey: `scrap-noloc-${part._id}`,
      level: 'warning',
      category: 'part_missing_location',
      source: 'desguaces',
      title: 'Pieza sin ubicación',
      message: `La pieza ${part.nombre} (${part.codigoInterno}) no tiene ubicación en el almacén`,
      entityId: part._id,
      entityType: 'scrapyard_part',
      route: '/saas/scrapyard-parts',
      metadata: { nombre: part.nombre, codigoInterno: part.codigoInterno },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkDuplicatePartReferences(ctx, scrapyardParts, config) {
  if (!config.scrapyard?.partDuplicateReferenceEnabled) return [];
  const alerts = [];

  const refMap = new Map();
  for (const part of scrapyardParts) {
    if (!part.active) continue;
    const ref = String(part.referencia || '').trim().toLowerCase();
    if (!ref) continue;
    if (!refMap.has(ref)) refMap.set(ref, []);
    refMap.get(ref).push(part);
  }

  for (const [ref, parts] of refMap) {
    if (parts.length <= 1) continue;
    alerts.push(await emitAlert({
      userId: ctx.userId,
      businessId: ctx.businessId,
      dedupKey: `scrap-dupref-${ref}`,
      level: 'info',
      category: 'part_duplicate_reference',
      source: 'desguaces',
      title: 'Referencia duplicada en piezas',
      message: `La referencia ${parts[0].referencia} está asignada a ${parts.length} piezas`,
      entityId: parts[0]._id,
      entityType: 'scrapyard_part',
      route: '/saas/scrapyard-parts',
      metadata: { referencia: parts[0].referencia, count: parts.length, partIds: parts.map((p) => p._id) },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkPartsWithoutPhotos(ctx, scrapyardParts, config) {
  if (!config.scrapyard?.partMissingPhotosEnabled) return [];
  const alerts = [];
  const now = Date.now();
  const threshold = 48 * 3_600_000;

  for (const part of scrapyardParts) {
    if (!part.active || part.estado !== 'disponible') continue;
    if (Array.isArray(part.fotos) && part.fotos.length > 0) continue;
    const age = now - new Date(part.createdAt || 0).getTime();
    if (age < threshold) continue;

    alerts.push(await emitAlert({
      userId: ctx.userId,
      businessId: ctx.businessId,
      dedupKey: `scrap-nophoto-${part._id}`,
      level: 'info',
      category: 'part_missing_photos',
      source: 'desguaces',
      title: 'Pieza sin fotos',
      message: `La pieza ${part.nombre} (${part.codigoInterno}) no tiene fotos`,
      entityId: part._id,
      entityType: 'scrapyard_part',
      route: '/saas/scrapyard-parts',
      metadata: { nombre: part.nombre, codigoInterno: part.codigoInterno },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkIncompleteDismantling(ctx, dismantlingSessions, config) {
  if (!config.scrapyard?.dismantlingStalledEnabled) return [];
  const alerts = [];
  const now = Date.now();
  const stalledDays = config.scrapyard.dismantlingStalledDays || 7;
  const stalledMs = stalledDays * 86_400_000;

  for (const session of dismantlingSessions) {
    if (session.status !== 'in_progress') continue;

    let lastActivity = new Date(session.createdAt || 0).getTime();
    if (Array.isArray(session.historial) && session.historial.length > 0) {
      const lastEntry = session.historial[session.historial.length - 1];
      const entryTime = new Date(lastEntry.timestamp || lastEntry.date || lastEntry.createdAt || 0).getTime();
      if (entryTime > lastActivity) lastActivity = entryTime;
    }

    if (now - lastActivity < stalledMs) continue;

    const label = session.vehicleLabel || '???';
    const plate = session.vehicleMatricula || '???';
    alerts.push(await emitAlert({
      userId: ctx.userId,
      businessId: ctx.businessId,
      dedupKey: `scrap-stalled-${session._id}`,
      level: 'warning',
      category: 'dismantling_stalled',
      source: 'desguaces',
      title: 'Despiece parado',
      message: `El despiece del vehículo ${label} (${plate}) lleva más de ${stalledDays} días parado`,
      entityId: session._id,
      entityType: 'dismantling_session',
      route: '/saas/scrapyard-dismantling',
      metadata: { vehicleLabel: label, vehicleMatricula: plate, sessionId: session._id, stalledDays },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── OCR ALERTS ──────────────────────────────────────────────────────────────

async function checkOcrAlerts(ctx, userId, config) {
  const results = [];
  try {
    const ocrDocs = await fetchAllDocs(getOcrLogsDbName()).then((d) => d.filter((i) => i.user_id === userId)).catch(() => []);
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 3600000);

    const recentLogs = ocrDocs.filter((l) => l.type === 'ocr_processing_log' && new Date(l.createdAt) >= last24h);

    if (config.ocrIncompleteReadEnabled) {
      for (const log of recentLogs) {
        if (log.status !== 'pending_review' || !Array.isArray(log.warnings)) continue;
        const incomplete = log.warnings.filter((w) => w.code === 'INCOMPLETE_READ');
        if (incomplete.length === 0) continue;
        const fields = incomplete.map((w) => w.field).join(', ');
        const a = await emitAlert({
          userId, dedupKey: 'ocr-incomplete:' + log._id,
          level: 'warning', category: 'ocr',
          title: 'Lectura OCR incompleta',
          message: 'El documento "' + (log.sourceFileName || 'sin nombre') + '" no pudo leerse completamente. Campos faltantes: ' + fields,
          entityId: log._id, entityType: 'ocr_processing_log',
          route: '/saas/ocr-review',
        });
        if (a) results.push(a);
      }
    }

    if (config.ocrDuplicateEnabled) {
      for (const log of recentLogs) {
        if (log.status !== 'duplicate') continue;
        const a = await emitAlert({
          userId, dedupKey: 'ocr-duplicate:' + (log.sourceHash || log._id),
          level: 'warning', category: 'ocr',
          title: 'Documento duplicado detectado',
          message: 'El documento "' + (log.sourceFileName || 'sin nombre') + '" ya fue procesado anteriormente',
          entityId: log._id, entityType: 'ocr_processing_log',
          route: '/saas/ocr-review',
        });
        if (a) results.push(a);
      }
    }

    if (config.ocrInconsistentEnabled) {
      for (const log of recentLogs) {
        if (!Array.isArray(log.errors) || log.errors.length === 0) continue;
        const errorList = log.errors.map((e) => e.message).join('; ');
        const a = await emitAlert({
          userId, dedupKey: 'ocr-inconsistent:' + log._id,
          level: 'warning', category: 'ocr',
          title: 'Datos OCR inconsistentes',
          message: 'El documento "' + (log.sourceFileName || 'sin nombre') + '" tiene datos inconsistentes: ' + errorList,
          entityId: log._id, entityType: 'ocr_processing_log',
          route: '/saas/ocr-review',
        });
        if (a) results.push(a);
      }
    }

    if (config.ocrUncategorizedEnabled) {
      for (const log of recentLogs) {
        if (!Array.isArray(log.warnings)) continue;
        if (!log.warnings.some((w) => w.code === 'UNCATEGORIZED')) continue;
        const a = await emitAlert({
          userId, dedupKey: 'ocr-uncategorized:' + log._id,
          level: 'info', category: 'ocr',
          title: 'Documento sin categoria',
          message: 'No se pudo determinar el tipo del documento "' + (log.sourceFileName || 'sin nombre') + '". Clasificalo manualmente.',
          entityId: log._id, entityType: 'ocr_processing_log',
          route: '/saas/ocr-review',
        });
        if (a) results.push(a);
      }
    }
  } catch (err) {
    logger.warn({ tag: 'ALERT_ENGINE', error: err.message }, 'OCR alerts check failed');
  }
  return results;
}

// ── Facturas de clientes vencidas ─────────────────────────────────────────────

async function checkOverdueClientInvoices(ctx, clientInvoices, config) {
  if (!config.overdueClientInvoicesEnabled) return [];
  const now = new Date();
  const alerts = [];
  const overdue = clientInvoices.filter((inv) => inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < now);
  for (const inv of overdue) {
    const daysLate = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
    alerts.push(await emitGlobalAlert({
      userId: ctx.userId, businessId: ctx.businessId,
      dedupKey: `overdue-client-inv-${inv._id}`,
      level: daysLate > 15 ? 'alert' : 'warning',
      category: 'overdue_client_invoice',
      title: 'Factura de cliente vencida',
      message: `Factura ${inv.number || inv._id?.slice(-8)} de ${inv.clientName || 'cliente'} vencida hace ${daysLate} dias. Total: ${Number(inv.total || 0).toFixed(2)} EUR.`,
      entityId: inv._id, entityType: 'client_invoice',
      route: '/saas/finanzas/facturacion-clientes',
      metadata: { invoiceNumber: inv.number, clientName: inv.clientName, total: inv.total, daysLate },
    }));
  }
  return alerts.filter(Boolean);
}

// ── Factura sin cobrar ────────────────────────────────────────────────────────

async function checkUnpaidClientInvoices(ctx, clientInvoices, config) {
  if (!config.unpaidClientInvoiceEnabled) return [];
  const now = new Date();
  const alerts = [];
  const threshold = config.unpaidClientInvoiceDays * 86400000;
  const unpaid = clientInvoices.filter((inv) => inv.status === 'pending' && Number(inv.paid || 0) === 0 && inv.createdAt && (now.getTime() - new Date(inv.createdAt).getTime()) > threshold);
  for (const inv of unpaid) {
    const days = Math.floor((now.getTime() - new Date(inv.createdAt).getTime()) / 86400000);
    alerts.push(await emitGlobalAlert({
      userId: ctx.userId, businessId: ctx.businessId,
      dedupKey: `unpaid-client-inv-${inv._id}`,
      level: 'warning',
      category: 'unpaid_client_invoice',
      title: 'Factura sin cobrar',
      message: `Factura ${inv.number || inv._id?.slice(-8)} emitida hace ${days} dias sin ningun cobro registrado. Total: ${Number(inv.total || 0).toFixed(2)} EUR.`,
      entityId: inv._id, entityType: 'client_invoice',
      route: '/saas/finanzas/facturacion-clientes',
      metadata: { invoiceNumber: inv.number, clientName: inv.clientName, total: inv.total, days },
    }));
  }
  return alerts.filter(Boolean);
}

// ── Cliente con varias facturas pendientes ────────────────────────────────────

async function checkClientMultiplePending(ctx, clientInvoices, config) {
  if (!config.clientMultiplePendingEnabled) return [];
  const alerts = [];
  const grouped = {};
  for (const inv of clientInvoices) {
    if (inv.status === 'pending' || inv.status === 'overdue' || inv.status === 'partial') {
      const key = inv.clientId || inv.clientName || 'unknown';
      if (!grouped[key]) grouped[key] = { name: inv.clientName, invoices: [], total: 0 };
      grouped[key].invoices.push(inv);
      grouped[key].total += Number(inv.total || 0) - Number(inv.paid || 0);
    }
  }
  for (const [clientKey, data] of Object.entries(grouped)) {
    if (data.invoices.length >= config.clientMultiplePendingThreshold) {
      alerts.push(await emitGlobalAlert({
        userId: ctx.userId, businessId: ctx.businessId,
        dedupKey: `client-multi-pending-${clientKey}`,
        level: 'alert',
        category: 'client_multiple_pending',
        title: 'Cliente con varias facturas pendientes',
        message: `${data.name || 'Cliente'} tiene ${data.invoices.length} facturas pendientes por un total de ${data.total.toFixed(2)} EUR.`,
        entityType: 'client_invoice',
        route: '/saas/finanzas/facturacion-clientes',
        metadata: { clientName: data.name, count: data.invoices.length, totalPending: data.total },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ── Rutas de limpieza: alertas ───────────────────────────────────────────────

async function checkCleaningRouteAlerts(ctx, cleaningDb, userId, config) {
  if (!config.cleaning?.enabled) return [];
  const alerts = [];
  const now = new Date();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  try {
    const allDocs = await fetchAllDocs(cleaningDb);
    const routes = allDocs.filter(d => d.type === 'cleaning_route' && d.user_id === userId);
    const services = allDocs.filter(d => d.type === 'cleaning_service' && d.user_id === userId);
    const members = allDocs.filter(d => d.type === 'team_member' || d.assignedTo);

    const tomorrowRoutes = routes.filter(r => r.date === tomorrowStr && r.status !== 'cancelled');
    const todayRoutes = routes.filter(r => r.date === todayStr && r.status === 'active');
    const tomorrowServices = services.filter(s => s.date === tomorrowStr && s.status !== 'cancelled');

    // Workers with assigned services tomorrow but no route
    const workerIdsWithRoute = new Set(tomorrowRoutes.map(r => r.workerId));
    const workerIdsWithService = new Set(tomorrowServices.filter(s => s.assignedTo).map(s => s.assignedTo));
    for (const wId of workerIdsWithService) {
      if (!workerIdsWithRoute.has(wId)) {
        const svc = tomorrowServices.find(s => s.assignedTo === wId);
        alerts.push(emit({
          ...ctx,
          dedupKey: `route-noroute-${wId}-${tomorrowStr}`,
          level: 'warning',
          category: 'cleaning_route',
          title: 'Trabajador sin ruta para mañana',
          message: `${svc?.assignedToName || 'Trabajador'} tiene servicios asignados para mañana pero no tiene ruta generada.`,
          entityId: wId,
          entityType: 'team_member',
          route: '/saas/cleaning-routes',
          metadata: { workerId: wId, workerName: svc?.assignedToName, date: tomorrowStr },
        }));
      }
    }

    // Services for tomorrow without any worker assigned
    const unassignedTomorrow = tomorrowServices.filter(s => !s.assignedTo && ['pending'].includes(s.status));
    for (const svc of unassignedTomorrow) {
      alerts.push(emit({
        ...ctx,
        dedupKey: `route-uncovered-${svc._id}`,
        level: 'alert',
        category: 'cleaning_route',
        title: 'Servicio sin cubrir para mañana',
        message: `El servicio ${svc.serviceNumber} (${svc.clientName} - ${svc.address}) para mañana no tiene trabajador asignado.`,
        entityId: svc._id,
        entityType: 'cleaning_service',
        route: '/saas/cleaning-routes',
        metadata: { serviceNumber: svc.serviceNumber, clientName: svc.clientName },
      }));
    }

    // Routes with overlapping entries
    for (const rt of tomorrowRoutes) {
      const overlaps = (rt.entries || []).filter(e => e.overlap);
      if (overlaps.length > 0) {
        alerts.push(emit({
          ...ctx,
          dedupKey: `route-overlap-${rt._id}`,
          level: 'warning',
          category: 'cleaning_route',
          title: 'Solapamiento en ruta',
          message: `La ruta de ${rt.workerName} para mañana tiene ${overlaps.length} solapamiento(s) horario(s).`,
          entityId: rt._id,
          entityType: 'cleaning_route',
          route: '/saas/cleaning-routes',
          metadata: { workerName: rt.workerName, overlaps: overlaps.length },
        }));
      }
    }

    // Accumulated delay in today's active routes
    const delayThreshold = config.cleaning?.routeDelayThresholdMinutes || 15;
    for (const rt of todayRoutes) {
      let accumulatedDelay = 0;
      for (const entry of rt.entries || []) {
        if (entry.status === 'completed' && entry.actualEndTime && entry.estimatedEndTime) {
          const [ah, am] = entry.actualEndTime.split(':').map(Number);
          const [eh, em] = entry.estimatedEndTime.split(':').map(Number);
          const diff = (ah * 60 + (am || 0)) - (eh * 60 + (em || 0));
          if (diff > 0) accumulatedDelay += diff;
        }
      }
      if (accumulatedDelay >= delayThreshold) {
        alerts.push(emit({
          ...ctx,
          dedupKey: `route-delay-${rt._id}-${todayStr}`,
          level: accumulatedDelay >= (config.cleaning?.routeDelayHighMinutes || 30) ? 'alert' : 'warning',
          category: 'cleaning_route',
          title: 'Retraso acumulado en ruta',
          message: `${rt.workerName} lleva ${accumulatedDelay} min de retraso acumulado hoy.`,
          entityId: rt._id,
          entityType: 'cleaning_route',
          route: '/saas/cleaning-routes',
          metadata: { workerName: rt.workerName, delayMinutes: accumulatedDelay },
        }));
      }
    }
  } catch { /* cleaning vertical not active */ }

  return (await Promise.all(alerts)).filter(Boolean);
}

// ── Rentabilidad y operación de limpieza ─────────────────────────────────────

async function checkCleaningProfitabilityAlerts(ctx, cleaningDb, userId, config) {
  const alerts = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  const DEFAULT_HOURLY_COST = 12;

  try {
    const allDocs = await fetchAllDocs(cleaningDb);
    const services = allDocs.filter(d => d.type === 'cleaning_service' && d.user_id === userId && !d.deletedAt);
    const workers = allDocs.filter(d => d.type === 'cleaning_worker' && d.user_id === userId && !d.deletedAt);

    const recentCompleted = services.filter(s => s.status === 'completed' && s.date >= thirtyDaysAgo && s.date <= todayStr);
    if (recentCompleted.length < 5) return (await Promise.all(alerts)).filter(Boolean);

    const marginThreshold = config.cleaning?.lowProfitabilityMarginPercent ?? 10;
    const absentThreshold = config.cleaning?.highAbsenteeismPercent ?? 15;
    const materialCostThreshold = config.cleaning?.highMaterialCostPercent ?? 25;

    // 1. Client low profitability
    const byClient = {};
    for (const svc of recentCompleted) {
      const c = svc.clientName || 'Sin cliente';
      if (!byClient[c]) byClient[c] = { revenue: 0, cost: 0 };
      const rev = Number(svc.price) || 0;
      const execMins = svc.execution?.realMinutes || (svc.execution?.checkInAt && svc.execution?.checkOutAt ? Math.max(0, (new Date(svc.execution.checkOutAt) - new Date(svc.execution.checkInAt)) / 60000) : 0);
      const wId = svc.workerId || svc.assignedTo;
      const w = wId ? workers.find(w => w._id === wId || w.id === wId) : null;
      const hCost = w?.hourlyCost || DEFAULT_HOURLY_COST;
      const labor = (execMins / 60) * hCost;
      const material = Number(svc.materialCost) || 0;
      byClient[c].revenue += rev;
      byClient[c].cost += labor + material;
    }

    for (const [client, data] of Object.entries(byClient)) {
      if (data.revenue > 0) {
        const margin = ((data.revenue - data.cost) / data.revenue) * 100;
        if (margin < marginThreshold) {
          alerts.push(emit({
            ...ctx,
            dedupKey: `cleaning-low-profit-client-${client}-${todayStr.slice(0, 7)}`,
            level: margin < 0 ? 'alert' : 'warning',
            category: 'cleaning_profitability',
            title: 'Cliente con baja rentabilidad',
            message: `El cliente "${client}" tiene un margen del ${margin.toFixed(1)}% en los últimos 30 días (umbral: ${marginThreshold}%).`,
            route: '/saas/vertical/limpieza/informes',
            metadata: { clientName: client, margin: margin.toFixed(1), revenue: data.revenue.toFixed(2), cost: data.cost.toFixed(2) },
          }));
        }
      }
    }

    // 2. High absenteeism
    const assigned = services.filter(s => s.date >= thirtyDaysAgo && s.date <= todayStr && (s.assignedToName || s.workerId));
    const absences = assigned.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d < now && (s.status === 'assigned' || s.status === 'pending') && !s.execution?.checkInAt && !s.checkInAt;
    });
    if (assigned.length > 10) {
      const rate = (absences.length / assigned.length) * 100;
      if (rate > absentThreshold) {
        alerts.push(emit({
          ...ctx,
          dedupKey: `cleaning-high-absenteeism-${todayStr.slice(0, 7)}`,
          level: rate > 25 ? 'alert' : 'warning',
          category: 'cleaning_profitability',
          title: 'Absentismo elevado en limpieza',
          message: `La tasa de absentismo es del ${rate.toFixed(1)}% en los últimos 30 días (${absences.length} ausencias de ${assigned.length} asignaciones).`,
          route: '/saas/vertical/limpieza/informes',
          metadata: { rate: rate.toFixed(1), absences: absences.length, assigned: assigned.length },
        }));
      }
    }

    // 3. Worker productivity drop (>20% drop vs planned hours)
    const byWorker = {};
    for (const svc of recentCompleted) {
      const w = svc.assignedToName || svc.workerId || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { planned: 0, real: 0 };
      byWorker[w].planned += svc.execution?.plannedMinutes || (parseFloat(svc.duration) || 0) * 60;
      byWorker[w].real += svc.execution?.realMinutes || 0;
    }
    for (const [worker, data] of Object.entries(byWorker)) {
      if (data.planned > 120 && data.real > 0) {
        const efficiency = (data.planned / data.real) * 100;
        if (efficiency < 70) {
          alerts.push(emit({
            ...ctx,
            dedupKey: `cleaning-productivity-drop-${worker}-${todayStr.slice(0, 7)}`,
            level: 'warning',
            category: 'cleaning_profitability',
            title: 'Caída de productividad',
            message: `${worker} tiene una eficiencia del ${efficiency.toFixed(0)}% (horas reales superan las planificadas en más del 30%).`,
            route: '/saas/vertical/limpieza/informes',
            metadata: { workerName: worker, efficiency: efficiency.toFixed(1), plannedMins: data.planned, realMins: data.real },
          }));
        }
      }
    }

    // 4. High material costs
    const totalRevenue = recentCompleted.reduce((s, sv) => s + (Number(sv.price) || 0), 0);
    const totalMaterialCost = recentCompleted.reduce((s, sv) => s + (Number(sv.materialCost) || 0), 0);
    if (totalRevenue > 0 && totalMaterialCost > 0) {
      const matPct = (totalMaterialCost / totalRevenue) * 100;
      if (matPct > materialCostThreshold) {
        alerts.push(emit({
          ...ctx,
          dedupKey: `cleaning-high-material-cost-${todayStr.slice(0, 7)}`,
          level: 'warning',
          category: 'cleaning_profitability',
          title: 'Costes de materiales elevados',
          message: `Los materiales representan el ${matPct.toFixed(1)}% de los ingresos (${totalMaterialCost.toFixed(2)}€ de ${totalRevenue.toFixed(2)}€).`,
          route: '/saas/vertical/limpieza/informes',
          metadata: { materialCost: totalMaterialCost.toFixed(2), revenue: totalRevenue.toFixed(2), percentage: matPct.toFixed(1) },
        }));
      }
    }
  } catch { /* vertical not active */ }

  return (await Promise.all(alerts)).filter(Boolean);
}

// ── Materiales de limpieza: material no entregado ────────────────────────────

async function checkMaterialNotDelivered(ctx, cleaningServices, cleaningDeliveries, config) {
  if (!config.materialNotDeliveredEnabled) return [];
  const alerts = [];
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const upcomingServices = cleaningServices.filter(
    (s) => (s.date === todayStr || s.date === tomorrowStr) && ['pending', 'assigned'].includes(s.status) && s.assignedTo
  );

  const recentDeliveryWorkers = new Set(
    cleaningDeliveries
      .filter((d) => d.status === 'delivered' && daysBetween(d.date, now) <= 3)
      .map((d) => d.workerId)
  );

  for (const svc of upcomingServices) {
    if (recentDeliveryWorkers.has(svc.assignedTo)) continue;
    alerts.push(await emitAlert({
      ...ctx,
      dedupKey: `matnotdel-${svc._id}`,
      level: 'warning',
      category: 'cleaning_material',
      title: 'Servicio sin material asignado',
      message: `${svc.assignedToName || 'Trabajador'} tiene el servicio ${svc.serviceNumber} ${svc.date === todayStr ? 'hoy' : 'mañana'} en ${svc.address || '?'} sin material entregado reciente.`,
      entityId: svc._id,
      entityType: 'cleaning_service',
      route: `/saas/cleaning-materials?tab=entregas&workerId=${svc.assignedTo}`,
      metadata: { serviceNumber: svc.serviceNumber, workerName: svc.assignedToName },
    }));
  }
  return alerts.filter(Boolean);
}

// ── Materiales de limpieza: consumo anómalo ──────────────────────────────────

async function checkAbnormalConsumption(ctx, cleaningDeliveries, config) {
  if (!config.abnormalConsumptionEnabled) return [];
  const alerts = [];
  const now = new Date();
  const threshold = config.abnormalConsumptionThreshold || 2;

  const recentDeliveries = cleaningDeliveries.filter((d) => d.status === 'delivered' && daysBetween(d.date, now) <= 28);
  if (recentDeliveries.length < 4) return [];

  const byWorker = {};
  for (const d of recentDeliveries) {
    if (!d.workerId) continue;
    if (!byWorker[d.workerId]) byWorker[d.workerId] = { name: d.workerName, totalQty: 0, count: 0 };
    byWorker[d.workerId].totalQty += d.lines.reduce((s, l) => s + (l.quantity || 0), 0);
    byWorker[d.workerId].count++;
  }

  const workers = Object.entries(byWorker);
  if (workers.length < 2) return [];
  const avgQty = workers.reduce((s, [, w]) => s + w.totalQty, 0) / workers.length;
  if (avgQty <= 0) return [];

  for (const [workerId, w] of workers) {
    if (w.totalQty > avgQty * threshold) {
      const ratio = (w.totalQty / avgQty).toFixed(1);
      alerts.push(await emitAlert({
        ...ctx,
        dedupKey: `matabnorm-${workerId}`,
        level: 'warning',
        category: 'cleaning_material',
        title: 'Consumo de material anómalo',
        message: `${w.name} ha recibido ${w.totalQty} unidades en las últimas 4 semanas (${ratio}× la media del equipo).`,
        entityId: workerId,
        entityType: 'team_member',
        route: `/saas/cleaning-materials?tab=entregas&workerId=${workerId}`,
        metadata: { workerName: w.name, totalQty: w.totalQty, avgQty: Math.round(avgQty), ratio },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ── Materiales de limpieza: producto próximo a caducar ───────────────────────

async function checkMaterialExpiring(ctx, catalogItems, config) {
  if (!config.materialExpiringEnabled) return [];
  const alerts = [];
  const now = new Date();
  const daysAhead = config.materialExpiringDays || 30;

  const cleaningMats = catalogItems.filter((i) => i.subtype === 'cleaning_material' && i.expirationMonths > 0 && i.active !== false);
  for (const mat of cleaningMats) {
    const purchased = new Date(mat.lastPurchaseDate || mat.createdAt);
    if (Number.isNaN(purchased.getTime())) continue;
    const expiryDate = new Date(purchased);
    expiryDate.setMonth(expiryDate.getMonth() + mat.expirationMonths);
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);

    if (daysLeft > 0 && daysLeft <= daysAhead && Number(mat.stockQuantity || 0) > 0) {
      alerts.push(await emitAlert({
        ...ctx,
        dedupKey: `matexpiry-${mat._id}`,
        level: daysLeft <= 7 ? 'alert' : 'warning',
        category: 'cleaning_material',
        title: 'Material próximo a caducar',
        message: `"${mat.name}" caduca en ${daysLeft} días. Stock restante: ${mat.stockQuantity} ${mat.unit || 'ud'}.`,
        entityId: mat._id,
        entityType: 'catalog_item',
        route: `/saas/cleaning-materials?tab=stock&itemId=${mat._id}`,
        metadata: { name: mat.name, daysLeft, stockQuantity: mat.stockQuantity },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── CASH REGISTER ALERTS ───────────────────────────────────────────────────

async function checkRegisterNotOpened(ctx, tpvSessions, pointsOfSale, config) {
  if (!config.cashRegister?.registerNotOpenedEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const now = new Date();
  const hour = now.getHours();
  if (hour < config.cashRegister.registerNotOpenedCheckHour) return [];
  const todayStr = now.toISOString().slice(0, 10);
  const todayOpenSessions = tpvSessions.filter(s => s.openedAt?.startsWith(todayStr));
  const alerts = [];

  for (const pdv of pointsOfSale) {
    const activeTerminals = (pdv.terminals || []).filter(t => t.active);
    for (const terminal of activeTerminals) {
      const hasSession = todayOpenSessions.some(s => s.terminalId === terminal.id || s.terminalName === terminal.name);
      if (!hasSession) {
        alerts.push(await emit({
          ...ctx, dedupKey: `reg-notopen-${pdv._id}-${terminal.id}-${todayStr}`, level: 'warning',
          category: 'register_not_opened', source: 'cash_register',
          title: 'Caja sin abrir',
          message: `La caja "${terminal.name}" de ${pdv.name} no se ha abierto hoy.`,
          entityId: pdv._id, entityType: 'point_of_sale', route: '/saas/vertical/delivery/caja',
          metadata: { pdvName: pdv.name, terminalName: terminal.name },
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

async function checkRegisterNotClosed(ctx, tpvSessions, config, pointsOfSale = []) {
  if (!config.cashRegister?.registerNotClosedEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const now = new Date();
  const hour = now.getHours();
  if (hour < config.cashRegister.registerNotClosedCheckHour) return [];
  const alerts = [];

  const openSessions = tpvSessions.filter(s => s.status === 'open');
  for (const session of openSessions) {
    const openedAt = new Date(session.openedAt);
    const hoursOpen = (now.getTime() - openedAt.getTime()) / 3_600_000;
    if (hoursOpen >= 14) {
      alerts.push(await emit({
        ...ctx, dedupKey: `reg-notclosed-${session._id}`, level: 'alert',
        category: 'register_not_closed', source: 'cash_register',
        title: 'Caja sin cerrar',
        message: `La caja "${session.terminalName}"${session.pointOfSaleName ? ` (${session.pointOfSaleName})` : ''} lleva ${Math.floor(hoursOpen)}h abierta.`,
        entityId: session._id, entityType: 'tpv_register_session', route: '/saas/vertical/delivery/caja',
        metadata: { terminalName: session.terminalName, hoursOpen: Math.floor(hoursOpen), workerName: session.workerName },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkRegisterDiscrepancy(ctx, tpvSessions, cashCfg, pointsOfSale = []) {
  if (!cashCfg?.discrepancyEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const threshold = cashCfg.discrepancyThreshold || 20;
  const todayStr = new Date().toISOString().slice(0, 10);
  const alerts = [];

  const closedToday = tpvSessions.filter(s => s.status === 'closed' && s.closedAt?.startsWith(todayStr) && Math.abs(s.difference || 0) >= threshold);
  for (const session of closedToday) {
    alerts.push(await emit({
      ...ctx, dedupKey: `reg-discrep-${session._id}`, level: Math.abs(session.difference) >= threshold * 5 ? 'alert' : 'warning',
      category: 'delivery_cash_discrepancy', source: 'delivery', ruleId: 'delivery_cash_discrepancy',
      title: 'Descuadre de caja',
      message: `Diferencia de ${session.difference >= 0 ? '+' : ''}${Number(session.difference).toFixed(2)}€ en "${session.terminalName}"${session.pointOfSaleName ? ` (${session.pointOfSaleName})` : ''}.`,
      entityId: session._id, entityType: 'tpv_register_session', route: '/saas/vertical/delivery/caja',
      metadata: { terminalName: session.terminalName, difference: session.difference, workerName: session.workerName },
    }));
  }
  return alerts.filter(Boolean);
}

async function checkHighReturnInRegister(ctx, tpvSessions, cashCfg, pointsOfSale = []) {
  if (!cashCfg?.highReturnEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];
  const threshold = cashCfg.highReturnThreshold || 50;
  const todayStr = new Date().toISOString().slice(0, 10);
  const alerts = [];

  const todaySessions = tpvSessions.filter(s => s.openedAt?.startsWith(todayStr));
  for (const session of todaySessions) {
    const returns = (session.transactions || []).filter(t => t.type === 'return');
    const totalReturns = returns.reduce((s, t) => s + t.amount, 0);
    if (totalReturns >= threshold) {
      alerts.push(await emit({
        ...ctx, dedupKey: `reg-highret-${session._id}-${todayStr}`, level: totalReturns >= threshold * 3 ? 'alert' : 'warning',
        category: 'register_high_return', source: 'cash_register',
        title: 'Devolución elevada',
        message: `${returns.length} devolución(es) por ${totalReturns.toFixed(2)}€ en "${session.terminalName}".`,
        entityId: session._id, entityType: 'tpv_register_session', route: '/saas/vertical/delivery/caja',
        metadata: { terminalName: session.terminalName, returnAmount: totalReturns, returnCount: returns.length, workerName: session.workerName },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── CONSTRUCTION PAYMENT ALERTS ─────────────────────────────────────────────

async function checkConstructionPaymentUpcoming(ctx, payments, config) {
  if (config.constructionPaymentUpcomingEnabled === false) return [];
  const now = new Date();
  const alerts = [];
  for (const payment of payments) {
    if (payment.estado === 'pagado' || payment.estado === 'anulado') continue;
    if (!payment.fechaPrevista) continue;
    const dueDate = new Date(payment.fechaPrevista);
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
    if (daysUntil > 0 && daysUntil <= 7) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-upcoming-${payment._id}`,
        level: daysUntil <= 3 ? 'warning' : 'info',
        category: 'construction_payment_upcoming', source: 'construction',
        title: 'Pago interno próximo',
        message: `${payment.nombre} (${payment.obraNombre}): ${Number(payment.pendiente || 0).toFixed(2)}€ pendiente, vence en ${daysUntil} día(s).`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, pendiente: payment.pendiente, daysUntil },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkConstructionPaymentOverdue(ctx, payments) {
  const now = new Date();
  const alerts = [];
  for (const payment of payments) {
    if (payment.estado === 'pagado' || payment.estado === 'anulado') continue;
    if (!payment.fechaPrevista) continue;
    const daysLate = daysBetween(payment.fechaPrevista, now);
    if (daysLate > 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-overdue-${payment._id}`,
        level: daysLate > 15 ? 'alert' : 'warning',
        category: 'construction_payment_overdue', source: 'construction',
        title: 'Pago interno vencido',
        message: `${payment.nombre} (${payment.obraNombre}): ${Number(payment.pendiente || 0).toFixed(2)}€ sin pagar, venció hace ${daysLate} día(s).`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, pendiente: payment.pendiente, daysLate },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkConstructionPaymentNoReceipt(ctx, payments) {
  const alerts = [];
  for (const payment of payments) {
    const sinJustificante = (payment.pagos || []).filter(p => p.pagado && !p.justificanteUrl && !p.facturaProveedorId);
    if (sinJustificante.length > 0) {
      const totalSin = sinJustificante.reduce((s, p) => s + (Number(p.importe) || 0), 0);
      alerts.push(await emit({
        ...ctx, dedupKey: `cpay-noreceipt-${payment._id}`,
        level: 'warning',
        category: 'construction_payment_no_receipt', source: 'construction',
        title: 'Pago sin justificante',
        message: `${payment.nombre} (${payment.obraNombre}): ${sinJustificante.length} pago(s) por ${totalSin.toFixed(2)}€ sin justificante.`,
        entityId: payment._id, entityType: 'construction_payment',
        route: '/saas/vertical/construccion/pagos',
        metadata: { obraId: payment.obraId, count: sinJustificante.length, totalSin },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkConstructionCostOverBudget(ctx, projects) {
  const alerts = [];
  for (const project of projects) {
    if (!project.costePresupuestado || project.costePresupuestado <= 0) continue;
    if ((project.costeAcumulado || 0) > project.costePresupuestado) {
      const exceso = project.costeAcumulado - project.costePresupuestado;
      alerts.push(await emit({
        ...ctx, dedupKey: `cprj-overcost-${project._id}`,
        level: 'alert',
        category: 'construction_cost_over_budget', source: 'construction',
        title: 'Coste de obra superior al presupuestado',
        message: `${project.nombre}: coste ${Number(project.costeAcumulado).toFixed(2)}€ supera los ${Number(project.costePresupuestado).toFixed(2)}€ presupuestados.`,
        entityId: project._id, entityType: 'construction_project',
        route: '/saas/vertical/construccion/pagos',
        metadata: { costeAcumulado: project.costeAcumulado, costePresupuestado: project.costePresupuestado, exceso },
      }));
    }
  }
  return alerts.filter(Boolean);
}

async function checkConstructionLowMargin(ctx, projects, config) {
  const umbral = Number(config.constructionLowMarginThreshold) || 10;
  const alerts = [];
  for (const project of projects) {
    if (!project.cobradoCliente || project.cobradoCliente <= 0) continue;
    const margenPorc = Number(project.margenRealPorc || 0);
    if (margenPorc < umbral && margenPorc !== 0) {
      alerts.push(await emit({
        ...ctx, dedupKey: `cprj-lowmargin-${project._id}`,
        level: margenPorc < 0 ? 'alert' : 'warning',
        category: 'construction_low_margin', source: 'construction',
        title: margenPorc < 0 ? 'Obra con margen negativo' : 'Margen bajo en obra',
        message: `${project.nombre}: margen real ${margenPorc.toFixed(1)}% (previsto: ${Number(project.margenPrevistoPorc || 0).toFixed(1)}%).`,
        entityId: project._id, entityType: 'construction_project',
        route: '/saas/vertical/construccion/pagos',
        metadata: { margenReal: project.margenReal, margenRealPorc: margenPorc, umbral },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ── Construcción — presupuesto aceptado sin obra ─────────────────────────────

async function checkBudgetWithoutProject(ctx, budgets, config) {
  if (config.budgetNoProjectEnabled === false) return [];
  const now = new Date();
  const alerts = [];

  for (const budget of budgets) {
    if (budget.estado !== 'aceptado') continue;
    if (budget.obraGeneradaId) continue;
    const accepted = budget.fechaAceptacion ? new Date(budget.fechaAceptacion) : new Date(budget.updatedAt);
    const hoursSince = (now.getTime() - accepted.getTime()) / 3_600_000;
    if (hoursSince < 1) continue;

    alerts.push(await emitAlert({
      ...ctx, dedupKey: `cbud-noproject-${budget._id}`,
      level: hoursSince > 24 ? 'alert' : 'warning',
      category: 'budget_no_project', source: 'construction',
      title: 'Presupuesto aceptado sin obra',
      message: `El presupuesto ${budget.referencia} (${budget.clienteNombre || 'sin cliente'}) fue aceptado hace ${Math.floor(hoursSince)}h pero no se generó obra automáticamente.`,
      entityId: budget._id, entityType: 'construction_budget',
      route: '/saas/construction/budgets',
      metadata: { referencia: budget.referencia, clienteNombre: budget.clienteNombre, hoursSince: Math.floor(hoursSince) },
    }));
  }
  return alerts.filter(Boolean);
}

// ── Construcción — obra sin responsable ──────────────────────────────────────

async function checkProjectWithoutOwner(ctx, projects, config) {
  if (config.projectNoOwnerEnabled === false) return [];
  const alerts = [];

  for (const project of projects) {
    if (project.estado === 'finalizada') continue;
    if (project.responsableId) continue;

    alerts.push(await emitAlert({
      ...ctx, dedupKey: `cprj-noowner-${project._id}`,
      level: 'warning',
      category: 'project_no_owner', source: 'construction',
      title: 'Obra sin responsable',
      message: `La obra "${project.nombre}" no tiene responsable asignado.`,
      entityId: project._id, entityType: 'construction_project',
      route: '/saas/construction/projects',
      metadata: { nombre: project.nombre, estado: project.estado },
    }));
  }
  return alerts.filter(Boolean);
}

// ── Construcción — obra sin fecha de inicio ──────────────────────────────────

async function checkProjectWithoutStartDate(ctx, projects, config) {
  if (config.projectNoStartDateEnabled === false) return [];
  const thresholdDays = Number(config.projectNoStartDateDays) || 3;
  const now = new Date();
  const alerts = [];

  for (const project of projects) {
    if (project.estado === 'finalizada') continue;
    if (project.fechaInicio) continue;
    const created = new Date(project.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const daysSince = Math.floor((now.getTime() - created.getTime()) / 86_400_000);
    if (daysSince < thresholdDays) continue;

    alerts.push(await emitAlert({
      ...ctx, dedupKey: `cprj-nostart-${project._id}`,
      level: daysSince > thresholdDays * 2 ? 'alert' : 'warning',
      category: 'project_no_start_date', source: 'construction',
      title: 'Obra sin fecha de inicio',
      message: `La obra "${project.nombre}" lleva ${daysSince} días creada sin fecha de inicio asignada.`,
      entityId: project._id, entityType: 'construction_project',
      route: '/saas/construction/projects',
      metadata: { nombre: project.nombre, estado: project.estado, daysSince },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── CLEANING WORKER ALERTS ──────────────────────────────────────────────────

async function checkCleaningWorkerAlerts(ctx, workers, services, config) {
  if (!workers || workers.length === 0) return [];
  const alerts = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const allSvcs = services.filter((s) => !s.deletedAt);

  for (const w of workers) {
    const tomorrowSvcs = allSvcs.filter((s) => s.date === tomorrow && (s.workerId === w._id || s.assignedTo === w._id));
    if (tomorrowSvcs.length === 0) {
      alerts.push(await emitAlert({
        ...ctx, category: 'cleaning_worker', source: 'worker_no_assignment',
        dedupKey: `worker_no_assignment:${w._id}:${tomorrow}`, priority: 'warning',
        title: `${w.name} sin asignación`,
        message: `${w.name} no tiene servicios asignados para mañana (${tomorrow})`,
        entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
      }));
    }

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekSvcs = allSvcs.filter((s) => s.date >= weekStartStr && s.date <= today && (s.workerId === w._id || s.assignedTo === w._id) && s.status === 'completed');
    let weekMinutes = 0;
    for (const s of weekSvcs) {
      if (s.checkInAt && s.checkOutAt) weekMinutes += Math.max(0, (new Date(s.checkOutAt) - new Date(s.checkInAt)) / 60000);
    }
    const weekHours = weekMinutes / 60;
    if (weekHours > (w.weeklyHours || 40) * 1.1) {
      alerts.push(await emitAlert({
        ...ctx, category: 'cleaning_worker', source: 'worker_hours_excess',
        dedupKey: `worker_hours_excess:${w._id}:${weekStartStr}`, priority: 'warning',
        title: `Exceso de horas: ${w.name}`,
        message: `${w.name} lleva ${Math.round(weekHours * 10) / 10}h esta semana (${w.weeklyHours || 40}h contratadas)`,
        entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
      }));
    }

    const todayWorkerSvcs = allSvcs.filter((s) => s.date === today && (s.workerId === w._id || s.assignedTo === w._id) && s.status === 'assigned');
    for (const s of todayWorkerSvcs) {
      if (s.time && !s.checkInAt) {
        const scheduled = new Date(`${s.date}T${s.time}`);
        if (now.getTime() - scheduled.getTime() > 30 * 60000) {
          alerts.push(await emitAlert({
            ...ctx, category: 'cleaning_worker', source: 'worker_absence',
            dedupKey: `worker_absence:${w._id}:${s._id}`, priority: 'critical',
            title: `Ausencia: ${w.name}`,
            message: `${w.name} no se ha presentado al servicio en ${s.address || 'ubicación desconocida'} (programado a las ${s.time})`,
            entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
          }));
        }
      }
    }

    for (const d of (w.documents || [])) {
      if (d.expiresAt && d.expiresAt < today) {
        alerts.push(await emitAlert({
          ...ctx, category: 'cleaning_worker', source: 'worker_doc_expired',
          dedupKey: `worker_doc_expired:${w._id}:${d.id}`, priority: 'critical',
          title: `Documento caducado: ${w.name}`,
          message: `Documento '${d.name}' de ${w.name} caducó el ${d.expiresAt}`,
          entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
        }));
      }
      const thirtyDays = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      if (d.expiresAt && d.expiresAt >= today && d.expiresAt <= thirtyDays) {
        const daysLeft = Math.ceil((new Date(d.expiresAt) - now) / 86400000);
        alerts.push(await emitAlert({
          ...ctx, category: 'cleaning_worker', source: 'worker_doc_expiring',
          dedupKey: `worker_doc_expiring:${w._id}:${d.id}`, priority: 'warning',
          title: `Documento por caducar: ${w.name}`,
          message: `Documento '${d.name}' de ${w.name} caduca el ${d.expiresAt} (en ${daysLeft} días)`,
          entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
        }));
      }
    }

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const recentSvcs = allSvcs.filter((s) => s.date >= sevenDaysAgo && s.date <= today && (s.workerId === w._id || s.assignedTo === w._id));
    const recentCompleted = recentSvcs.filter((s) => s.status === 'completed');
    if (recentSvcs.length >= 3) {
      const efficiency = (recentCompleted.length / recentSvcs.length) * 100;
      if (efficiency < 40) {
        alerts.push(await emitAlert({
          ...ctx, category: 'cleaning_worker', source: 'worker_low_productivity',
          dedupKey: `worker_low_productivity:${w._id}:${weekStartStr}`, priority: 'warning',
          title: `Baja productividad: ${w.name}`,
          message: `${w.name} tiene una eficiencia del ${Math.round(efficiency)}% en la última semana`,
          entityId: w._id, entityType: 'cleaning_worker', route: '/saas/cleaning-workers',
        }));
      }
    }
  }

  return alerts.filter(Boolean);
}

async function runAlertsForUser(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  if (!account) return { userId, alerts: 0 };

  const config = getAlertConfig(account);
  const ctx = { businessId: '', userId };
  const results = [];

  const [catalogItems, catalogInfraDocs, purchaseInvoices, parts, vehicles, webOrders, deliveryOrders, workOrders, purchaseOrders, financeDocs, clientInvoices, prepExpenses, pointsOfSale] = await Promise.all([
    fetchAllDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocs(getCatalogDbName()).then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt && (i.type === 'warehouse' || i.type === 'stock_movement'))),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_invoice').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getPartsDbName(), 'part').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === userId)),
    fetchAllDocsOfType(getWebDbName(), 'web_order').then((d) => d.filter((i) => i.user_id === userId || i.business_id)),
    fetchAllDocsOfType(getDeliveryDbName(), 'delivery_order').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getWorkshopDbName(), 'work_order').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_order').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocs(getFinanceDbName()).then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    fetchAllDocsOfType(getInvoicesDbName(), 'client_invoice').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
    fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'preparation_expense' && i.active !== false && !i.deletedAt && i.user_id === userId)).catch(() => []),
    fetchAllDocsOfType(getDeliveryDbName(), 'point_of_sale').then((d) => d.filter((i) => i.user_id === userId)),
  ]);

  const deliveryReady = canEmitDeliveryAlerts({ deliveryOrders, pointsOfSale, deliveryConfig: account?.deliveryConfig });
  const financeReady = canEmitFinanceAlerts({ financeDocs, purchaseInvoices, clientInvoices });
  const purchaseReady = canEmitPurchaseAlerts({ purchaseOrders, purchaseInvoices });
  const webReady = canEmitWebOrderAlerts({ webOrders });
  const workshopReady = canEmitWorkshopAlerts({ workOrders, parts });
  const vehiclesReady = canEmitVehicleAlerts({ vehicles });

  results.push(...await checkLowStock(ctx, catalogItems, config, catalogInfraDocs));
  results.push(...await checkPartsLowStock(ctx, parts, config));
  results.push(...await checkNegativeStock(ctx, catalogItems, config, catalogInfraDocs));
  if (financeReady) {
    results.push(...await checkOverdueInvoices(ctx, purchaseInvoices, config));
    results.push(...await checkHighPayables(ctx, purchaseInvoices, config));
    results.push(...await checkClientPaymentOverdue(ctx, financeDocs, config));
    results.push(...await checkNegativeCashFlow(ctx, financeDocs, config));
    results.push(...await checkTaxDeadline(ctx, financeDocs, config));
    results.push(...await checkExpenseWithoutDocument(ctx, financeDocs, config));
  }
  if (webReady) results.push(...await checkStaleWebOrders(ctx, webOrders, config));
  if (deliveryReady && !usesDeliveryAlertMotor(account)) {
    results.push(...await checkStaleDeliveryOrders(ctx, deliveryOrders, config));
  }
  if (vehiclesReady) {
    results.push(...await checkVehicleStockAging(ctx, vehicles, config));
    results.push(...await checkLowSalesVelocity(ctx, vehicles, config));
    results.push(...await checkLowAvgMargin(ctx, vehicles, config));
    results.push(...await checkExcessPreparationCost(ctx, vehicles, config));
  }
  if (workshopReady) results.push(...await checkStaleWorkOrders(ctx, workOrders, config));
  if (purchaseReady) {
    results.push(...await checkPendingPurchaseOrders(ctx, purchaseOrders, config));
    results.push(...await checkWeeklyPurchaseMissing(userId, purchaseOrders, catalogItems, config));
    results.push(...await checkSupplierNotDelivering(userId, purchaseOrders, config));
    results.push(...await checkPendingReception(userId, purchaseOrders, config));
    results.push(...await checkCriticalProductNotOrdered(userId, catalogItems, purchaseOrders, config));
    results.push(...await checkSupplierInvoiceEmailAlerts(ctx, purchaseInvoices, config));
  }

  // Gastos de preparación
  if (vehiclesReady && prepExpenses.length > 0) {
    results.push(...await checkExpensesWithoutDocument(userId, prepExpenses, config));
    results.push(...await checkPendingExpenses(userId, prepExpenses, config));
    results.push(...await checkVehicleHighPreparationCost(userId, vehicles, prepExpenses, config));
    results.push(...await checkDuplicateExpenseInvoices(userId, prepExpenses, config));
  }

  // Sala
  results.push(...await runSalaAlerts(ctx, userId, config));

  // Facturacion clientes
  if (financeReady && clientInvoices.length > 0) {
    results.push(...await checkOverdueClientInvoices(ctx, clientInvoices, config));
    results.push(...await checkUnpaidClientInvoices(ctx, clientInvoices, config));
    results.push(...await checkClientMultiplePending(ctx, clientInvoices, config));
  }

  // Firma digital
  const sigReqs = await fetchAllDocsOfType(getDocumentsDbName(), 'signature_request').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []);
  if (sigReqs.length > 0) {
    results.push(...await checkPendingSignatures(ctx, sigReqs, config));
    results.push(...await checkRejectedSignatures(ctx, sigReqs, config));
    results.push(...await checkExpiringSignatures(ctx, sigReqs, config));
  }

  // Scrapyard — piezas y despiece
  try {
    const scrapyardDb = getScrapyardDbName();
    const [scrapParts, scrapSessions] = await Promise.all([
      fetchAllDocsOfType(scrapyardDb, 'scrapyard_part').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(scrapyardDb, 'dismantling_session').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
    ]);
    if (canEmitScrapyardAlerts({ parts: scrapParts, sessions: scrapSessions, vehicles })) {
      results.push(...await checkPartsWithoutPrice(ctx, scrapParts, config));
      results.push(...await checkPartsWithoutLocation(ctx, scrapParts, config));
      results.push(...await checkDuplicatePartReferences(ctx, scrapParts, config));
      results.push(...await checkPartsWithoutPhotos(ctx, scrapParts, config));
      results.push(...await checkIncompleteDismantling(ctx, scrapSessions, config));
    }
  } catch { /* vertical not active */ }

  // Materiales de limpieza
  try {
    const cleaningDb = getCleaningDbName();
    const [cleaningServices, cleaningDeliveries] = await Promise.all([
      fetchAllDocsOfType(cleaningDb, 'cleaning_service').then((d) => d.filter((i) => i.user_id === userId)),
      fetchAllDocsOfType(cleaningDb, 'material_delivery').then((d) => d.filter((i) => i.user_id === userId)),
    ]);
    if (canEmitCleaningAlerts({ services: cleaningServices })) {
      results.push(...await checkMaterialNotDelivered(ctx, cleaningServices, cleaningDeliveries, config));
      results.push(...await checkAbnormalConsumption(ctx, cleaningDeliveries, config));
      results.push(...await checkMaterialExpiring(ctx, catalogItems, config));
      results.push(...await checkCleaningRouteAlerts(ctx, cleaningDb, userId, config));
      results.push(...await checkCleaningProfitabilityAlerts(ctx, cleaningDb, userId, config));
    }
  } catch { /* vertical not active */ }

  // Construcción — pagos internos + conversión presupuesto → obra
  try {
    const constructionDb = getConstructionDbName();
    const [cPayments, cProjects, cBudgets] = await Promise.all([
      fetchAllDocsOfType(constructionDb, 'construction_payment').then((d) => d.filter((i) => i.user_id === userId)),
      fetchAllDocsOfType(constructionDb, 'construction_project').then((d) => d.filter((i) => i.user_id === userId)),
      fetchAllDocsOfType(constructionDb, 'construction_budget').then((d) => d.filter((i) => i.user_id === userId)),
    ]);
    if (canEmitConstructionAlerts({ projects: cProjects, budgets: cBudgets })) {
      results.push(...await checkConstructionPaymentUpcoming(ctx, cPayments, config));
      results.push(...await checkConstructionPaymentOverdue(ctx, cPayments));
      results.push(...await checkConstructionPaymentNoReceipt(ctx, cPayments));
      results.push(...await checkConstructionCostOverBudget(ctx, cProjects));
      results.push(...await checkConstructionLowMargin(ctx, cProjects, config));
      results.push(...await checkBudgetWithoutProject(ctx, cBudgets, config));
      results.push(...await checkProjectWithoutOwner(ctx, cProjects, config));
      results.push(...await checkProjectWithoutStartDate(ctx, cProjects, config));
    }
  } catch { /* vertical not active */ }

  // Construcción — documentación de obra (obligatorios, firma, caducidad, duplicados)
  try {
    const constructionDb = getConstructionDbName();
    const [obraDocs, obraProjects] = await Promise.all([
      fetchAllDocsOfType(constructionDb, 'construction_obra_document').then(d => d.filter(i => i.user_id === userId)),
      fetchAllDocsOfType(constructionDb, 'construction_project').then(d => d.filter(i => i.user_id === userId)),
    ]);
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeProjects = obraProjects.filter(p => p.estado === 'en_obra' || p.estado === 'planificación');
    for (const proj of activeProjects) {
      const projDocs = obraDocs.filter(d => d.obraId === proj._id);
      const obligatorios = projDocs.filter(d => d.obligatorio);
      const faltantes = obligatorios.filter(d => d.estado === 'pendiente' || d.estado === 'borrador');
      if (faltantes.length > 0) {
        results.push(await emit({
          userId, businessId: ctx.businessId, category: 'construction_doc_obligatorio_faltante', source: 'construccion',
          level: 'alert', dedupKey: `cdoc_oblig_${proj._id}_${todayStr}`, ruleId: 'construction_doc_obligatorio_faltante',
          title: `${faltantes.length} documento(s) obligatorio(s) faltante(s)`,
          message: `La obra "${proj.nombre}" tiene ${faltantes.length} documento(s) obligatorio(s) sin completar: ${faltantes.slice(0, 3).map(d => d.nombre || d.categoria).join(', ')}`,
          entityId: proj._id, entityType: 'construction_project', route: `/saas/construction-documents?obraId=${proj._id}`,
        }));
      }
    }
    const firmaPendientes = obraDocs.filter(d => d.firmaEstado === 'pendiente');
    const hace48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    for (const d of firmaPendientes) {
      if (d.updatedAt && d.updatedAt < hace48h) {
        results.push(await emit({
          userId, businessId: ctx.businessId, category: 'construction_doc_firma_pendiente', source: 'construccion',
          level: 'warning', dedupKey: `cdoc_firma_${d._id}_${todayStr}`, ruleId: 'construction_doc_firma_pendiente',
          title: 'Firma pendiente más de 48h',
          message: `El documento "${d.nombre}" de la obra "${d.obraNombre}" lleva más de 48h pendiente de firma`,
          entityId: d._id, entityType: 'construction_obra_document', route: `/saas/construction-documents?obraId=${d.obraId}`,
        }));
      }
    }
    const licenciasCaducadas = obraDocs.filter(d =>
      d.fechaCaducidad && d.fechaCaducidad < todayStr && d.estado !== 'archivado' &&
      (d.categoria === 'licencia' || d.categoria === 'seguro' || d.categoria === 'licencia_obra' || d.categoria === 'seguro_rc' || d.categoria === 'seguro_todo_riesgo')
    );
    for (const d of licenciasCaducadas) {
      results.push(await emit({
        userId, businessId: ctx.businessId, category: 'construction_doc_licencia_caducada', source: 'construccion',
        level: 'alert', dedupKey: `cdoc_caducada_${d._id}_${todayStr}`, ruleId: 'construction_doc_licencia_caducada',
        title: 'Licencia/seguro caducado',
        message: `"${d.nombre}" de la obra "${d.obraNombre}" caducó el ${d.fechaCaducidad}`,
        entityId: d._id, entityType: 'construction_obra_document', route: `/saas/construction-documents?obraId=${d.obraId}`,
      }));
    }
    const seen = new Set();
    for (const d of obraDocs) {
      if (seen.has(d._id)) continue;
      const dups = [];
      const normName = String(d.nombre || '').toLowerCase().trim();
      for (const other of obraDocs) {
        if (other._id === d._id || other.obraId !== d.obraId) continue;
        let score = 0;
        if (String(other.nombre || '').toLowerCase().trim() === normName && normName) score++;
        if (other.categoria === d.categoria) score++;
        if (d.archivoSize && other.archivoSize === d.archivoSize) score++;
        if (score >= 2) dups.push(other);
      }
      if (dups.length > 0) {
        results.push(await emit({
          userId, businessId: ctx.businessId, category: 'construction_doc_duplicado', source: 'construccion',
          level: 'info', dedupKey: `cdoc_dup_${d._id}_${todayStr}`, ruleId: 'construction_doc_duplicado',
          title: 'Posible documento duplicado',
          message: `"${d.nombre}" en obra "${d.obraNombre}" puede estar duplicado`,
          entityId: d._id, entityType: 'construction_obra_document', route: `/saas/construction-documents?obraId=${d.obraId}`,
        }));
        dups.forEach(x => seen.add(x._id));
      }
      seen.add(d._id);
    }
  } catch { /* vertical not active */ }

  // Carnicería — alertas de margen, merma, ventas y stock estrella
  try {
    const butcherDb = getButcherDbName();
    const butcherDocs = await fetchAllDocs(butcherDb).catch(() => []);
    const bUserDocs = butcherDocs.filter((d) => d.user_id === userId);
    const bSales = bUserDocs.filter((d) => d.type === 'butcher_sale' && d.status === 'completed');
    const bWaste = bUserDocs.filter((d) => d.type === 'butcher_waste');
    const bProducts = bUserDocs.filter((d) => d.type === 'butcher_product' && d.active !== false);

    if (bSales.length > 0 || bProducts.length > 0) {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      const bCfg = config.butcherMermaUmbralKg || 2.5;
      const bMargenMin = config.butcherMargenMinPct || 15;

      // RULE: Margen bajo en producto (últimos 7 días)
      const recentSales = bSales.filter((s) => s.date >= weekAgo);
      const prodRevenue = {};
      const prodCost = {};
      for (const s of recentSales) {
        for (const it of (s.items || [])) {
          const key = it.productId || it.productName;
          if (!key) continue;
          prodRevenue[key] = (prodRevenue[key] || 0) + Number(it.subtotal || 0);
          const prod = bProducts.find((p) => p._id === key);
          prodCost[key] = (prodCost[key] || 0) + Number(it.quantity || 0) * Number(prod?.costPerKg || Number(it.pricePerUnit || 0) * 0.6);
        }
      }
      for (const [key, rev] of Object.entries(prodRevenue)) {
        const cost = prodCost[key] || 0;
        const marginPct = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0;
        if (marginPct < bMargenMin && rev > 50) {
          const prod = bProducts.find((p) => p._id === key);
          const prodName = prod?.name || key;
          const lvl = marginPct < 5 ? 'alert' : 'warning';
          results.push(await emit({
            userId, businessId: ctx.businessId, category: 'butcher', source: 'butcher_margin',
            level: lvl, dedupKey: `butcher_margin_${key}_${today}`, ruleId: 'butcher_low_margin',
            title: `Margen bajo en ${prodName}`,
            message: `Margen de ${prodName}: ${marginPct}% (últimos 7 días). Objetivo: ${bMargenMin}%`,
            entityId: key, entityType: 'butcher_product', route: '/saas/vertical/carniceria/informes?tab=margenes',
          }));
        }
      }

      // RULE: Merma alta del día
      const todayWaste = bWaste.filter((w) => w.date === today);
      const todayWasteKg = todayWaste.reduce((s, w) => s + Number(w.wasteKg || 0), 0);
      if (todayWasteKg > bCfg) {
        const lvl = todayWasteKg > bCfg * 2 ? 'alert' : 'warning';
        results.push(await emit({
          userId, businessId: ctx.businessId, category: 'butcher', source: 'butcher_waste',
          level: lvl, dedupKey: `butcher_waste_high_${today}`, ruleId: 'butcher_high_waste',
          title: 'Merma alta hoy',
          message: `Merma del día: ${todayWasteKg.toFixed(1)} kg (umbral: ${bCfg} kg)`,
          route: '/saas/vertical/carniceria/informes?tab=merma',
        }));
      }

      // RULE: Caída de ventas (solo horario comercial 8-21h)
      const hora = now.getHours();
      if (hora >= 8 && hora <= 21) {
        const todaySalesTotal = bSales.filter((s) => s.date === today).reduce((s, x) => s + Number(x.total || 0), 0);
        const dayOfWeek = now.getDay();
        const sameDaySales = [];
        for (let i = 1; i <= 5; i++) {
          const d = new Date(now.getTime() - i * 7 * 86400000).toISOString().slice(0, 10);
          const dayTotal = bSales.filter((s) => s.date === d).reduce((s2, x) => s2 + Number(x.total || 0), 0);
          if (dayTotal > 0) sameDaySales.push(dayTotal);
        }
        if (sameDaySales.length >= 2) {
          const avgSales = sameDaySales.reduce((a, b) => a + b, 0) / sameDaySales.length;
          const pctOfAvg = avgSales > 0 ? Math.round((todaySalesTotal / avgSales) * 100) : 100;
          if (pctOfAvg < 70) {
            const lvl = pctOfAvg < 50 ? 'alert' : 'warning';
            results.push(await emit({
              userId, businessId: ctx.businessId, category: 'butcher', source: 'butcher_sales',
              level: lvl, dedupKey: `butcher_sales_drop_${today}`, ruleId: 'butcher_sales_drop',
              title: 'Ventas por debajo de la media',
              message: `Ventas hoy: ${todaySalesTotal.toFixed(0)}€ vs ${avgSales.toFixed(0)}€ habitual (${pctOfAvg}%)`,
              route: '/saas/vertical/carniceria/informes?tab=ventas',
            }));
          }
        }
      }

      // RULE: Producto estrella con falta de stock
      const last30Sales = bSales.filter((s) => s.date >= monthAgo);
      const prodSalesMap = {};
      for (const s of last30Sales) {
        for (const it of (s.items || [])) {
          const key = it.productId;
          if (!key) continue;
          prodSalesMap[key] = (prodSalesMap[key] || 0) + Number(it.subtotal || 0);
        }
      }
      const topProductIds = Object.entries(prodSalesMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
      for (const prodId of topProductIds) {
        const prod = bProducts.find((p) => p._id === prodId);
        if (prod && prod.minStockKg > 0 && prod.stockKg < prod.minStockKg) {
          const lvl = prod.stockKg <= 0 ? 'alert' : 'warning';
          results.push(await emit({
            userId, businessId: ctx.businessId, category: 'butcher', source: 'butcher_stock',
            level: lvl, dedupKey: `butcher_star_stock_${prodId}_${today}`, ruleId: 'butcher_star_low_stock',
            title: `¡${prod.name} (top ventas) con stock bajo!`,
            message: `Stock: ${prod.stockKg} / ${prod.minStockKg} ${prod.unit || 'kg'}`,
            entityId: prodId, entityType: 'butcher_product', route: '/saas/butcher-inventory',
          }));
        }
      }
    }
  } catch { /* butcher vertical not active */ }

  return { userId, alerts: results.length };
}

// ─── ONBOARDING ALERTS ──────────────────────────────────────────────────────

async function checkOnboardingAlerts(userId) {
  const results = [];
  try {
    const setupDoc = await getDocument(fakeReq, ACCOUNTS_DB, `setup_progress:${userId}`);
    if (!setupDoc || setupDoc.type !== 'setup_progress') return results;
    if (setupDoc.overallCompleted) return results;

    const createdAt = new Date(setupDoc.createdAt);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / 3_600_000;

    const total = setupDoc.steps.length;
    const completed = setupDoc.steps.filter((s) => s.completed || s.skipped).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    let trialDaysLeft = 0;
    if (setupDoc.trialEndDate) {
      trialDaysLeft = Math.max(0, Math.ceil((new Date(setupDoc.trialEndDate).getTime() - now.getTime()) / 86_400_000));
    }

    // Rule 1: onboarding_incomplete (after 48h)
    if (hoursSinceCreation > 48 && pct < 100) {
      let level = 'info';
      if (hoursSinceCreation > 120) level = 'warning';
      if (trialDaysLeft > 0 && trialDaysLeft <= 3) level = 'critical';

      const alert = await emitAlert({
        userId,
        dedupKey: `onboarding_incomplete:${userId}`,
        level,
        category: 'onboarding',
        title: `Tu configuración inicial está al ${pct}%`,
        message: `Te faltan ${total - completed} pasos para tener tu negocio listo. Completa el onboarding para aprovechar tu prueba gratuita.`,
        entityId: setupDoc._id,
        entityType: 'setup_progress',
        route: '/saas/onboarding',
      });
      if (alert) results.push(alert);
    }

    // Rule 2: module_not_configured (after 72h)
    if (hoursSinceCreation > 72) {
      const moduleStepMap = {
        crm: ['initial_clients', 'crm_pipeline'],
        inventory: ['catalog_setup', 'stock_initial'],
        sales: ['tpv_config'],
        workshop: ['workshop_config'],
      };
      for (const [mod, stepKeys] of Object.entries(moduleStepMap)) {
        if (!setupDoc.requestedModules?.[mod]) continue;
        const unconfigured = stepKeys.filter((key) => {
          const s = setupDoc.steps.find((st) => st.key === key);
          return s && !s.completed && !s.skipped;
        });
        if (unconfigured.length > 0) {
          const modNames = { crm: 'CRM', inventory: 'Stock', sales: 'TPV', workshop: 'Taller' };
          const alert = await emitAlert({
            userId,
            dedupKey: `module_not_configured:${userId}:${mod}`,
            level: 'warning',
            category: 'onboarding',
            title: `El módulo ${modNames[mod] || mod} está activo pero sin configurar`,
            message: `Activaste ${modNames[mod] || mod} pero aún no lo has configurado. Completa el paso en el onboarding.`,
            entityId: setupDoc._id,
            entityType: 'setup_progress',
            route: '/saas/onboarding',
          });
          if (alert) results.push(alert);
        }
      }
    }

    // Rule 3: initial_team_missing (after 24h)
    if (hoursSinceCreation > 24) {
      const teamStep = setupDoc.steps.find((s) => s.key === 'initial_team');
      if (teamStep && !teamStep.completed && !teamStep.skipped) {
        const account = await findAccountByUserId(fakeReq, userId);
        const userCount = account?.onboardingData?.businessMetrics?.userCount || 1;
        if (userCount > 1) {
          const alert = await emitAlert({
            userId,
            dedupKey: `initial_team_missing:${userId}`,
            level: 'info',
            category: 'onboarding',
            title: 'Aún no has invitado a tu equipo',
            message: `Indicaste que ${userCount} personas usarán la plataforma. Invítalas desde el onboarding para que empiecen a trabajar.`,
            entityId: setupDoc._id,
            entityType: 'setup_progress',
            route: '/saas/onboarding',
          });
          if (alert) results.push(alert);
        }
      }
    }
  } catch {
    // silently skip if setup_progress doesn't exist
  }
  return results;
}

// ─── SALA ALERTS ─────────────────────────────────────────────────────────────

async function checkLongOccupiedTables(ctx, salaDocs, config) {
  const threshold = config.salaLongOccupiedMinutes || 180;
  if (!threshold) return [];
  const now = new Date();
  const alerts = [];
  const tables = salaDocs.filter((d) => d.type === 'dining_table' && !d.deletedAt && ['occupied', 'served', 'pending_payment'].includes(d.status));
  for (const table of tables) {
    if (!table.occupiedAt) continue;
    const mins = (now.getTime() - new Date(table.occupiedAt).getTime()) / 60_000;
    if (mins >= threshold) {
      alerts.push({
        type: 'long_occupied_table',
        severity: mins >= threshold * 2 ? 'critical' : 'warning',
        entityId: table._id,
        entityLabel: `Mesa #${table.number}`,
        message: `Mesa #${table.number} lleva ${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}min abierta sin cobrar`,
        ...ctx,
      });
    }
  }
  return alerts;
}

async function checkServedPendingClose(ctx, salaDocs, config) {
  const threshold = config.salaServedPendingMinutes || 30;
  if (!threshold) return [];
  const now = new Date();
  const alerts = [];
  const orders = salaDocs.filter((d) => d.type === 'dining_order' && !d.deletedAt && d.status === 'served' && d.servedAt);
  for (const order of orders) {
    const mins = (now.getTime() - new Date(order.servedAt).getTime()) / 60_000;
    if (mins >= threshold) {
      alerts.push({
        type: 'served_pending_close',
        severity: 'warning',
        entityId: order._id,
        entityLabel: `Mesa #${order.tableNumber}`,
        message: `Mesa #${order.tableNumber} servida hace ${Math.floor(mins)}min — pendiente de cobro`,
        ...ctx,
      });
    }
  }
  return alerts;
}

async function checkSlowKitchenComandas(ctx, salaDocs, config) {
  const threshold = config.salaSlowKitchenMinutes || 25;
  if (!threshold) return [];
  const now = new Date();
  const alerts = [];
  const orders = salaDocs.filter((d) => d.type === 'dining_order' && !d.deletedAt && ['open', 'served'].includes(d.status));
  for (const order of orders) {
    for (const comanda of (order.comandas || [])) {
      if (!['sent_to_kitchen', 'in_preparation'].includes(comanda.status)) continue;
      if (!comanda.sentToKitchenAt) continue;
      const mins = (now.getTime() - new Date(comanda.sentToKitchenAt).getTime()) / 60_000;
      if (mins >= threshold) {
        alerts.push({
          type: 'slow_kitchen_comanda',
          severity: mins >= threshold * 2 ? 'critical' : 'warning',
          entityId: order._id,
          entityLabel: `Comanda #${comanda.orderNumber} Mesa #${order.tableNumber}`,
          message: `Comanda #${comanda.orderNumber} de Mesa #${order.tableNumber} lleva ${Math.floor(mins)}min en cocina`,
          ...ctx,
        });
      }
    }
  }
  return alerts;
}

async function checkSalaIncidents(ctx, salaDocs, config) {
  if (config.salaIncidentsEnabled === false) return [];
  const alerts = [];
  const orders = salaDocs.filter((d) => d.type === 'dining_order' && !d.deletedAt && ['open', 'served', 'pending_payment'].includes(d.status));
  for (const order of orders) {
    const cancelledItems = (order.comandas || [])
      .filter((c) => c.status !== 'cancelled')
      .flatMap((c) => c.items || [])
      .filter((i) => i.status === 'cancelled');
    if (cancelledItems.length > 0) {
      alerts.push({
        type: 'sala_incident',
        severity: 'warning',
        entityId: order._id,
        entityLabel: `Mesa #${order.tableNumber}`,
        message: `Incidencia en Mesa #${order.tableNumber}: ${cancelledItems.length} ítem(s) cancelado(s)`,
        ...ctx,
      });
    }
  }
  return alerts;
}

async function runSalaAlerts(ctx, userId, config) {
  try {
    const salaDbName = getSalaDbName();
    const salaDocs = await fetchAllDocs(salaDbName).then((d) => d.filter((i) => i.user_id === userId)).catch(() => []);
    if (salaDocs.length === 0) return [];

    const results = [];
    results.push(...await checkLongOccupiedTables(ctx, salaDocs, config));
    results.push(...await checkServedPendingClose(ctx, salaDocs, config));
    results.push(...await checkSlowKitchenComandas(ctx, salaDocs, config));
    results.push(...await checkSalaIncidents(ctx, salaDocs, config));
    return results;
  } catch {
    return [];
  }
}

export async function runAlertEngine() {
  const startMs = Date.now();
  try {
    // Firma digital: expirar solicitudes vencidas y enviar recordatorios programados
    await expireOverdueRequests().catch((err) => logger.warn({ tag: 'ALERT_ENGINE', err: err?.message }, 'Error en expiración de firmas'));
    await sendScheduledReminders().catch((err) => logger.warn({ tag: 'ALERT_ENGINE', err: err?.message }, 'Error en recordatorios de firmas'));

    const businesses = await getAllBusinesses();
    let totalAlerts = 0;

    if (businesses.length > 0) {
      for (const business of businesses) {
        try {
          const result = await runAlertsForBusiness(business);
          totalAlerts += result.alerts;
        } catch (err) {
          logger.warn({ tag: 'ALERT_ENGINE', businessId: business._id, err: err?.message }, 'Error procesando alertas para negocio');
        }
      }
    } else {
      const userIds = await getAllUserIds();
      for (const userId of userIds) {
        try {
          const result = await runAlertsForUser(userId);
          totalAlerts += result.alerts;
        } catch (err) {
          logger.warn({ tag: 'ALERT_ENGINE', userId, err: err?.message }, 'Error procesando alertas para usuario');
        }
      }
    }

    if (totalAlerts > 0) {
      logger.info({ tag: 'ALERT_ENGINE', businesses: businesses.length, alerts: totalAlerts, ms: Date.now() - startMs }, 'Alertas generadas');
    }
  } catch (err) {
    logger.error({ tag: 'ALERT_ENGINE', err: err?.message }, 'Error en el motor de alertas');
  }
}

// ─── ON-DEMAND SUMMARY ──────────────────────────────────────────────────────

export async function getAlertSummary(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  const config = getAlertConfig(account);
  const now = new Date();

  const [catalogItems, purchaseInvoices, parts, vehicles, webOrders, deliveryOrders, workOrders, purchaseOrders] = await Promise.all([
    fetchAllDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_invoice').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getPartsDbName(), 'part').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocs(VEHICLES_DB).then((d) => d.filter((i) => i.type === 'car' && i.user_id === userId)),
    fetchAllDocsOfType(getWebDbName(), 'web_order').then((d) => d.filter((i) => i.user_id === userId || i.business_id)),
    fetchAllDocsOfType(getDeliveryDbName(), 'delivery_order').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getWorkshopDbName(), 'work_order').then((d) => d.filter((i) => i.user_id === userId)),
    fetchAllDocsOfType(getCatalogDbName(), 'purchase_order').then((d) => d.filter((i) => i.user_id === userId)),
  ]);

  const stockAlertsEnabled = canEmitCatalogStockAlerts(catalogItems);
  const stockTrackedItems = filterStockTrackedCatalogItems(catalogItems);
  const stockTrackedParts = filterStockTrackedParts(parts);
  const outOfStockItems = stockAlertsEnabled
    ? stockTrackedItems.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) <= 0)
    : [];
  const lowStockItems = stockAlertsEnabled
    ? stockTrackedItems.filter((i) => i.minStock > 0 && Number(i.stockQuantity || 0) > 0 && Number(i.stockQuantity) <= i.minStock)
    : [];
  const lowStockParts = hasPartsStockSetup(parts)
    ? stockTrackedParts.filter((p) => Number(p.stockQuantity || 0) <= p.minStock)
    : [];
  const negativeStockItems = stockAlertsEnabled
    ? stockTrackedItems.filter((i) => Number(i.stockQuantity || 0) < 0)
    : [];
  const overdueInvoices = purchaseInvoices.filter((inv) => inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < now);
  const pendingPayables = purchaseInvoices.filter((inv) => inv.status !== 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
  const staleWebOrders = webOrders.filter((o) => ['pending', 'processing'].includes(o.status) && daysBetween(o.createdAt, now) >= config.staleWebOrderDays);
  const staleDelivery = deliveryOrders.filter((o) => {
    if (!['pending', 'preparing', 'kitchen', 'assembly'].includes(o.status)) return false;
    return (now.getTime() - new Date(o.createdAt).getTime()) / 60_000 >= config.staleDeliveryMinutes;
  });
  const inStockStatuses = ['entrada', 'preparacion', 'listo', 'available', 'workshop'];
  const availableVehicles = vehicles.filter((v) => inStockStatuses.includes(v.status) && v.active !== false);
  const agingVehicles = availableVehicles.filter((v) => daysBetween(v.purchaseDate || v.createdAt, now) >= config.vehicleStockAlertDays);
  const staleWorkOrders = workOrders.filter((wo) => ['pending', 'in_progress'].includes(wo.status) && daysBetween(wo.createdAt, now) >= config.staleWorkOrderDays);
  const pendingPurchaseOrders = purchaseOrders.filter((po) => {
    if (!['sent', 'pending', 'partial'].includes(po.status)) return false;
    if (po.expectedDate) return new Date(po.expectedDate) < now;
    if (po.sentAt) return daysBetween(po.sentAt, now) >= config.pendingOrderDaysThreshold;
    return daysBetween(po.createdAt, now) >= config.pendingOrderDaysThreshold;
  });
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const soldThisMonth = vehicles.filter((v) => v.status === 'sold' && v.soldAt && new Date(v.soldAt) >= firstOfMonth).length;

  const severity = {
    critical: outOfStockItems.length + negativeStockItems.length + overdueInvoices.filter((i) => daysBetween(i.dueDate, now) > 30).length,
    warning: lowStockItems.length + lowStockParts.length + staleWebOrders.length + agingVehicles.length + staleWorkOrders.length + staleDelivery.length + pendingPurchaseOrders.length,
    info: 0,
  };

  return {
    updatedAt: now.toISOString(),
    config,
    totals: { critical: severity.critical, warning: severity.warning, total: severity.critical + severity.warning },
    stock: {
      outOfStock: outOfStockItems.map((i) => ({ id: i._id, name: i.name, sku: i.sku })),
      lowStock: lowStockItems.map((i) => ({ id: i._id, name: i.name, sku: i.sku, qty: Number(i.stockQuantity), min: i.minStock })),
      lowStockParts: lowStockParts.map((p) => ({ id: p._id, name: p.name, partNumber: p.partNumber, qty: Number(p.stockQuantity), min: p.minStock })),
      negativeStock: negativeStockItems.map((i) => ({ id: i._id, name: i.name, sku: i.sku, qty: Number(i.stockQuantity) })),
    },
    purchases: {
      overdueInvoices: overdueInvoices.map((i) => ({ id: i._id, number: i.invoiceNumber, supplier: i.supplierName, total: i.total, dueDate: i.dueDate, daysLate: daysBetween(i.dueDate, now) })),
      pendingPayables,
      payablesThreshold: config.highPayablesThreshold,
      payablesExceeded: pendingPayables >= config.highPayablesThreshold,
    },
    sales: {
      staleWebOrders: staleWebOrders.map((o) => ({ id: o._id, number: o.orderNumber, days: daysBetween(o.createdAt, now) })),
      staleDelivery: staleDelivery.map((o) => ({ id: o._id, number: o.orderNumber, minutes: Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / 60_000), status: o.status })),
      soldThisMonth,
    },
    vehicles: {
      totalAvailable: availableVehicles.length,
      aging: agingVehicles.map((v) => ({ id: v._id, label: `${v.brand || ''} ${v.model || ''}`.trim(), plate: v.registrationPlate, days: daysBetween(v.purchaseDate || v.createdAt, now) })),
    },
    workshop: {
      staleWorkOrders: staleWorkOrders.map((wo) => ({ id: wo._id, number: wo.woNumber, days: daysBetween(wo.createdAt, now), status: wo.status })),
    },
    purchaseOrders: {
      pending: pendingPurchaseOrders.map((po) => ({ id: po._id, number: po.orderNumber, supplier: po.supplierName, status: po.status, daysLate: daysBetween(po.expectedDate || po.sentAt || po.createdAt, now) })),
    },
    purchaseAlerts: {
      weeklyPurchaseMissing: (() => {
        const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000);
        const recent = purchaseOrders.filter((o) => new Date(o.createdAt) >= oneWeekAgo);
        return recent.length === 0 && lowStockItems.length > 0;
      })(),
      overdueDeliveries: purchaseOrders.filter((o) => o.status === 'sent' && o.expectedDate && new Date(o.expectedDate) < now).map((o) => ({ id: o._id, number: o.orderNumber, supplier: o.supplierName, daysLate: Math.floor((now.getTime() - new Date(o.expectedDate).getTime()) / 86_400_000) })),
      pendingReception: purchaseOrders.filter((o) => ['sent', 'partial'].includes(o.status)).length,
      criticalNotOrdered: stockAlertsEnabled
        ? filterStockTrackedCatalogItems(catalogItems).filter((i) => i.isCritical && i.minStock > 0 && Number(i.stockQuantity || 0) < i.minStock).filter((i) => !purchaseOrders.some((o) => ['draft', 'pending', 'sent'].includes(o.status) && (o.items || []).some((it) => it.catalogItemId === i._id))).map((i) => ({ id: i._id, name: i.name, stock: Number(i.stockQuantity || 0), min: i.minStock }))
        : [],
    },
    construction: await getConstructionSummaryForUser(userId, now, config),
    butcher: await getButcherAlerts(userId, now),
    compraventa: await getCompraventaSummaryForUser(userId, vehicles, now),
  };
}

async function getConstructionSummaryForUser(userId, now, config) {
  try {
    const constructionDb = getConstructionDbName();
    const [cBudgets, cProjects] = await Promise.all([
      fetchAllDocsOfType(constructionDb, 'construction_budget').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(constructionDb, 'construction_project').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
    ]);
    if (!cBudgets.length && !cProjects.length) return null;

    const budgetsWithoutProject = cBudgets.filter((b) => b.estado === 'aceptado' && !b.obraGeneradaId);
    const activeProjects = cProjects.filter((p) => p.estado !== 'finalizada');
    const projectsWithoutOwner = activeProjects.filter((p) => !p.responsableId);
    const thresholdDays = config.projectNoStartDateDays || 3;
    const projectsWithoutStartDate = activeProjects.filter((p) => {
      if (p.fechaInicio) return false;
      const days = Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / 86_400_000);
      return days >= thresholdDays;
    });

    return {
      budgetsWithoutProject: budgetsWithoutProject.map((b) => ({ id: b._id, referencia: b.referencia, cliente: b.clienteNombre })),
      projectsWithoutOwner: projectsWithoutOwner.map((p) => ({ id: p._id, nombre: p.nombre, estado: p.estado })),
      projectsWithoutStartDate: projectsWithoutStartDate.map((p) => ({ id: p._id, nombre: p.nombre, daysSinceCreated: Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / 86_400_000) })),
      totalActive: activeProjects.length,
      totalBudgets: cBudgets.length,
    };
  } catch {
    return null;
  }
}

async function getCompraventaSummaryForUser(userId, vehicles, now) {
  try {
    const account = await findAccountByUserId(fakeReq, userId);
    const cvConfig = getCompraventaAlertConfig(account);
    if (!cvConfig.enabled) return null;

    const [sales, leads, documents] = await Promise.all([
      fetchAllDocsOfType(getSalesDbName(), 'sale').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
      fetchAllDocsOfType(getLeadsDbName(), 'lead').then((d) => d.filter((i) => i.user_id === userId || i.responsible === userId)).catch(() => []),
      fetchAllDocsOfType(getDocumentsDbName(), 'document').then((d) => d.filter((i) => i.user_id === userId && !i.deletedAt)).catch(() => []),
    ]);

    const { getCompraventaAlertSummary } = await import('./compraventaAlertEngine.js');
    return await getCompraventaAlertSummary(userId, vehicles, sales, leads, documents, cvConfig);
  } catch {
    return null;
  }
}

async function getButcherAlerts(userId, now) {
  try {
    const butcherDb = getButcherDbName();
    await ensureDatabase(fakeReq, butcherDb);
    const docs = await getAllDocuments(fakeReq, butcherDb);

    const userOrders = docs.filter((d) => d?.type === 'butcher_order' && !d?.deletedAt && d?.user_id === userId);
    const today = now.toISOString().slice(0, 10);

    const pendingPickup = userOrders.filter((o) => o.status === 'ready' && o.pickupDate && o.pickupDate <= today);
    const unpreparedSpecial = userOrders.filter((o) => o.orderType === 'special' && o.status === 'pending');
    const overdueOrders = userOrders.filter((o) =>
      ['pending', 'preparing'].includes(o.status) && o.pickupDate && o.pickupDate < today,
    );
    const todayOrders = userOrders.filter((o) => o.pickupDate === today && o.status !== 'cancelled' && o.status !== 'picked_up');

    return {
      pendingPickup: pendingPickup.map((o) => ({ id: o._id, number: o.orderNumber, client: o.clientName, phone: o.clientPhone, pickupDate: o.pickupDate })),
      unpreparedSpecial: unpreparedSpecial.map((o) => ({ id: o._id, number: o.orderNumber, client: o.clientName, pickupDate: o.pickupDate })),
      overdueOrders: overdueOrders.map((o) => ({ id: o._id, number: o.orderNumber, client: o.clientName, pickupDate: o.pickupDate, daysLate: daysBetween(o.pickupDate, now) })),
      todayOrdersCount: todayOrders.length,
    };
  } catch {
    return { pendingPickup: [], unpreparedSpecial: [], overdueOrders: [], todayOrdersCount: 0 };
  }
}

// ─── Vehicle Acquisition Alerts ─────────────────────────────────────────────

function checkAcquisitionAlerts(ctx, acquisitions, config) {
  const alerts = [];
  const now = new Date();
  const missingDocsDays = config?.acquisitionMissingDocsDaysThreshold ?? 3;
  const unclosedDays = config?.acquisitionUnclosedDaysThreshold ?? 15;
  const excessiveCostThreshold = config?.acquisitionExcessiveCostThreshold ?? 3000;
  const unjustifiedDays = config?.acquisitionUnjustifiedDaysThreshold ?? 5;

  for (const acq of acquisitions) {
    const acqDate = new Date(acq.acquisitionDate || acq.createdAt);
    const daysSince = Math.floor((now.getTime() - acqDate.getTime()) / 86_400_000);
    const plate = acq.registrationPlate || '???';

    // 1. Missing docs
    if (['recibida', 'aprobada'].includes(acq.status) && !acq.hasRequiredDocs && daysSince > missingDocsDays) {
      alerts.push({
        userId: ctx.userId,
        businessId: ctx.businessId,
        category: 'acquisition_missing_docs',
        level: daysSince > 7 ? 'alert' : 'warning',
        title: `Compra sin documentación — ${plate}`,
        message: `La compra del vehículo ${plate} lleva ${daysSince} días sin documentación completa.`,
        route: `/saas/vertical/desguaces/compras-retiradas?id=${acq._id}`,
        dedupKey: `acquisition_missing_docs:${acq._id}`,
      });
    }

    // 2. Excessive cost
    if (acq.costTotal > excessiveCostThreshold) {
      alerts.push({
        userId: ctx.userId,
        businessId: ctx.businessId,
        category: 'acquisition_excessive_cost',
        level: 'warning',
        title: `Coste excesivo — ${plate}`,
        message: `La compra del vehículo ${plate} tiene un coste de ${acq.costTotal}€, superior al umbral de ${excessiveCostThreshold}€.`,
        route: `/saas/vertical/desguaces/compras-retiradas?id=${acq._id}`,
        dedupKey: `acquisition_excessive_cost:${acq._id}`,
      });
    }

    // 3. Unclosed
    if (!['cerrada', 'cancelada'].includes(acq.status) && daysSince > unclosedDays) {
      alerts.push({
        userId: ctx.userId,
        businessId: ctx.businessId,
        category: 'acquisition_unclosed',
        level: daysSince > 30 ? 'alert' : 'warning',
        title: `Operación sin cerrar — ${plate}`,
        message: `La compra/retirada del vehículo ${plate} lleva ${daysSince} días sin cerrar.`,
        route: `/saas/vertical/desguaces/compras-retiradas?id=${acq._id}`,
        dedupKey: `acquisition_unclosed:${acq._id}`,
      });
    }

    // 4. Unjustified expense
    if (acq.costTotal > 0 &&
        (!acq.linkedDocumentIds || acq.linkedDocumentIds.length === 0) &&
        (!acq.linkedInvoiceIds || acq.linkedInvoiceIds.length === 0) &&
        daysSince > unjustifiedDays) {
      alerts.push({
        userId: ctx.userId,
        businessId: ctx.businessId,
        category: 'acquisition_unjustified_expense',
        level: 'warning',
        title: `Gasto sin justificar — ${plate}`,
        message: `La compra del vehículo ${plate} tiene ${acq.costTotal}€ en gastos sin ningún justificante adjunto.`,
        route: `/saas/vertical/desguaces/compras-retiradas?id=${acq._id}`,
        dedupKey: `acquisition_unjustified_expense:${acq._id}`,
      });
    }
  }

  return alerts;
}

// ─── SCHEDULER ──────────────────────────────────────────────────────────────

let engineTimer = null;

export function startAlertEngine() {
  logger.info({ tag: 'ALERT_ENGINE' }, `Motor de alertas programado — inicio en ${STARTUP_DELAY_MS / 1000}s, luego cada ${ALERT_INTERVAL_MS / 60000} min`);

  setTimeout(() => {
    runAlertEngine().catch(() => null);
    engineTimer = setInterval(() => runAlertEngine().catch(() => null), ALERT_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopAlertEngine() {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
  }
}

export { getAlertConfig };
