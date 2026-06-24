/**
 * Compraventa Alert Engine — Motor de alertas de la vertical compraventa.
 *
 * Se integra en el ciclo del alertEngine genérico (60 min) para negocios
 * de tipo carDealership. Evalúa 12 reglas sobre vehículos, ventas, leads,
 * documentación y finanzas.
 */

import { emitGlobalAlert, daysBetween } from './alertEmitter.js';
import logger from './logger.js';

// ─── Classification ──────────────────────────────────────────────────────────

const CLASSIFICATION = {
  COMMERCIAL: 'comercial',
  ECONOMIC: 'economica',
  DOCUMENTARY: 'documental',
};

const ALERT_CLASSIFICATION = {
  cv_vehicle_missing_docs:    { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: true },
  cv_stock_itv_expired:       { defaultPriority: 'high',   classification: CLASSIFICATION.DOCUMENTARY, escalable: false },
  cv_stock_itv_expiring:      { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: true },
  cv_reservation_no_contract: { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: true },
  cv_reservation_expired:     { defaultPriority: 'high',   classification: CLASSIFICATION.COMMERCIAL,  escalable: false },
  cv_sale_unpaid:             { defaultPriority: 'medium', classification: CLASSIFICATION.ECONOMIC,    escalable: true },
  cv_vehicle_stagnant:        { defaultPriority: 'low',    classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_expense_no_invoice:      { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: false },
  cv_price_below_minimum:     { defaultPriority: 'high',   classification: CLASSIFICATION.ECONOMIC,    escalable: false },
  cv_low_avg_margin:          { defaultPriority: 'medium', classification: CLASSIFICATION.ECONOMIC,    escalable: true },
  cv_lead_no_followup:        { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_pending_delivery:        { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_ready_not_published:     { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_vehicle_no_photos:       { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: false },
  cv_vehicle_price_below_min: { defaultPriority: 'high',   classification: CLASSIFICATION.ECONOMIC,    escalable: false },
  cv_worker_unmanaged_leads:  { defaultPriority: 'high',   classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_worker_inactive:         { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_worker_low_conversion:   { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  cv_worker_excess_pending:   { defaultPriority: 'medium', classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
};

// ─── Role targets per alert type ─────────────────────────────────────────────

const ALERT_TARGET_ROLES = {
  cv_vehicle_missing_docs:    { manager: true, assignedWorker: true,  admin: true },
  cv_stock_itv_expired:       { manager: true, assignedWorker: false, admin: true },
  cv_stock_itv_expiring:      { manager: true, assignedWorker: false, admin: true },
  cv_reservation_no_contract: { manager: true, assignedWorker: true,  admin: true },
  cv_reservation_expired:     { manager: true, assignedWorker: true,  admin: false },
  cv_sale_unpaid:             { manager: true, assignedWorker: true,  admin: true },
  cv_vehicle_stagnant:        { manager: true, assignedWorker: false, admin: false },
  cv_expense_no_invoice:      { manager: true, assignedWorker: false, admin: true },
  cv_price_below_minimum:     { manager: true, assignedWorker: true,  admin: false },
  cv_low_avg_margin:          { manager: true, assignedWorker: false, admin: false },
  cv_lead_no_followup:        { manager: true, assignedWorker: true,  admin: false },
  cv_pending_delivery:        { manager: true, assignedWorker: true,  admin: false },
  cv_ready_not_published:     { manager: true, assignedWorker: true,  admin: false },
  cv_vehicle_no_photos:       { manager: true, assignedWorker: true,  admin: false },
  cv_vehicle_price_below_min: { manager: true, assignedWorker: true,  admin: false },
  cv_worker_unmanaged_leads:  { manager: true, assignedWorker: true,  admin: false },
  cv_worker_inactive:         { manager: true, assignedWorker: false, admin: false },
  cv_worker_low_conversion:   { manager: true, assignedWorker: true,  admin: false },
  cv_worker_excess_pending:   { manager: true, assignedWorker: true,  admin: false },
};

const DOC_LABELS = {
  permiso_circulacion: 'Permiso de circulación',
  ficha_tecnica: 'Ficha técnica',
  itv: 'ITV vigente',
  contrato_compra: 'Contrato de compra',
  factura_compra: 'Factura de compra',
};

const STAGE_LABELS = {
  interested: 'Interesado',
  reserved: 'Reservado',
  documentation: 'Documentación',
  sold: 'Vendido',
  delivered: 'Entregado',
};

// ─── Config ──────────────────────────────────────────────────────────────────

export function getCompraventaAlertConfig(account) {
  const cfg = account?.alertConfig?.compraventa || {};
  return {
    enabled: cfg.enabled !== false,

    missingDocsEnabled: cfg.missingDocsEnabled !== false,
    requiredDocs: cfg.requiredDocs || ['permiso_circulacion', 'ficha_tecnica', 'itv', 'contrato_compra', 'factura_compra'],
    missingDocsGraceDays: Number(cfg.missingDocsGraceDays || 3),

    reservationNoContractEnabled: cfg.reservationNoContractEnabled !== false,
    reservationNoContractDays: Number(cfg.reservationNoContractDays || 3),

    saleUnpaidEnabled: cfg.saleUnpaidEnabled !== false,
    saleUnpaidDays: Number(cfg.saleUnpaidDays || 7),
    saleUnpaidCriticalDays: Number(cfg.saleUnpaidCriticalDays || 30),

    vehicleStagnantEnabled: cfg.vehicleStagnantEnabled !== false,
    vehicleStagnantWarningDays: Number(cfg.vehicleStagnantWarningDays || 30),
    vehicleStagnantHighDays: Number(cfg.vehicleStagnantHighDays || 60),
    vehicleStagnantCriticalDays: Number(cfg.vehicleStagnantCriticalDays || 90),

    expenseNoInvoiceEnabled: cfg.expenseNoInvoiceEnabled !== false,
    expenseNoInvoiceGraceDays: Number(cfg.expenseNoInvoiceGraceDays || 7),

    priceBelowMinEnabled: cfg.priceBelowMinEnabled !== false,

    leadNoFollowUpEnabled: cfg.leadNoFollowUpEnabled !== false,
    leadNoFollowUpDays: Number(cfg.leadNoFollowUpDays || 3),
    leadNoFollowUpCriticalDays: Number(cfg.leadNoFollowUpCriticalDays || 7),

    pendingDeliveryEnabled: cfg.pendingDeliveryEnabled !== false,
    pendingDeliveryDays: Number(cfg.pendingDeliveryDays || 5),
    pendingDeliveryCriticalDays: Number(cfg.pendingDeliveryCriticalDays || 15),

    reservationExpiredEnabled: cfg.reservationExpiredEnabled !== false,
    reservationExpiredDays: Number(cfg.reservationExpiredDays || 15),

    stockItvEnabled: cfg.stockItvEnabled !== false,
    stockItvWarningDays: Number(cfg.stockItvWarningDays || 30),

    lowAvgMarginEnabled: cfg.lowAvgMarginEnabled ?? false,
    lowAvgMarginThresholdPercent: Number(cfg.lowAvgMarginThresholdPercent || 10),

    readyNotPublishedEnabled: cfg.readyNotPublishedEnabled !== false,
    readyNotPublishedDays: Number(cfg.readyNotPublishedDays || 3),

    vehicleNoPhotosEnabled: cfg.vehicleNoPhotosEnabled !== false,

    vehiclePriceBelowMinEnabled: cfg.vehiclePriceBelowMinEnabled !== false,

    workerUnmanagedLeadsEnabled: cfg.workerUnmanagedLeadsEnabled !== false,
    workerUnmanagedLeadHours: Number(cfg.workerUnmanagedLeadHours || 48),
    workerInactiveEnabled: cfg.workerInactiveEnabled !== false,
    workerInactiveDays: Number(cfg.workerInactiveDays || 3),
    workerLowConversionEnabled: cfg.workerLowConversionEnabled !== false,
    workerLowConversionThresholdPct: Number(cfg.workerLowConversionThresholdPct || 50),
    workerExcessPendingEnabled: cfg.workerExcessPendingEnabled !== false,
    workerExcessPendingThreshold: Number(cfg.workerExcessPendingThreshold || 10),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emit(ctx, opts) {
  const cls = ALERT_CLASSIFICATION[opts.category] || {};
  const targets = ALERT_TARGET_ROLES[opts.category] || {};
  const targetRoles = [];
  if (targets.manager) targetRoles.push('manager');
  if (targets.assignedWorker) targetRoles.push('assigned_worker');
  if (targets.admin) targetRoles.push('admin');

  return emitGlobalAlert({
    businessId: ctx.businessId || '',
    userId: ctx.userId || '',
    source: 'compraventa',
    ruleId: opts.category,
    category: opts.category,
    priority: opts.priority || cls.defaultPriority || 'medium',
    level: opts.level || 'warning',
    title: opts.title,
    message: opts.message,
    entityId: opts.entityId || '',
    entityType: opts.entityType || '',
    route: opts.route || '',
    metadata: {
      ...(opts.metadata || {}),
      classification: cls.classification || CLASSIFICATION.COMMERCIAL,
      targetRoles,
      vertical: 'compraventa',
    },
    dedupKey: opts.dedupKey,
  });
}

function getStageDays(sale, targetStage) {
  const now = new Date();
  if (Array.isArray(sale.stageHistory)) {
    for (let i = sale.stageHistory.length - 1; i >= 0; i--) {
      const entry = sale.stageHistory[i];
      if (entry.stage === targetStage || entry.to === targetStage) {
        return daysBetween(entry.date || entry.at || entry.timestamp, now);
      }
    }
  }
  return daysBetween(sale.createdAt, now);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES');
  } catch {
    return dateStr;
  }
}

// ─── ACV-03: Vehículo sin documentación obligatoria ──────────────────────────

async function checkVehicleMissingDocs(ctx, vehicles, documents, config) {
  if (!config.missingDocsEnabled) return [];
  const now = new Date();
  const alerts = [];
  const requiredDocs = config.requiredDocs;

  for (const vehicle of vehicles) {
    if (vehicle.status !== 'available' && vehicle.status !== 'reserved') continue;
    if (vehicle.active === false) continue;

    const daysInStock = daysBetween(vehicle.purchaseDate || vehicle.createdAt, now);
    if (daysInStock < config.missingDocsGraceDays) continue;

    const vehicleDocs = documents.filter((d) =>
      d.vehicleId === vehicle._id || d.entityId === vehicle._id,
    );
    const existingCategories = new Set(
      vehicleDocs.map((d) => d.docSubCategory || d.category).filter(Boolean),
    );

    const missingList = requiredDocs.filter((req) => !existingCategories.has(req));
    if (missingList.length === 0) continue;

    const missingLabels = missingList.map((k) => DOC_LABELS[k] || k);
    const priority = missingList.length >= 3 ? 'high' : 'medium';

    alerts.push(await emit(ctx, {
      category: 'cv_vehicle_missing_docs',
      priority,
      level: missingList.length >= 3 ? 'alert' : 'warning',
      title: 'Vehículo sin documentación completa',
      message: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''}) — Faltan ${missingList.length} documento(s): ${missingLabels.join(', ')}.`,
      entityId: vehicle._id,
      entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}?tab=documents`,
      dedupKey: `cvmissdocs-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate, missingDocs: missingList,
        totalRequired: requiredDocs.length, daysInStock,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-03b: ITV caducada/próxima en stock ──────────────────────────────────

async function checkStockItvExpiry(ctx, vehicles, documents, config) {
  if (!config.stockItvEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.status !== 'available' && vehicle.status !== 'reserved') continue;
    if (vehicle.active === false) continue;

    let itvDateStr = vehicle.itvDate || vehicle.itvExpiryDate;
    if (!itvDateStr) {
      const itvDoc = documents.find((d) =>
        (d.vehicleId === vehicle._id || d.entityId === vehicle._id) &&
        (d.docSubCategory === 'itv' || d.category === 'itv') &&
        (d.expiryDate || d.expirationDate || d.validUntil),
      );
      if (itvDoc) itvDateStr = itvDoc.expiryDate || itvDoc.expirationDate || itvDoc.validUntil;
    }
    if (!itvDateStr) continue;

    const itvDate = new Date(itvDateStr);
    if (Number.isNaN(itvDate.getTime())) continue;
    const daysUntil = Math.floor((itvDate.getTime() - now.getTime()) / 86_400_000);
    const label = `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''})`.trim();

    if (daysUntil < 0) {
      alerts.push(await emit(ctx, {
        category: 'cv_stock_itv_expired',
        priority: 'high',
        level: 'alert',
        title: 'ITV caducada — Vehículo en stock',
        message: `${label} tiene la ITV caducada desde hace ${Math.abs(daysUntil)} días. No se puede entregar.`,
        entityId: vehicle._id, entityType: 'vehicle',
        route: `/saas/vehicles/${vehicle._id}?tab=documents`,
        dedupKey: `cvitv-exp-${vehicle._id}`,
        metadata: { plate: vehicle.registrationPlate, itvDate: itvDateStr, daysOverdue: Math.abs(daysUntil) },
      }));
    } else if (daysUntil <= config.stockItvWarningDays) {
      alerts.push(await emit(ctx, {
        category: 'cv_stock_itv_expiring',
        priority: 'medium',
        level: 'warning',
        title: 'ITV próxima a vencer — Vehículo en stock',
        message: `${label} — ITV vence en ${daysUntil} días (${formatDate(itvDateStr)}).`,
        entityId: vehicle._id, entityType: 'vehicle',
        route: `/saas/vehicles/${vehicle._id}?tab=documents`,
        dedupKey: `cvitv-soon-${vehicle._id}`,
        metadata: { plate: vehicle.registrationPlate, itvDate: itvDateStr, daysUntil },
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── ACV-04: Reserva sin contrato ────────────────────────────────────────────

async function checkReservationNoContract(ctx, sales, documents, config) {
  if (!config.reservationNoContractEnabled) return [];
  const alerts = [];

  for (const sale of sales) {
    if (sale.stage !== 'reserved') continue;
    const days = getStageDays(sale, 'reserved');
    if (days < config.reservationNoContractDays) continue;

    const hasContract =
      (Array.isArray(sale.generatedDocuments) && sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok')) ||
      documents.some((d) =>
        (d.saleId === sale._id || d.entityId === sale._id) &&
        (d.docSubCategory === 'contrato_venta' || d.category === 'contrato_venta' || d.type === 'contract'),
      );
    if (hasContract) continue;

    const priority = sale.depositPaid > 0 ? 'high' : 'medium';
    const depositNote = sale.depositPaid > 0 ? ` Señal cobrada: ${sale.depositPaid.toFixed(2)} €.` : '';

    alerts.push(await emit(ctx, {
      category: 'cv_reservation_no_contract',
      priority,
      level: sale.depositPaid > 0 ? 'alert' : 'warning',
      title: 'Reserva sin contrato',
      message: `${sale.vehicleName} (${sale.vehiclePlate}) — Reservado por ${sale.clientName} hace ${days} días sin contrato.${depositNote}`,
      entityId: sale._id, entityType: 'sale',
      route: `/saas/sales/${sale._id}?tab=documents`,
      dedupKey: `cvresnocon-${sale._id}`,
      metadata: {
        vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
        clientName: sale.clientName, daysInReserved: days,
        depositPaid: sale.depositPaid, responsible: sale.responsible,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-04b: Reserva vencida ────────────────────────────────────────────────

async function checkExpiredReservations(ctx, sales, config) {
  if (!config.reservationExpiredEnabled) return [];
  const alerts = [];

  for (const sale of sales) {
    if (sale.stage !== 'reserved') continue;
    const days = getStageDays(sale, 'reserved');
    if (days < config.reservationExpiredDays) continue;

    alerts.push(await emit(ctx, {
      category: 'cv_reservation_expired',
      priority: 'high',
      level: 'alert',
      title: 'Reserva vencida',
      message: `${sale.vehicleName} — Reservado por ${sale.clientName} hace ${days} días sin avance. Señal: ${(sale.depositPaid || 0).toFixed(2)} €. Vehículo bloqueado.`,
      entityId: sale._id, entityType: 'sale',
      route: `/saas/sales/${sale._id}`,
      dedupKey: `cvresexp-${sale._id}`,
      metadata: {
        vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
        clientName: sale.clientName, daysInReserved: days,
        depositPaid: sale.depositPaid, responsible: sale.responsible,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-05: Venta sin cobro completo ────────────────────────────────────────

async function checkSaleUnpaid(ctx, sales, config) {
  if (!config.saleUnpaidEnabled) return [];
  const alerts = [];
  const validStages = ['documentation', 'sold', 'delivered'];

  for (const sale of sales) {
    if (!validStages.includes(sale.stage)) continue;
    const pendingAmount = (sale.totalPrice || 0) - (sale.depositPaid || 0) - (sale.financingAmount || 0);
    if (pendingAmount <= 0) continue;

    const daysInStage = getStageDays(sale, sale.stage);
    let priority = 'low';
    let level = 'info';

    if (sale.stage === 'delivered') {
      priority = 'high';
      level = 'alert';
    } else if (sale.stage === 'sold' && daysInStage > config.saleUnpaidCriticalDays) {
      priority = 'high';
      level = 'alert';
    } else if (sale.stage === 'sold' && daysInStage > config.saleUnpaidDays) {
      priority = 'medium';
      level = 'warning';
    } else if (sale.stage === 'documentation' && daysInStage > config.saleUnpaidDays) {
      priority = 'low';
      level = 'info';
    } else {
      continue;
    }

    const title = sale.stage === 'delivered'
      ? 'Impago — Vehículo entregado sin cobro total'
      : 'Venta con cobro pendiente';

    alerts.push(await emit(ctx, {
      category: 'cv_sale_unpaid',
      priority, level, title,
      message: `${sale.vehicleName} (${sale.vehiclePlate}) — ${sale.clientName}. Pendiente: ${pendingAmount.toFixed(2)} € de ${(sale.totalPrice || 0).toFixed(2)} €. Fase: ${STAGE_LABELS[sale.stage] || sale.stage}.`,
      entityId: sale._id, entityType: 'sale',
      route: `/saas/sales/${sale._id}?tab=payments`,
      dedupKey: `cvsaleunpd-${sale._id}`,
      metadata: {
        vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
        clientName: sale.clientName, totalPrice: sale.totalPrice,
        depositPaid: sale.depositPaid, financingAmount: sale.financingAmount,
        pendingAmount, stage: sale.stage, daysInStage,
        responsible: sale.responsible,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-06: Vehículo inmovilizado ──────────────────────────────────────────

async function checkVehicleStagnant(ctx, vehicles, config) {
  if (!config.vehicleStagnantEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.status !== 'available' || vehicle.active === false) continue;
    const daysInStock = daysBetween(vehicle.purchaseDate || vehicle.createdAt, now);
    if (daysInStock < config.vehicleStagnantWarningDays) continue;

    const totalCosts = Array.isArray(vehicle.associatedCosts)
      ? vehicle.associatedCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
      : 0;
    const estimatedMargin = (vehicle.salePrice || 0) - (vehicle.purchasePrice || 0) - totalCosts;
    const depreciation = (vehicle.purchasePrice || 0) * 0.01 * Math.floor(daysInStock / 30);
    const adjustedMargin = estimatedMargin - depreciation;

    let priority;
    let level;
    if (daysInStock >= config.vehicleStagnantCriticalDays) {
      priority = 'high'; level = 'alert';
    } else if (daysInStock >= config.vehicleStagnantHighDays) {
      priority = 'medium'; level = 'warning';
    } else {
      priority = 'low'; level = 'warning';
    }

    if (adjustedMargin < 0 && priority !== 'high') {
      priority = priority === 'low' ? 'medium' : 'high';
    }

    const deprecNote = depreciation > 0 ? ` Depreciación estimada: ${depreciation.toFixed(0)} €.` : '';

    alerts.push(await emit(ctx, {
      category: 'cv_vehicle_stagnant',
      priority, level,
      title: `Vehículo inmovilizado — ${daysInStock} días en stock`,
      message: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''}) lleva ${daysInStock} días sin venderse. PV: ${(vehicle.salePrice || 0).toFixed(0)} €. Margen estimado: ${estimatedMargin.toFixed(0)} €.${deprecNote}`,
      entityId: vehicle._id, entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}`,
      dedupKey: `cvstagnant-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate, daysInStock,
        purchasePrice: vehicle.purchasePrice, salePrice: vehicle.salePrice,
        associatedCosts: totalCosts, estimatedMargin, depreciation,
        adjustedMargin,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-07: Gasto de preparación sin factura ────────────────────────────────

async function checkExpenseNoInvoice(ctx, vehicles, config) {
  if (!config.expenseNoInvoiceEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const vehicle of vehicles) {
    if (!Array.isArray(vehicle.associatedCosts) || vehicle.associatedCosts.length === 0) continue;

    const withoutInvoice = vehicle.associatedCosts.filter((c) => {
      if (c.invoiceId || c.attachmentUrl) return false;
      const daysOld = daysBetween(c.date || vehicle.createdAt, now);
      return daysOld >= config.expenseNoInvoiceGraceDays;
    });

    if (withoutInvoice.length === 0) continue;
    const totalAmount = withoutInvoice.reduce((s, c) => s + Number(c.amount || 0), 0);
    const concepts = withoutInvoice.map((c) => c.concept || 'Sin concepto').join(', ');
    const priority = totalAmount > 500 ? 'high' : 'medium';

    alerts.push(await emit(ctx, {
      category: 'cv_expense_no_invoice',
      priority,
      level: 'warning',
      title: 'Gastos de preparación sin factura',
      message: `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''}) tiene ${withoutInvoice.length} gasto(s) sin factura por ${totalAmount.toFixed(2)} €: ${concepts}.`,
      entityId: vehicle._id, entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}?tab=costs`,
      dedupKey: `cvexpnoinv-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate,
        expensesWithoutInvoice: withoutInvoice.length, totalAmount, concepts,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-08: Precio por debajo del mínimo ────────────────────────────────────

async function checkPriceBelowMinimum(ctx, sales, vehicles, config) {
  if (!config.priceBelowMinEnabled) return [];
  const alerts = [];
  const vehicleMap = new Map(vehicles.map((v) => [v._id, v]));

  for (const sale of sales) {
    if (!['reserved', 'documentation', 'sold'].includes(sale.stage)) continue;
    if (sale.deletedAt) continue;

    const vehicle = vehicleMap.get(sale.vehicleId);
    const totalCosts = vehicle && Array.isArray(vehicle.associatedCosts)
      ? vehicle.associatedCosts.reduce((s, c) => s + Number(c.amount || 0), 0)
      : 0;

    let alertTitle = '';
    let difference = 0;
    let shouldAlert = false;

    if (sale.totalPrice < sale.purchasePrice) {
      alertTitle = 'Venta con pérdida';
      difference = sale.totalPrice - sale.purchasePrice;
      shouldAlert = true;
    } else if (sale.minimumPrice > 0 && sale.totalPrice < sale.minimumPrice) {
      alertTitle = 'Precio por debajo del mínimo';
      difference = sale.totalPrice - sale.minimumPrice;
      shouldAlert = true;
    } else if (sale.totalPrice < sale.purchasePrice + totalCosts) {
      alertTitle = 'Margen negativo tras costes de preparación';
      difference = sale.totalPrice - sale.purchasePrice - totalCosts;
      shouldAlert = true;
    }

    if (!shouldAlert) continue;

    alerts.push(await emit(ctx, {
      category: 'cv_price_below_minimum',
      priority: 'high',
      level: 'alert',
      title: alertTitle,
      message: `${sale.vehicleName} (${sale.vehiclePlate}) — PV: ${(sale.totalPrice || 0).toFixed(0)} €, mínimo: ${(sale.minimumPrice || 0).toFixed(0)} €, compra: ${(sale.purchasePrice || 0).toFixed(0)} €. Diferencia: ${difference.toFixed(0)} €.`,
      entityId: sale._id, entityType: 'sale',
      route: `/saas/sales/${sale._id}?tab=summary`,
      dedupKey: `cvpricelo-${sale._id}`,
      metadata: {
        vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
        totalPrice: sale.totalPrice, minimumPrice: sale.minimumPrice,
        purchasePrice: sale.purchasePrice, associatedCosts: totalCosts,
        netMargin: sale.totalPrice - sale.purchasePrice - totalCosts,
        responsible: sale.responsible,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-08b: Margen medio bajo (nivel negocio) ─────────────────────────────

async function checkLowAvgMargin(ctx, sales, config) {
  if (!config.lowAvgMarginEnabled) return [];
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const closedThisMonth = sales.filter((s) =>
    s.stage === 'sold' || s.stage === 'delivered',
  ).filter((s) => {
    const closedDate = s.closureData?.closedAt || s.soldAt || s.updatedAt;
    return closedDate && new Date(closedDate) >= firstOfMonth;
  });

  if (closedThisMonth.length < 3) return [];

  const margins = closedThisMonth.map((s) => {
    if (s.totalPrice <= 0) return 0;
    return ((s.totalPrice - s.purchasePrice) / s.totalPrice) * 100;
  });
  const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;

  if (avgMargin >= config.lowAvgMarginThresholdPercent) return [];

  const alert = await emit(ctx, {
    category: 'cv_low_avg_margin',
    priority: avgMargin < config.lowAvgMarginThresholdPercent / 2 ? 'high' : 'medium',
    level: 'warning',
    title: 'Margen medio bajo este mes',
    message: `El margen medio de las ${closedThisMonth.length} ventas cerradas este mes es ${avgMargin.toFixed(1)}% (umbral: ${config.lowAvgMarginThresholdPercent}%).`,
    entityType: 'sale',
    route: '/saas/reports?tab=margen',
    dedupKey: `cvlowmargin-${ctx.userId}-${now.getFullYear()}-${now.getMonth()}`,
    metadata: {
      avgMarginPercent: Math.round(avgMargin * 10) / 10,
      threshold: config.lowAvgMarginThresholdPercent,
      salesCount: closedThisMonth.length,
    },
  });
  return alert ? [alert] : [];
}

// ─── ACV-09: Lead sin seguimiento ────────────────────────────────────────────

async function checkLeadNoFollowUp(ctx, leads, config) {
  if (!config.leadNoFollowUpEnabled) return [];
  const now = new Date();
  const alerts = [];
  const activeStatuses = ['new', 'contacted', 'follow_up', 'negotiation', 'visit_scheduled', 'pending', 'active'];

  for (const lead of leads) {
    if (!activeStatuses.includes(lead.status)) continue;

    const lastContact = lead.lastContactAt || lead.lastActivityAt || lead.updatedAt || lead.createdAt;
    const daysSinceContact = daysBetween(lastContact, now);

    let priority = null;
    let level = null;
    let isOverdue = false;
    let daysPastDue = 0;

    if (lead.nextFollowUpDate) {
      const followUpDate = new Date(lead.nextFollowUpDate);
      if (followUpDate < now) {
        isOverdue = true;
        daysPastDue = daysBetween(lead.nextFollowUpDate, now);
        if (daysPastDue > config.leadNoFollowUpCriticalDays) {
          priority = 'high'; level = 'alert';
        } else {
          priority = 'medium'; level = 'warning';
        }
      }
    }

    if (!priority) {
      if (daysSinceContact > config.leadNoFollowUpCriticalDays) {
        priority = 'high'; level = 'alert';
      } else if (daysSinceContact > config.leadNoFollowUpDays) {
        priority = 'medium'; level = 'warning';
      } else {
        continue;
      }
    }

    const leadName = lead.name || lead.contactName || lead.clientName || 'Sin nombre';
    const title = isOverdue
      ? `Seguimiento vencido — ${leadName}`
      : `Lead sin seguimiento — ${leadName}`;
    const message = isOverdue
      ? `Seguimiento de ${leadName} vencido hace ${daysPastDue} días (previsto: ${formatDate(lead.nextFollowUpDate)}). Asignado a: ${lead.responsible || 'Sin asignar'}.`
      : `${leadName} lleva ${daysSinceContact} días sin contacto. Asignado a: ${lead.responsible || 'Sin asignar'}.`;

    alerts.push(await emit(ctx, {
      category: 'cv_lead_no_followup',
      priority, level, title, message,
      entityId: lead._id, entityType: 'lead',
      route: `/saas/vertical/compraventa/crm?tab=leads&leadId=${lead._id}`,
      dedupKey: `cvleadnf-${lead._id}`,
      metadata: {
        leadName, responsible: lead.responsible,
        daysSinceContact, nextFollowUpDate: lead.nextFollowUpDate,
        daysPastDue, source: lead.source, budget: lead.budget,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-10: Entrega pendiente ───────────────────────────────────────────────

async function checkPendingDelivery(ctx, sales, config) {
  if (!config.pendingDeliveryEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const sale of sales) {
    if (sale.stage !== 'sold') continue;
    if (sale.deliveredAt) continue;

    const daysSinceSold = getStageDays(sale, 'sold');
    let priority = null;
    let level = null;
    let isLate = false;
    let daysLate = 0;

    if (sale.expectedDelivery) {
      const expected = new Date(sale.expectedDelivery);
      if (expected < now) {
        isLate = true;
        daysLate = daysBetween(sale.expectedDelivery, now);
        priority = 'high'; level = 'alert';
      }
    }

    if (!priority) {
      if (daysSinceSold > config.pendingDeliveryCriticalDays) {
        priority = 'high'; level = 'alert';
      } else if (daysSinceSold > config.pendingDeliveryDays) {
        priority = 'medium'; level = 'warning';
      } else {
        continue;
      }
    }

    const title = isLate
      ? `Entrega retrasada — ${sale.vehicleName}`
      : `Entrega pendiente — ${sale.vehicleName}`;
    const message = isLate
      ? `${sale.vehicleName} (${sale.vehiclePlate}) — Entrega prevista el ${formatDate(sale.expectedDelivery)}, retrasada ${daysLate} días. Cliente: ${sale.clientName}.`
      : `${sale.vehicleName} (${sale.vehiclePlate}) vendido hace ${daysSinceSold} días sin entregar. Cliente: ${sale.clientName}.`;

    alerts.push(await emit(ctx, {
      category: 'cv_pending_delivery',
      priority, level, title, message,
      entityId: sale._id, entityType: 'sale',
      route: `/saas/sales/${sale._id}?tab=delivery`,
      dedupKey: `cvpenddeliv-${sale._id}`,
      metadata: {
        vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
        clientName: sale.clientName, clientPhone: sale.clientPhone,
        daysSinceSold, expectedDelivery: sale.expectedDelivery,
        daysLate, responsible: sale.responsible,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-11: Vehículo listo sin publicar ─────────────────────────────────────

async function checkReadyNotPublished(ctx, vehicles, config) {
  if (!config.readyNotPublishedEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.active === false) continue;
    if (vehicle.commercialStatus !== 'ready') continue;
    if (vehicle.published) continue;

    const history = Array.isArray(vehicle.commercialStatusHistory) ? vehicle.commercialStatusHistory : [];
    const readyEntry = [...history].reverse().find((h) => h.toStatus === 'ready');
    const readyDate = readyEntry?.date || vehicle.updatedAt || vehicle.createdAt;
    const daysReady = daysBetween(readyDate, now);
    if (daysReady < config.readyNotPublishedDays) continue;

    const label = `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''})`.trim();
    alerts.push(await emit(ctx, {
      category: 'cv_ready_not_published',
      priority: daysReady > 7 ? 'high' : 'medium',
      level: daysReady > 7 ? 'alert' : 'warning',
      title: 'Vehículo listo sin publicar',
      message: `${label} lleva ${daysReady} días listo para vender pero no está publicado en ningún canal.`,
      entityId: vehicle._id,
      entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}`,
      dedupKey: `cvreadynotpub-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate, daysReady,
        salePrice: vehicle.salePrice,
        assignedCommercialName: vehicle.assignedCommercialName,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-12: Anuncio sin fotos ───────────────────────────────────────────────

async function checkVehicleNoPhotos(ctx, vehicles, config) {
  if (!config.vehicleNoPhotosEnabled) return [];
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.active === false) continue;
    const cs = vehicle.commercialStatus || 'preparation';
    if (cs === 'sold' || cs === 'preparation') continue;

    const hasPhotos = Array.isArray(vehicle.images) && vehicle.images.length > 0;
    if (hasPhotos) continue;

    const isPublished = vehicle.published === true;
    const label = `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''})`.trim();

    alerts.push(await emit(ctx, {
      category: 'cv_vehicle_no_photos',
      priority: isPublished ? 'high' : 'medium',
      level: isPublished ? 'alert' : 'warning',
      title: isPublished ? 'Anuncio publicado sin fotos' : 'Vehículo listo sin fotos',
      message: `${label} ${isPublished ? 'está publicado' : 'está listo para vender'} pero no tiene ninguna foto. Los anuncios sin fotos tienen mucha menos visibilidad.`,
      entityId: vehicle._id,
      entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}`,
      dedupKey: `cvnophotos-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate, published: isPublished,
        commercialStatus: cs,
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── ACV-13b: Precio del vehículo por debajo de su mínimo ───────────────────

async function checkVehiclePriceBelowMin(ctx, vehicles, config) {
  if (!config.vehiclePriceBelowMinEnabled) return [];
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.active === false) continue;
    const cs = vehicle.commercialStatus || 'preparation';
    if (cs === 'sold') continue;
    if (!vehicle.minimumSalePrice || vehicle.minimumSalePrice <= 0) continue;
    if (!vehicle.salePrice || vehicle.salePrice <= 0) continue;
    if (vehicle.salePrice >= vehicle.minimumSalePrice) continue;

    const diff = vehicle.minimumSalePrice - vehicle.salePrice;
    const pct = ((diff / vehicle.minimumSalePrice) * 100).toFixed(1);
    const label = `${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.registrationPlate || ''})`.trim();

    alerts.push(await emit(ctx, {
      category: 'cv_vehicle_price_below_min',
      priority: 'high',
      level: 'alert',
      title: 'Precio por debajo del mínimo',
      message: `${label} tiene un precio de venta de ${vehicle.salePrice} € que está ${diff.toFixed(0)} € (${pct}%) por debajo del mínimo configurado (${vehicle.minimumSalePrice} €).`,
      entityId: vehicle._id,
      entityType: 'vehicle',
      route: `/saas/vehicles/${vehicle._id}`,
      dedupKey: `cvvehpricelo-${vehicle._id}`,
      metadata: {
        brand: vehicle.brand, model: vehicle.model,
        plate: vehicle.registrationPlate,
        salePrice: vehicle.salePrice, minimumSalePrice: vehicle.minimumSalePrice,
        diff, pct: Number(pct),
      },
    }));
  }
  return alerts.filter(Boolean);
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

// ─── Worker performance alerts (WP-01..04) ──────────────────────────────────

function checkWorkerPerformanceAlerts(ctx, leads, sales, config) {
  const results = [];
  const now = new Date();

  const responsibleMap = {};
  for (const l of leads) {
    const r = (l.responsible || '').trim();
    if (!r || r === 'Sin asignar') continue;
    if (!responsibleMap[r]) responsibleMap[r] = { leads: [], sales: [] };
    responsibleMap[r].leads.push(l);
  }
  for (const s of sales) {
    const r = (s.responsible || '').trim();
    if (!r) continue;
    if (!responsibleMap[r]) responsibleMap[r] = { leads: [], sales: [] };
    responsibleMap[r].sales.push(s);
  }

  const activeLeadStatuses = ['new', 'contacted', 'follow_up', 'negotiation', 'visit_scheduled', 'pending', 'active'];
  const unmanagedHours = config.workerUnmanagedLeadHours || 48;
  const inactiveDays = config.workerInactiveDays || 3;
  const excessThreshold = config.workerExcessPendingThreshold || 10;

  const conversionByWorker = {};
  const totalConvertedAll = [];

  for (const [responsible, data] of Object.entries(responsibleMap)) {
    const myLeads = data.leads;
    const mySales = data.sales;

    // WP-01: Unmanaged leads
    if (config.workerUnmanagedLeadsEnabled !== false) {
      const unmanaged = myLeads.filter((l) => {
        if (l.status !== 'new') return false;
        if (Array.isArray(l.interactions) && l.interactions.length > 0) return false;
        const created = new Date(l.createdAt);
        return (now - created) / 3_600_000 >= unmanagedHours;
      });
      if (unmanaged.length > 0) {
        results.push(emit(ctx, {
          category: 'cv_worker_unmanaged_leads',
          level: 'warning',
          priority: 'high',
          title: `${responsible}: ${unmanaged.length} lead(s) sin gestionar`,
          message: `${responsible} tiene ${unmanaged.length} lead(s) sin contactar desde hace más de ${unmanagedHours}h`,
          route: '/saas/dealership-workers',
          dedupKey: `cv_worker_unmanaged:${responsible}:${now.toISOString().slice(0, 10)}`,
          metadata: { responsible, count: unmanaged.length },
        }));
      }
    }

    // WP-02: Inactive commercial
    if (config.workerInactiveEnabled !== false) {
      const recentActivity = [...myLeads, ...mySales].some((item) => {
        const d = new Date(item.updatedAt || item.createdAt);
        return daysBetween(d.toISOString(), now) < inactiveDays;
      });
      if (!recentActivity && myLeads.length + mySales.length > 0) {
        results.push(emit(ctx, {
          category: 'cv_worker_inactive',
          level: 'warning',
          priority: 'medium',
          title: `${responsible}: sin actividad comercial`,
          message: `${responsible} no registra actividad en los últimos ${inactiveDays} días`,
          route: '/saas/dealership-workers',
          dedupKey: `cv_worker_inactive:${responsible}:${now.toISOString().slice(0, 10)}`,
          metadata: { responsible, inactiveDays },
        }));
      }
    }

    // Conversion tracking for WP-03
    const activeLeads = myLeads.filter((l) => activeLeadStatuses.includes(l.status) || l.status === 'won' || l.status === 'lost');
    const wonLeads = myLeads.filter((l) => l.status === 'won');
    if (activeLeads.length >= 5) {
      const ratio = Math.round((wonLeads.length / activeLeads.length) * 100);
      conversionByWorker[responsible] = ratio;
      totalConvertedAll.push({ responsible, ratio, total: activeLeads.length, won: wonLeads.length });
    }

    // WP-04: Excess pending tasks
    if (config.workerExcessPendingEnabled !== false) {
      const unmanagedLeads = myLeads.filter((l) => l.status === 'new' && (!Array.isArray(l.interactions) || l.interactions.length === 0)).length;
      const pendingDeliveries = mySales.filter((s) => s.stage === 'sold' && !s.deliveredAt).length;
      const pendingDocs = mySales.filter((s) => s.stage === 'documentation').length;
      const total = unmanagedLeads + pendingDeliveries + pendingDocs;
      if (total > excessThreshold) {
        results.push(emit(ctx, {
          category: 'cv_worker_excess_pending',
          level: 'warning',
          priority: 'medium',
          title: `${responsible}: ${total} tareas pendientes`,
          message: `${responsible} acumula ${total} tareas pendientes (${unmanagedLeads} leads, ${pendingDeliveries} entregas, ${pendingDocs} docs)`,
          route: '/saas/dealership-workers',
          dedupKey: `cv_worker_excess:${responsible}:${now.toISOString().slice(0, 10)}`,
          metadata: { responsible, total, unmanagedLeads, pendingDeliveries, pendingDocs },
        }));
      }
    }
  }

  // WP-03: Low conversion (after computing all workers)
  if (config.workerLowConversionEnabled !== false && totalConvertedAll.length >= 2) {
    const avgConversion = totalConvertedAll.reduce((sum, w) => sum + w.ratio, 0) / totalConvertedAll.length;
    const threshold = avgConversion * (config.workerLowConversionThresholdPct || 50) / 100;
    for (const w of totalConvertedAll) {
      if (w.ratio < threshold) {
        results.push(emit(ctx, {
          category: 'cv_worker_low_conversion',
          level: 'warning',
          priority: 'medium',
          title: `${w.responsible}: baja conversión (${w.ratio}%)`,
          message: `${w.responsible} convierte al ${w.ratio}% vs media del equipo ${Math.round(avgConversion)}%`,
          route: '/saas/dealership-workers',
          dedupKey: `cv_worker_lowconv:${w.responsible}:${now.toISOString().slice(0, 7)}`,
          metadata: { responsible: w.responsible, ratio: w.ratio, avgConversion: Math.round(avgConversion) },
        }));
      }
    }
  }

  return results;
}

export async function runCompraventaAlerts(ctx, config, vehicles, sales, leads, documents) {
  if (!config.enabled) return [];
  const results = [];

  try {
    results.push(...await checkVehicleMissingDocs(ctx, vehicles, documents, config));
    results.push(...await checkStockItvExpiry(ctx, vehicles, documents, config));
    results.push(...await checkReservationNoContract(ctx, sales, documents, config));
    results.push(...await checkExpiredReservations(ctx, sales, config));
    results.push(...await checkSaleUnpaid(ctx, sales, config));
    results.push(...await checkVehicleStagnant(ctx, vehicles, config));
    results.push(...await checkExpenseNoInvoice(ctx, vehicles, config));
    results.push(...await checkPriceBelowMinimum(ctx, sales, vehicles, config));
    results.push(...await checkLowAvgMargin(ctx, sales, config));
    results.push(...await checkLeadNoFollowUp(ctx, leads, config));
    results.push(...await checkPendingDelivery(ctx, sales, config));
    results.push(...await checkReadyNotPublished(ctx, vehicles, config));
    results.push(...await checkVehicleNoPhotos(ctx, vehicles, config));
    results.push(...await checkVehiclePriceBelowMin(ctx, vehicles, config));
    results.push(...checkWorkerPerformanceAlerts(ctx, leads, sales, config));
  } catch (err) {
    logger.warn({ tag: 'COMPRAVENTA_ALERT_ENGINE', err: err?.message }, 'Error ejecutando alertas compraventa');
  }

  if (results.length > 0) {
    logger.info({ tag: 'COMPRAVENTA_ALERT_ENGINE', alerts: results.length, businessId: ctx.businessId }, 'Alertas compraventa generadas');
  }

  return results;
}

// ─── On-demand summary (ACV-13) ─────────────────────────────────────────────

export async function getCompraventaAlertSummary(userId, vehicles, sales, leads, documents, config) {
  const now = new Date();

  const activeVehicles = vehicles.filter((v) => v.status === 'available' && v.active !== false);
  const activeSales = sales.filter((s) => !s.deletedAt);

  const vehiclesWithMissingDocs = activeVehicles.filter((v) => {
    const daysInStock = daysBetween(v.purchaseDate || v.createdAt, now);
    if (daysInStock < (config.missingDocsGraceDays || 3)) return false;
    const vDocs = documents.filter((d) => d.vehicleId === v._id || d.entityId === v._id);
    const cats = new Set(vDocs.map((d) => d.docSubCategory || d.category).filter(Boolean));
    return (config.requiredDocs || []).some((r) => !cats.has(r));
  }).length;

  const stagnant30 = activeVehicles.filter((v) => daysBetween(v.purchaseDate || v.createdAt, now) >= 30).length;
  const stagnant60 = activeVehicles.filter((v) => daysBetween(v.purchaseDate || v.createdAt, now) >= 60).length;
  const stagnant90 = activeVehicles.filter((v) => daysBetween(v.purchaseDate || v.createdAt, now) >= 90).length;

  const reservedSales = activeSales.filter((s) => s.stage === 'reserved');
  const reservationsWithoutContract = reservedSales.filter((s) => {
    const hasContract = Array.isArray(s.generatedDocuments) && s.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok');
    return !hasContract && getStageDays(s, 'reserved') >= (config.reservationNoContractDays || 3);
  }).length;

  const expiredReservations = reservedSales.filter((s) => getStageDays(s, 'reserved') >= (config.reservationExpiredDays || 15)).length;

  const salesWithPending = activeSales.filter((s) => {
    if (!['documentation', 'sold', 'delivered'].includes(s.stage)) return false;
    return ((s.totalPrice || 0) - (s.depositPaid || 0) - (s.financingAmount || 0)) > 0;
  });
  const totalPendingAmount = salesWithPending.reduce((sum, s) => sum + (s.totalPrice || 0) - (s.depositPaid || 0) - (s.financingAmount || 0), 0);

  const salesBelowMin = activeSales.filter((s) => {
    if (!['reserved', 'documentation', 'sold'].includes(s.stage)) return false;
    return (s.minimumPrice > 0 && s.totalPrice < s.minimumPrice) || s.totalPrice < s.purchasePrice;
  }).length;

  const expensesWithoutInvoice = vehicles.filter((v) => {
    if (!Array.isArray(v.associatedCosts)) return false;
    return v.associatedCosts.some((c) => !c.invoiceId && !c.attachmentUrl && daysBetween(c.date || v.createdAt, now) >= (config.expenseNoInvoiceGraceDays || 7));
  }).length;

  const activeLeadStatuses = ['new', 'contacted', 'follow_up', 'negotiation', 'visit_scheduled', 'pending', 'active'];
  const leadsWithoutFollowUp = leads.filter((l) => {
    if (!activeLeadStatuses.includes(l.status)) return false;
    const last = l.lastContactAt || l.lastActivityAt || l.updatedAt || l.createdAt;
    return daysBetween(last, now) > (config.leadNoFollowUpDays || 3);
  }).length;

  const pendingDeliveries = activeSales.filter((s) => s.stage === 'sold' && !s.deliveredAt).length;

  const readyNotPublished = vehicles.filter((v) => {
    if (v.active === false) return false;
    if (v.commercialStatus !== 'ready') return false;
    return !v.published;
  }).length;

  const vehiclesNoPhotos = vehicles.filter((v) => {
    if (v.active === false) return false;
    const cs = v.commercialStatus || 'preparation';
    if (cs === 'sold' || cs === 'preparation') return false;
    return !Array.isArray(v.images) || v.images.length === 0;
  }).length;

  const vehiclesPriceBelowMin = vehicles.filter((v) => {
    if (v.active === false) return false;
    if ((v.commercialStatus || 'preparation') === 'sold') return false;
    return v.minimumSalePrice > 0 && v.salePrice > 0 && v.salePrice < v.minimumSalePrice;
  }).length;

  const closedThisMonth = activeSales.filter((s) => {
    if (s.stage !== 'sold' && s.stage !== 'delivered') return false;
    const d = s.closureData?.closedAt || s.soldAt || s.updatedAt;
    return d && new Date(d) >= new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const avgMarginPercent = closedThisMonth.length > 0
    ? closedThisMonth.reduce((sum, s) => sum + (s.totalPrice > 0 ? ((s.totalPrice - s.purchasePrice) / s.totalPrice) * 100 : 0), 0) / closedThisMonth.length
    : 0;

  const critical = (salesBelowMin > 0 ? salesBelowMin : 0) + stagnant90 +
    salesWithPending.filter((s) => s.stage === 'delivered').length;
  const warning = vehiclesWithMissingDocs + reservationsWithoutContract +
    salesWithPending.filter((s) => s.stage !== 'delivered').length +
    (stagnant60 - stagnant90) + expensesWithoutInvoice + leadsWithoutFollowUp + pendingDeliveries;

  return {
    updatedAt: now.toISOString(),
    totals: { critical, warning, total: critical + warning },
    documentation: {
      vehiclesWithMissingDocs,
      expiredItv: 0,
      reservationsWithoutContract,
      expensesWithoutInvoice,
    },
    commercial: {
      stagnantVehicles: { over30: stagnant30, over60: stagnant60, over90: stagnant90 },
      expiredReservations,
      leadsWithoutFollowUp,
      pendingDeliveries,
      readyNotPublished,
      vehiclesNoPhotos,
    },
    economic: {
      salesWithPendingPayment: salesWithPending.length,
      totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      salesBelowMinimum: salesBelowMin,
      vehiclesPriceBelowMinimum: vehiclesPriceBelowMin,
      avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
    },
  };
}
