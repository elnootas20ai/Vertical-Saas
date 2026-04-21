import {
  getCleaningDbName,
  buildCleaningServiceDocument,
  buildServiceExecution,
  sanitizeCleaningService,
  listCleaningServicesByUser,
  listCleaningServicesByDate,
  buildCleaningRouteDocument,
  sanitizeCleaningRoute,
  listCleaningRoutesByUser,
  listCleaningRoutesByDate,
  listCleaningRoutesByWorker,
  buildCleaningIncidentDocument,
  sanitizeCleaningIncident,
  listCleaningIncidentsByUser,
  buildCleaningWorkerDocument,
  sanitizeCleaningWorker,
  listCleaningWorkersByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';

import { v4 as uuidv4 } from 'uuid';
import { triggerReactiveCleaningAlert } from '../services/cleaningAlertEngine.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureCleaningServiceOwner(req, userId, serviceId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, serviceId);
  if (!doc || doc.type !== 'cleaning_service' || doc.user_id !== userId) return null;
  return doc;
}

// ─── CLEANING SERVICES ──────────────────────────────────────────────────────

export async function listCleaningServices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const services = await listCleaningServicesByUser(req, userId);
    return res.json({ ok: true, services: services.map(sanitizeCleaningService) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar servicios de limpieza' });
  }
}

export async function createCleaningService(req, res) {
  try {
    const { userId } = req.params;
    const { service } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!service || typeof service !== 'object') return badRequest(res, 'Falta el objeto service en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildCleaningServiceDocument(userId, service);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_service',
      action: `Creó servicio ${doc.serviceNumber} — ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${doc.serviceNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status, cleaningType: doc.cleaningType },
    });
    if (!doc.assignedTo || !doc.assignedTo.trim()) {
      triggerReactiveCleaningAlert(userId, 'service_created_unassigned', { serviceId: doc._id }).catch(() => {});
    }
    return res.status(201).json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear servicio de limpieza' });
  }
}

export async function updateCleaningService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { service } = req.body || {};
    if (!service || typeof service !== 'object') return badRequest(res, 'Faltan datos del servicio');
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, ...service }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_service',
      action: `Actualizó servicio ${doc.serviceNumber} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.serviceNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status },
    });
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar servicio de limpieza' });
  }
}

export async function removeCleaningService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await softDeleteDocument(req, db, serviceId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_service',
      action: `Eliminó servicio ${existing.serviceNumber}`,
      entityId: existing._id,
      entityLabel: existing.serviceNumber,
      metadata: {},
    });
    return res.json({ ok: true, id: serviceId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar servicio de limpieza' });
  }
}

// ─── HUB / CENTRO OPERATIVO ──────────────────────────────────────────────────

export async function getCleaningHubKpis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const today = new Date().toISOString().slice(0, 10);
    const services = (await listCleaningServicesByUser(req, userId))
      .map(sanitizeCleaningService)
      .filter(s => s.date === today && !s.deletedAt);

    const workers = (await listCleaningWorkersByUser(req, userId))
      .map(sanitizeCleaningWorker)
      .filter(w => w.status === 'active');

    const incidents = (await listCleaningIncidentsByUser(req, userId))
      .map(sanitizeCleaningIncident)
      .filter(i => !i.deletedAt && (i.status === 'open' || i.status === 'in_progress'));

    const completed = services.filter(s => s.status === 'completed').length;
    const inProgress = services.filter(s => s.status === 'in_progress').length;
    const pending = services.filter(s => s.status === 'pending' || s.status === 'assigned').length;
    const uncovered = services.filter(s => !s.assignedTo && !s.assignedToName).length;
    const recurrent = services.filter(s => s.recurrence && s.recurrence.type && s.recurrence.type !== 'none').length;

    let totalHours = 0;
    let billingTotal = 0;
    let billingPending = 0;
    for (const svc of services) {
      const exec = svc.execution || {};
      totalHours += (exec.realMinutes || 0) / 60;
      billingTotal += svc.price || 0;
      if (svc.status === 'completed' && !svc.invoiceId) billingPending += svc.price || 0;
    }

    const kpis = {
      servicesToday: services.length,
      servicesCompleted: completed,
      servicesInProgress: inProgress,
      servicesPending: pending,
      servicesUncovered: uncovered,
      activeWorkers: workers.length,
      totalWorkers: workers.length,
      absentWorkers: 0,
      clockinsPending: 0,
      hoursWorkedToday: Math.round(totalHours * 10) / 10,
      openIncidents: incidents.length,
      billingToday: Math.round(billingTotal * 100) / 100,
      billingPending: Math.round(billingPending * 100) / 100,
      profitabilityAvg: 0,
      criticalMaterials: 0,
      recurrentServices: recurrent,
      oneTimeServices: services.length - recurrent,
    };

    const alerts = [];
    for (const svc of services) {
      if (!svc.assignedTo && !svc.assignedToName) {
        alerts.push({ id: `alert-uncovered-${svc._id}`, type: 'service_uncovered', severity: 'error', message: `Servicio #${svc.serviceNumber} sin trabajador asignado`, route: '/saas/cleaning-services', relatedId: svc._id, timestamp: new Date().toISOString() });
      }
    }
    for (const inc of incidents) {
      alerts.push({ id: `alert-incident-${inc._id}`, type: 'incident_open', severity: 'warning', message: `Incidencia #${inc.incidentNumber} - ${inc.incidentType}`, route: '/saas/cleaning-incidents', relatedId: inc._id, timestamp: inc.createdAt });
    }
    if (billingPending > 0) {
      const unbilledCount = services.filter(s => s.status === 'completed' && !s.invoiceId).length;
      alerts.push({ id: 'alert-billing', type: 'billing_pending', severity: 'info', message: `${unbilledCount} servicios completados sin facturar`, route: '/saas/finance', timestamp: new Date().toISOString() });
    }

    return res.json({ ok: true, data: kpis, alerts, services: services.map(sanitizeCleaningService) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar datos del hub' });
  }
}

// ─── SERVICE EXECUTION ──────────────────────────────────────────────────────

function computePauseMinutes(pauseLog) {
  let total = 0;
  for (const p of pauseLog || []) {
    if (p.startAt && p.endAt) {
      const diff = new Date(p.endAt).getTime() - new Date(p.startAt).getTime();
      if (diff > 0) total += Math.round(diff / 60000);
    }
  }
  return total;
}

