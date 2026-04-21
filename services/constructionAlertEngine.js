/**
 * Construction Alert Engine — Motor de alertas específico de construcción
 *
 * Ciclo: cada 30 min (más frecuente que el genérico de 1h).
 * Implementa 11 reglas de detección sobre obras, presupuestos,
 * trabajadores, partes, incidencias, documentación y costes.
 *
 * Usa emitGlobalAlert() del alertEmitter para emisión y routing.
 */

import {
  findAccountByUserId,
  getConstructionDbName,
} from './couchdb.js';
import {
  emitGlobalAlert,
  daysBetween,
  fetchAllDocsOfType,
  getBusinessesOfType,
  fakeReq,
} from './alertEmitter.js';
import { broadcastToBusiness } from './sseService.js';
import logger from './logger.js';

const TAG = 'CONSTRUCTION_ALERT_ENGINE';
const MAIN_INTERVAL_MS = 30 * 60_000;
const STARTUP_DELAY_MS = 25_000;

const CONSTRUCTION_REQUIRED_DOCUMENTS = [
  'dni', 'seguridad_social', 'prevencion_riesgos',
  'seguro_responsabilidad', 'formacion_prl',
];

// ─── Config ──────────────────────────────────────────────────────────────────

export function getConstructionAlertConfig(account) {
  const cfg = account?.alertConfig || {};
  return {
    enabled: cfg.constructionAlertsEnabled !== false,
    budgetNoResponseEnabled: cfg.constructionBudgetNoResponseEnabled !== false,
    budgetNoResponseDays: Math.max(1, Number(cfg.constructionBudgetNoResponseDays) || 7),
    projectNoResponsibleEnabled: cfg.constructionProjectNoResponsibleEnabled !== false,
    projectInactiveEnabled: cfg.constructionProjectInactiveEnabled !== false,
    projectInactiveDays: Math.max(1, Number(cfg.constructionProjectInactiveDays) || 5),
    workerNoReportEnabled: cfg.constructionWorkerNoReportEnabled !== false,
    workerNoReportCheckHour: Math.min(23, Math.max(0, Number(cfg.constructionWorkerNoReportCheckHour) || 18)),
    collectionOverdueEnabled: cfg.constructionCollectionOverdueEnabled !== false,
    collectionGraceDays: Math.max(0, Number(cfg.constructionCollectionGraceDays) || 3),
    paymentOverdueEnabled: cfg.constructionPaymentOverdueEnabled !== false,
    paymentOverdueDays: Math.max(1, Number(cfg.constructionPaymentOverdueDays) || 7),
    paymentUnjustifiedEnabled: cfg.constructionPaymentUnjustifiedEnabled !== false,
    paymentUnjustifiedDays: Math.max(1, Number(cfg.constructionPaymentUnjustifiedDays) || 15),
    documentPendingEnabled: cfg.constructionDocumentPendingEnabled !== false,
    documentExpiryDays: Math.max(1, Number(cfg.constructionDocumentExpiryDays) || 30),
    documentRequiredTypes: Array.isArray(cfg.constructionDocumentRequiredTypes)
      ? cfg.constructionDocumentRequiredTypes
      : CONSTRUCTION_REQUIRED_DOCUMENTS,
    incidentCriticalEnabled: cfg.constructionIncidentCriticalEnabled !== false,
    incidentUnreviewedHours: Math.max(1, Number(cfg.constructionIncidentUnreviewedHours) || 24),
    costOverrunEnabled: cfg.constructionCostOverrunEnabled !== false,
    costWarningPct: Math.max(1, Number(cfg.constructionCostWarningPct) || 80),
    costCriticalPct: Math.max(1, Number(cfg.constructionCostCriticalPct) || 100),
    projectUnclosedEnabled: cfg.constructionProjectUnclosedEnabled !== false,
    projectUnclosedDays: Math.max(1, Number(cfg.constructionProjectUnclosedDays) || 15),
    taskOverdueEnabled: cfg.constructionTaskOverdueEnabled !== false,
    taskOverdueDays: Math.max(0, Number(cfg.constructionTaskOverdueDays) || 2),
  };
}

// ─── Emit helper ─────────────────────────────────────────────────────────────

async function emit(ctx, opts) {
  const result = await emitGlobalAlert({
    businessId: ctx.businessId || '',
    userId: ctx.userId || '',
    source: 'construccion',
    ruleId: opts.category,
    tag: TAG,
    ...opts,
  });

  if (result && ctx.businessId) {
    try {
      broadcastToBusiness(ctx.businessId, 'construction_alert', {
        type: opts.category,
        priority: opts.priority || opts.level,
        title: opts.title,
        message: opts.message,
        audience: opts.audience || ['manager'],
        targetWorkerId: opts.targetWorkerId || null,
        entityId: opts.entityId,
        route: opts.route,
      });
    } catch { /* SSE best-effort */ }
  }

  return result;
}

// ─── Rule 1: Presupuesto sin respuesta ──────────────────────────────────────

