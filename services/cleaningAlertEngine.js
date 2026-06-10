/**
 * Cleaning Alert Engine — Motor de alertas operativas vertical limpieza
 *
 * Ciclo rápido (120s default) independiente del motor genérico (1h).
 * Reglas: servicio sin cubrir, trabajador ausente, fichaje pendiente,
 * incidencia abierta/crítica, impago, contrato, material, retraso ruta, exceso horas.
 *
 * Usa emitGlobalAlert() del alertEmitter para persistencia y routing unificados.
 */

import {
  BUSINESSES_DB,
  ensureDatabase,
  findAccountByUserId,
  getAllDocuments,
  getCatalogDbName,
  getCleaningDbName,
  getClockinsDbName,
  getFinanceDbName,
  getInvoicesDbName,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { broadcastToBusiness, broadcastToUser } from './sseService.js';
import logger from './logger.js';
import { canEmitCleaningAlerts } from './moduleAlertUtils.js';

const TAG = 'CLEANING_ALERT_ENGINE';
const DEFAULT_INTERVAL_MS = 120_000;
const STARTUP_DELAY_MS = 25_000;
const DEDUP_WINDOW_MS = 5 * 60_000;
const ESCALATION_MEDIUM_MS = 15 * 60_000;
const ESCALATION_HIGH_MS = 30 * 60_000;
const fakeReq = { headers: {} };

const dedupCache = new Map();
const escalationTracker = new Map();
let cycleCount = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function todayStr() { return new Date().toISOString().slice(0, 10); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function mondayStr() { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }

function parseTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchDocsOfType(dbName, type) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch { return []; }
}

async function fetchAllDocs(dbName) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
  } catch { return []; }
}

// ─── Alert Classification ────────────────────────────────────────────────────

const ALERT_CLASSIFICATION = {
  cleaning_service_uncovered:     { defaultPriority: 'high',   escalable: false },
  cleaning_worker_absent:         { defaultPriority: 'high',   escalable: false },
  cleaning_clockin_pending:       { defaultPriority: 'medium', escalable: true  },
  cleaning_incident_critical:     { defaultPriority: 'high',   escalable: false },
  cleaning_incident_open:         { defaultPriority: 'medium', escalable: true  },
  cleaning_client_unpaid:         { defaultPriority: 'medium', escalable: true  },
  cleaning_contract_renewal:      { defaultPriority: 'medium', escalable: true  },
  cleaning_material_critical:     { defaultPriority: 'medium', escalable: true  },
  cleaning_material_depleted:     { defaultPriority: 'high',   escalable: false },
  cleaning_route_delayed:         { defaultPriority: 'medium', escalable: true  },
  cleaning_excess_hours:          { defaultPriority: 'medium', escalable: true  },
  cleaning_service_overtime:      { defaultPriority: 'low',    escalable: true  },
  cleaning_no_photos:             { defaultPriority: 'low',    escalable: false },
  cleaning_incomplete_checklist:  { defaultPriority: 'low',    escalable: true  },
};

// ─── Config reader ───────────────────────────────────────────────────────────

export function getCleaningAlertConfig(account) {
  const cfg = account?.alertConfig?.cleaning || {};
  return {
    enabled: cfg.enabled !== false,
    serviceUncoveredEnabled: cfg.serviceUncoveredEnabled !== false,
    serviceUncoveredHoursBefore: Number(cfg.serviceUncoveredHoursBefore || 2),
    workerAbsentEnabled: cfg.workerAbsentEnabled !== false,
    workerAbsentGraceMinutes: Number(cfg.workerAbsentGraceMinutes || 15),
    clockinPendingEnabled: cfg.clockinPendingEnabled !== false,
    clockinPendingMinutesBefore: Number(cfg.clockinPendingMinutesBefore || 10),
    incidentOpenEnabled: cfg.incidentOpenEnabled !== false,
    incidentOpenEscalationHours: Number(cfg.incidentOpenEscalationHours || 4),
    incidentCriticalTypes: cfg.incidentCriticalTypes || ['ausencia', 'urgencia_extra', 'acceso_no_permitido'],
    clientUnpaidEnabled: cfg.clientUnpaidEnabled !== false,
    clientUnpaidGraceDays: Number(cfg.clientUnpaidGraceDays || 15),
    clientUnpaidHighThresholdDays: Number(cfg.clientUnpaidHighThresholdDays || 30),
    contractRenewalEnabled: cfg.contractRenewalEnabled !== false,
    contractRenewalDays: Number(cfg.contractRenewalDays || 30),
    contractRenewalHighDays: Number(cfg.contractRenewalHighDays || 7),
    materialCriticalEnabled: cfg.materialCriticalEnabled !== false,
    materialCriticalDaysLookahead: Number(cfg.materialCriticalDaysLookahead || 7),
    routeDelayEnabled: cfg.routeDelayEnabled !== false,
    routeDelayThresholdMinutes: Number(cfg.routeDelayThresholdMinutes || 15),
    routeDelayHighMinutes: Number(cfg.routeDelayHighMinutes || 30),
    excessHoursEnabled: cfg.excessHoursEnabled !== false,
    excessHoursWeeklyMax: Number(cfg.excessHoursWeeklyMax || 40),
    excessHoursDailyMax: Number(cfg.excessHoursDailyMax || 10),
    excessHoursWarningPercent: Number(cfg.excessHoursWarningPercent || 90),
    noPhotosEnabled: cfg.noPhotosEnabled ?? false,
    incompleteChecklistEnabled: cfg.incompleteChecklistEnabled ?? false,
    serviceOvertimeEnabled: cfg.serviceOvertimeEnabled !== false,
    serviceOvertimeThresholdMinutes: Number(cfg.serviceOvertimeThresholdMinutes || 30),
    engineIntervalSeconds: Number(cfg.engineIntervalSeconds || 120),
  };
}

