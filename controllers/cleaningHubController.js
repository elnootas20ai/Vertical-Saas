/**
 * Cleaning Hub Controller — Endpoints para el dashboard de limpieza
 *
 * Alimenta el frontend cleaningHubApi.ts con KPIs, alertas, trabajadores,
 * materiales y métricas de la vertical limpieza.
 */

import {
  getCleaningDbName,
  getClockinsDbName,
  getFinanceDbName,
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
  findAccountByUserId,
  listCleaningWorkersByUser,
} from '../services/couchdb.js';
import { getCleaningAlertSummary } from '../services/cleaningAlertEngine.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

async function fetchAllDocs(req, dbName) {
  try {
    await ensureDatabase(req, dbName);
    const docs = await getAllDocuments(req, dbName);
    return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
  } catch { return []; }
}

async function fetchDocsOfType(req, dbName, type) {
  try {
    await ensureDatabase(req, dbName);
    const docs = await getAllDocuments(req, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch { return []; }
}

function workerInitials(name) {
  return String(name || '')
    .split(' ')
    .map((n) => n[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── GET /api/cleaning-hub/kpis/:userId ─────────────────────────────────────

export async function getCleaningHubKpis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const today = todayStr();
    const cleaningDocs = await fetchAllDocs(req, getCleaningDbName());
    const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId);
    const todayServices = services.filter((s) => s.date === today);
    const incidents = cleaningDocs.filter((d) => d.type === 'cleaning_incident' && d.user_id === userId);

    const clockinDocs = await fetchAllDocs(req, getClockinsDbName());
    const todayClockins = clockinDocs.filter((c) => c.type === 'clockin' && c.date === today);

    const catalogDocs = await fetchDocsOfType(req, getCatalogDbName(), 'catalog_item');
    const materials = catalogDocs.filter((i) => i.user_id === userId && i.active && (i.subtype === 'cleaning_material' || (i.materialType && ['detergent', 'disinfectant', 'degreaser', 'glass_cleaner', 'floor_cleaner', 'utensil', 'consumable', 'protective'].includes(i.materialType))));

    const workerIds = new Set(todayServices.filter((s) => s.assignedTo).map((s) => s.assignedTo));
    const clockedWorkers = new Set(todayClockins.map((c) => c.user_id));
    let activeWorkers = 0;
    let absentWorkers = 0;
    const now = new Date();
    for (const wid of workerIds) {
      if (clockedWorkers.has(wid)) activeWorkers++;
      else {
        const firstSvc = todayServices.filter((s) => s.assignedTo === wid).sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
        if (firstSvc?.time) {
          const svcTime = new Date(`${today}T${firstSvc.time}:00`);
          if (now > new Date(svcTime.getTime() + 15 * 60_000)) absentWorkers++;
        }
      }
    }

    let hoursWorkedToday = 0;
    for (const svc of todayServices) {
      const exec = svc.execution || {};
      if (exec.realMinutes) hoursWorkedToday += exec.realMinutes / 60;
      else if (exec.checkInAt && !exec.checkOutAt && (exec.status === 'checked_in' || exec.status === 'in_progress')) {
        hoursWorkedToday += (now.getTime() - new Date(exec.checkInAt).getTime()) / 3_600_000;
      }
    }

    const completed = todayServices.filter((s) => s.status === 'completed' || (s.execution?.status === 'completed') || (s.execution?.status === 'validated')).length;
    const inProgress = todayServices.filter((s) => { const st = s.execution?.status; return st === 'checked_in' || st === 'in_progress' || st === 'paused'; }).length;
    const pending = todayServices.filter((s) => s.status === 'pending' || s.status === 'assigned').length - inProgress;
    const uncovered = todayServices.filter((s) => s.status === 'pending' && (!s.assignedTo || !s.assignedTo.trim())).length;
    const clockinsPending = todayServices.filter((s) => s.status === 'assigned' && s.assignedTo && (!s.execution || s.execution.status === 'not_started')).length;

    const openIncidents = incidents.filter((i) => !['resolved', 'cancelled', 'closed'].includes(i.status)).length;

    let billingToday = 0;
    let billingPending = 0;
    for (const svc of todayServices) {
      const price = Number(svc.price || 0);
      if (svc.status === 'completed' && svc.invoiceId) billingToday += price;
      else if (svc.status === 'completed' && !svc.invoiceId) billingPending += price;
    }

    const criticalMaterials = materials.filter((m) => {
      const qty = Number(m.stockQuantity || 0);
      const min = Number(m.minStock || 0);
      return min > 0 && qty <= min;
    }).length;

    const recurrentServices = services.filter((s) => s.recurrence?.type && s.recurrence.type !== 'none' && s.status !== 'cancelled').length;
    const oneTimeServices = todayServices.filter((s) => !s.recurrence?.type || s.recurrence.type === 'none').length;

    const revenue = todayServices.reduce((s, sv) => s + Number(sv.price || 0), 0);
    const cost = hoursWorkedToday * 15;
    const profitabilityAvg = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;

    return res.json({
      ok: true,
      data: {
        servicesToday: todayServices.length,
        servicesCompleted: completed,
        servicesInProgress: Math.max(0, inProgress),
        servicesPending: Math.max(0, pending),
        servicesUncovered: uncovered,
        activeWorkers,
        totalWorkers: workerIds.size,
        absentWorkers,
        clockinsPending,
        hoursWorkedToday: Math.round(hoursWorkedToday * 10) / 10,
        openIncidents,
        billingToday: Math.round(billingToday * 100) / 100,
        billingPending: Math.round(billingPending * 100) / 100,
        profitabilityAvg,
        criticalMaterials,
        recurrentServices,
        oneTimeServices,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener KPIs de limpieza' });
  }
}

// ─── GET /api/cleaning-hub/today/:userId ────────────────────────────────────

export async function getCleaningHubToday(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const today = todayStr();
    const cleaningDocs = await fetchAllDocs(req, getCleaningDbName());
    const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId && d.date === today);
    const clockinDocs = await fetchAllDocs(req, getClockinsDbName());
    const todayClockins = new Set(clockinDocs.filter((c) => c.type === 'clockin' && c.date === today).map((c) => c.user_id));

    const result = services.map((svc) => ({
      ...svc,
      isRecurrent: !!(svc.recurrence?.type && svc.recurrence.type !== 'none'),
      recurrencePattern: svc.recurrence?.type || 'none',
      workerClockedIn: svc.assignedTo ? todayClockins.has(svc.assignedTo) : false,
      estimatedStart: svc.time || '',
      estimatedEnd: svc.time && svc.duration ? (() => {
        const [h, m] = svc.time.split(':').map(Number);
        const endMin = h * 60 + (m || 0) + Math.round(parseFloat(svc.duration || '0') * 60);
        return `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      })() : '',
      actualStart: svc.execution?.checkInAt || '',
      actualEnd: svc.execution?.checkOutAt || '',
      zoneName: svc.zone || '',
      checklistDone: Array.isArray(svc.tasks) ? svc.tasks.filter((t) => t.done).length : 0,
      checklistTotal: Array.isArray(svc.tasks) ? svc.tasks.length : 0,
    }));

    return res.json({ ok: true, services: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener servicios de hoy' });
  }
}

// ─── GET /api/cleaning-hub/alerts/:userId ───────────────────────────────────

export async function getCleaningHubAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { alerts } = await getCleaningAlertSummary(userId);

    const severityMap = { high: 'error', medium: 'warning', low: 'info' };
    const typeMap = {
      cleaning_service_uncovered: 'service_uncovered',
      cleaning_worker_absent: 'worker_absent',
      cleaning_clockin_pending: 'clockin_pending',
      cleaning_incident_open: 'incident_open',
      cleaning_incident_critical: 'incident_open',
      cleaning_client_unpaid: 'billing_pending',
      cleaning_contract_renewal: 'billing_pending',
      cleaning_material_critical: 'material_critical',
      cleaning_material_depleted: 'material_critical',
      cleaning_route_delayed: 'service_delayed',
      cleaning_excess_hours: 'clockin_pending',
    };

    const mapped = alerts.map((a) => ({
      id: a.dedupKey || a.entityId || '',
      type: typeMap[a.category] || a.category,
      severity: severityMap[a.priority] || 'warning',
      message: a.message,
      route: a.route || '',
      relatedId: a.entityId || '',
      timestamp: new Date().toISOString(),
    }));

    return res.json({ ok: true, alerts: mapped });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener alertas' });
  }
}

// ─── GET /api/cleaning-hub/workers/:userId ──────────────────────────────────

export async function getCleaningHubWorkers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const today = todayStr();
    const cleaningDocs = await fetchAllDocs(req, getCleaningDbName());
    const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId && d.date === today);
    const incidents = cleaningDocs.filter((d) => d.type === 'cleaning_incident' && d.user_id === userId);
    const clockinDocs = await fetchAllDocs(req, getClockinsDbName());
    const todayClockins = clockinDocs.filter((c) => c.type === 'clockin' && c.date === today);

    const workers = new Map();
    for (const svc of services) {
      if (!svc.assignedTo) continue;
      if (!workers.has(svc.assignedTo)) {
        workers.set(svc.assignedTo, {
          id: svc.assignedTo, name: svc.assignedToName || '', avatar: '',
          clockedIn: false, clockInTime: '', clockOutTime: '',
          currentService: null, nextService: null,
          servicesTotal: 0, servicesCompleted: 0, hoursToday: 0, incidents: 0, rating: 0,
          _ratings: [],
        });
      }
      const w = workers.get(svc.assignedTo);
      w.servicesTotal++;

      const exec = svc.execution || {};
      if (exec.status === 'completed' || exec.status === 'validated') {
        w.servicesCompleted++;
        w.hoursToday += (exec.realMinutes || 0) / 60;
      } else if (exec.status === 'checked_in' || exec.status === 'in_progress') {
        w.currentService = { id: svc._id, clientName: svc.clientName, address: svc.address || '', status: svc.status };
        w.hoursToday += (Date.now() - new Date(exec.checkInAt).getTime()) / 3_600_000;
      } else if (!w.currentService) {
        if (!w.nextService || (svc.time || '') < (w.nextService.time || '')) {
          w.nextService = { id: svc._id, clientName: svc.clientName, time: svc.time || '' };
        }
      }
      if (svc.qualityRating) w._ratings.push(Number(svc.qualityRating));
    }

    for (const c of todayClockins) {
      if (!workers.has(c.user_id)) continue;
      const w = workers.get(c.user_id);
      w.clockedIn = true;
      const firstEntry = (c.entries || [])[0];
      if (firstEntry?.clock_in) w.clockInTime = firstEntry.clock_in;
      const lastEntry = (c.entries || []).findLast((e) => e.clock_out);
      if (lastEntry?.clock_out) w.clockOutTime = lastEntry.clock_out;
    }

    const openIncidents = incidents.filter((i) => !['resolved', 'cancelled', 'closed'].includes(i.status));
    for (const inc of openIncidents) {
      if (inc.workerId && workers.has(inc.workerId)) workers.get(inc.workerId).incidents++;
    }

    const rosterWorkers = await listCleaningWorkersByUser(req, userId);
    for (const rw of rosterWorkers) {
      if (rw.status !== 'active') continue;
      const key = String(rw.teamMemberId || rw._id || '').trim();
      if (!key) continue;
      if (!workers.has(key)) {
        workers.set(key, {
          id: rw._id,
          name: rw.name || '',
          avatar: workerInitials(rw.name),
          clockedIn: false,
          clockInTime: '',
          clockOutTime: '',
          currentService: null,
          nextService: null,
          servicesTotal: 0,
          servicesCompleted: 0,
          hoursToday: 0,
          incidents: 0,
          rating: rw.specializations?.length ? 4.5 : 4,
          _ratings: [],
        });
      } else {
        const w = workers.get(key);
        if (!w.name) w.name = rw.name || '';
        if (!w.avatar) w.avatar = workerInitials(rw.name);
      }
    }

    const result = [...workers.values()].map((w) => ({
      id: w.id, name: w.name, avatar: w.avatar,
      clockedIn: w.clockedIn, clockInTime: w.clockInTime, clockOutTime: w.clockOutTime,
      currentService: w.currentService, nextService: w.nextService,
      servicesTotal: w.servicesTotal, servicesCompleted: w.servicesCompleted,
      hoursToday: Math.round(w.hoursToday * 10) / 10, incidents: w.incidents,
      rating: w._ratings.length > 0 ? Math.round((w._ratings.reduce((a, b) => a + b, 0) / w._ratings.length) * 10) / 10 : 0,
    }));

    return res.json({ ok: true, workers: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener trabajadores' });
  }
}

// ─── GET /api/cleaning-hub/materials/:userId ────────────────────────────────

export async function getCleaningHubMaterials(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const catalogDocs = await fetchDocsOfType(req, getCatalogDbName(), 'catalog_item');
    const materials = catalogDocs.filter((i) => i.user_id === userId && i.active && (i.subtype === 'cleaning_material' || (i.materialType && ['detergent', 'disinfectant', 'degreaser', 'glass_cleaner', 'floor_cleaner', 'utensil', 'consumable', 'protective'].includes(i.materialType))));

    const result = materials.map((m) => ({
      id: m._id,
      name: m.name || '',
      category: m.materialType || m.category || '',
      currentStock: Number(m.stockQuantity || 0),
      minStock: Number(m.minStock || 0),
      unit: m.unit || 'ud',
      lastRestocked: m.lastRestockedAt || '',
      isCritical: Number(m.minStock || 0) > 0 && Number(m.stockQuantity || 0) <= Number(m.minStock || 0),
    }));

    return res.json({ ok: true, materials: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener materiales' });
  }
}

// ─── GET /api/cleaning-hub/metrics/:userId ──────────────────────────────────

export async function getCleaningHubMetrics(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const today = todayStr();
    const cleaningDocs = await fetchAllDocs(req, getCleaningDbName());
    const services = cleaningDocs.filter((d) => d.type === 'cleaning_service' && d.user_id === userId);
    const todayServices = services.filter((s) => s.date === today);

    const servicesByHour = [];
    for (let h = 6; h <= 22; h++) {
      const hStr = String(h).padStart(2, '0');
      const scheduled = todayServices.filter((s) => (s.time || '').startsWith(hStr)).length;
      const completed = todayServices.filter((s) => (s.time || '').startsWith(hStr) && (s.status === 'completed' || s.execution?.status === 'completed' || s.execution?.status === 'validated')).length;
      servicesByHour.push({ hour: `${hStr}:00`, scheduled, completed });
    }

    const profitByClient = new Map();
    for (const svc of services) {
      if (!svc.clientName || svc.status === 'cancelled') continue;
      if (!profitByClient.has(svc.clientName)) profitByClient.set(svc.clientName, { client: svc.clientName, revenue: 0, cost: 0, margin: 0 });
      const e = profitByClient.get(svc.clientName);
      e.revenue += Number(svc.price || 0);
      const exec = svc.execution || {};
      e.cost += ((exec.realMinutes || 0) / 60) * 15;
    }
    for (const e of profitByClient.values()) {
      e.margin = e.revenue > 0 ? Math.round(((e.revenue - e.cost) / e.revenue) * 100) : 0;
    }

    const hoursByWorker = new Map();
    for (const svc of todayServices) {
      if (!svc.assignedTo) continue;
      if (!hoursByWorker.has(svc.assignedTo)) hoursByWorker.set(svc.assignedTo, { worker: svc.assignedToName || '', hours: 0, services: 0 });
      const w = hoursByWorker.get(svc.assignedTo);
      w.services++;
      w.hours += (svc.execution?.realMinutes || 0) / 60;
    }

    const weeklyTrend = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(); dt.setDate(dt.getDate() - d);
      const ds = dt.toISOString().slice(0, 10);
      const daySvcs = services.filter((s) => s.date === ds);
      const dayIncidents = cleaningDocs.filter((i) => i.type === 'cleaning_incident' && i.user_id === userId && (i.createdAt || '').startsWith(ds));
      weeklyTrend.push({
        day: ds,
        services: daySvcs.length,
        completed: daySvcs.filter((s) => s.status === 'completed' || s.execution?.status === 'completed' || s.execution?.status === 'validated').length,
        incidents: dayIncidents.length,
      });
    }

    return res.json({
      ok: true,
      data: {
        servicesByHour,
        profitByClient: [...profitByClient.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        hoursByWorker: [...hoursByWorker.values()].sort((a, b) => b.hours - a.hours),
        weeklyTrend,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener métricas' });
  }
}
