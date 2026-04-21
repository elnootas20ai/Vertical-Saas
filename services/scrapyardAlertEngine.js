/**
 * Scrapyard Alert Engine — Motor de alertas específico de la vertical desguaces.
 *
 * Ejecuta reglas de alerta sobre vehículos, piezas, despieces, ventas y documentación
 * del desguace. Se integra en el ciclo estándar de 60 minutos del alertEngine.
 *
 * Usa emitGlobalAlert() del alertEmitter para emisión y routing.
 */

import { emitGlobalAlert } from './alertEmitter.js';
import { broadcastToBusiness } from './sseService.js';
import logger from './logger.js';

const TAG = 'SCRAPYARD_ALERT_ENGINE';

// ─── Classification & escalation ─────────────────────────────────────────────

const CLASSIFICATION = {
  OPERATIONAL: 'operativa',
  ECONOMIC: 'economica',
  DOCUMENTARY: 'documental',
  COMMERCIAL: 'comercial',
};

const ALERT_CLASSIFICATION = {
  scrapyard_pending_deregistration: { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: true },
  scrapyard_no_destruction_cert:    { defaultPriority: 'high',   classification: CLASSIFICATION.DOCUMENTARY, escalable: false },
  scrapyard_part_no_price:          { defaultPriority: 'medium', classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_part_no_location:       { defaultPriority: 'medium', classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_sale_unpaid:            { defaultPriority: 'medium', classification: CLASSIFICATION.ECONOMIC,    escalable: true },
  scrapyard_order_pending_ship:     { defaultPriority: 'medium', classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_stale_stock:            { defaultPriority: 'low',    classification: CLASSIFICATION.COMMERCIAL,  escalable: true },
  scrapyard_vehicle_missing_docs:   { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: true },
  scrapyard_unjustified_purchase:   { defaultPriority: 'medium', classification: CLASSIFICATION.DOCUMENTARY, escalable: false },
  scrapyard_dismantling_stale:      { defaultPriority: 'medium', classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_pending_dismantling:    { defaultPriority: 'low',    classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_low_extraction_rate:    { defaultPriority: 'medium', classification: CLASSIFICATION.OPERATIONAL, escalable: true },
  scrapyard_low_margin:             { defaultPriority: 'medium', classification: CLASSIFICATION.ECONOMIC,    escalable: false },
  scrapyard_avg_margin_low:         { defaultPriority: 'medium', classification: CLASSIFICATION.ECONOMIC,    escalable: true },
  scrapyard_reservation_expired:    { defaultPriority: 'high',   classification: CLASSIFICATION.COMMERCIAL,  escalable: false },
  scrapyard_sold_not_delivered:     { defaultPriority: 'high',   classification: CLASSIFICATION.OPERATIONAL, escalable: false },
};

const ALERT_TARGET_ROLES = {
  scrapyard_pending_deregistration: { manager: true, assignedWorker: false, admin: true },
  scrapyard_no_destruction_cert:    { manager: true, assignedWorker: false, admin: true },
  scrapyard_part_no_price:          { manager: true, assignedWorker: true,  admin: false },
  scrapyard_part_no_location:       { manager: true, assignedWorker: true,  admin: false },
  scrapyard_sale_unpaid:            { manager: true, assignedWorker: true,  admin: true },
  scrapyard_order_pending_ship:     { manager: true, assignedWorker: true,  admin: false },
  scrapyard_stale_stock:            { manager: true, assignedWorker: false, admin: false },
  scrapyard_vehicle_missing_docs:   { manager: true, assignedWorker: false, admin: true },
  scrapyard_unjustified_purchase:   { manager: true, assignedWorker: false, admin: true },
  scrapyard_dismantling_stale:      { manager: true, assignedWorker: true,  admin: false },
  scrapyard_pending_dismantling:    { manager: true, assignedWorker: false, admin: false },
  scrapyard_low_extraction_rate:    { manager: true, assignedWorker: false, admin: false },
  scrapyard_low_margin:             { manager: true, assignedWorker: false, admin: false },
  scrapyard_avg_margin_low:         { manager: true, assignedWorker: false, admin: false },
  scrapyard_reservation_expired:    { manager: true, assignedWorker: true,  admin: false },
  scrapyard_sold_not_delivered:     { manager: true, assignedWorker: true,  admin: false },
};

const HIGH_VALUE_CATEGORIES = [
  'motores', 'cajas_cambio', 'centralitas', 'turbocompresores',
  'alternadores', 'compresores',
];

const DOC_LABELS = {
  baja_temporal: 'Baja temporal',
  baja_definitiva: 'Baja definitiva',
  factura_compra: 'Factura de compra',
  contrato_compra: 'Contrato de compra',
  permiso_circulacion: 'Permiso de circulación',
  ficha_tecnica: 'Ficha técnica',
  certificado_destruccion: 'Certificado de destrucción',
};

const BAJA_DOC_TYPES = ['baja_temporal', 'baja_definitiva', 'certificado_destruccion'];

const SHIP_ALERT_TITLES = {
  confirmada: 'Pedido confirmado sin preparar',
  preparando: 'Pedido en preparación demasiado tiempo',
  lista: 'Pedido listo pero no enviado',
  enviada: 'Envío sin confirmar entrega',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(dateStr, now) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('es-ES'); } catch { return dateStr; }
}

function isScrapyardVehicle(vehicle) {
  return !!(vehicle.procedencia || vehicle.entryDate || vehicle.dismantlingStartedAt);
}

function getEntryDate(vehicle) {
  return vehicle.entryDate || vehicle.purchaseDate || vehicle.createdAt;
}

function getVehicleDocTypes(vehicle) {
  const types = new Set();
  if (Array.isArray(vehicle.documents)) {
    for (const doc of vehicle.documents) {
      if (doc.documentType) types.add(doc.documentType);
    }
  }
  return types;
}

function getDaysInCurrentStatus(sale) {
  if (Array.isArray(sale.historial) && sale.historial.length > 0) {
    const sorted = [...sale.historial].sort((a, b) =>
      String(b.fecha || '').localeCompare(String(a.fecha || ''))
    );
    for (const entry of sorted) {
      if (entry.fecha) {
        const d = daysBetween(entry.fecha, new Date());
        if (d >= 0) return d;
      }
    }
  }
  return daysBetween(sale.createdAt || sale.updatedAt, new Date());
}

async function emit(ctx, { category, priority, level, title, message, entityId, entityType, route, metadata, dedupKey }) {
  const classDef = ALERT_CLASSIFICATION[category] || {};
  const targetRoles = ALERT_TARGET_ROLES[category] || {};
  const resolvedMeta = {
    ...metadata,
    classification: classDef.classification || CLASSIFICATION.OPERATIONAL,
    targetRoles: Object.entries(targetRoles).filter(([, v]) => v).map(([k]) => k),
  };

  return emitGlobalAlert({
    businessId: ctx.businessId || '',
    userId: ctx.userId || '',
    source: 'desguaces',
    ruleId: category,
    category,
    priority: priority || classDef.defaultPriority || 'medium',
    level: level || (priority === 'high' ? 'alert' : 'warning'),
    title,
    message,
    entityId: entityId || '',
    entityType: entityType || '',
    route: route || '',
    metadata: resolvedMeta,
    dedupKey,
  });
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getScrapyardAlertConfig(account) {
  const cfg = account?.alertConfig?.scrapyard || {};
  return {
    enabled: cfg.enabled !== false,

    pendingDeregistrationEnabled: cfg.pendingDeregistrationEnabled !== false,
    pendingDeregistrationDays: Number(cfg.pendingDeregistrationDays || 7),
    pendingDeregistrationCriticalDays: Number(cfg.pendingDeregistrationCriticalDays || 30),

    partNoPriceEnabled: cfg.partNoPriceEnabled !== false,
    partNoPriceGraceDays: Number(cfg.partNoPriceGraceDays || 2),

    partNoLocationEnabled: cfg.partNoLocationEnabled !== false,
    partNoLocationGraceDays: Number(cfg.partNoLocationGraceDays || 1),

    saleUnpaidEnabled: cfg.saleUnpaidEnabled !== false,
    saleUnpaidDays: Number(cfg.saleUnpaidDays || 3),
    saleUnpaidCriticalDays: Number(cfg.saleUnpaidCriticalDays || 15),

    orderPendingShipEnabled: cfg.orderPendingShipEnabled !== false,
    orderPendingShipDays: Number(cfg.orderPendingShipDays || 2),
    orderPendingShipCriticalDays: Number(cfg.orderPendingShipCriticalDays || 7),

    staleStockEnabled: cfg.staleStockEnabled !== false,
    staleStockWarningDays: Number(cfg.staleStockWarningDays || 30),
    staleStockHighDays: Number(cfg.staleStockHighDays || 60),
    staleStockCriticalDays: Number(cfg.staleStockCriticalDays || 90),

    vehicleMissingDocsEnabled: cfg.vehicleMissingDocsEnabled !== false,
    vehicleRequiredDocs: cfg.vehicleRequiredDocs || [
      'baja_temporal', 'factura_compra', 'permiso_circulacion', 'ficha_tecnica',
    ],
    vehicleMissingDocsGraceDays: Number(cfg.vehicleMissingDocsGraceDays || 5),

    unjustifiedPurchaseEnabled: cfg.unjustifiedPurchaseEnabled !== false,
    unjustifiedPurchaseGraceDays: Number(cfg.unjustifiedPurchaseGraceDays || 7),

    productivityEnabled: cfg.productivityEnabled !== false,
    dismantlingStaleDays: Number(cfg.dismantlingStaleDays || 5),
    dismantlingStaleExtractionPct: Number(cfg.dismantlingStaleExtractionPct || 25),
    pendingDismantlingDays: Number(cfg.pendingDismantlingDays || 10),
    pendingDismantlingCriticalDays: Number(cfg.pendingDismantlingCriticalDays || 20),

    lowMarginEnabled: cfg.lowMarginEnabled !== false,
    lowMarginThresholdPercent: Number(cfg.lowMarginThresholdPercent || 15),
    lowMarginAbsoluteThreshold: Number(cfg.lowMarginAbsoluteThreshold || 5),

    reservationExpiredEnabled: cfg.reservationExpiredEnabled !== false,
    reservationExpiredDays: Number(cfg.reservationExpiredDays || 7),
  };
}

// ─── ADS-03: Vehículo con baja pendiente ─────────────────────────────────────

async function checkPendingDeregistration(ctx, vehicles, config) {
  if (!config.pendingDeregistrationEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const v of vehicles) {
    if (!isScrapyardVehicle(v)) continue;
    if (v.status === 'scrapped') continue;
    if (!['available', 'workshop'].includes(v.status) && v.status !== undefined) continue;

    const docTypes = getVehicleDocTypes(v);
    const hasBaja = BAJA_DOC_TYPES.some((t) => docTypes.has(t));
    if (hasBaja) continue;

    const days = daysBetween(getEntryDate(v), now);
    if (days < config.pendingDeregistrationDays) continue;

    const priority = days > config.pendingDeregistrationCriticalDays ? 'high' : 'medium';
    const a = await emit(ctx, {
      category: 'scrapyard_pending_deregistration',
      priority,
      level: priority === 'high' ? 'alert' : 'warning',
      title: 'Vehículo con baja pendiente',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || v.vin || '?'}) lleva ${days} días sin tramitar la baja. Entrada: ${formatDate(getEntryDate(v))}.`,
      entityId: v._id, entityType: 'vehicle',
      route: `/saas/vertical/desguaces/vehiculos/${v._id}?tab=documents`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate, vin: v.vin, daysSinceEntry: days },
      dedupKey: `scrap-baja-${v._id}`,
    });
    if (a) alerts.push(a);
  }

  // Vehículos scrapped sin certificado de destrucción
  for (const v of vehicles) {
    if (v.status !== 'scrapped') continue;
    if (!isScrapyardVehicle(v)) continue;
    const docTypes = getVehicleDocTypes(v);
    if (docTypes.has('certificado_destruccion')) continue;

    const a = await emit(ctx, {
      category: 'scrapyard_no_destruction_cert',
      priority: 'high', level: 'alert',
      title: 'Vehículo dado de baja sin certificado de destrucción',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || '?'}) tiene status "baja" pero no se ha adjuntado certificado de destrucción.`,
      entityId: v._id, entityType: 'vehicle',
      route: `/saas/vertical/desguaces/vehiculos/${v._id}?tab=documents`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate },
      dedupKey: `scrap-destcert-${v._id}`,
    });
    if (a) alerts.push(a);
  }

  return alerts;
}

// ─── ADS-04: Pieza sin precio ────────────────────────────────────────────────

async function checkPartNoPrice(ctx, parts, config) {
  if (!config.partNoPriceEnabled) return [];
  const now = new Date();
  const alerts = [];
  const byVehicle = new Map();

  for (const p of parts) {
    if (p.estado !== 'disponible' || p.active === false) continue;
    if (p.precioVenta && Number(p.precioVenta) > 0) continue;

    const days = daysBetween(p.createdAt, now);
    if (days < config.partNoPriceGraceDays) continue;

    const vid = p.vehiculoOrigenId || '_none';
    if (!byVehicle.has(vid)) byVehicle.set(vid, []);
    byVehicle.get(vid).push(p);
  }

  for (const [vid, partsGroup] of byVehicle) {
    if (partsGroup.length > 10) {
      const sample = partsGroup[0];
      const a = await emit(ctx, {
        category: 'scrapyard_part_no_price',
        priority: 'high', level: 'alert',
        title: `${partsGroup.length} piezas sin precio de venta`,
        message: `${partsGroup.length} piezas del vehículo ${sample.vehiculoOrigenLabel || vid} no tienen precio asignado.`,
        entityId: vid, entityType: 'vehicle',
        route: '/saas/vertical/desguaces/piezas',
        metadata: { count: partsGroup.length, vehicleOrigin: sample.vehiculoOrigenLabel },
        dedupKey: `scrap-noprice-batch-${vid}`,
      });
      if (a) alerts.push(a);
    } else {
      for (const p of partsGroup) {
        const isHigh = HIGH_VALUE_CATEGORIES.includes(p.categoria);
        const days = daysBetween(p.createdAt, now);
        const a = await emit(ctx, {
          category: 'scrapyard_part_no_price',
          priority: isHigh ? 'high' : 'medium',
          level: isHigh ? 'alert' : 'warning',
          title: 'Pieza sin precio de venta',
          message: `${p.nombre || '?'} (${p.codigoInterno || '?'}) — Vehículo: ${p.vehiculoOrigenLabel || '?'}. Sin precio asignado desde hace ${days} días.`,
          entityId: p._id, entityType: 'scrapyard_part',
          route: `/saas/vertical/desguaces/piezas/${p._id}`,
          metadata: { partName: p.nombre, partCode: p.codigoInterno, category: p.categoria, vehicleOrigin: p.vehiculoOrigenLabel, daysSinceCreation: days },
          dedupKey: `scrap-noprice-${p._id}`,
        });
        if (a) alerts.push(a);
      }
    }
  }
  return alerts;
}

// ─── ADS-05: Pieza sin ubicación ─────────────────────────────────────────────

async function checkPartNoLocation(ctx, parts, config) {
  if (!config.partNoLocationEnabled) return [];
  const now = new Date();
  const alerts = [];
  const byVehicle = new Map();

  for (const p of parts) {
    if (p.estado !== 'disponible' || p.active === false) continue;
    if (p.ubicacion || p.zona || p.estanteria) continue;

    const days = daysBetween(p.createdAt, now);
    if (days < config.partNoLocationGraceDays) continue;

    const vid = p.vehiculoOrigenId || '_none';
    if (!byVehicle.has(vid)) byVehicle.set(vid, []);
    byVehicle.get(vid).push(p);
  }

  for (const [vid, partsGroup] of byVehicle) {
    if (partsGroup.length > 10) {
      const sample = partsGroup[0];
      const a = await emit(ctx, {
        category: 'scrapyard_part_no_location',
        priority: 'medium', level: 'warning',
        title: `${partsGroup.length} piezas sin ubicar en almacén`,
        message: `${partsGroup.length} piezas del despiece de ${sample.vehiculoOrigenLabel || vid} no tienen ubicación asignada.`,
        entityId: vid, entityType: 'vehicle',
        route: '/saas/vertical/desguaces/piezas',
        metadata: { count: partsGroup.length, vehicleOrigin: sample.vehiculoOrigenLabel },
        dedupKey: `scrap-noloc-batch-${vid}`,
      });
      if (a) alerts.push(a);
    } else {
      for (const p of partsGroup) {
        const days = daysBetween(p.createdAt, now);
        const a = await emit(ctx, {
          category: 'scrapyard_part_no_location',
          priority: 'medium', level: 'warning',
          title: 'Pieza sin ubicar en almacén',
          message: `${p.nombre || '?'} (${p.codigoInterno || '?'}) — Sin ubicación asignada desde hace ${days} días. Vehículo origen: ${p.vehiculoOrigenLabel || '?'}.`,
          entityId: p._id, entityType: 'scrapyard_part',
          route: `/saas/vertical/desguaces/piezas/${p._id}`,
          metadata: { partName: p.nombre, partCode: p.codigoInterno, category: p.categoria, vehicleOrigin: p.vehiculoOrigenLabel, daysSinceCreation: days },
          dedupKey: `scrap-noloc-${p._id}`,
        });
        if (a) alerts.push(a);
      }
    }
  }
  return alerts;
}

// ─── ADS-06: Venta sin cobro ─────────────────────────────────────────────────

async function checkScrapyardSaleUnpaid(ctx, sales, config) {
  if (!config.saleUnpaidEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const sale of sales) {
    if (sale.estado === 'cancelada' || sale.estado === 'borrador') continue;
    if (sale.estadoPago === 'cobrada') continue;

    const totalPaid = Array.isArray(sale.pagos)
      ? sale.pagos.reduce((s, p) => s + Number(p.importe || 0), 0) : 0;
    const pendingAmount = Number(sale.importeConIva || 0) - totalPaid;
    if (pendingAmount <= 0) continue;

    const days = daysBetween(sale.createdAt, now);

    let priority = 'low';
    let level = 'info';
    if (sale.estado === 'entregada') {
      priority = 'high'; level = 'alert';
    } else if (days > config.saleUnpaidCriticalDays) {
      priority = 'high'; level = 'alert';
    } else if (days > config.saleUnpaidDays) {
      priority = 'medium'; level = 'warning';
    } else {
      continue;
    }

    const a = await emit(ctx, {
      category: 'scrapyard_sale_unpaid',
      priority, level,
      title: sale.estado === 'entregada' ? 'Venta entregada sin cobrar' : 'Venta con cobro pendiente',
      message: `Venta ${sale.numVenta || '?'} — ${sale.clientName || '?'}. Pendiente: ${pendingAmount.toFixed(2)} € de ${Number(sale.importeConIva || 0).toFixed(2)} €. Estado: ${sale.estado}.`,
      entityId: sale._id, entityType: 'scrapyard_sale',
      route: `/saas/vertical/desguaces/ventas/${sale._id}`,
      metadata: {
        saleNumber: sale.numVenta, clientName: sale.clientName, clientType: sale.clientTipo,
        totalAmount: sale.importeConIva, pendingAmount, paymentStatus: sale.estadoPago,
        saleStatus: sale.estado, daysSinceCreation: days, responsible: sale.responsable,
      },
      dedupKey: `scrap-unpaid-${sale._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

// ─── ADS-07: Pedido sin enviar / retrasado ───────────────────────────────────

async function checkOrderPendingShip(ctx, sales, config) {
  if (!config.orderPendingShipEnabled) return [];
  const alerts = [];

  for (const sale of sales) {
    if (sale.entrega !== 'envio') continue;
    if (['borrador', 'entregada', 'cancelada'].includes(sale.estado)) continue;

    const days = getDaysInCurrentStatus(sale);

    let priority, level;
    if (sale.estado === 'lista') {
      if (days < 1) continue;
      priority = 'high'; level = 'alert';
    } else if (sale.estado === 'enviada') {
      if (days < config.orderPendingShipCriticalDays) continue;
      priority = 'high'; level = 'alert';
    } else {
      if (days < config.orderPendingShipDays) continue;
      priority = 'medium'; level = 'warning';
    }

    const missingTracking = !sale.envio?.numSeguimiento;
    const title = SHIP_ALERT_TITLES[sale.estado] || 'Pedido retrasado';

    const a = await emit(ctx, {
      category: 'scrapyard_order_pending_ship',
      priority, level,
      title,
      message: `Venta ${sale.numVenta || '?'} — ${sale.clientName || '?'}. Estado: ${sale.estado} desde hace ${days} día(s).${missingTracking && sale.estado === 'enviada' ? ' Sin número de seguimiento.' : ''}`,
      entityId: sale._id, entityType: 'scrapyard_sale',
      route: `/saas/vertical/desguaces/ventas/${sale._id}`,
      metadata: {
        saleNumber: sale.numVenta, clientName: sale.clientName,
        status: sale.estado, daysInStatus: days,
        hasTracking: !missingTracking, carrier: sale.envio?.transportista || '',
        responsible: sale.responsable,
      },
      dedupKey: `scrap-pendship-${sale._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

// ─── ADS-08: Stock parado ────────────────────────────────────────────────────

async function checkStalePartStock(ctx, parts, config) {
  if (!config.staleStockEnabled) return [];
  const now = new Date();
  const alerts = [];
  let totalAvailable = 0;
  let totalStale = 0;

  for (const p of parts) {
    if (p.estado !== 'disponible' || p.active === false) continue;
    totalAvailable++;

    const days = daysBetween(p.createdAt, now);
    if (days < config.staleStockWarningDays) continue;
    totalStale++;

    let priority, level;
    if (days >= config.staleStockCriticalDays) {
      priority = 'high'; level = 'alert';
    } else if (days >= config.staleStockHighDays) {
      priority = 'medium'; level = 'warning';
    } else {
      priority = 'low'; level = 'info';
    }

    const noCompat = !p.compatibilidades || p.compatibilidades.length === 0;
    if (noCompat && priority === 'low') priority = 'medium';
    if (noCompat && priority === 'medium' && days >= config.staleStockHighDays) priority = 'high';

    const a = await emit(ctx, {
      category: 'scrapyard_stale_stock',
      priority, level,
      title: `Pieza parada — ${days} días en stock`,
      message: `${p.nombre || '?'} (${p.codigoInterno || '?'}) lleva ${days} días sin venderse. PV: ${p.precioVenta ? Number(p.precioVenta).toFixed(0) : '—'} €. Categoría: ${p.categoria || '?'}.${noCompat ? ' Sin compatibilidades registradas.' : ''}`,
      entityId: p._id, entityType: 'scrapyard_part',
      route: `/saas/vertical/desguaces/piezas/${p._id}`,
      metadata: {
        partName: p.nombre, partCode: p.codigoInterno,
        category: p.categoria, daysInStock: days,
        price: p.precioVenta, compatCount: p.compatibilidades?.length || 0,
        vehicleOrigin: p.vehiculoOrigenLabel,
      },
      dedupKey: `scrap-stale-${p._id}`,
    });
    if (a) alerts.push(a);
  }

  if (totalAvailable > 20 && totalStale / totalAvailable > 0.4) {
    const pct = Math.round((totalStale / totalAvailable) * 100);
    const a = await emit(ctx, {
      category: 'scrapyard_stale_stock',
      priority: 'high', level: 'alert',
      title: `${pct}% del stock de piezas parado`,
      message: `El ${pct}% del stock de piezas lleva más de ${config.staleStockWarningDays} días sin venderse (${totalStale} de ${totalAvailable} piezas).`,
      entityId: '', entityType: 'business',
      route: '/saas/vertical/desguaces/piezas',
      metadata: { totalAvailable, totalStale, percent: pct },
      dedupKey: `scrap-stale-summary-${ctx.businessId}`,
    });
    if (a) alerts.push(a);
  }

  return alerts;
}

// ─── ADS-09: Vehículo sin documentación obligatoria ──────────────────────────

async function checkVehicleMissingDocs(ctx, vehicles, externalDocs, config) {
  if (!config.vehicleMissingDocsEnabled) return [];
  const now = new Date();
  const alerts = [];
  const requiredDocs = config.vehicleRequiredDocs;

  const externalByVehicle = new Map();
  for (const doc of externalDocs) {
    if (!doc.vehicleId) continue;
    if (!externalByVehicle.has(doc.vehicleId)) externalByVehicle.set(doc.vehicleId, new Set());
    if (doc.category) externalByVehicle.get(doc.vehicleId).add(doc.category);
    if (doc.documentType) externalByVehicle.get(doc.vehicleId).add(doc.documentType);
  }

  for (const v of vehicles) {
    if (!isScrapyardVehicle(v)) continue;
    if (v.status === 'scrapped') continue;

    const days = daysBetween(getEntryDate(v), now);
    if (days < config.vehicleMissingDocsGraceDays) continue;

    const docTypes = getVehicleDocTypes(v);
    const extTypes = externalByVehicle.get(v._id) || new Set();
    const allTypes = new Set([...docTypes, ...extTypes]);

    const missing = requiredDocs.filter((req) => {
      if (BAJA_DOC_TYPES.includes(req)) {
        return !BAJA_DOC_TYPES.some((t) => allTypes.has(t));
      }
      if (req === 'factura_compra') {
        return !allTypes.has('factura_compra') && !allTypes.has('contrato_compra');
      }
      return !allTypes.has(req);
    });

    if (missing.length === 0) continue;
    const missingLabels = missing.map((m) => DOC_LABELS[m] || m);
    const priority = missing.length >= 3 ? 'high' : 'medium';

    const a = await emit(ctx, {
      category: 'scrapyard_vehicle_missing_docs',
      priority, level: priority === 'high' ? 'alert' : 'warning',
      title: 'Vehículo sin documentación completa',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || '?'}) — Faltan ${missing.length} documento(s): ${missingLabels.join(', ')}.`,
      entityId: v._id, entityType: 'vehicle',
      route: `/saas/vertical/desguaces/vehiculos/${v._id}?tab=documents`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate, missingDocs: missing, missingLabels, totalRequired: requiredDocs.length, daysSinceEntry: days },
      dedupKey: `scrap-missdocs-${v._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

// ─── ADS-10: Compra sin justificar ───────────────────────────────────────────

async function checkUnjustifiedPurchase(ctx, vehicles, financeDocs, config) {
  if (!config.unjustifiedPurchaseEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const v of vehicles) {
    if (!isScrapyardVehicle(v)) continue;
    const costs = Array.isArray(v.associatedCosts) ? v.associatedCosts : [];
    let count = 0;
    let totalWithout = 0;
    const concepts = [];

    for (const c of costs) {
      if (c.invoiceId || c.attachmentUrl) continue;
      const costDays = daysBetween(c.date || v.createdAt, now);
      if (costDays < config.unjustifiedPurchaseGraceDays) continue;
      count++;
      totalWithout += Number(c.amount || 0);
      if (c.concept) concepts.push(c.concept);
    }

    const vehicleFinDocs = financeDocs.filter(
      (f) => f.linkedEntityId === v._id && f.linkedEntityType === 'vehicle' && !f.linkedInvoiceId && !f.attachmentUrl
    );
    for (const f of vehicleFinDocs) {
      const fDays = daysBetween(f.date || f.createdAt, now);
      if (fDays < config.unjustifiedPurchaseGraceDays) continue;
      count++;
      totalWithout += Number(f.totalAmount || 0);
    }

    if (count === 0) continue;
    const priority = totalWithout > 1000 ? 'high' : 'medium';

    const a = await emit(ctx, {
      category: 'scrapyard_unjustified_purchase',
      priority, level: 'warning',
      title: 'Compra sin justificar',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || '?'}) tiene ${count} gasto(s) sin justificante por ${totalWithout.toFixed(2)} €${concepts.length ? ': ' + concepts.join(', ') : ''}.`,
      entityId: v._id, entityType: 'vehicle',
      route: `/saas/vertical/desguaces/vehiculos/${v._id}?tab=costs`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate, unjustifiedCount: count, totalAmount: totalWithout, concepts },
      dedupKey: `scrap-unjust-${v._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

// ─── ADS-11: Productividad anómala ───────────────────────────────────────────

async function checkStaleDismantling(ctx, sessions, config) {
  if (!config.productivityEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const s of sessions) {
    if (s.status !== 'in_progress') continue;

    let lastActivity = s.updatedAt || s.createdAt;
    if (Array.isArray(s.historial)) {
      for (const h of s.historial) {
        if (h.fecha && h.fecha > lastActivity) lastActivity = h.fecha;
      }
    }

    const inactiveDays = daysBetween(lastActivity, now);
    if (inactiveDays < config.dismantlingStaleDays) continue;

    const total = Array.isArray(s.piezasPrevistas) ? s.piezasPrevistas.length : 0;
    const extracted = total > 0 ? s.piezasPrevistas.filter((p) => p.extraida).length : 0;
    const progress = total > 0 ? (extracted / total) * 100 : 0;

    const priority = progress < config.dismantlingStaleExtractionPct ? 'high' : 'medium';

    const a = await emit(ctx, {
      category: 'scrapyard_dismantling_stale',
      priority, level: priority === 'high' ? 'alert' : 'warning',
      title: `Despiece estancado — ${s.vehicleMatricula || s.vehicleLabel || '?'}`,
      message: `Despiece de ${s.vehicleLabel || '?'} (${s.vehicleMatricula || '?'}) lleva ${inactiveDays} días sin actividad. Progreso: ${progress.toFixed(0)}% (${extracted}/${total} piezas).`,
      entityId: s._id, entityType: 'dismantling_session',
      route: `/saas/vertical/desguaces/despiece/${s._id}`,
      metadata: { vehicleLabel: s.vehicleLabel, plate: s.vehicleMatricula, progress, extracted, total, inactiveDays, workers: s.trabajadores },
      dedupKey: `scrap-dismstale-${s._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

async function checkVehiclePendingDismantling(ctx, vehicles, sessions, config) {
  if (!config.productivityEnabled) return [];
  const now = new Date();
  const alerts = [];

  const vehiclesWithSession = new Set();
  for (const s of sessions) {
    if (s.vehicleId) vehiclesWithSession.add(s.vehicleId);
  }

  for (const v of vehicles) {
    if (!isScrapyardVehicle(v)) continue;
    if (!['available', 'workshop'].includes(v.status) && v.status !== undefined) continue;
    if (v.dismantlingStartedAt) continue;
    if (vehiclesWithSession.has(v._id)) continue;

    const days = daysBetween(getEntryDate(v), now);
    if (days < config.pendingDismantlingDays) continue;

    const priority = days >= config.pendingDismantlingCriticalDays ? 'medium' : 'low';

    const a = await emit(ctx, {
      category: 'scrapyard_pending_dismantling',
      priority, level: priority === 'medium' ? 'warning' : 'info',
      title: 'Vehículo pendiente de despiece',
      message: `${v.brand || ''} ${v.model || ''} (${v.registrationPlate || '?'}) lleva ${days} días sin iniciar despiece.`,
      entityId: v._id, entityType: 'vehicle',
      route: `/saas/vertical/desguaces/vehiculos/${v._id}`,
      metadata: { brand: v.brand, model: v.model, plate: v.registrationPlate, daysSinceEntry: days },
      dedupKey: `scrap-pendingdism-${v._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

async function checkLowExtractionRate(ctx, parts, sessions, config) {
  if (!config.productivityEnabled) return [];
  const now = new Date();

  const activeSessions = sessions.filter((s) => s.status === 'in_progress');
  if (activeSessions.length === 0) return [];

  const totalExpected = activeSessions.reduce((s, sess) =>
    s + (Array.isArray(sess.piezasPrevistas) ? sess.piezasPrevistas.length : 0), 0);
  if (totalExpected === 0) return [];

  const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const recentParts = parts.filter((p) => new Date(p.createdAt) >= oneWeekAgo);

  if (recentParts.length >= totalExpected * 0.1) return [];

  const a = await emit(ctx, {
    category: 'scrapyard_low_extraction_rate',
    priority: 'medium', level: 'warning',
    title: 'Ritmo de extracción de piezas bajo',
    message: `Se han extraído ${recentParts.length} piezas en la última semana con ${activeSessions.length} despiece(s) activo(s) y ${totalExpected} piezas previstas en total.`,
    entityId: '', entityType: 'business',
    route: '/saas/vertical/desguaces/despiece',
    metadata: { extractedLastWeek: recentParts.length, activeSessions: activeSessions.length, totalExpected },
    dedupKey: `scrap-lowrate-${ctx.businessId}`,
  });
  return a ? [a] : [];
}

// ─── ADS-12: Margen bajo en ventas ───────────────────────────────────────────

async function checkLowMarginSales(ctx, sales, config) {
  if (!config.lowMarginEnabled) return [];
  const alerts = [];

  for (const sale of sales) {
    if (['borrador', 'cancelada'].includes(sale.estado)) continue;
    const net = Number(sale.importeNeto || 0);
    const margin = Number(sale.margen || 0);
    if (net <= 0) continue;

    const marginPct = (margin / net) * 100;
    const isLoss = margin < 0;

    let priority, level;
    if (isLoss) {
      priority = 'high'; level = 'alert';
    } else if (marginPct < config.lowMarginAbsoluteThreshold) {
      priority = 'high'; level = 'alert';
    } else if (marginPct < config.lowMarginThresholdPercent) {
      priority = 'medium'; level = 'warning';
    } else {
      continue;
    }

    const a = await emit(ctx, {
      category: 'scrapyard_low_margin',
      priority, level,
      title: isLoss ? 'Venta con pérdida' : 'Venta con margen bajo',
      message: `Venta ${sale.numVenta || '?'} — ${sale.clientName || '?'}. Importe: ${net.toFixed(2)} €, margen: ${margin.toFixed(2)} € (${marginPct.toFixed(1)}%).`,
      entityId: sale._id, entityType: 'scrapyard_sale',
      route: `/saas/vertical/desguaces/ventas/${sale._id}`,
      metadata: { saleNumber: sale.numVenta, clientName: sale.clientName, totalAmount: net, margin, marginPercent: marginPct, responsible: sale.responsable },
      dedupKey: `scrap-lowmargin-${sale._id}`,
    });
    if (a) alerts.push(a);
  }

  // Margen medio bajo (nivel negocio)
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const completedSales = sales.filter((s) =>
    ['entregada', 'cobrada'].includes(s.estado) || s.estadoPago === 'cobrada'
  ).filter((s) => new Date(s.createdAt) >= monthStart);

  if (completedSales.length >= 3) {
    const totalNet = completedSales.reduce((s, sale) => s + Number(sale.importeNeto || 0), 0);
    const totalMargin = completedSales.reduce((s, sale) => s + Number(sale.margen || 0), 0);
    const avgMarginPct = totalNet > 0 ? (totalMargin / totalNet) * 100 : 0;

    if (avgMarginPct < config.lowMarginThresholdPercent) {
      const a = await emit(ctx, {
        category: 'scrapyard_avg_margin_low',
        priority: 'medium', level: 'warning',
        title: 'Margen medio del mes bajo',
        message: `El margen medio de ventas este mes es del ${avgMarginPct.toFixed(1)}% (${completedSales.length} ventas). Umbral configurado: ${config.lowMarginThresholdPercent}%.`,
        entityId: '', entityType: 'business',
        route: '/saas/vertical/desguaces/ventas',
        metadata: { avgMarginPercent: avgMarginPct, salesCount: completedSales.length, totalNet, totalMargin, threshold: config.lowMarginThresholdPercent },
        dedupKey: `scrap-avgmargin-${ctx.businessId}`,
      });
      if (a) alerts.push(a);
    }
  }

  return alerts;
}

// ─── ADS-13: Reservas expiradas y vendidas no entregadas ─────────────────────

async function checkExpiredReservations(ctx, parts, sales, config) {
  if (!config.reservationExpiredEnabled) return [];
  const now = new Date();
  const alerts = [];

  const salesById = new Map();
  for (const s of sales) { if (s._id) salesById.set(s._id, s); }

  const reservedParts = parts.filter((p) => p.estado === 'reservada' && p.active !== false);

  for (const part of reservedParts) {
    let linkedSale = null;
    for (const s of sales) {
      if (Array.isArray(s.lineas) && s.lineas.some((l) => l.piezaId === part._id || l.partId === part._id)) {
        linkedSale = s;
        break;
      }
    }

    let expired = false;
    let days = daysBetween(part.updatedAt || part.createdAt, now);

    if (linkedSale?.reservaExpira) {
      const expiryDate = new Date(linkedSale.reservaExpira);
      if (expiryDate < now) expired = true;
    }

    if (!expired && days < config.reservationExpiredDays) continue;

    const a = await emit(ctx, {
      category: 'scrapyard_reservation_expired',
      priority: 'high', level: 'alert',
      title: 'Reserva de pieza expirada',
      message: `${part.nombre || '?'} (${part.codigoInterno || '?'}) reservada para ${linkedSale?.clientName || 'desconocido'} desde hace ${days} días.${linkedSale?.reservaExpira ? ` La reserva expiró el ${formatDate(linkedSale.reservaExpira)}.` : ''}`,
      entityId: part._id, entityType: 'scrapyard_part',
      route: `/saas/vertical/desguaces/piezas/${part._id}`,
      metadata: {
        partName: part.nombre, partCode: part.codigoInterno,
        clientName: linkedSale?.clientName, saleId: linkedSale?._id,
        reservationDays: days, expiryDate: linkedSale?.reservaExpira,
      },
      dedupKey: `scrap-resexp-${part._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

async function checkSoldNotDelivered(ctx, sales, config) {
  if (!config.orderPendingShipEnabled) return [];
  const alerts = [];

  for (const sale of sales) {
    if (sale.entrega !== 'recogida') continue;
    if (!['confirmada', 'preparando', 'lista'].includes(sale.estado)) continue;

    const days = getDaysInCurrentStatus(sale);
    if (days < config.orderPendingShipDays) continue;

    const a = await emit(ctx, {
      category: 'scrapyard_sold_not_delivered',
      priority: 'high', level: 'alert',
      title: 'Venta pendiente de recogida',
      message: `Venta ${sale.numVenta || '?'} — ${sale.clientName || '?'} pendiente de recogida desde hace ${days} día(s). Estado: ${sale.estado}.`,
      entityId: sale._id, entityType: 'scrapyard_sale',
      route: `/saas/vertical/desguaces/ventas/${sale._id}`,
      metadata: { saleNumber: sale.numVenta, clientName: sale.clientName, status: sale.estado, daysInStatus: days, responsible: sale.responsable },
      dedupKey: `scrap-notdeliv-${sale._id}`,
    });
    if (a) alerts.push(a);
  }
  return alerts;
}

// ─── Main runner ─────────────────────────────────────────────────────────────

export async function runScrapyardAlerts(ctx, config, vehicles, parts, sessions, sales, documents) {
  if (!config.enabled) return [];
  const start = Date.now();
  const results = [];

  try {
    // ADS-03: Baja pendiente + certificado destrucción
    results.push(...await checkPendingDeregistration(ctx, vehicles, config));

    // ADS-04: Pieza sin precio
    results.push(...await checkPartNoPrice(ctx, parts, config));

    // ADS-05: Pieza sin ubicación
    results.push(...await checkPartNoLocation(ctx, parts, config));

    // ADS-06: Venta sin cobro
    results.push(...await checkScrapyardSaleUnpaid(ctx, sales, config));

    // ADS-07: Pedido sin enviar
    results.push(...await checkOrderPendingShip(ctx, sales, config));

    // ADS-08: Stock parado
    results.push(...await checkStalePartStock(ctx, parts, config));

    // ADS-09: Documentación obligatoria
    results.push(...await checkVehicleMissingDocs(ctx, vehicles, documents, config));

    // ADS-10: Compra sin justificar
    const financeDocs = []; // financeDocs are passed via vehicles.associatedCosts
    results.push(...await checkUnjustifiedPurchase(ctx, vehicles, financeDocs, config));

    // ADS-11: Productividad
    results.push(...await checkStaleDismantling(ctx, sessions, config));
    results.push(...await checkVehiclePendingDismantling(ctx, vehicles, sessions, config));
    results.push(...await checkLowExtractionRate(ctx, parts, sessions, config));

    // ADS-12: Margen bajo
    results.push(...await checkLowMarginSales(ctx, sales, config));

    // ADS-13: Reservas expiradas + vendidas no entregadas
    results.push(...await checkExpiredReservations(ctx, parts, sales, config));
    results.push(...await checkSoldNotDelivered(ctx, sales, config));
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message, businessId: ctx.businessId }, 'Error en reglas de alerta desguace');
  }

  const elapsed = Date.now() - start;
  const validResults = results.filter(Boolean);
  if (validResults.length > 0) {
    logger.info({ tag: TAG, businessId: ctx.businessId, alertCount: validResults.length, elapsedMs: elapsed }, 'Alertas desguace generadas');
  }

  return validResults;
}

// ─── Summary (on-demand, no emissions) ───────────────────────────────────────

export function computeScrapyardAlertSummary(vehicles, parts, sessions, sales, config) {
  const now = new Date();
  const scrapVehicles = vehicles.filter(isScrapyardVehicle);

  const vehiclesPendingDeregistration = scrapVehicles.filter((v) => {
    if (v.status === 'scrapped') return false;
    const hasBaja = BAJA_DOC_TYPES.some((t) => getVehicleDocTypes(v).has(t));
    return !hasBaja && daysBetween(getEntryDate(v), now) >= config.pendingDeregistrationDays;
  }).length;

  const partsWithoutPrice = parts.filter((p) =>
    p.estado === 'disponible' && p.active !== false && (!p.precioVenta || Number(p.precioVenta) <= 0)
    && daysBetween(p.createdAt, now) >= config.partNoPriceGraceDays
  ).length;

  const partsWithoutLocation = parts.filter((p) =>
    p.estado === 'disponible' && p.active !== false && !p.ubicacion && !p.zona && !p.estanteria
    && daysBetween(p.createdAt, now) >= config.partNoLocationGraceDays
  ).length;

  const salesUnpaid = sales.filter((s) =>
    !['borrador', 'cancelada'].includes(s.estado) && s.estadoPago !== 'cobrada'
    && daysBetween(s.createdAt, now) >= config.saleUnpaidDays
  );
  const totalPendingAmount = salesUnpaid.reduce((sum, s) => {
    const paid = Array.isArray(s.pagos) ? s.pagos.reduce((a, p) => a + Number(p.importe || 0), 0) : 0;
    return sum + Math.max(0, Number(s.importeConIva || 0) - paid);
  }, 0);

  const staleParts = { over30: 0, over60: 0, over90: 0 };
  for (const p of parts) {
    if (p.estado !== 'disponible' || p.active === false) continue;
    const days = daysBetween(p.createdAt, now);
    if (days >= 90) staleParts.over90++;
    else if (days >= 60) staleParts.over60++;
    else if (days >= 30) staleParts.over30++;
  }

  const staleDismantlings = sessions.filter((s) => {
    if (s.status !== 'in_progress') return false;
    let lastActivity = s.updatedAt || s.createdAt;
    if (Array.isArray(s.historial)) {
      for (const h of s.historial) { if (h.fecha && h.fecha > lastActivity) lastActivity = h.fecha; }
    }
    return daysBetween(lastActivity, now) >= config.dismantlingStaleDays;
  }).length;

  const expiredReservations = parts.filter((p) => p.estado === 'reservada' && p.active !== false).length;

  const completedSales = sales.filter((s) => ['entregada'].includes(s.estado) || s.estadoPago === 'cobrada');
  const totalNet = completedSales.reduce((s, sale) => s + Number(sale.importeNeto || 0), 0);
  const totalMargin = completedSales.reduce((s, sale) => s + Number(sale.margen || 0), 0);
  const avgMarginPercent = totalNet > 0 ? (totalMargin / totalNet) * 100 : 0;

  return {
    updatedAt: now.toISOString(),
    documentation: {
      vehiclesPendingDeregistration,
      vehiclesWithMissingDocs: 0,
      unjustifiedPurchases: 0,
    },
    operations: {
      partsWithoutPrice,
      partsWithoutLocation,
      ordersPendingShip: sales.filter((s) => s.entrega === 'envio' && !['borrador', 'entregada', 'cancelada'].includes(s.estado)).length,
      staleDismantlings,
      vehiclesPendingDismantling: scrapVehicles.filter((v) => !v.dismantlingStartedAt && ['available', 'workshop'].includes(v.status)).length,
    },
    economic: {
      salesUnpaid: salesUnpaid.length,
      totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      lowMarginSales: 0,
      avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
    },
    commercial: {
      staleStock: staleParts,
      expiredReservations,
    },
  };
}