// ─── Emit + Route ────────────────────────────────────────────────────────────

async function emitCleaningAlert({ userId, businessId, category, dedupKey, priority, title, message, entityId, entityType, route, metadata, targetRoles }) {
  const key = `calert:${category}:${dedupKey}`;
  if (isDuplicate(key)) return null;
  const cls = ALERT_CLASSIFICATION[category] || {};
  const basePriority = priority || cls.defaultPriority || 'medium';
  const { priority: finalPriority, escalated } = applyEscalation(key, basePriority, cls.escalable);
  const level = finalPriority === 'high' ? 'alert' : finalPriority === 'medium' ? 'warning' : 'info';

  const result = await emitGlobalAlert({
    businessId, userId, source: 'limpieza', ruleId: category, category,
    priority: finalPriority, level, title, message,
    entityId: entityId || '', entityType: entityType || '',
    route: route || '', dedupKey,
    metadata: { ...metadata, targetRoles, escalated },
  });

  if (result && businessId) {
    const payload = {
      id: result.id || key, category, priority: finalPriority, escalated,
      title, message, metadata, route, targetRoles, createdAt: new Date().toISOString(),
    };
    broadcastToBusiness(businessId, 'cleaning:alert_triggered', payload);
    if (finalPriority === 'high' && metadata?.workerId) {
      broadcastToUser(metadata.workerId, 'cleaning:alert_triggered', payload);
    }
  }
  return result;
}

// ─── RULES ──────────────────────────────────────────────────────────────────