async function checkBudgetNoResponse(ctx, budgets, config) {
  if (!config.budgetNoResponseEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const b of budgets) {
    if (b.estado !== 'enviado') continue;
    const sentDate = b.fechaEnvio || b.updatedAt || b.createdAt;
    if (!sentDate) continue;
    const days = daysBetween(sentDate, now);
    if (days >= config.budgetNoResponseDays) {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-budget-noresp-${b._id}`,
        level: 'warning',
        category: 'construction_budget_no_response',
        title: 'Presupuesto sin respuesta',
        message: `Presupuesto ${b.referencia} para "${b.proyectoNombre || 'obra'}" enviado hace ${days} días sin respuesta del cliente.`,
        entityId: b._id,
        entityType: 'construction_budget',
        route: '/saas/construction-budgets',
        metadata: { referencia: b.referencia, obraNombre: b.proyectoNombre, diasEnviado: days, clienteNombre: b.clienteNombre },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 2: Obra sin responsable ───────────────────────────────────────────

async function checkProjectNoResponsible(ctx, projects, workers, config) {
  if (!config.projectNoResponsibleEnabled) return [];
  const alerts = [];

  for (const p of projects) {
    if (p.estado !== 'planificación' && p.estado !== 'en_obra') continue;
    const hasResponsible = p.responsable || p.responsableNombre;
    const hasWorker = workers.some(w => w.obraAsignada === p._id && w.activo);
    if (!hasResponsible && !hasWorker) {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-proj-noresp-${p._id}`,
        level: 'warning',
        priority: 'high',
        category: 'construction_project_no_responsible',
        title: 'Obra sin responsable',
        message: `Obra "${p.nombre}" en estado "${p.estado}" no tiene responsable asignado.`,
        entityId: p._id,
        entityType: 'construction_project',
        route: '/saas/construction-projects',
        metadata: { nombre: p.nombre, estado: p.estado },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 3: Obra sin actividad (obra parada) ──────────────────────────────

async function checkProjectInactive(ctx, projects, reports, config) {
  if (!config.projectInactiveEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const p of projects) {
    if (p.estado !== 'en_obra') continue;
    const projectReports = reports.filter(r => r.obraId === p._id && r.estado === 'validado');
    const latestReport = projectReports.length > 0
      ? projectReports.reduce((best, r) => (!best || r.fecha > best.fecha) ? r : best, null)
      : null;

    if (latestReport) {
      const daysSince = daysBetween(latestReport.fecha, now);
      if (daysSince >= config.projectInactiveDays) {
        alerts.push(await emit(ctx, {
          dedupKey: `construction-proj-inactive-${p._id}`,
          level: 'warning',
          priority: 'high',
          category: 'construction_project_inactive',
          title: 'Obra sin actividad',
          message: `Obra "${p.nombre}" lleva ${daysSince} días sin actividad. Último parte: ${latestReport.fecha}.`,
          entityId: p._id,
          entityType: 'construction_project',
          route: '/saas/construction-projects',
          metadata: { nombre: p.nombre, diasInactiva: daysSince, ultimoParte: latestReport.fecha },
          audience: ['manager'],
        }));
      }
    } else {
      const daysSinceCreation = daysBetween(p.createdAt || p.fechaInicio, now);
      if (daysSinceCreation >= config.projectInactiveDays) {
        alerts.push(await emit(ctx, {
          dedupKey: `construction-proj-inactive-${p._id}`,
          level: 'warning',
          priority: 'high',
          category: 'construction_project_inactive',
          title: 'Obra sin actividad',
          message: `Obra "${p.nombre}" en estado "en obra" sin ningún parte registrado desde hace ${daysSinceCreation} días.`,
          entityId: p._id,
          entityType: 'construction_project',
          route: '/saas/construction-projects',
          metadata: { nombre: p.nombre, diasInactiva: daysSinceCreation, ultimoParte: null },
          audience: ['manager'],
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 4: Trabajador sin parte diario ────────────────────────────────────

async function checkWorkerNoReport(ctx, workers, projects, reports, config) {
  if (!config.workerNoReportEnabled) return [];
  const currentHour = new Date().getHours();
  if (currentHour < config.workerNoReportCheckHour) return [];

  const today = new Date().toISOString().slice(0, 10);
  const todayReportWorkerIds = new Set(
    reports.filter(r => r.fecha === today).map(r => r.trabajadorId)
  );
  const activeProjectIds = new Set(
    projects.filter(p => p.estado === 'en_obra').map(p => p._id)
  );
  const alerts = [];

  for (const w of workers) {
    if (!w.activo || !w.obraAsignada) continue;
    if (!activeProjectIds.has(w.obraAsignada)) continue;
    if (todayReportWorkerIds.has(w._id)) continue;

    alerts.push(await emit(ctx, {
      dedupKey: `construction-noreport-${w._id}-${today}`,
      level: 'warning',
      category: 'construction_worker_no_report',
      title: 'Trabajador sin parte diario',
      message: `${w.nombre} no ha registrado parte hoy en obra "${w.obraNombre || ''}".`,
      entityId: w._id,
      entityType: 'construction_worker',
      route: '/saas/construction-execution',
      metadata: { workerId: w._id, nombre: w.nombre, obraNombre: w.obraNombre, obraId: w.obraAsignada, fecha: today },
      audience: ['manager', 'worker'],
      targetWorkerId: w._id,
    }));
  }
  return alerts.filter(Boolean);
}

// ─── Rule 5: Cobro vencido ──────────────────────────────────────────────────

async function checkCollectionOverdue(ctx, budgets, config) {
  if (!config.collectionOverdueEnabled) return [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const alerts = [];

  for (const b of budgets) {
    if (b.estado !== 'aceptado') continue;
    const pagos = Array.isArray(b.pagos) ? b.pagos : [];

    for (const pago of pagos) {
      if (pago.pagado || !pago.fecha) continue;
      const days = daysBetween(pago.fecha, now);
      if (days <= config.collectionGraceDays) continue;

      const priority = days > 30 ? 'high' : 'medium';
      const level = days > 30 ? 'alert' : 'warning';

      alerts.push(await emit(ctx, {
        dedupKey: `construction-collection-${b._id}-${pago.id || pago.concepto}`,
        level,
        priority,
        category: 'construction_collection_overdue',
        title: 'Cobro vencido',
        message: `Cobro de ${Number(pago.importe || 0).toLocaleString('es-ES')}€ del presupuesto ${b.referencia} (obra "${b.proyectoNombre || ''}") vencido hace ${days} días.`,
        entityId: b._id,
        entityType: 'construction_budget',
        route: '/saas/construction-budgets',
        metadata: {
          referencia: b.referencia, obraNombre: b.proyectoNombre, clienteNombre: b.clienteNombre,
          pagoId: pago.id, concepto: pago.concepto, importe: pago.importe, fechaVencimiento: pago.fecha, diasVencido: days,
        },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 6: Pago vencido / sin justificar ──────────────────────────────────

async function checkPaymentOverdue(ctx, budgets, config) {
  if (!config.paymentOverdueEnabled && !config.paymentUnjustifiedEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const b of budgets) {
    if (b.estado !== 'aceptado') continue;

    if (config.paymentOverdueEnabled) {
      const pagosProveedor = Array.isArray(b.pagosProveedor) ? b.pagosProveedor : [];
      for (const pp of pagosProveedor) {
        if (pp.pagado || !pp.fechaVencimiento) continue;
        const days = daysBetween(pp.fechaVencimiento, now);
        if (days >= config.paymentOverdueDays) {
          alerts.push(await emit(ctx, {
            dedupKey: `construction-payoverdue-${b._id}-${pp.id || pp.gremioNombre}`,
            level: 'alert',
            priority: 'high',
            category: 'construction_payment_overdue',
            title: 'Pago a proveedor vencido',
            message: `Pago de ${Number(pp.importe || 0).toLocaleString('es-ES')}€ a "${pp.gremioNombre || 'proveedor'}" en obra "${b.proyectoNombre || ''}" vencido hace ${days} días.`,
            entityId: b._id,
            entityType: 'construction_budget',
            route: '/saas/construction-budgets',
            metadata: {
              referencia: b.referencia, obraNombre: b.proyectoNombre,
              gremioNombre: pp.gremioNombre, importe: pp.importe, fechaVencimiento: pp.fechaVencimiento, diasVencido: days,
            },
            audience: ['manager'],
          }));
        }
      }
    }

    if (config.paymentUnjustifiedEnabled) {
      const pagos = Array.isArray(b.pagos) ? b.pagos : [];
      for (const pago of pagos) {
        if (!pago.pagado || pago.justificante) continue;
        const payDate = pago.fechaPago || pago.fecha;
        if (!payDate) continue;
        const days = daysBetween(payDate, now);
        if (days >= config.paymentUnjustifiedDays) {
          alerts.push(await emit(ctx, {
            dedupKey: `construction-payunjust-${b._id}-${pago.id || pago.concepto}`,
            level: 'warning',
            category: 'construction_payment_unjustified',
            title: 'Pago sin justificante',
            message: `Pago de ${Number(pago.importe || 0).toLocaleString('es-ES')}€ en presupuesto ${b.referencia} registrado hace ${days} días sin justificante.`,
            entityId: b._id,
            entityType: 'construction_budget',
            route: '/saas/construction-budgets',
            metadata: {
              referencia: b.referencia, obraNombre: b.proyectoNombre,
              pagoId: pago.id, importe: pago.importe, diasSinJustificar: days,
            },
            audience: ['manager'],
          }));
        }
      }
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 7: Documento pendiente / expirado ─────────────────────────────────

async function checkDocumentPending(ctx, workers, obraDocs, config) {
  if (!config.documentPendingEnabled) return [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const alerts = [];

  for (const w of workers) {
    if (!w.activo) continue;
    const docs = Array.isArray(w.documentos) ? w.documentos : [];

    for (const tipo of config.documentRequiredTypes) {
      const found = docs.find(d => d.tipo === tipo);

      if (!found) {
        alerts.push(await emit(ctx, {
          dedupKey: `construction-docmissing-${w._id}-${tipo}`,
          level: 'warning',
          category: 'construction_document_pending',
          title: 'Documento obligatorio faltante',
          message: `Trabajador "${w.nombre}" no tiene "${tipo}" registrado.`,
          entityId: w._id,
          entityType: 'construction_worker',
          route: '/saas/construction-workers',
          metadata: { workerId: w._id, nombre: w.nombre, tipoFaltante: tipo },
          audience: ['manager', 'worker'],
          targetWorkerId: w._id,
        }));
      } else if (found.fechaCaducidad) {
        const daysUntil = -daysBetween(found.fechaCaducidad, now);

        if (daysUntil < 0) {
          alerts.push(await emit(ctx, {
            dedupKey: `construction-docexpired-${w._id}-${tipo}`,
            level: 'alert',
            priority: 'high',
            category: 'construction_document_expired',
            title: 'Documento caducado',
            message: `"${tipo}" de "${w.nombre}" caducó hace ${Math.abs(daysUntil)} días.`,
            entityId: w._id,
            entityType: 'construction_worker',
            route: '/saas/construction-workers',
            metadata: { workerId: w._id, nombre: w.nombre, tipo, fechaCaducidad: found.fechaCaducidad, diasCaducado: Math.abs(daysUntil) },
            audience: ['manager', 'worker'],
            targetWorkerId: w._id,
          }));
        } else if (daysUntil <= config.documentExpiryDays) {
          alerts.push(await emit(ctx, {
            dedupKey: `construction-docexpiring-${w._id}-${tipo}`,
            level: 'warning',
            category: 'construction_document_pending',
            title: 'Documento próximo a caducar',
            message: `"${tipo}" de "${w.nombre}" caduca en ${daysUntil} días (${found.fechaCaducidad}).`,
            entityId: w._id,
            entityType: 'construction_worker',
            route: '/saas/construction-workers',
            metadata: { workerId: w._id, nombre: w.nombre, tipo, fechaCaducidad: found.fechaCaducidad, diasRestantes: daysUntil },
            audience: ['manager', 'worker'],
            targetWorkerId: w._id,
          }));
        }
      }
    }
  }

  for (const d of obraDocs) {
    if (d.obligatorio && d.estado === 'pendiente') {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-obradoc-pending-${d._id}`,
        level: 'warning',
        category: 'construction_document_pending',
        title: 'Documento de obra obligatorio pendiente',
        message: `Obra "${d.obraNombre || ''}" — documento "${d.nombre}" obligatorio sin completar.`,
        entityId: d._id,
        entityType: 'construction_obra_document',
        route: '/saas/vertical/construccion',
        metadata: { obraId: d.obraId, obraNombre: d.obraNombre, nombre: d.nombre },
        audience: ['manager'],
      }));
    }

    if (d.estado === 'vigente' && d.fechaCaducidad && d.fechaCaducidad <= today) {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-obradoc-expired-${d._id}`,
        level: 'alert',
        priority: 'high',
        category: 'construction_document_expired',
        title: 'Documento de obra caducado',
        message: `Obra "${d.obraNombre || ''}" — documento "${d.nombre}" caducado desde ${d.fechaCaducidad}.`,
        entityId: d._id,
        entityType: 'construction_obra_document',
        route: '/saas/vertical/construccion',
        metadata: { obraId: d.obraId, obraNombre: d.obraNombre, nombre: d.nombre, fechaCaducidad: d.fechaCaducidad },
        audience: ['manager'],
      }));
    }
  }

  return alerts.filter(Boolean);
}

// ─── Rule 8: Incidencia crítica / sin revisar ───────────────────────────────

async function checkIncidentCritical(ctx, incidents, config) {
  if (!config.incidentCriticalEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const inc of incidents) {
    const isOpen = ['abierta', 'en_revision', 'reabierta', 'en_progreso'].includes(inc.estado);
    if (!isOpen) continue;

    if (inc.gravedad === 'critica' || inc.gravedad === 'alta') {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-inc-critical-${inc._id}`,
        level: 'alert',
        priority: 'high',
        category: 'construction_incident_critical',
        title: `Incidencia ${inc.gravedad === 'critica' ? 'CRÍTICA' : 'ALTA'}`,
        message: `${inc.referencia || ''} en obra "${inc.obraNombre || ''}": ${(inc.titulo || inc.descripcion || '').slice(0, 100)}. Estado: ${inc.estado}.`,
        entityId: inc._id,
        entityType: 'construction_incident',
        route: '/saas/construction-execution',
        metadata: {
          referencia: inc.referencia, obraNombre: inc.obraNombre, obraId: inc.obraId,
          gravedad: inc.gravedad, estado: inc.estado, tipo: inc.tipo,
          reportadoPorNombre: inc.reportadoPorNombre,
        },
        audience: ['manager', 'worker'],
        targetWorkerId: inc.reportadoPor || inc.asignadoA || null,
      }));
    }

    if (inc.estado === 'abierta') {
      const hoursSinceCreation = (now.getTime() - new Date(inc.createdAt).getTime()) / 3_600_000;
      if (hoursSinceCreation >= config.incidentUnreviewedHours) {
        alerts.push(await emit(ctx, {
          dedupKey: `construction-inc-unreviewed-${inc._id}`,
          level: 'warning',
          priority: 'high',
          category: 'construction_incident_unreviewed',
          title: 'Incidencia sin revisar',
          message: `${inc.referencia || ''} en obra "${inc.obraNombre || ''}" lleva ${Math.floor(hoursSinceCreation)}h sin revisar. Gravedad: ${inc.gravedad || 'desconocida'}.`,
          entityId: inc._id,
          entityType: 'construction_incident',
          route: '/saas/construction-execution',
          metadata: {
            referencia: inc.referencia, obraNombre: inc.obraNombre, obraId: inc.obraId,
            gravedad: inc.gravedad, horasSinRevisar: Math.floor(hoursSinceCreation),
          },
          audience: ['manager'],
        }));
      }
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 9: Coste disparado (desviación presupuestaria) ────────────────────

async function checkCostOverrun(ctx, projects, budgets, config) {
  if (!config.costOverrunEnabled) return [];
  const alerts = [];

  for (const p of projects) {
    if (p.estado !== 'en_obra' && p.estado !== 'finalizada') continue;
    const budget = budgets.find(b =>
      (b.proyectoId === p._id || b._id === p.presupuestoId) && b.estado === 'aceptado'
    );
    if (!budget) continue;

    const presupuestado = Number(budget.totalConMargen) || 0;
    if (presupuestado <= 0) continue;

    const costeAcumulado = Number(p.costeAcumulado) || 0;
    const pct = Math.round((costeAcumulado / presupuestado) * 100);

    if (pct >= config.costCriticalPct) {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-costcritical-${p._id}`,
        level: 'alert',
        priority: 'high',
        category: 'construction_cost_overrun',
        title: 'Coste supera presupuesto',
        message: `Obra "${p.nombre}": coste acumulado ${costeAcumulado.toLocaleString('es-ES')}€ SUPERA el presupuesto de ${presupuestado.toLocaleString('es-ES')}€ (${pct}%).`,
        entityId: p._id,
        entityType: 'construction_project',
        route: '/saas/construction-budgets',
        metadata: { nombre: p.nombre, presupuesto: presupuestado, costeAcumulado, porcentaje: pct },
        audience: ['manager'],
      }));
    } else if (pct >= config.costWarningPct) {
      alerts.push(await emit(ctx, {
        dedupKey: `construction-costwarn-${p._id}`,
        level: 'warning',
        category: 'construction_cost_warning',
        title: 'Desviación de coste',
        message: `Obra "${p.nombre}": coste acumulado ${costeAcumulado.toLocaleString('es-ES')}€ alcanza el ${pct}% del presupuesto de ${presupuestado.toLocaleString('es-ES')}€.`,
        entityId: p._id,
        entityType: 'construction_project',
        route: '/saas/construction-budgets',
        metadata: { nombre: p.nombre, presupuesto: presupuestado, costeAcumulado, porcentaje: pct },
        audience: ['manager'],
      }));
    }
  }
  return alerts.filter(Boolean);
}

// ─── Rule 10: Obra finalizada sin cerrar ────────────────────────────────────

async function checkProjectUnclosed(ctx, projects, budgets, obraDocs, config) {
  if (!config.projectUnclosedEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const p of projects) {
    if (p.estado !== 'finalizada') continue;
    const finDate = p.fechaFin || p.updatedAt;
    if (!finDate) continue;
    const days = daysBetween(finDate, now);
    if (days < config.projectUnclosedDays) continue;

    const budget = budgets.find(b =>
      (b.proyectoId === p._id || b._id === p.presupuestoId) && b.estado === 'aceptado'
    );
    const pagos = budget ? (Array.isArray(budget.pagos) ? budget.pagos : []) : [];
    const cobrosCompletos = pagos.length === 0 || pagos.every(pg => pg.pagado);
    const docsObra = obraDocs.filter(d => d.obraId === p._id && d.obligatorio);
    const documentacionCompleta = docsObra.length === 0 || docsObra.every(d => d.estado !== 'pendiente');

    let detail = '';
    if (!cobrosCompletos) detail += ` Quedan ${pagos.filter(pg => !pg.pagado).length} cobros pendientes.`;
    if (!documentacionCompleta) detail += ` Falta documentación de cierre.`;

    alerts.push(await emit(ctx, {
      dedupKey: `construction-unclosed-${p._id}`,
      level: 'warning',
      category: 'construction_project_unclosed',
      title: 'Obra finalizada sin cierre',
      message: `Obra "${p.nombre}" finalizada hace ${days} días sin cierre administrativo.${detail}`,
      entityId: p._id,
      entityType: 'construction_project',
      route: '/saas/construction-projects',
      metadata: { nombre: p.nombre, diasFinalizada: days, cobrosCompletos, documentacionCompleta },
      audience: ['manager'],
    }));
  }
  return alerts.filter(Boolean);
}

// ─── Rule 11: Tarea de obra vencida ─────────────────────────────────────────

async function checkTaskOverdue(ctx, tasks, config) {
  if (!config.taskOverdueEnabled) return [];
  const now = new Date();
  const alerts = [];

  for (const t of tasks) {
    if (t.estado !== 'pendiente' && t.estado !== 'en_progreso') continue;
    if (!t.fechaLimite) continue;
    const days = daysBetween(t.fechaLimite, now);
    if (days < config.taskOverdueDays) continue;

    alerts.push(await emit(ctx, {
      dedupKey: `construction-taskoverdue-${t._id}`,
      level: 'warning',
      category: 'construction_task_overdue',
      title: 'Tarea de obra vencida',
      message: `"${t.titulo}" en obra "${t.obraNombre || ''}" vencida hace ${days} días.${t.trabajadorNombre ? ` Asignada a ${t.trabajadorNombre}.` : ''}`,
      entityId: t._id,
      entityType: 'construction_task',
      route: '/saas/construction-execution',
      metadata: {
        titulo: t.titulo, obraNombre: t.obraNombre, obraId: t.obraId,
        trabajadorNombre: t.trabajadorNombre, trabajadorId: t.trabajadorId,
        fechaLimite: t.fechaLimite, diasVencida: days,
      },
      audience: t.trabajadorId ? ['manager', 'worker'] : ['manager'],
      targetWorkerId: t.trabajadorId || null,
    }));
  }
  return alerts.filter(Boolean);
}

// ─── Orchestration per business ─────────────────────────────────────────────

async function runConstructionAlertsForBusiness(business) {
  const ownerId = business.owner_user_id;
  if (!ownerId) return 0;
  const account = await findAccountByUserId(fakeReq, ownerId);
  if (!account) return 0;

  const config = getConstructionAlertConfig(account);
  if (!config.enabled) return 0;

  const businessId = business._id?.replace('business:', '') || '';
  const ctx = { businessId, userId: ownerId };
  const db = getConstructionDbName();

  const [projects, budgets, workers, tasks, reports, incidents, obraDocs] = await Promise.all([
    fetchAllDocsOfType(db, 'construction_project').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_budget').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_worker').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_task').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_daily_report').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_incident').then(d => d.filter(i => i.user_id === ownerId)),
    fetchAllDocsOfType(db, 'construction_obra_document').then(d => d.filter(i => i.user_id === ownerId)),
  ]);

  if (projects.length === 0 && budgets.length === 0) return 0;

  const results = [];
  results.push(...await checkBudgetNoResponse(ctx, budgets, config));
  results.push(...await checkProjectNoResponsible(ctx, projects, workers, config));
  results.push(...await checkProjectInactive(ctx, projects, reports, config));
  results.push(...await checkWorkerNoReport(ctx, workers, projects, reports, config));
  results.push(...await checkCollectionOverdue(ctx, budgets, config));
  results.push(...await checkPaymentOverdue(ctx, budgets, config));
  results.push(...await checkDocumentPending(ctx, workers, obraDocs, config));
  results.push(...await checkIncidentCritical(ctx, incidents, config));
  results.push(...await checkCostOverrun(ctx, projects, budgets, config));
  results.push(...await checkProjectUnclosed(ctx, projects, budgets, obraDocs, config));
  results.push(...await checkTaskOverdue(ctx, tasks, config));

  return results.filter(Boolean).length;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function runConstructionAlertEngine() {
  const startMs = Date.now();
  try {
    const businesses = await getBusinessesOfType('construction');
    if (businesses.length === 0) return;

    let total = 0;
    for (const biz of businesses) {
      try {
        total += await runConstructionAlertsForBusiness(biz);
      } catch (err) {
        logger.warn({ tag: TAG, businessId: biz._id, err: err?.message }, 'Error alertas construcción');
      }
    }
    const elapsed = Date.now() - startMs;
    if (total > 0 || elapsed > 5000) {
      logger.info({ tag: TAG, businesses: businesses.length, alerts: total, ms: elapsed }, 'Ciclo alertas construcción');
    }
  } catch (err) {
    logger.error({ tag: TAG, err: err?.message }, 'Error en motor de alertas construcción');
  }
}

// ─── On-demand summary ──────────────────────────────────────────────────────

export async function getConstructionAlertSummary(userId) {
  const account = await findAccountByUserId(fakeReq, userId);
  if (!account) return { totals: { critical: 0, warning: 0, info: 0, total: 0 } };

  const config = getConstructionAlertConfig(account);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const db = getConstructionDbName();

  const [projects, budgets, workers, tasks, reports, incidents, obraDocs] = await Promise.all([
    fetchAllDocsOfType(db, 'construction_project').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_budget').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_worker').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_task').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_daily_report').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_incident').then(d => d.filter(i => i.user_id === userId)),
    fetchAllDocsOfType(db, 'construction_obra_document').then(d => d.filter(i => i.user_id === userId)),
  ]);

  const activeProjects = projects.filter(p => p.estado === 'en_obra' || p.estado === 'planificación');
  const acceptedBudgets = budgets.filter(b => b.estado === 'aceptado');

  // Presupuestos sin respuesta
  const sinRespuesta = budgets.filter(b => {
    if (b.estado !== 'enviado') return false;
    const d = daysBetween(b.fechaEnvio || b.updatedAt || b.createdAt, now);
    return d >= config.budgetNoResponseDays;
  }).map(b => ({
    id: b._id, referencia: b.referencia, obraNombre: b.proyectoNombre,
    diasEnviado: daysBetween(b.fechaEnvio || b.updatedAt || b.createdAt, now),
  }));

  // Cobros vencidos
  const cobrosVencidos = [];
  let totalCobrosVencidos = 0;
  for (const b of acceptedBudgets) {
    for (const pago of (b.pagos || [])) {
      if (pago.pagado || !pago.fecha) continue;
      const d = daysBetween(pago.fecha, now);
      if (d > config.collectionGraceDays) {
        cobrosVencidos.push({ id: b._id, referencia: b.referencia, pagoId: pago.id, importe: pago.importe, diasVencido: d });
        totalCobrosVencidos += Number(pago.importe || 0);
      }
    }
  }

  // Obras sin responsable
  const activeWorkerProjectIds = new Set(workers.filter(w => w.activo && w.obraAsignada).map(w => w.obraAsignada));
  const sinResponsable = activeProjects.filter(p =>
    !p.responsable && !p.responsableNombre && !activeWorkerProjectIds.has(p._id)
  ).map(p => ({ id: p._id, nombre: p.nombre, estado: p.estado }));

  // Obras sin actividad
  const sinActividad = projects.filter(p => {
    if (p.estado !== 'en_obra') return false;
    const pReports = reports.filter(r => r.obraId === p._id && r.estado === 'validado');
    const latest = pReports.reduce((b, r) => (!b || r.fecha > b.fecha) ? r : b, null);
    const ref = latest ? latest.fecha : (p.createdAt || p.fechaInicio);
    return ref && daysBetween(ref, now) >= config.projectInactiveDays;
  }).map(p => {
    const pReports = reports.filter(r => r.obraId === p._id && r.estado === 'validado');
    const latest = pReports.reduce((b, r) => (!b || r.fecha > b.fecha) ? r : b, null);
    return { id: p._id, nombre: p.nombre, diasInactiva: daysBetween(latest?.fecha || p.createdAt, now), ultimoParte: latest?.fecha || null };
  });

  // Finalizadas sin cerrar
  const finalizadasSinCerrar = projects.filter(p => {
    if (p.estado !== 'finalizada') return false;
    const finDate = p.fechaFin || p.updatedAt;
    return finDate && daysBetween(finDate, now) >= config.projectUnclosedDays;
  }).map(p => {
    const budget = budgets.find(b => (b.proyectoId === p._id || b._id === p.presupuestoId) && b.estado === 'aceptado');
    const pagos = budget ? (budget.pagos || []) : [];
    return {
      id: p._id, nombre: p.nombre, diasFinalizada: daysBetween(p.fechaFin || p.updatedAt, now),
      cobrosCompletos: pagos.length === 0 || pagos.every(pg => pg.pagado),
    };
  });

  // Trabajadores sin parte hoy
  const todayReportWorkerIds = new Set(reports.filter(r => r.fecha === today).map(r => r.trabajadorId));
  const activeProjectIds = new Set(projects.filter(p => p.estado === 'en_obra').map(p => p._id));
  const trabajadoresSinParte = workers.filter(w =>
    w.activo && w.obraAsignada && activeProjectIds.has(w.obraAsignada) && !todayReportWorkerIds.has(w._id)
  ).map(w => ({ workerId: w._id, nombre: w.nombre, obraNombre: w.obraNombre }));

  // Incidencias
  const openIncidents = incidents.filter(i => ['abierta', 'en_revision', 'reabierta', 'en_progreso'].includes(i.estado));
  const incidenciasCriticas = openIncidents.filter(i => i.gravedad === 'critica' || i.gravedad === 'alta')
    .map(i => ({ id: i._id, referencia: i.referencia, obraNombre: i.obraNombre, gravedad: i.gravedad, horasAbierta: Math.floor((now - new Date(i.createdAt)) / 3_600_000) }));
  const incidenciasSinRevisar = openIncidents.filter(i =>
    i.estado === 'abierta' && (now - new Date(i.createdAt)) / 3_600_000 >= config.incidentUnreviewedHours
  ).map(i => ({ id: i._id, referencia: i.referencia, obraNombre: i.obraNombre, horasSinRevisar: Math.floor((now - new Date(i.createdAt)) / 3_600_000) }));

  // Costes
  const desviaciones = [];
  const superados = [];
  for (const p of projects) {
    if (p.estado !== 'en_obra' && p.estado !== 'finalizada') continue;
    const budget = budgets.find(b => (b.proyectoId === p._id || b._id === p.presupuestoId) && b.estado === 'aceptado');
    if (!budget) continue;
    const pres = Number(budget.totalConMargen) || 0;
    if (pres <= 0) continue;
    const coste = Number(p.costeAcumulado) || 0;
    const pct = Math.round((coste / pres) * 100);
    const row = { projectId: p._id, nombre: p.nombre, presupuesto: pres, costeAcumulado: coste, porcentaje: pct };
    if (pct >= config.costCriticalPct) superados.push(row);
    else if (pct >= config.costWarningPct) desviaciones.push(row);
  }

  // Documentación
  const docFaltantes = [];
  const docCaducados = [];
  const docProximosCaducar = [];
  for (const w of workers) {
    if (!w.activo) continue;
    const docs = Array.isArray(w.documentos) ? w.documentos : [];
    for (const tipo of config.documentRequiredTypes) {
      const found = docs.find(d => d.tipo === tipo);
      if (!found) {
        docFaltantes.push({ workerId: w._id, nombre: w.nombre, tipoFaltante: tipo });
      } else if (found.fechaCaducidad) {
        const daysUntil = -daysBetween(found.fechaCaducidad, now);
        if (daysUntil < 0) docCaducados.push({ workerId: w._id, nombre: w.nombre, tipo, caducadoHace: Math.abs(daysUntil) });
        else if (daysUntil <= config.documentExpiryDays) docProximosCaducar.push({ workerId: w._id, nombre: w.nombre, tipo, diasRestantes: daysUntil });
      }
    }
  }

  // Pagos
  const pagosVencidos = [];
  let totalPagosVencidos = 0;
  const pagosSinJustificar = [];
  for (const b of acceptedBudgets) {
    for (const pp of (b.pagosProveedor || [])) {
      if (pp.pagado || !pp.fechaVencimiento) continue;
      const d = daysBetween(pp.fechaVencimiento, now);
      if (d >= config.paymentOverdueDays) {
        pagosVencidos.push({ budgetId: b._id, referencia: b.referencia, obraNombre: b.proyectoNombre, importe: pp.importe, diasVencido: d });
        totalPagosVencidos += Number(pp.importe || 0);
      }
    }
    for (const pago of (b.pagos || [])) {
      if (!pago.pagado || pago.justificante) continue;
      const payDate = pago.fechaPago || pago.fecha;
      if (!payDate) continue;
      const d = daysBetween(payDate, now);
      if (d >= config.paymentUnjustifiedDays) {
        pagosSinJustificar.push({ budgetId: b._id, referencia: b.referencia, pagoId: pago.id, importe: pago.importe, diasSinJustificar: d });
      }
    }
  }

  // Tareas vencidas
  const tareasVencidas = tasks.filter(t =>
    (t.estado === 'pendiente' || t.estado === 'en_progreso') && t.fechaLimite && daysBetween(t.fechaLimite, now) >= config.taskOverdueDays
  ).map(t => ({
    id: t._id, titulo: t.titulo, obraNombre: t.obraNombre, trabajadorNombre: t.trabajadorNombre,
    fechaLimite: t.fechaLimite, diasVencida: daysBetween(t.fechaLimite, now),
  }));

  const critical = incidenciasCriticas.length + superados.length + cobrosVencidos.filter(c => c.diasVencido > 30).length + docCaducados.length;
  const warning = sinResponsable.length + sinActividad.length + cobrosVencidos.filter(c => c.diasVencido <= 30).length
    + trabajadoresSinParte.length + incidenciasSinRevisar.length + desviaciones.length + pagosVencidos.length + docFaltantes.length;
  const info = sinRespuesta.length + finalizadasSinCerrar.length + tareasVencidas.length + pagosSinJustificar.length + docProximosCaducar.length;

  return {
    updatedAt: now.toISOString(),
    config,
    totals: { critical, warning, info, total: critical + warning + info },
    presupuestos: { sinRespuesta, cobrosVencidos, totalCobrosVencidos },
    obras: { sinResponsable, sinActividad, finalizadasSinCerrar },
    ejecucion: { trabajadoresSinParte, incidenciasCriticas, incidenciasSinRevisar },
    costes: { desviaciones, superados },
    documentacion: { faltantes: docFaltantes, caducados: docCaducados, proximosACaducar: docProximosCaducar },
    pagos: { vencidos: pagosVencidos, sinJustificar: pagosSinJustificar, totalVencidos: totalPagosVencidos },
    tareas: { vencidas: tareasVencidas },
  };
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

let engineTimer = null;

export function startConstructionAlertEngine() {
  logger.info({ tag: TAG }, `Motor alertas construcción — inicio en ${STARTUP_DELAY_MS / 1000}s, ciclo cada ${MAIN_INTERVAL_MS / 60_000} min`);
  setTimeout(() => {
    runConstructionAlertEngine().catch(() => null);
    engineTimer = setInterval(() => runConstructionAlertEngine().catch(() => null), MAIN_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopConstructionAlertEngine() {
  if (engineTimer) { clearInterval(engineTimer); engineTimer = null; }
}