function generateExecutionAlerts(services) {
  const now = new Date();
  const alerts = [];
  for (const svc of services) {
    const exec = svc.execution || {};
    const scheduledStart = svc.date && svc.time
      ? new Date(svc.date + 'T' + svc.time + ':00').getTime()
      : null;

    if (scheduledStart && now.getTime() > scheduledStart + 15 * 60000 && exec.status === 'not_started') {
      alerts.push({ type: 'NO_CHECKIN', severity: 'high', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: (svc.assignedToName || 'Trabajador') + ' no ha fichado entrada (previsto ' + (svc.time || '??:??') + ')' });
    }
    if (exec.status === 'completed' && Array.isArray(svc.tasks) && svc.tasks.some(t => !t.done)) {
      alerts.push({ type: 'INCOMPLETE_SERVICE', severity: 'medium', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: 'Servicio completado con tareas sin terminar' });
    }
    if (scheduledStart && exec.checkInAt) {
      const checkInMs = new Date(exec.checkInAt).getTime();
      if (checkInMs > scheduledStart + 15 * 60000) {
        alerts.push({ type: 'LATE_START', severity: 'medium', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: (svc.assignedToName || 'Trabajador') + ' fichó con retraso (' + Math.round((checkInMs - scheduledStart) / 60000) + ' min)' });
      }
    }
    if (exec.realMinutes > 0 && exec.plannedMinutes > 0 && exec.realMinutes > exec.plannedMinutes + 30) {
      alerts.push({ type: 'OVERTIME', severity: 'medium', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: 'Exceso de tiempo: +' + (exec.realMinutes - exec.plannedMinutes) + ' min sobre lo previsto' });
    }
    if (exec.status === 'completed' && Array.isArray(exec.incidents) && exec.incidents.some(i => !i.resolvedAt)) {
      alerts.push({ type: 'UNRESOLVED_INCIDENT', severity: 'high', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: 'Incidencia sin resolver en servicio completado' });
    }
    if (exec.status === 'completed' && (!exec.photosBefore || exec.photosBefore.length === 0) && (!exec.photosAfter || exec.photosAfter.length === 0)) {
      alerts.push({ type: 'NO_PHOTOS', severity: 'low', serviceId: svc._id, serviceNumber: svc.serviceNumber, workerName: svc.assignedToName, message: 'Servicio completado sin evidencia fotográfica' });
    }
  }
  return alerts;
}

export async function checkInService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { geo } = req.body || {};
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    if (exec.status && exec.status !== 'not_started') {
      return badRequest(res, 'El servicio ya tiene un fichaje de entrada activo');
    }
    const now = new Date().toISOString();
    const plannedMinutes = Math.round(parseFloat(existing.duration || '0') * 60);
    const newExec = buildServiceExecution({
      ...exec,
      checkInAt: now,
      checkInGeo: geo || null,
      plannedMinutes,
      status: 'checked_in',
    }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, {
      ...existing,
      execution: newExec,
      status: 'in_progress',
      checkInAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const account = await findAccountByUserId(req, userId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || userId, targetUserId: userId,
      type: 'cleaning_execution', action: 'Fichó entrada en servicio ' + doc.serviceNumber,
      entityId: doc._id, entityLabel: doc.serviceNumber, metadata: { geo: geo || null },
    });
    triggerReactiveCleaningAlert(userId, 'service_checkin', { serviceId: doc._id, workerId: doc.assignedTo }).catch(() => {});
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al fichar entrada' });
  }
}

export async function checkOutService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { geo, workerNotes } = req.body || {};
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    if (!exec.checkInAt) {
      return badRequest(res, 'No se puede fichar salida sin haber fichado entrada');
    }
    if (exec.status === 'completed' || exec.status === 'validated') {
      return badRequest(res, 'El servicio ya está completado');
    }
    const now = new Date().toISOString();
    const checkInMs = new Date(exec.checkInAt).getTime();
    const checkOutMs = new Date(now).getTime();
    const pauseMin = computePauseMinutes(exec.pauseLog);
    const grossMinutes = Math.round((checkOutMs - checkInMs) / 60000);
    const realMinutes = Math.max(0, grossMinutes - pauseMin);
    const plannedMinutes = exec.plannedMinutes || Math.round(parseFloat(existing.duration || '0') * 60);
    const deviationMinutes = realMinutes - plannedMinutes;

    const newExec = buildServiceExecution({
      ...exec,
      checkOutAt: now,
      checkOutGeo: geo || null,
      realMinutes,
      plannedMinutes,
      deviationMinutes,
      workerNotes: workerNotes || exec.workerNotes || '',
      status: 'completed',
    }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, {
      ...existing,
      execution: newExec,
      status: 'completed',
      checkOutAt: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const account = await findAccountByUserId(req, userId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || userId, targetUserId: userId,
      type: 'cleaning_execution', action: 'Fichó salida en servicio ' + doc.serviceNumber + ' (' + realMinutes + ' min reales)',
      entityId: doc._id, entityLabel: doc.serviceNumber, metadata: { realMinutes, plannedMinutes, deviationMinutes },
    });
    triggerReactiveCleaningAlert(userId, 'service_checkout', { serviceId: doc._id, workerId: doc.assignedTo, realMinutes }).catch(() => {});
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al fichar salida' });
  }
}

export async function pauseService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { reason } = req.body || {};
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    if (exec.status !== 'checked_in' && exec.status !== 'in_progress') {
      return badRequest(res, 'Solo se puede pausar un servicio en curso');
    }
    const now = new Date().toISOString();
    const pauseLog = [...(exec.pauseLog || []), { startAt: now, endAt: '', reason: reason || '' }];
    const newExec = buildServiceExecution({ ...exec, pauseLog, status: 'paused' }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, execution: newExec }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al pausar servicio' });
  }
}

export async function resumeService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    if (exec.status !== 'paused') {
      return badRequest(res, 'El servicio no está pausado');
    }
    const now = new Date().toISOString();
    const pauseLog = [...(exec.pauseLog || [])];
    const lastPause = pauseLog.length > 0 ? pauseLog[pauseLog.length - 1] : null;
    if (lastPause && !lastPause.endAt) lastPause.endAt = now;
    const newExec = buildServiceExecution({ ...exec, pauseLog, status: 'in_progress' }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, execution: newExec }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reanudar servicio' });
  }
}

export async function reportServiceIncident(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { incident } = req.body || {};
    if (!incident || typeof incident !== 'object') return badRequest(res, 'Falta el objeto incident');
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    const now = new Date().toISOString();
    const newIncident = {
      id: uuidv4(),
      type: incident.type || 'other',
      severity: incident.severity || 'medium',
      description: incident.description || '',
      photoUrl: incident.photoUrl || '',
      timestamp: now,
      resolvedAt: '',
      resolvedBy: '',
      resolutionNotes: '',
    };
    const incidents = [...(exec.incidents || []), newIncident];
    const newExec = buildServiceExecution({ ...exec, incidents }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, execution: newExec }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const account = await findAccountByUserId(req, userId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || userId, targetUserId: userId,
      type: 'cleaning_execution', action: 'Reportó incidencia en servicio ' + doc.serviceNumber,
      entityId: doc._id, entityLabel: doc.serviceNumber, metadata: { incidentType: newIncident.type, severity: newIncident.severity },
    });
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reportar incidencia' });
  }
}