// ALLP-04: Servicio sin cubrir
function checkServiceUncovered(services, config) {
  if (!config.serviceUncoveredEnabled) return [];
  const now = Date.now(), today = todayStr(), tomorrow = tomorrowStr();
  const alerts = [];

  for (const svc of services) {
    if (svc.status !== 'pending' || (svc.assignedTo && svc.assignedTo.trim())) continue;
    if (svc.date !== today && svc.date !== tomorrow) continue;

    const svcTime = parseTime(svc.date, svc.time);
    const hoursUntil = svcTime ? (svcTime.getTime() - now) / 3_600_000 : 999;
    let prio = 'medium';
    if (svc.date === today && hoursUntil <= 0) prio = 'high';
    else if (svc.date === today && hoursUntil <= config.serviceUncoveredHoursBefore) prio = 'high';

    alerts.push({
      category: 'cleaning_service_uncovered', dedupKey: `uncovered-${svc._id}`, priority: prio,
      title: 'Servicio sin cubrir',
      message: `Servicio ${svc.serviceNumber || ''} para ${svc.clientName || '?'} (${svc.date} ${svc.time || ''}) no tiene trabajador asignado.`,
      entityId: svc._id, entityType: 'cleaning_service',
      route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
      metadata: { serviceNumber: svc.serviceNumber, clientName: svc.clientName, address: svc.address, date: svc.date, time: svc.time, hoursUntilService: Math.round(hoursUntil * 10) / 10, cleaningType: svc.cleaningType },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-05: Trabajador ausente
function checkWorkerAbsent(services, clockins, config) {
  if (!config.workerAbsentEnabled) return [];
  const now = Date.now(), today = todayStr(), alerts = [];
  const byWorker = new Map();

  for (const svc of services) {
    if (svc.date !== today || !svc.assignedTo) continue;
    if (!byWorker.has(svc.assignedTo)) byWorker.set(svc.assignedTo, []);
    byWorker.get(svc.assignedTo).push(svc);
  }

  const todayClockins = new Set(clockins.filter((c) => c.type === 'clockin' && c.date === today).map((c) => c.user_id));

  for (const [workerId, workerSvcs] of byWorker) {
    const sorted = workerSvcs.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const first = sorted[0];
    const svcTime = parseTime(first.date, first.time);
    if (!svcTime) continue;
    const graceEnd = svcTime.getTime() + config.workerAbsentGraceMinutes * 60_000;
    if (now < graceEnd) continue;

    const exec = first.execution || {};
    if (exec.checkInAt || exec.status === 'checked_in' || exec.status === 'in_progress' || exec.status === 'completed' || exec.status === 'validated') continue;

    const hasGeneralClockin = todayClockins.has(workerId);
    const minutesLate = Math.floor((now - svcTime.getTime()) / 60_000);

    alerts.push({
      category: 'cleaning_worker_absent', dedupKey: `absent-${workerId}-${today}`,
      priority: hasGeneralClockin ? 'medium' : 'high',
      title: hasGeneralClockin ? 'Trabajador fichó pero no en servicio' : 'Trabajador ausente',
      message: `${first.assignedToName || workerId} no se ha presentado. Servicio ${first.serviceNumber || ''} para ${first.clientName || '?'} a las ${first.time || '?'}. ${workerSvcs.length} servicio(s) afectado(s).`,
      entityId: workerId, entityType: 'team_member', route: '/saas/clockins',
      metadata: { workerId, workerName: first.assignedToName, serviceId: first._id, serviceNumber: first.serviceNumber, clientName: first.clientName, scheduledTime: first.time, hasGeneralClockin, minutesOverdue: minutesLate, affectedServices: workerSvcs.length },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-06: Fichaje pendiente
function checkClockinPending(services, config) {
  if (!config.clockinPendingEnabled) return [];
  const now = Date.now(), today = todayStr(), alerts = [];

  for (const svc of services) {
    if (svc.date !== today || svc.status !== 'assigned' || !svc.assignedTo) continue;
    const exec = svc.execution || {};
    if (exec.checkInAt || exec.status !== 'not_started') continue;

    const svcTime = parseTime(svc.date, svc.time);
    if (!svcTime) continue;
    const minutesUntil = (svcTime.getTime() - now) / 60_000;
    if (minutesUntil > config.clockinPendingMinutesBefore || minutesUntil < -config.workerAbsentGraceMinutes) continue;

    alerts.push({
      category: 'cleaning_clockin_pending', dedupKey: `clockin-${svc._id}`, priority: 'medium',
      title: 'Fichaje pendiente',
      message: `${svc.assignedToName || 'Trabajador'} no ha fichado entrada. Servicio ${svc.serviceNumber || ''} en ${svc.clientName || '?'} ${minutesUntil > 0 ? `empieza en ${Math.round(minutesUntil)} min` : `debería haber empezado hace ${Math.abs(Math.round(minutesUntil))} min`}.`,
      entityId: svc._id, entityType: 'cleaning_service',
      route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
      metadata: { workerId: svc.assignedTo, workerName: svc.assignedToName, serviceNumber: svc.serviceNumber, clientName: svc.clientName, scheduledTime: svc.time, minutesUntilStart: Math.round(minutesUntil) },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-07: Incidencia abierta / crítica
function checkIncidentsOpen(incidents, config) {
  if (!config.incidentOpenEnabled) return [];
  const now = Date.now(), alerts = [];

  for (const inc of incidents) {
    if (['resolved', 'cancelled', 'closed'].includes(inc.status)) continue;
    const created = new Date(inc.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const hoursOpen = (now - created.getTime()) / 3_600_000;

    if (config.incidentCriticalTypes.includes(inc.incidentType)) {
      alerts.push({
        category: 'cleaning_incident_critical', dedupKey: `inc-crit-${inc._id}`, priority: 'high',
        title: 'Incidencia crítica abierta',
        message: `Incidencia ${inc.incidentNumber || ''} (${inc.incidentType}) en ${inc.clientName || '?'}. Prioridad: ${inc.priority || 'N/A'}.`,
        entityId: inc._id, entityType: 'cleaning_incident',
        route: `/saas/vertical/limpieza/incidencias?incidentId=${inc._id}`,
        metadata: { incidentNumber: inc.incidentNumber, incidentType: inc.incidentType, priority: inc.priority, clientName: inc.clientName, workerName: inc.workerName, serviceId: inc.serviceId, hoursOpen: Math.round(hoursOpen * 10) / 10, workerId: inc.workerId },
        targetRoles: ['manager', 'owner', 'admin'],
      });
      continue;
    }

    if (hoursOpen >= config.incidentOpenEscalationHours) {
      const prio = hoursOpen >= config.incidentOpenEscalationHours * 2 ? 'high' : 'medium';
      alerts.push({
        category: 'cleaning_incident_open', dedupKey: `inc-open-${inc._id}`, priority: prio,
        title: 'Incidencia sin resolver',
        message: `Incidencia ${inc.incidentNumber || ''} (${inc.incidentType}) abierta hace ${Math.round(hoursOpen)}h. Cliente: ${inc.clientName || '?'}.`,
        entityId: inc._id, entityType: 'cleaning_incident',
        route: `/saas/vertical/limpieza/incidencias?incidentId=${inc._id}`,
        metadata: { incidentNumber: inc.incidentNumber, incidentType: inc.incidentType, priority: inc.priority, clientName: inc.clientName, workerName: inc.workerName, hoursOpen: Math.round(hoursOpen * 10) / 10, workerId: inc.workerId },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    }
  }
  return alerts;
}

// ALLP-08: Cliente con impago
function checkClientUnpaid(services, financeDocs, invoices, config) {
  if (!config.clientUnpaidEnabled) return [];
  const now = new Date(), alerts = [];
  const activeClients = new Map();

  for (const svc of services) {
    if (svc.status === 'cancelled') continue;
    const key = svc.clientName || '';
    if (!key) continue;
    if (!activeClients.has(key)) activeClients.set(key, { services: 0, nextDate: null });
    const entry = activeClients.get(key);
    entry.services++;
    if (!entry.nextDate || svc.date > todayStr()) entry.nextDate = svc.date;
  }

  const overduePayments = financeDocs.filter((d) => d.type === 'cobro' && d.status === 'pending' && d.dueDate && new Date(d.dueDate) < now);
  const overdueInvoices = invoices.filter((i) => i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now);

  const clientDebt = new Map();
  for (const doc of [...overduePayments, ...overdueInvoices]) {
    const cn = doc.clientName || doc.customerName || '';
    if (!cn || !activeClients.has(cn)) continue;
    if (!clientDebt.has(cn)) clientDebt.set(cn, { total: 0, maxDaysLate: 0, items: [] });
    const entry = clientDebt.get(cn);
    const amount = Number(doc.totalAmount || doc.total || 0);
    const daysLate = Math.floor((now.getTime() - new Date(doc.dueDate).getTime()) / 86_400_000);
    entry.total += amount;
    if (daysLate > entry.maxDaysLate) entry.maxDaysLate = daysLate;
    entry.items.push({ id: doc._id, number: doc.invoiceNumber || '', amount, dueDate: doc.dueDate, daysLate });
  }

  for (const [clientName, debt] of clientDebt) {
    if (debt.maxDaysLate < config.clientUnpaidGraceDays) continue;
    const clientInfo = activeClients.get(clientName) || { services: 0 };
    const prio = debt.maxDaysLate >= config.clientUnpaidHighThresholdDays ? 'high' : 'medium';

    alerts.push({
      category: 'cleaning_client_unpaid', dedupKey: `unpaid-${clientName}`, priority: prio,
      title: 'Cliente con impago',
      message: `${clientName} tiene ${debt.total.toFixed(2)}€ pendientes (${debt.maxDaysLate} días). Servicios activos: ${clientInfo.services}.`,
      entityId: clientName, entityType: 'client', route: '/saas/finance',
      metadata: { clientName, totalPending: debt.total, daysLate: debt.maxDaysLate, activeServicesCount: clientInfo.services, unpaidItems: debt.items.slice(0, 5) },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-09: Contrato próximo a renovar
function checkContractRenewal(services, members, config) {
  if (!config.contractRenewalEnabled) return [];
  const now = new Date(), alerts = [];

  for (const svc of services) {
    if (!svc.recurrence?.type || svc.recurrence.type === 'none') continue;
    if (!svc.recurrence.endDate) continue;
    const endDate = new Date(svc.recurrence.endDate);
    if (Number.isNaN(endDate.getTime())) continue;
    const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft > config.contractRenewalDays) continue;

    const prio = daysLeft <= config.contractRenewalHighDays ? 'high' : daysLeft <= 0 ? 'high' : 'medium';
    const label = daysLeft <= 0 ? `vencido hace ${Math.abs(daysLeft)} días` : `vence en ${daysLeft} días`;

    alerts.push({
      category: 'cleaning_contract_renewal', dedupKey: `renewal-svc-${svc._id}`, priority: prio,
      title: 'Contrato próximo a renovar',
      message: `Servicio recurrente para ${svc.clientName || '?'} (${svc.cleaningType || ''}) ${label} (${svc.recurrence.endDate}).`,
      entityId: svc._id, entityType: 'cleaning_service',
      route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
      metadata: { serviceNumber: svc.serviceNumber, clientName: svc.clientName, cleaningType: svc.cleaningType, recurrenceType: svc.recurrence.type, endDate: svc.recurrence.endDate, daysUntilExpiry: daysLeft },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }

  const cleaningWorkerIds = new Set(services.filter((s) => s.assignedTo).map((s) => s.assignedTo));
  for (const member of members) {
    if (!member.contractEndDate || member.status === 'inactive') continue;
    if (!cleaningWorkerIds.has(member.user_id)) continue;
    const endDate = new Date(member.contractEndDate);
    if (Number.isNaN(endDate.getTime())) continue;
    const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft > config.contractRenewalDays || daysLeft < 0) continue;

    alerts.push({
      category: 'cleaning_contract_renewal', dedupKey: `renewal-member-${member.user_id}`, priority: daysLeft <= config.contractRenewalHighDays ? 'high' : 'medium',
      title: 'Contrato laboral próximo a vencer',
      message: `El contrato de ${member.name || member.email || ''} vence en ${daysLeft} días (${member.contractEndDate}).`,
      entityId: member.user_id, entityType: 'team_member', route: '/saas/team',
      metadata: { memberName: member.name, contractEndDate: member.contractEndDate, daysUntilExpiry: daysLeft, workerId: member.user_id },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-10: Material crítico / agotado
function checkMaterialCritical(materials, upcomingServicesCount, config) {
  if (!config.materialCriticalEnabled) return [];
  const alerts = [];

  for (const mat of materials) {
    if (!mat.active) continue;
    const qty = Number(mat.stockQuantity || 0);
    const min = Number(mat.minStock || 0);
    if (min <= 0 && qty > 0) continue;

    const avgConsumption = Number(mat.averageConsumptionPerService || 1);
    const estimatedNeed = upcomingServicesCount * avgConsumption;
    const coverageDays = estimatedNeed > 0 ? Math.round((qty / estimatedNeed) * config.materialCriticalDaysLookahead) : 999;

    if (qty <= 0 && min > 0) {
      alerts.push({
        category: 'cleaning_material_depleted', dedupKey: `matdep-${mat._id}`, priority: 'high',
        title: 'Material de limpieza agotado',
        message: `"${mat.name}" está agotado. ${upcomingServicesCount} servicios planificados.`,
        entityId: mat._id, entityType: 'catalog_item', route: '/saas/vertical/limpieza/materiales',
        metadata: { materialName: mat.name, sku: mat.sku, stockQuantity: 0, minStock: min, upcomingServicesCount, coverageDays: 0 },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    } else if (qty > 0 && min > 0 && qty <= min) {
      alerts.push({
        category: 'cleaning_material_critical', dedupKey: `matcrit-${mat._id}`, priority: coverageDays < config.materialCriticalDaysLookahead ? 'high' : 'medium',
        title: 'Material de limpieza bajo mínimo',
        message: `"${mat.name}" tiene ${qty} ${mat.unit || 'ud'} (mínimo: ${min}). Cobertura estimada: ${coverageDays} días.`,
        entityId: mat._id, entityType: 'catalog_item', route: '/saas/vertical/limpieza/materiales',
        metadata: { materialName: mat.name, sku: mat.sku, stockQuantity: qty, minStock: min, upcomingServicesCount, coverageDays, estimatedConsumption: estimatedNeed },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    }
  }
  return alerts;
}

// ALLP-11: Retraso en ruta
function checkRouteDelayed(routes, config) {
  if (!config.routeDelayEnabled) return [];
  const now = new Date(), today = todayStr(), alerts = [];

  for (const route of routes) {
    if (route.status !== 'active' || route.date !== today) continue;
    const entries = (route.entries || []).sort((a, b) => (a.order || 0) - (b.order || 0));
    let accumulatedDelay = 0;
    let currentEntry = null;
    let currentIdx = -1;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.actualStartTime && e.estimatedStartTime) {
        const actual = parseTime(today, e.actualStartTime);
        const estimated = parseTime(today, e.estimatedStartTime);
        if (actual && estimated) {
          accumulatedDelay = Math.max(accumulatedDelay, (actual.getTime() - estimated.getTime()) / 60_000);
        }
      } else if (!e.actualStartTime && e.estimatedStartTime && e.status === 'pending') {
        const estimated = parseTime(today, e.estimatedStartTime);
        if (estimated && now > estimated) {
          const delay = (now.getTime() - estimated.getTime()) / 60_000;
          if (delay > accumulatedDelay) accumulatedDelay = delay;
          if (!currentEntry) { currentEntry = e; currentIdx = i; }
        }
      }
    }

    if (accumulatedDelay < config.routeDelayThresholdMinutes) continue;
    const prio = accumulatedDelay >= config.routeDelayHighMinutes ? 'high' : 'medium';
    const remaining = entries.filter((e) => e.status === 'pending').length;

    alerts.push({
      category: 'cleaning_route_delayed', dedupKey: `routedel-${route._id}`, priority: prio,
      title: 'Retraso en ruta de limpieza',
      message: `Ruta de ${route.workerName || '?'}: retraso de ${Math.round(accumulatedDelay)} min.${currentEntry ? ` Servicio actual: ${currentEntry.clientName || '?'} (previsto ${currentEntry.estimatedStartTime}).` : ''}`,
      entityId: route._id, entityType: 'cleaning_route',
      route: `/saas/vertical/limpieza/rutas?routeId=${route._id}`,
      metadata: { routeId: route._id, workerId: route.workerId, workerName: route.workerName, date: route.date, delayMinutes: Math.round(accumulatedDelay), currentEntryIndex: currentIdx, currentClientName: currentEntry?.clientName, remainingEntries: remaining },
      targetRoles: ['manager', 'owner', 'admin'],
    });
  }
  return alerts;
}

// ALLP-12: Exceso de horas
function checkExcessHours(services, clockins, config) {
  if (!config.excessHoursEnabled) return [];
  const now = new Date(), today = todayStr(), monday = mondayStr(), alerts = [];
  const workerHours = new Map();

  for (const svc of services) {
    if (!svc.assignedTo) continue;
    const exec = svc.execution || {};
    if (!exec.checkInAt) continue;
    const checkIn = new Date(exec.checkInAt);
    const checkOut = exec.checkOutAt ? new Date(exec.checkOutAt) : (exec.status === 'checked_in' || exec.status === 'in_progress' ? now : null);
    if (!checkOut) continue;
    let minutes = (checkOut.getTime() - checkIn.getTime()) / 60_000;
    for (const p of exec.pauseLog || []) {
      if (p.startAt && p.endAt) minutes -= Math.max(0, (new Date(p.endAt).getTime() - new Date(p.startAt).getTime()) / 60_000);
    }
    if (minutes <= 0) continue;

    if (!workerHours.has(svc.assignedTo)) workerHours.set(svc.assignedTo, { name: svc.assignedToName, today: 0, week: 0, svcs: 0 });
    const entry = workerHours.get(svc.assignedTo);
    if (svc.date === today) entry.today += minutes;
    if (svc.date >= monday) entry.week += minutes;
    entry.svcs++;
  }

  for (const c of clockins) {
    if (c.type !== 'clockin' || !c.user_id) continue;
    for (const e of c.entries || []) {
      if (!e.clock_in) continue;
      const ci = new Date(e.clock_in);
      const co = e.clock_out ? new Date(e.clock_out) : (c.status === 'active' ? now : null);
      if (!co) continue;
      let mins = (co.getTime() - ci.getTime()) / 60_000;
      if (e.break_start && e.break_end) mins -= Math.max(0, (new Date(e.break_end).getTime() - new Date(e.break_start).getTime()) / 60_000);
      if (mins <= 0) continue;
      if (!workerHours.has(c.user_id)) workerHours.set(c.user_id, { name: '', today: 0, week: 0, svcs: 0 });
      const entry = workerHours.get(c.user_id);
      if (c.date === today) entry.today = Math.max(entry.today, mins);
      if (c.date >= monday) entry.week = Math.max(entry.week, entry.week || mins);
    }
  }

  for (const [workerId, data] of workerHours) {
    const hoursToday = data.today / 60;
    const hoursWeek = data.week / 60;
    const dailyPct = (hoursToday / config.excessHoursDailyMax) * 100;
    const weeklyPct = (hoursWeek / config.excessHoursWeeklyMax) * 100;

    if (hoursToday >= config.excessHoursDailyMax) {
      alerts.push({
        category: 'cleaning_excess_hours', dedupKey: `excess-${workerId}-daily-${today}`, priority: 'high',
        title: 'Exceso de jornada diaria',
        message: `${data.name || workerId} lleva ${hoursToday.toFixed(1)}h hoy (máximo: ${config.excessHoursDailyMax}h). ${Math.round(dailyPct)}% de la jornada.`,
        entityId: workerId, entityType: 'team_member', route: '/saas/clockins',
        metadata: { workerId, workerName: data.name, hoursToday: Math.round(hoursToday * 10) / 10, hoursWeek: Math.round(hoursWeek * 10) / 10, dailyMax: config.excessHoursDailyMax, weeklyMax: config.excessHoursWeeklyMax, percentDailyUsed: Math.round(dailyPct), period: 'diario' },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    } else if (dailyPct >= config.excessHoursWarningPercent) {
      alerts.push({
        category: 'cleaning_excess_hours', dedupKey: `excess-${workerId}-dailywarn-${today}`, priority: 'medium',
        title: 'Jornada diaria cerca del límite',
        message: `${data.name || workerId} lleva ${hoursToday.toFixed(1)}h hoy (${Math.round(dailyPct)}% del máximo de ${config.excessHoursDailyMax}h).`,
        entityId: workerId, entityType: 'team_member', route: '/saas/clockins',
        metadata: { workerId, workerName: data.name, hoursToday: Math.round(hoursToday * 10) / 10, dailyMax: config.excessHoursDailyMax, percentDailyUsed: Math.round(dailyPct), period: 'diario' },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    }

    if (hoursWeek >= config.excessHoursWeeklyMax) {
      alerts.push({
        category: 'cleaning_excess_hours', dedupKey: `excess-${workerId}-weekly-${monday}`, priority: 'high',
        title: 'Exceso de jornada semanal',
        message: `${data.name || workerId} lleva ${hoursWeek.toFixed(1)}h esta semana (máximo: ${config.excessHoursWeeklyMax}h). ${Math.round(weeklyPct)}%.`,
        entityId: workerId, entityType: 'team_member', route: '/saas/clockins',
        metadata: { workerId, workerName: data.name, hoursWeek: Math.round(hoursWeek * 10) / 10, weeklyMax: config.excessHoursWeeklyMax, percentWeeklyUsed: Math.round(weeklyPct), period: 'semanal' },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    } else if (weeklyPct >= config.excessHoursWarningPercent) {
      alerts.push({
        category: 'cleaning_excess_hours', dedupKey: `excess-${workerId}-weeklywarn-${monday}`, priority: 'medium',
        title: 'Jornada semanal cerca del límite',
        message: `${data.name || workerId} lleva ${hoursWeek.toFixed(1)}h esta semana (${Math.round(weeklyPct)}% del máximo de ${config.excessHoursWeeklyMax}h).`,
        entityId: workerId, entityType: 'team_member', route: '/saas/clockins',
        metadata: { workerId, workerName: data.name, hoursWeek: Math.round(hoursWeek * 10) / 10, weeklyMax: config.excessHoursWeeklyMax, percentWeeklyUsed: Math.round(weeklyPct), period: 'semanal' },
        targetRoles: ['manager', 'owner', 'admin'],
      });
    }
  }
  return alerts;
}

// ─── ENGINE LOOP ────────────────────────────────────────────────────────────

async function getAllBusinesses() {
  try {
    const docs = await fetchAllDocs(BUSINESSES_DB);
    return docs.filter((d) => d.type === 'business' && !d.deletedAt);
  } catch { return []; }
}

async function runForBusiness(business) {
  const ownerId = business.owner_user_id;
  if (!ownerId) return 0;
  const account = await findAccountByUserId(fakeReq, ownerId);
  if (!account) return 0;
  const config = getCleaningAlertConfig(account);
  if (!config.enabled) return 0;

  const businessId = business._id?.replace('business:', '') || '';
  const members = Array.isArray(business.members) ? business.members : [];
  const ctx = { userId: ownerId, businessId };
  const today = todayStr(), tomorrow = tomorrowStr();

  const [cleaningDocs, clockinDocs, financeDocs, invoiceDocs, catalogDocs] = await Promise.all([
    fetchAllDocs(getCleaningDbName()).catch(() => []),
    fetchAllDocs(getClockinsDbName()).catch(() => []),
    fetchAllDocs(getFinanceDbName()).then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []),
    fetchDocsOfType(getInvoicesDbName(), 'client_invoice').then((d) => d.filter((i) => i.user_id === ownerId)).catch(() => []),
    fetchDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === ownerId && i.active && (i.subtype === 'cleaning_material' || (i.materialType && ['detergent', 'disinfectant', 'degreaser', 'glass_cleaner', 'floor_cleaner', 'utensil', 'consumable', 'protective'].includes(i.materialType))))).catch(() => []),
  ]);

  const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === ownerId);
  const todayTomorrowSvcs = services.filter((s) => s.date === today || s.date === tomorrow);
  const routes = cleaningDocs.filter((d) => d.type === 'cleaning_route' && d.user_id === ownerId);
  const incidents = cleaningDocs.filter((d) => d.type === 'cleaning_incident' && d.user_id === ownerId);
  const workers = cleaningDocs.filter((d) => d.type === 'cleaning_worker' && d.user_id === ownerId);

  if (!canEmitCleaningAlerts({ services, routes, workers })) return 0;

  const lookAheadDate = new Date(); lookAheadDate.setDate(lookAheadDate.getDate() + config.materialCriticalDaysLookahead);
  const lookAheadStr = lookAheadDate.toISOString().slice(0, 10);
  const upcomingServicesCount = services.filter((s) => s.date >= today && s.date <= lookAheadStr && s.status !== 'cancelled').length;

  const allAlerts = [
    ...checkServiceUncovered(todayTomorrowSvcs, config),
    ...checkWorkerAbsent(services, clockinDocs, config),
    ...checkClockinPending(services, config),
    ...checkIncidentsOpen(incidents, config),
    ...checkClientUnpaid(services, financeDocs, invoiceDocs, config),
    ...checkContractRenewal(services, members, config),
    ...checkMaterialCritical(catalogDocs, upcomingServicesCount, config),
    ...checkRouteDelayed(routes, config),
    ...checkExcessHours(services, clockinDocs, config),
  ];

  let emitted = 0;
  for (const a of allAlerts) {
    if (await emitCleaningAlert({ ...ctx, ...a })) emitted++;
  }
  return emitted;
}

export async function runCleaningAlerts() {
  const ms = Date.now(); cycleCount++;
  if (cycleCount % 30 === 0) cleanCaches();
  try {
    const businesses = await getAllBusinesses();
    if (!businesses.length) return;
    let total = 0;
    for (const b of businesses) {
      try { total += await runForBusiness(b); }
      catch (e) { logger.warn({ tag: TAG, businessId: b._id, err: e?.message }, 'Error alertas limpieza'); }
    }
    const elapsed = Date.now() - ms;
    if (total > 0 || elapsed > 10_000) logger.info({ tag: TAG, businesses: businesses.length, alerts: total, ms: elapsed, cycle: cycleCount }, 'Ciclo alertas limpieza');
  } catch (e) { logger.error({ tag: TAG, err: e?.message }, 'Error motor alertas limpieza'); }
}

export async function getCleaningAlertSummary(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  if (!account) return { alerts: [], summary: { total: 0, byPriority: {}, byCategory: {} } };
  const config = getCleaningAlertConfig(account);
  if (!config.enabled) return { alerts: [], summary: { total: 0, byPriority: {}, byCategory: {} } };

  const businessId = account.businessId || '';
  const today = todayStr(), tomorrow = tomorrowStr();
  const [cleaningDocs, clockinDocs, financeDocs, invoiceDocs, catalogDocs] = await Promise.all([
    fetchAllDocs(getCleaningDbName()).catch(() => []),
    fetchAllDocs(getClockinsDbName()).catch(() => []),
    fetchAllDocs(getFinanceDbName()).then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
    fetchDocsOfType(getInvoicesDbName(), 'client_invoice').then((d) => d.filter((i) => i.user_id === userId)).catch(() => []),
    fetchDocsOfType(getCatalogDbName(), 'catalog_item').then((d) => d.filter((i) => i.user_id === userId && i.active && (i.subtype === 'cleaning_material' || (i.materialType && ['detergent', 'disinfectant', 'degreaser', 'glass_cleaner', 'floor_cleaner', 'utensil', 'consumable', 'protective'].includes(i.materialType))))).catch(() => []),
  ]);

  const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId);
  const routes = cleaningDocs.filter((d) => d.type === 'cleaning_route' && d.user_id === userId);
  const incidents = cleaningDocs.filter((d) => d.type === 'cleaning_incident' && d.user_id === userId);
  const todayTomorrowSvcs = services.filter((s) => s.date === today || s.date === tomorrow);

  const lookAheadDate = new Date(); lookAheadDate.setDate(lookAheadDate.getDate() + config.materialCriticalDaysLookahead);
  const upcomingCount = services.filter((s) => s.date >= today && s.date <= lookAheadDate.toISOString().slice(0, 10) && s.status !== 'cancelled').length;
  const members = [];

  const allAlerts = [
    ...checkServiceUncovered(todayTomorrowSvcs, config),
    ...checkWorkerAbsent(services, clockinDocs, config),
    ...checkClockinPending(services, config),
    ...checkIncidentsOpen(incidents, config),
    ...checkClientUnpaid(services, financeDocs, invoiceDocs, config),
    ...checkContractRenewal(services, members, config),
    ...checkMaterialCritical(catalogDocs, upcomingCount, config),
    ...checkRouteDelayed(routes, config),
    ...checkExcessHours(services, clockinDocs, config),
  ];

  const byP = { high: 0, medium: 0, low: 0 }, byC = {};
  for (const a of allAlerts) {
    byP[a.priority] = (byP[a.priority] || 0) + 1;
    byC[a.category] = (byC[a.category] || 0) + 1;
  }
  return { alerts: allAlerts, summary: { total: allAlerts.length, active: allAlerts.length, byPriority: byP, byCategory: byC } };
}

// ─── REACTIVE ───────────────────────────────────────────────────────────────

const EVENT_TO_RULES = {
  service_created_unassigned: ['checkServiceUncovered'],
  service_assigned:           ['resolveServiceUncovered'],
  service_checkin:            ['resolveClockinPending', 'resolveWorkerAbsent'],
  service_checkout:           ['checkExcessHours'],
  incident_created:           ['checkIncidentsOpen'],
  incident_resolved:          ['resolveIncidentOpen'],
  route_generated:            ['checkServiceUncovered'],
};

export async function triggerReactiveCleaningAlert(userId, eventType, payload) {
  try {
    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return;
    const config = getCleaningAlertConfig(account);
    if (!config.enabled) return;

    const businessId = account.businessId || '';
    const cleaningDocs = await fetchAllDocs(getCleaningDbName()).catch(() => []);
    const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId);
    const today = todayStr(), tomorrow = tomorrowStr();
    const todayTomorrowSvcs = services.filter((s) => s.date === today || s.date === tomorrow);
    const toEmit = [];

    const rules = EVENT_TO_RULES[eventType] || [];
    for (const rule of rules) {
      if (rule === 'checkServiceUncovered') toEmit.push(...checkServiceUncovered(todayTomorrowSvcs, config));
      if (rule === 'checkExcessHours') {
        const clockins = await fetchAllDocs(getClockinsDbName()).catch(() => []);
        toEmit.push(...checkExcessHours(services, clockins, config));
      }
      if (rule === 'checkIncidentsOpen') {
        const incidents = cleaningDocs.filter((d) => d.type === 'cleaning_incident' && d.user_id === userId);
        toEmit.push(...checkIncidentsOpen(incidents, config));
      }
    }

    for (const a of toEmit) {
      await emitCleaningAlert({ userId, businessId, ...a });
    }

    if (rules.includes('resolveServiceUncovered') || rules.includes('resolveClockinPending') || rules.includes('resolveWorkerAbsent') || rules.includes('resolveIncidentOpen')) {
      if (businessId) {
        broadcastToBusiness(businessId, 'cleaning:alert_resolved', {
          eventType, resolvedAt: new Date().toISOString(), triggeredBy: payload?.serviceId || payload?.incidentId || '',
        });
      }
    }
  } catch (e) {
    logger.warn({ tag: TAG, userId, eventType, err: e?.message }, 'Error alerta reactiva limpieza');
  }
}

// ─── SCHEDULER ──────────────────────────────────────────────────────────────

let engineTimer = null;

export function startCleaningAlertEngine() {
  logger.info({ tag: TAG }, `Motor alertas limpieza — inicio en ${STARTUP_DELAY_MS / 1000}s, ciclo: ${DEFAULT_INTERVAL_MS / 1000}s`);
  setTimeout(() => {
    runCleaningAlerts().catch(() => null);
    engineTimer = setInterval(() => runCleaningAlerts().catch(() => null), DEFAULT_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopCleaningAlertEngine() {
  if (engineTimer) { clearInterval(engineTimer); engineTimer = null; }
}