export async function resolveServiceIncident(req, res) {
  try {
    const { userId, serviceId, incidentId } = req.params;
    const { resolvedBy, resolutionNotes } = req.body || {};
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    const incidents = [...(exec.incidents || [])];
    const idx = incidents.findIndex(i => i.id === incidentId);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    incidents[idx] = {
      ...incidents[idx],
      resolvedAt: new Date().toISOString(),
      resolvedBy: resolvedBy || userId,
      resolutionNotes: resolutionNotes || '',
    };
    const newExec = buildServiceExecution({ ...exec, incidents }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, execution: newExec }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al resolver incidencia' });
  }
}

export async function addServicePhoto(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const phase = req.body?.phase || req.query?.phase;
    const geo = req.body?.geo || null;
    const file = req.file;

    if (phase !== 'before' && phase !== 'after') return badRequest(res, 'phase debe ser "before" o "after"');
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });

    let photoUrl = '';
    if (file) {
      const db = getCleaningDbName();
      const attachmentName = 'photo_' + phase + '_' + Date.now() + '_' + (file.originalname || 'image.jpg');
      const contentType = file.mimetype || 'image/jpeg';
      const latestDoc = await getDocument(req, db, serviceId);
      const currentRev = latestDoc?._rev || existing._rev;
      const nano = req.app?.locals?.nano || req.nano;
      const couchDb = nano.use(db);
      await couchDb.attachment.insert(serviceId, attachmentName, file.buffer, contentType, { rev: currentRev });
      photoUrl = '/api/cleaning/services/' + userId + '/' + serviceId + '/photo-file/' + attachmentName;
    } else if (req.body?.url) {
      photoUrl = req.body.url;
    } else {
      return badRequest(res, 'Falta archivo o URL de la foto');
    }

    const freshDoc = await getDocument(req, getCleaningDbName(), serviceId);
    const exec = freshDoc?.execution || existing.execution || {};
    const now = new Date().toISOString();
    const photo = { url: photoUrl, timestamp: now, geo };
    const photosBefore = [...(exec.photosBefore || [])];
    const photosAfter = [...(exec.photosAfter || [])];
    if (phase === 'before') photosBefore.push(photo);
    else photosAfter.push(photo);
    const newExec = buildServiceExecution({ ...exec, photosBefore, photosAfter }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...freshDoc, execution: newExec }, freshDoc);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al añadir foto' });
  }
}

export async function getServicePhotoFile(req, res) {
  try {
    const { userId, serviceId, filename } = req.params;
    const db = getCleaningDbName();
    const nano = req.app?.locals?.nano || req.nano;
    const couchDb = nano.use(db);
    const stream = await couchDb.attachment.get(serviceId, filename);
    const doc = await getDocument(req, db, serviceId);
    const att = doc?._attachments?.[filename];
    if (att?.content_type) res.setHeader('Content-Type', att.content_type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(stream);
  } catch (error) {
    return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
  }
}

export async function validateExecution(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { validatedBy, validationNotes } = req.body || {};
    const existing = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const exec = existing.execution || {};
    if (exec.status !== 'completed') {
      return badRequest(res, 'Solo se puede validar un servicio completado');
    }
    const now = new Date().toISOString();
    const newExec = buildServiceExecution({
      ...exec,
      validatedBy: validatedBy || userId,
      validatedAt: now,
      validationNotes: validationNotes || '',
      status: 'validated',
    }, exec);

    const db = getCleaningDbName();
    const doc = buildCleaningServiceDocument(userId, { ...existing, execution: newExec }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const account = await findAccountByUserId(req, userId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || userId, targetUserId: userId,
      type: 'cleaning_execution', action: 'Validó ejecución del servicio ' + doc.serviceNumber,
      entityId: doc._id, entityLabel: doc.serviceNumber, metadata: { realMinutes: newExec.realMinutes },
    });
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al validar ejecución' });
  }
}

export async function getExecutionSummary(req, res) {
  try {
    const { userId } = req.params;
    const { date, from, to } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let services = await listCleaningServicesByUser(req, userId);
    services = services.map(sanitizeCleaningService);

    if (date) {
      services = services.filter(s => s.date === date);
    } else {
      if (from) services = services.filter(s => s.date >= from);
      if (to) services = services.filter(s => s.date <= to);
    }

    let totalPlannedMinutes = 0;
    let totalRealMinutes = 0;
    let completed = 0;
    let validated = 0;
    let pending = 0;
    let inProgress = 0;
    let withIncidents = 0;
    let totalTasksDone = 0;
    let totalTasks = 0;
    const byWorkerMap = {};

    for (const svc of services) {
      const exec = svc.execution || {};
      totalPlannedMinutes += exec.plannedMinutes || 0;
      totalRealMinutes += exec.realMinutes || 0;
      if (exec.status === 'completed') completed++;
      if (exec.status === 'validated') { validated++; completed++; }
      if (exec.status === 'not_started') pending++;
      if (exec.status === 'checked_in' || exec.status === 'in_progress' || exec.status === 'paused') inProgress++;
      if (Array.isArray(exec.incidents) && exec.incidents.length > 0) withIncidents++;
      if (Array.isArray(svc.tasks)) {
        totalTasks += svc.tasks.length;
        totalTasksDone += svc.tasks.filter(t => t.done).length;
      }

      const wk = svc.assignedTo || '__unassigned__';
      if (!byWorkerMap[wk]) {
        byWorkerMap[wk] = { memberId: svc.assignedTo || '', memberName: svc.assignedToName || 'Sin asignar', services: 0, realMinutes: 0, plannedMinutes: 0, incidents: 0 };
      }
      byWorkerMap[wk].services++;
      byWorkerMap[wk].realMinutes += exec.realMinutes || 0;
      byWorkerMap[wk].plannedMinutes += exec.plannedMinutes || 0;
      byWorkerMap[wk].incidents += (exec.incidents || []).length;
    }

    const alerts = generateExecutionAlerts(services);

    return res.json({
      ok: true,
      summary: {
        totalServices: services.length,
        completed,
        validated,
        pending,
        inProgress,
        withIncidents,
        totalPlannedMinutes,
        totalRealMinutes,
        deviationMinutes: totalRealMinutes - totalPlannedMinutes,
        avgCompletionRate: totalTasks > 0 ? Math.round((totalTasksDone / totalTasks) * 100) : 0,
        alerts,
        byWorker: Object.values(byWorkerMap),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen de ejecución' });
  }
}

// ─── CLEANING ROUTES ────────────────────────────────────────────────────────

async function ensureCleaningRouteOwner(req, userId, routeId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, routeId);
  if (!doc || doc.type !== 'cleaning_route' || doc.user_id !== userId) return null;
  return doc;
}

export async function listCleaningRoutes(req, res) {
  try {
    const { userId } = req.params;
    const { date, workerId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    let routes;
    if (date) routes = await listCleaningRoutesByDate(req, userId, date);
    else if (workerId) routes = await listCleaningRoutesByWorker(req, userId, workerId);
    else routes = await listCleaningRoutesByUser(req, userId);
    return res.json({ ok: true, routes: routes.map(sanitizeCleaningRoute) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar rutas' });
  }
}

export async function createCleaningRoute(req, res) {
  try {
    const { userId } = req.params;
    const { route } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!route || typeof route !== 'object') return badRequest(res, 'Falta el objeto route en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildCleaningRouteDocument(userId, route);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_route', action: `Creó ruta para ${doc.workerName} — ${doc.date}`,
      entityId: doc._id, entityLabel: `${doc.workerName} ${doc.date}`.trim(),
      metadata: { status: doc.status, entries: doc.entries.length },
    });
    return res.status(201).json({ ok: true, route: sanitizeCleaningRoute({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear ruta' });
  }
}

export async function updateCleaningRoute(req, res) {
  try {
    const { userId, routeId } = req.params;
    const { route } = req.body || {};
    if (!route || typeof route !== 'object') return badRequest(res, 'Faltan datos de la ruta');
    const existing = await ensureCleaningRouteOwner(req, userId, routeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildCleaningRouteDocument(userId, { ...existing, ...route }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_route', action: `Actualizó ruta ${doc.workerName} → ${doc.status}`,
      entityId: doc._id, entityLabel: `${doc.workerName} ${doc.date}`.trim(),
      metadata: { status: doc.status },
    });
    return res.json({ ok: true, route: sanitizeCleaningRoute({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar ruta' });
  }
}

export async function reorderCleaningRoute(req, res) {
  try {
    const { userId, routeId } = req.params;
    const { entryOrder } = req.body || {};
    if (!Array.isArray(entryOrder)) return badRequest(res, 'Falta entryOrder (array de serviceId)');
    const existing = await ensureCleaningRouteOwner(req, userId, routeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
    const entriesByService = {};
    for (const e of existing.entries || []) entriesByService[e.serviceId] = e;
    const reordered = entryOrder.map((serviceId, idx) => ({
      ...(entriesByService[serviceId] || { serviceId }),
      order: idx + 1,
    }));
    const db = getCleaningDbName();
    const doc = buildCleaningRouteDocument(userId, { ...existing, entries: reordered }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, route: sanitizeCleaningRoute({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reordenar ruta' });
  }
}

export async function reassignCleaningRoute(req, res) {
  try {
    const { userId, routeId } = req.params;
    const { newWorkerId, newWorkerName } = req.body || {};
    if (!newWorkerId || !newWorkerName) return badRequest(res, 'Falta newWorkerId o newWorkerName');
    const existing = await ensureCleaningRouteOwner(req, userId, routeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const oldWorker = existing.workerName;
    const doc = buildCleaningRouteDocument(userId, { ...existing, workerId: newWorkerId, workerName: newWorkerName }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    for (const entry of existing.entries || []) {
      if (!entry.serviceId) continue;
      try {
        const svcDoc = await getDocument(req, db, entry.serviceId);
        if (svcDoc && svcDoc.type === 'cleaning_service') {
          const updatedSvc = buildCleaningServiceDocument(userId, { ...svcDoc, assignedTo: newWorkerId, assignedToName: newWorkerName }, svcDoc);
          await putDocument(req, db, updatedSvc._id, updatedSvc);
        }
      } catch { /* skip */ }
    }
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_route', action: `Reasignó ruta de ${oldWorker} → ${newWorkerName} (${doc.date})`,
      entityId: doc._id, entityLabel: `${newWorkerName} ${doc.date}`.trim(),
      metadata: { oldWorker, newWorker: newWorkerName },
    });
    return res.json({ ok: true, route: sanitizeCleaningRoute({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reasignar ruta' });
  }
}

export async function removeCleaningRoute(req, res) {
  try {
    const { userId, routeId } = req.params;
    const existing = await ensureCleaningRouteOwner(req, userId, routeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await softDeleteDocument(req, db, routeId);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_route', action: `Eliminó ruta de ${existing.workerName} (${existing.date})`,
      entityId: existing._id, entityLabel: `${existing.workerName} ${existing.date}`.trim(),
      metadata: {},
    });
    return res.json({ ok: true, id: routeId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar ruta' });
  }
}

export async function generateCleaningRoutes(req, res) {
  try {
    const { userId } = req.params;
    const { date } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!date) return badRequest(res, 'Falta date');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const services = await listCleaningServicesByDate(req, userId, date);
    const allServices = await listCleaningServicesByUser(req, userId);
    const db = getCleaningDbName();
    await ensureDatabase(req, db);

    // Expand recurrent services for the target date
    const recurrentExpanded = [];
    const targetDow = new Date(date).getDay();
    for (const svc of allServices) {
      if (!svc.recurrence?.type || svc.recurrence.type === 'none') continue;
      if (svc.recurrence.endDate && svc.recurrence.endDate < date) continue;
      if (svc.date === date) continue;
      let matches = false;
      if (svc.recurrence.type === 'daily') matches = true;
      else if (svc.recurrence.type === 'weekly') matches = (svc.recurrence.days || []).includes(targetDow);
      else if (svc.recurrence.type === 'biweekly') {
        const diffWeeks = Math.floor((new Date(date).getTime() - new Date(svc.date).getTime()) / (7 * 86400000));
        matches = diffWeeks % 2 === 0 && (svc.recurrence.days || []).includes(targetDow);
      } else if (svc.recurrence.type === 'monthly') {
        matches = new Date(date).getDate() === new Date(svc.date).getDate();
      }
      if (matches && !services.some(s => s.recurrenceParentId === svc._id)) recurrentExpanded.push(svc);
    }

    const createdServices = [];
    for (const parent of recurrentExpanded) {
      const child = buildCleaningServiceDocument(userId, {
        ...parent, date, status: parent.assignedTo ? 'assigned' : 'pending',
        recurrenceParentId: parent._id, recurrence: { type: 'none', days: [], endDate: '' },
        routeId: '', checkInAt: '', checkOutAt: '',
        tasks: (parent.tasks || []).map(t => ({ ...t, done: false })),
      });
      const saved = await putDocument(req, db, child._id, child);
      createdServices.push({ ...child, _rev: saved.rev });
    }

    // Group by worker and build routes
    const allForDate = [...services, ...createdServices];
    const byWorker = {};
    for (const svc of allForDate) {
      const wk = svc.assignedTo || '__unassigned__';
      if (!byWorker[wk]) byWorker[wk] = { workerId: svc.assignedTo || '', workerName: svc.assignedToName || 'Sin asignar', services: [] };
      byWorker[wk].services.push(svc);
    }

    const existingRoutes = await listCleaningRoutesByDate(req, userId, date);
    const existingByWorker = {};
    for (const r of existingRoutes) existingByWorker[r.workerId] = r;

    const routes = [];
    const warnings = [];
    for (const [wk, group] of Object.entries(byWorker)) {
      if (wk === '__unassigned__') {
        for (const s of group.services) warnings.push({ type: 'unassigned', serviceId: s._id, message: `Servicio ${s.serviceNumber} sin trabajador asignado` });
        continue;
      }
      const sorted = group.services.sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
        if (a.zone !== b.zone) return (a.zone || '').localeCompare(b.zone || '');
        return (a.time || '').localeCompare(b.time || '');
      });
      const entries = sorted.map((svc, idx) => ({
        serviceId: svc._id, order: idx + 1, estimatedStartTime: svc.time || '', estimatedEndTime: '',
        actualStartTime: '', actualEndTime: '', status: 'pending', travelTimeMin: 0,
        clientName: svc.clientName, address: svc.address, cleaningType: svc.cleaningType,
        duration: svc.duration, priority: svc.priority || 'normal', zone: svc.zone || '', overlap: false,
      }));

      // Calculate end times and detect overlaps
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.estimatedStartTime && e.duration) {
          const [h, m] = e.estimatedStartTime.split(':').map(Number);
          const durMin = Math.round(parseFloat(e.duration) * 60);
          const endMin = h * 60 + (m || 0) + durMin + e.travelTimeMin;
          e.estimatedEndTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
          if (i + 1 < entries.length && entries[i + 1].estimatedStartTime) {
            const [nh, nm] = entries[i + 1].estimatedStartTime.split(':').map(Number);
            if (endMin > nh * 60 + (nm || 0)) {
              entries[i + 1].overlap = true;
              warnings.push({ type: 'overlap', routeWorker: group.workerName, serviceId: entries[i + 1].serviceId, message: `Solapamiento: ${e.clientName} termina a las ${e.estimatedEndTime} pero ${entries[i + 1].clientName} empieza a las ${entries[i + 1].estimatedStartTime}` });
            }
          }
        }
      }
      const totalMin = entries.reduce((s, e) => s + Math.round(parseFloat(e.duration || '0') * 60) + e.travelTimeMin, 0);
      const existingRoute = existingByWorker[wk];
      const routeDoc = buildCleaningRouteDocument(userId, { date, workerId: group.workerId, workerName: group.workerName, status: 'active', entries, totalEstimatedMinutes: totalMin }, existingRoute || null);
      const savedRoute = await putDocument(req, db, routeDoc._id, routeDoc);

      for (const entry of entries) {
        try {
          const svcDoc = await getDocument(req, db, entry.serviceId);
          if (svcDoc?.type === 'cleaning_service') {
            const updated = buildCleaningServiceDocument(userId, { ...svcDoc, routeId: routeDoc._id }, svcDoc);
            await putDocument(req, db, updated._id, updated);
          }
        } catch { /* skip */ }
      }
      routes.push(sanitizeCleaningRoute({ ...routeDoc, _rev: savedRoute.rev }));
    }
    triggerReactiveCleaningAlert(userId, 'route_generated', { date, routeCount: routes.length }).catch(() => {});
    return res.json({ ok: true, routes, warnings, expandedServices: createdServices.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar rutas' });
  }
}

// ─── CLEANING INCIDENTS ──────────────────────────────────────────────────────

async function ensureCleaningIncidentOwner(req, userId, incidentId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, incidentId);
  if (!doc || doc.type !== 'cleaning_incident' || doc.user_id !== userId) return null;
  return doc;
}

export async function listCleaningIncidents(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const incidents = await listCleaningIncidentsByUser(req, userId);
    return res.json({ ok: true, incidents: incidents.map(sanitizeCleaningIncident) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar incidencias' });
  }
}

export async function createCleaningIncident(req, res) {
  try {
    const { userId } = req.params;
    const { incident } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!incident || typeof incident !== 'object') return badRequest(res, 'Falta el objeto incident en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildCleaningIncidentDocument(userId, incident);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_incident',
      action: `Registró incidencia ${doc.incidentNumber} — ${doc.incidentType}`,
      entityId: doc._id,
      entityLabel: `${doc.incidentNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status, priority: doc.priority, incidentType: doc.incidentType },
    });
    triggerReactiveCleaningAlert(userId, 'incident_created', { incidentId: doc._id, incidentType: doc.incidentType, priority: doc.priority }).catch(() => {});
    return res.status(201).json({ ok: true, incident: sanitizeCleaningIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear incidencia' });
  }
}

export async function updateCleaningIncident(req, res) {
  try {
    const { userId, incidentId } = req.params;
    const { incident } = req.body || {};
    if (!incident || typeof incident !== 'object') return badRequest(res, 'Faltan datos de la incidencia');
    const existing = await ensureCleaningIncidentOwner(req, userId, incidentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildCleaningIncidentDocument(userId, { ...existing, ...incident }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_incident',
      action: `Actualizó incidencia ${doc.incidentNumber} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.incidentNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status, priority: doc.priority },
    });
    if (doc.status === 'resolved' || doc.status === 'closed') {
      triggerReactiveCleaningAlert(userId, 'incident_resolved', { incidentId: doc._id }).catch(() => {});
    }
    return res.json({ ok: true, incident: sanitizeCleaningIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar incidencia' });
  }
}

export async function removeCleaningIncident(req, res) {
  try {
    const { userId, incidentId } = req.params;
    const existing = await ensureCleaningIncidentOwner(req, userId, incidentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await softDeleteDocument(req, db, incidentId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_incident',
      action: `Eliminó incidencia ${existing.incidentNumber}`,
      entityId: existing._id,
      entityLabel: existing.incidentNumber,
      metadata: {},
    });
    return res.json({ ok: true, id: incidentId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar incidencia' });
  }
}

// ─── CLEANING WORKERS ──────────────────────────────────────────────────────

async function ensureCleaningWorkerOwner(req, userId, workerId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, workerId);
  if (!doc || doc.type !== 'cleaning_worker' || doc.user_id !== userId) return null;
  return doc;
}

export async function listCleaningWorkers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const workers = await listCleaningWorkersByUser(req, userId);
    return res.json({ ok: true, workers: workers.map(sanitizeCleaningWorker) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar trabajadores' });
  }
}

export async function getCleaningWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    if (!userId || !workerId) return badRequest(res, 'Faltan parámetros');
    const existing = await ensureCleaningWorkerOwner(req, userId, workerId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    return res.json({ ok: true, worker: sanitizeCleaningWorker(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener trabajador' });
  }
}

export async function createCleaningWorker(req, res) {
  try {
    const { userId } = req.params;
    const { worker } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!worker || typeof worker !== 'object') return badRequest(res, 'Falta el objeto worker en el body');
    if (!worker.name || !String(worker.name).trim()) return badRequest(res, 'El nombre es obligatorio');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildCleaningWorkerDocument(userId, worker);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_worker',
      action: `Creó trabajador ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status, contractType: doc.contractType },
    });
    return res.status(201).json({ ok: true, worker: sanitizeCleaningWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear trabajador' });
  }
}

export async function updateCleaningWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    const { worker } = req.body || {};
    if (!worker || typeof worker !== 'object') return badRequest(res, 'Faltan datos del trabajador');
    const existing = await ensureCleaningWorkerOwner(req, userId, workerId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildCleaningWorkerDocument(userId, { ...existing, ...worker }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_worker',
      action: `Actualizó trabajador ${doc.name} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status },
    });
    return res.json({ ok: true, worker: sanitizeCleaningWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar trabajador' });
  }
}

export async function removeCleaningWorker(req, res) {
  try {
    const { userId, workerId } = req.params;
    const existing = await ensureCleaningWorkerOwner(req, userId, workerId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await softDeleteDocument(req, db, workerId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_worker',
      action: `Eliminó trabajador ${existing.name}`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: {},
    });
    return res.json({ ok: true, id: workerId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar trabajador' });
  }
}

export async function assignWorkerToService(req, res) {
  try {
    const { userId, serviceId } = req.params;
    const { workerId } = req.body || {};
    if (!workerId) return badRequest(res, 'Falta workerId');
    const service = await ensureCleaningServiceOwner(req, userId, serviceId);
    if (!service) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    const worker = await ensureCleaningWorkerOwner(req, userId, workerId);
    if (!worker) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const updates = {
      workerId: worker._id,
      assignedTo: worker._id,
      assignedToName: worker.name,
    };
    if (service.status === 'pending') updates.status = 'assigned';
    const doc = buildCleaningServiceDocument(userId, { ...service, ...updates }, service);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_service',
      action: `Asignó ${worker.name} al servicio ${doc.serviceNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.serviceNumber} → ${worker.name}`,
      metadata: { workerId: worker._id, status: doc.status },
    });
    triggerReactiveCleaningAlert(userId, 'service_assigned', { serviceId: doc._id, workerId: worker._id }).catch(() => {});
    return res.json({ ok: true, service: sanitizeCleaningService({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al asignar trabajador' });
  }
}

export async function listWorkerServices(req, res) {
  try {
    const { userId, workerId } = req.params;
    const { from, to } = req.query;
    if (!userId || !workerId) return badRequest(res, 'Faltan parámetros');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const allServices = await listCleaningServicesByUser(req, userId);
    const services = allServices.filter(s => {
      if (s.workerId !== workerId && s.assignedTo !== workerId) return false;
      if (from && s.date < from) return false;
      if (to && s.date > to) return false;
      return true;
    });
    return res.json({ ok: true, services: services.map(sanitizeCleaningService) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar servicios del trabajador' });
  }
}

// ─── PRODUCTIVITY ───────────────────────────────────────────────────────────

export async function getCleaningProductivity(req, res) {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const workers = await listCleaningWorkersByUser(req, userId);
    const allServices = await listCleaningServicesByUser(req, userId);
    const services = allServices.filter(s => {
      if (from && s.date < from) return false;
      if (to && s.date > to) return false;
      return true;
    });

    const LATE_THRESHOLD_MIN = 15;
    const workerMetrics = [];
    const clientCostMap = {};

    for (const w of workers) {
      const wSvcs = services.filter(s => s.workerId === w._id || s.assignedTo === w._id);
      const completed = wSvcs.filter(s => s.status === 'completed');
      const cancelled = wSvcs.filter(s => s.status === 'cancelled');
      const assigned = wSvcs.filter(s => s.status === 'assigned');

      let serviceMinutes = 0;
      let lateArrivals = 0;
      let totalDelayMin = 0;
      let absences = 0;
      let totalRevenue = 0;
      let qualitySum = 0;
      let qualityCount = 0;
      let clientRatingSum = 0;
      let clientRatingCount = 0;

      for (const s of completed) {
        if (s.checkInAt && s.checkOutAt) {
          serviceMinutes += Math.max(0, (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 60000);
        }
        totalRevenue += Number(s.price || 0);
        if (Number(s.qualityRating) > 0) { qualitySum += Number(s.qualityRating); qualityCount++; }
        if (Number(s.clientRating) > 0) { clientRatingSum += Number(s.clientRating); clientRatingCount++; }

        if (s.checkInAt && s.time) {
          const scheduled = new Date(`${s.date}T${s.time}`);
          const actual = new Date(s.checkInAt);
          const diff = (actual.getTime() - scheduled.getTime()) / 60000;
          if (diff > LATE_THRESHOLD_MIN) {
            lateArrivals++;
            totalDelayMin += diff;
          }
        }

        const clientKey = s.clientName || 'Sin cliente';
        if (!clientCostMap[clientKey]) clientCostMap[clientKey] = { totalMinutes: 0, servicesCount: 0, workerNames: new Set() };
        if (s.checkInAt && s.checkOutAt) {
          clientCostMap[clientKey].totalMinutes += Math.max(0, (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 60000);
        }
        clientCostMap[clientKey].servicesCount++;
        clientCostMap[clientKey].workerNames.add(w.name);
      }

      const now = new Date();
      for (const s of assigned) {
        if (s.date && s.time) {
          const scheduled = new Date(`${s.date}T${s.time}`);
          if (scheduled < now && !s.checkInAt) absences++;
        }
      }

      const serviceHours = Math.round((serviceMinutes / 60) * 100) / 100;
      const laborCost = serviceHours * (w.hourlyCost || 0);

      workerMetrics.push({
        workerId: w._id,
        workerName: w.name,
        status: w.status,
        serviceHours,
        completedServices: completed.length,
        cancelledServices: cancelled.length,
        totalServices: wSvcs.length,
        lateArrivals,
        avgDelayMinutes: lateArrivals > 0 ? Math.round(totalDelayMin / lateArrivals) : 0,
        absences,
        servicesPerHour: serviceHours > 0 ? Math.round((completed.length / serviceHours) * 100) / 100 : 0,
        revenuePerHour: serviceHours > 0 ? Math.round((totalRevenue / serviceHours) * 100) / 100 : 0,
        avgQualityRating: qualityCount > 0 ? Math.round((qualitySum / qualityCount) * 10) / 10 : 0,
        avgClientRating: clientRatingCount > 0 ? Math.round((clientRatingSum / clientRatingCount) * 10) / 10 : 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        laborCost: Math.round(laborCost * 100) / 100,
        profitability: Math.round((totalRevenue - laborCost) * 100) / 100,
      });
    }

    const totalServiceHours = workerMetrics.reduce((s, m) => s + m.serviceHours, 0);
    const totalServicesCompleted = workerMetrics.reduce((s, m) => s + m.completedServices, 0);
    const totalRevenue = workerMetrics.reduce((s, m) => s + m.totalRevenue, 0);
    const totalLaborCost = workerMetrics.reduce((s, m) => s + m.laborCost, 0);

    const costByClient = Object.entries(clientCostMap).map(([clientName, data]) => {
      const d = data;
      const hours = d.totalMinutes / 60;
      const avgHourlyCost = workers.length > 0 ? workers.reduce((s, w) => s + (w.hourlyCost || 0), 0) / workers.length : 0;
      const cost = hours * avgHourlyCost;
      return {
        clientName,
        totalHours: Math.round(hours * 100) / 100,
        laborCost: Math.round(cost * 100) / 100,
        servicesCount: d.servicesCount,
        avgCostPerService: d.servicesCount > 0 ? Math.round((cost / d.servicesCount) * 100) / 100 : 0,
        workers: Array.from(d.workerNames),
      };
    }).sort((a, b) => b.laborCost - a.laborCost);

    workerMetrics.sort((a, b) => b.profitability - a.profitability);

    return res.json({
      ok: true,
      period: { from: from || '', to: to || '' },
      workers: workerMetrics,
      totals: {
        totalWorkers: workers.length,
        totalServiceHours: Math.round(totalServiceHours * 100) / 100,
        totalServicesCompleted,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalLaborCost: Math.round(totalLaborCost * 100) / 100,
        avgServicesPerHour: totalServiceHours > 0 ? Math.round((totalServicesCompleted / totalServiceHours) * 100) / 100 : 0,
        avgRevenuePerHour: totalServiceHours > 0 ? Math.round((totalRevenue / totalServiceHours) * 100) / 100 : 0,
      },
      costByClient,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular productividad' });
  }
}

export async function getWorkerStats(req, res) {
  try {
    const { userId, workerId } = req.params;
    const { period } = req.query;
    if (!userId || !workerId) return badRequest(res, 'Faltan parámetros');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date();
    let from;
    if (period === 'today') from = now.toISOString().slice(0, 10);
    else if (period === 'week') from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    else from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);

    const allServices = await listCleaningServicesByUser(req, userId);
    const wSvcs = allServices.filter(s =>
      (s.workerId === workerId || s.assignedTo === workerId) && s.date >= from && s.date <= to
    );
    const completed = wSvcs.filter(s => s.status === 'completed');

    let serviceMinutes = 0;
    let totalRevenue = 0;
    for (const s of completed) {
      if (s.checkInAt && s.checkOutAt) {
        serviceMinutes += Math.max(0, (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 60000);
      }
      totalRevenue += Number(s.price || 0);
    }
    const serviceHours = Math.round((serviceMinutes / 60) * 100) / 100;

    return res.json({
      ok: true,
      period: { from, to },
      stats: {
        totalServices: wSvcs.length,
        completedServices: completed.length,
        serviceHours,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        servicesPerHour: serviceHours > 0 ? Math.round((completed.length / serviceHours) * 100) / 100 : 0,
        revenuePerHour: serviceHours > 0 ? Math.round((totalRevenue / serviceHours) * 100) / 100 : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener stats' });
  }
}

// ─── SERVICE CONTRACTS ──────────────────────────────────────────────────────

async function ensureContractOwner(req, userId, contractId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, contractId);
  if (!doc || doc.type !== 'service_contract' || doc.user_id !== userId) return null;
  return doc;
}

export async function listServiceContracts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const { status, clientId, workerId, zone } = req.query;
    const contracts = await listServiceContractsByUser(req, userId, { status, clientId, workerId, zone });
    return res.json({ ok: true, contracts: contracts.map(sanitizeServiceContract) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar contratos de servicio' });
  }
}

export async function getServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    return res.json({ ok: true, contract: sanitizeServiceContract(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener contrato' });
  }
}

export async function createServiceContract(req, res) {
  try {
    const { userId } = req.params;
    const { contract } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!contract || typeof contract !== 'object') return badRequest(res, 'Falta el objeto contract en el body');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const doc = buildServiceContractDocument(userId, contract);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Creó contrato ${doc.contractNumber} — ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: doc.contractStatus, frequency: doc.frequency, pricingModel: doc.pricingModel },
    });
    return res.status(201).json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear contrato de servicio' });
  }
}

export async function updateServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const { contract } = req.body || {};
    if (!contract || typeof contract !== 'object') return badRequest(res, 'Faltan datos del contrato');
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildServiceContractDocument(userId, { ...existing, ...contract }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Actualizó contrato ${doc.contractNumber} → ${doc.contractStatus}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: doc.contractStatus },
    });
    return res.json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar contrato' });
  }
}

export async function removeServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    await softDeleteDocument(req, db, contractId);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Eliminó contrato ${existing.contractNumber}`,
      entityId: existing._id,
      entityLabel: existing.contractNumber,
      metadata: {},
    });
    return res.json({ ok: true, id: contractId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar contrato' });
  }
}

export async function activateServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildServiceContractDocument(userId, { ...existing, contractStatus: 'active' }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Activó contrato ${doc.contractNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: 'active' },
    });
    return res.json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al activar contrato' });
  }
}

export async function pauseServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const doc = buildServiceContractDocument(userId, { ...existing, contractStatus: 'paused' }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Pausó contrato ${doc.contractNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: 'paused' },
    });
    return res.json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al pausar contrato' });
  }
}

export async function cancelServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const { reason } = req.body || {};
    const doc = buildServiceContractDocument(userId, {
      ...existing,
      contractStatus: 'cancelled',
      observations: reason ? `${existing.observations}\n[Cancelado] ${reason}`.trim() : existing.observations,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Canceló contrato ${doc.contractNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: 'cancelled', reason: reason || '' },
    });
    return res.json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar contrato' });
  }
}

export async function renewServiceContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getCleaningDbName();
    const { newEndDate } = req.body || {};
    const renewedEndDate = newEndDate || '';
    const now = new Date().toISOString().slice(0, 10);
    const doc = buildServiceContractDocument(userId, {
      ...existing,
      contractStatus: 'active',
      endDate: renewedEndDate,
      renewalDate: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Renovó contrato ${doc.contractNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { contractStatus: 'active', newEndDate: renewedEndDate },
    });
    return res.json({ ok: true, contract: sanitizeServiceContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al renovar contrato' });
  }
}

export async function getServiceContractStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const contracts = await listServiceContractsByUser(req, userId);

    const active = contracts.filter(c => c.contractStatus === 'active');
    const paused = contracts.filter(c => c.contractStatus === 'paused');
    const pendingRenewal = contracts.filter(c => {
      if (!c.endDate || c.autoRenew) return false;
      const daysUntil = Math.ceil((new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= (c.renewalNoticeDays || 30);
    });
    const expired = contracts.filter(c => {
      if (!c.endDate) return false;
      return new Date(c.endDate) < new Date() && c.contractStatus !== 'cancelled';
    });

    let estimatedMonthlyRevenue = 0;
    for (const c of active) {
      if (c.pricingModel === 'monthly') {
        estimatedMonthlyRevenue += c.monthlyPrice || 0;
      } else if (c.pricingModel === 'per_service') {
        estimatedMonthlyRevenue += (c.pricePerService || 0) * (c.contractedVisitsPerMonth || 4);
      } else if (c.pricingModel === 'per_hour') {
        estimatedMonthlyRevenue += (c.pricePerHour || 0) * (c.contractedHoursPerVisit || 0) * (c.contractedVisitsPerMonth || 4);
      }
    }

    return res.json({
      ok: true,
      stats: {
        total: contracts.length,
        active: active.length,
        paused: paused.length,
        pendingRenewal: pendingRenewal.length,
        expired: expired.length,
        estimatedMonthlyRevenue: Number(estimatedMonthlyRevenue.toFixed(2)),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas' });
  }
}

// ─── SERVICE GENERATION ─────────────────────────────────────────────────────

export async function generateContractServices(req, res) {
  try {
    const { userId, contractId } = req.params;
    const { fromDate, toDate, skipExisting = true } = req.body || {};
    if (!fromDate || !toDate) return badRequest(res, 'Faltan fromDate y toDate');

    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    if (existing.contractStatus !== 'active') {
      return badRequest(res, 'Solo se pueden generar servicios de contratos activos');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const contract = sanitizeServiceContract(existing);
    const dates = computeServiceDates(contract, fromDate, toDate);
    const db = getCleaningDbName();

    const allServices = await listCleaningServicesByUser(req, userId);
    const result = { generated: 0, skipped: 0, errors: [], serviceIds: [] };

    for (const date of dates) {
      if (skipExisting) {
        const dup = allServices.find(
          s => s.contractId === contractId && s.date === date && s.status !== 'cancelled',
        );
        if (dup) { result.skipped++; continue; }
      }

      const slot = contract.scheduleDays.find(s => {
        const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        return dayMap[s.day] === new Date(date + 'T00:00:00').getDay();
      });

      const svcDoc = buildCleaningServiceDocument(userId, {
        contractId: contract._id,
        contractNumber: contract.contractNumber,
        clientName: contract.clientName,
        clientPhone: contract.clientPhone,
        clientEmail: contract.clientEmail,
        address: contract.address,
        clientType: contract.clientType,
        date,
        time: slot?.startTime || '',
        duration: String(contract.contractedHoursPerVisit || ''),
        cleaningType: contract.cleaningType,
        assignedTo: contract.assignedWorkerId,
        assignedToName: contract.assignedWorkerName,
        status: contract.assignedWorkerId ? 'assigned' : 'pending',
        price: computeServicePrice(contract, dates.length),
        notes: contract.clientInstructions,
      });

      try {
        const saved = await putDocument(req, db, svcDoc._id, svcDoc);
        result.generated++;
        result.serviceIds.push(svcDoc._id);
      } catch (e) {
        result.errors.push(`Error ${date}: ${e.message}`);
      }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Generó ${result.generated} servicios desde contrato ${contract.contractNumber} (${fromDate} → ${toDate})`,
      entityId: contractId,
      entityLabel: contract.contractNumber,
      metadata: { generated: result.generated, skipped: result.skipped },
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar servicios' });
  }
}

export async function generateAllContractsServices(req, res) {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.body || {};
    if (!fromDate || !toDate) return badRequest(res, 'Faltan fromDate y toDate');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const contracts = await listServiceContractsByUser(req, userId, { status: 'active' });
    const db = getCleaningDbName();
    const allServices = await listCleaningServicesByUser(req, userId);
    const totals = { generated: 0, skipped: 0, errors: [], contracts: 0 };

    for (const rawContract of contracts) {
      const contract = sanitizeServiceContract(rawContract);
      if (contract.frequency === 'on_demand') continue;
      const dates = computeServiceDates(contract, fromDate, toDate);
      totals.contracts++;

      for (const date of dates) {
        const dup = allServices.find(
          s => s.contractId === contract._id && s.date === date && s.status !== 'cancelled',
        );
        if (dup) { totals.skipped++; continue; }

        const slot = contract.scheduleDays.find(s => {
          const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
          return dayMap[s.day] === new Date(date + 'T00:00:00').getDay();
        });

        const svcDoc = buildCleaningServiceDocument(userId, {
          contractId: contract._id,
          contractNumber: contract.contractNumber,
          clientName: contract.clientName,
          clientPhone: contract.clientPhone,
          clientEmail: contract.clientEmail,
          address: contract.address,
          clientType: contract.clientType,
          date,
          time: slot?.startTime || '',
          duration: String(contract.contractedHoursPerVisit || ''),
          cleaningType: contract.cleaningType,
          assignedTo: contract.assignedWorkerId,
          assignedToName: contract.assignedWorkerName,
          status: contract.assignedWorkerId ? 'assigned' : 'pending',
          price: computeServicePrice(contract, dates.length),
          notes: contract.clientInstructions,
        });

        try {
          await putDocument(req, db, svcDoc._id, svcDoc);
          totals.generated++;
        } catch (e) {
          totals.errors.push(`${contract.contractNumber} ${date}: ${e.message}`);
        }
      }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'service_contract',
      action: `Generación masiva: ${totals.generated} servicios de ${totals.contracts} contratos (${fromDate} → ${toDate})`,
      entityId: userId,
      entityLabel: 'Generación masiva',
      metadata: totals,
    });

    return res.json({ ok: true, ...totals });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar servicios' });
  }
}

// ─── Generation helpers (server-side, no TS) ────────────────────────────────

function computeServiceDates(contract, fromDate, toDate) {
  const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dates = [];
  let current = fromDate;
  while (current <= toDate) {
    const dow = new Date(current + 'T00:00:00').getDay();
    const dom = new Date(current + 'T00:00:00').getDate();
    let include = false;

    switch (contract.frequency) {
      case 'daily':
        include = dow >= 1 && dow <= 5;
        break;
      case 'daily_all':
        include = true;
        break;
      case 'weekly_1': case 'weekly_2': case 'weekly_3': case 'weekly_4': case 'weekly_5': {
        const allowed = (contract.scheduleDays || []).map(s => DAY_MAP[s.day]).filter(n => n !== undefined);
        include = allowed.includes(dow);
        break;
      }
      case 'biweekly': {
        const allowed = (contract.scheduleDays || []).map(s => DAY_MAP[s.day]).filter(n => n !== undefined);
        if (allowed.includes(dow)) {
          const ref = new Date(contract.startDate || fromDate + 'T00:00:00');
          const diff = Math.floor((new Date(current + 'T00:00:00').getTime() - ref.getTime()) / (7 * 86400000));
          include = diff % 2 === 0;
        }
        break;
      }
      case 'monthly': {
        const targets = (contract.customFrequencyDays || []).length > 0
          ? contract.customFrequencyDays
          : (contract.scheduleDays || []).map(s => DAY_MAP[s.day]);
        include = targets.includes(dom);
        break;
      }
      case 'custom':
        include = (contract.customFrequencyDays || []).includes(dom);
        break;
      default:
        break;
    }

    if (include) dates.push(current);
    const d = new Date(current + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return dates;
}

function computeServicePrice(contract, totalServices) {
  if (contract.pricingModel === 'per_service') return contract.pricePerService || 0;
  if (contract.pricingModel === 'per_hour') return (contract.pricePerHour || 0) * (contract.contractedHoursPerVisit || 0);
  if (contract.pricingModel === 'monthly' && totalServices > 0) {
    return Number(((contract.monthlyPrice || 0) / totalServices).toFixed(2));
  }
  return 0;
}
