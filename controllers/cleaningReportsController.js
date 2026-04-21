import {
  findAccountByUserId,
  ensureDatabase,
  getAllDocuments,
  getCleaningDbName,
  getInvoicesDbName,
} from '../services/couchdb.js';

const fakeReq = { headers: {} };
const ADMIN_ROLES = ['Admin', 'Gerente', 'admin', 'gerente', 'owner'];
const DEFAULT_HOURLY_COST = 12;

async function loadCleaningDocs(userId) {
  const dbName = getCleaningDbName();
  await ensureDatabase(fakeReq, dbName);
  const all = await getAllDocuments(fakeReq, dbName);
  return all.filter(d => d && d.user_id === userId && !d.deletedAt);
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= from && d <= to;
}

function minutesDiff(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / 60000);
}

function getWorkerCost(service, workers) {
  const wid = service.workerId || service.assignedTo;
  const w = wid ? workers.find(w => w._id === wid || w.id === wid) : null;
  return w?.hourlyCost || DEFAULT_HOURLY_COST;
}

function matchFilters(service, query) {
  if (query.clientId && query.clientId !== 'all') {
    const cn = (service.clientName || '').toLowerCase();
    if (!cn.includes(query.clientId.toLowerCase()) && service.clientId !== query.clientId) return false;
  }
  if (query.workerId && query.workerId !== 'all') {
    const wn = (service.assignedToName || '').toLowerCase();
    if (!wn.includes(query.workerId.toLowerCase()) && service.workerId !== query.workerId && service.assignedTo !== query.workerId) return false;
  }
  if (query.zone && query.zone !== 'all') {
    if ((service.zone || '') !== query.zone) return false;
  }
  if (query.cleaningType && query.cleaningType !== 'all') {
    if ((service.cleaningType || '') !== query.cleaningType) return false;
  }
  return true;
}

function computeTrend(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function prevPeriod(from, to) {
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const days = Math.max(1, Math.round((t - f) / 86400000));
  const pf = new Date(f);
  pf.setDate(pf.getDate() - days);
  const pt = new Date(f);
  pt.setDate(pt.getDate() - 1);
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
}

function getServices(docs) {
  return docs.filter(d => d.type === 'cleaning_service');
}

function getWorkers(docs) {
  return docs.filter(d => d.type === 'cleaning_worker');
}

function getIncidents(docs) {
  return docs.filter(d => d.type === 'cleaning_incident');
}

function getContracts(docs) {
  return docs.filter(d => d.type === 'service_contract');
}

function realMins(svc) {
  if (svc.execution?.realMinutes > 0) return svc.execution.realMinutes;
  if (svc.execution?.checkInAt && svc.execution?.checkOutAt) {
    return minutesDiff(svc.execution.checkInAt, svc.execution.checkOutAt);
  }
  if (svc.checkInAt && svc.checkOutAt) return minutesDiff(svc.checkInAt, svc.checkOutAt);
  return 0;
}

function plannedMins(svc) {
  if (svc.execution?.plannedMinutes > 0) return svc.execution.plannedMinutes;
  const d = parseFloat(svc.duration);
  return isNaN(d) ? 0 : d * 60;
}

function svcRevenue(svc) {
  return Number(svc.price) || 0;
}

function svcMaterialCost(svc) {
  return Number(svc.materialCost) || 0;
}

// ─── Overview ────────────────────────────────────────────────────────────────

export async function getCleaningOverview(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const services = getServices(docs);
    const workers = getWorkers(docs);
    const contracts = getContracts(docs);

    const filtered = services.filter(s => inRange(s.date, from, to) && matchFilters(s, q));
    const completed = filtered.filter(s => s.status === 'completed');
    const cancelled = filtered.filter(s => s.status === 'cancelled');
    const pending = filtered.filter(s => s.status === 'pending' || s.status === 'assigned');
    const inProg = filtered.filter(s => s.status === 'in_progress');

    const totalPlanned = completed.reduce((s, sv) => s + plannedMins(sv), 0);
    const totalReal = completed.reduce((s, sv) => s + realMins(sv), 0);
    const revenue = completed.reduce((s, sv) => s + svcRevenue(sv), 0);
    const materialCost = completed.reduce((s, sv) => s + svcMaterialCost(sv), 0);
    const laborCost = completed.reduce((s, sv) => s + (realMins(sv) / 60) * getWorkerCost(sv, workers), 0);
    const totalCost = laborCost + materialCost;
    const grossMargin = revenue - totalCost;

    const clientSet = new Set(completed.map(s => s.clientName).filter(Boolean));
    const allIncidents = [];
    completed.forEach(s => { (s.execution?.incidents || []).forEach(i => allIncidents.push(i)); });
    const incidentsFromDb = getIncidents(docs).filter(i => inRange(i.date, from, to) && matchFilters(i, q));

    const absentCount = filtered.filter(s => {
      if (s.status !== 'assigned') return false;
      const d = parseDate(s.date);
      return d && d < new Date() && !s.execution?.checkInAt && !s.checkInAt;
    }).length;

    const daysDiff = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));

    res.json({
      ok: true,
      period: { from, to },
      clients: {
        activeCount: clientSet.size,
        newCount: 0,
        lostCount: 0,
        totalContracts: contracts.filter(c => c.contractStatus === 'active').length,
      },
      services: {
        total: filtered.length,
        completed: completed.length,
        cancelled: cancelled.length,
        pending: pending.length,
        inProgress: inProg.length,
        completionRate: (completed.length + cancelled.length) > 0 ? Number(((completed.length / (completed.length + cancelled.length)) * 100).toFixed(1)) : 0,
      },
      hours: {
        planned: Number((totalPlanned / 60).toFixed(1)),
        real: Number((totalReal / 60).toFixed(1)),
        deviation: Number(((totalReal - totalPlanned) / 60).toFixed(1)),
        deviationPercent: totalPlanned > 0 ? Number((((totalReal - totalPlanned) / totalPlanned) * 100).toFixed(1)) : 0,
      },
      financial: {
        revenue: Number(revenue.toFixed(2)),
        laborCost: Number(laborCost.toFixed(2)),
        materialCost: Number(materialCost.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        grossMargin: Number(grossMargin.toFixed(2)),
        grossMarginPercent: revenue > 0 ? Number(((grossMargin / revenue) * 100).toFixed(1)) : 0,
        billedAmount: revenue,
        collectedAmount: 0,
        pendingAmount: revenue,
      },
      operational: {
        avgServicesPerDay: Number((completed.length / daysDiff).toFixed(1)),
        avgRevenuePerService: completed.length > 0 ? Number((revenue / completed.length).toFixed(2)) : 0,
        avgRevenuePerHour: totalReal > 0 ? Number((revenue / (totalReal / 60)).toFixed(2)) : 0,
        avgCostPerService: completed.length > 0 ? Number((totalCost / completed.length).toFixed(2)) : 0,
        incidentCount: allIncidents.length + incidentsFromDb.length,
        incidentRate: completed.length > 0 ? Number(((allIncidents.length + incidentsFromDb.length) / completed.length * 100).toFixed(1)) : 0,
        absenteeismCount: absentCount,
        absenteeismRate: filtered.length > 0 ? Number((absentCount / filtered.length * 100).toFixed(1)) : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Profitability by Client ─────────────────────────────────────────────────

export async function getClientProfitability(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const services = getServices(docs);
    const workers = getWorkers(docs);

    const completed = services.filter(s => s.status === 'completed' && inRange(s.date, from, to) && matchFilters(s, q));
    const prev = prevPeriod(from, to);
    const prevCompleted = services.filter(s => s.status === 'completed' && inRange(s.date, prev.from, prev.to) && matchFilters(s, q));

    const grouped = {};
    for (const svc of completed) {
      const key = svc.clientName || 'Sin cliente';
      if (!grouped[key]) grouped[key] = { services: [], clientId: svc.clientId, clientType: svc.clientType, zone: svc.zone };
      grouped[key].services.push(svc);
    }
    const prevGrouped = {};
    for (const svc of prevCompleted) {
      const key = svc.clientName || 'Sin cliente';
      if (!prevGrouped[key]) prevGrouped[key] = [];
      prevGrouped[key].push(svc);
    }

    const clients = Object.entries(grouped).map(([name, data]) => {
      const svcs = data.services;
      const hoursReal = svcs.reduce((s, sv) => s + realMins(sv), 0) / 60;
      const revenue = svcs.reduce((s, sv) => s + svcRevenue(sv), 0);
      const labor = svcs.reduce((s, sv) => s + (realMins(sv) / 60) * getWorkerCost(sv, workers), 0);
      const material = svcs.reduce((s, sv) => s + svcMaterialCost(sv), 0);
      const cost = labor + material;
      const margin = revenue - cost;
      const prevRevenue = (prevGrouped[name] || []).reduce((s, sv) => s + svcRevenue(sv), 0);
      const qualRatings = svcs.filter(s => s.qualityRating > 0).map(s => s.qualityRating);
      const clientRatings = svcs.filter(s => s.clientRating > 0).map(s => s.clientRating);
      const incidents = svcs.reduce((s, sv) => s + (sv.execution?.incidents?.length || 0), 0);

      return {
        clientName: name,
        clientId: data.clientId || '',
        clientType: data.clientType || '',
        zone: data.zone || '',
        servicesCompleted: svcs.length,
        hoursReal: Number(hoursReal.toFixed(1)),
        revenue: Number(revenue.toFixed(2)),
        laborCost: Number(labor.toFixed(2)),
        materialCost: Number(material.toFixed(2)),
        totalCost: Number(cost.toFixed(2)),
        grossMargin: Number(margin.toFixed(2)),
        grossMarginPercent: revenue > 0 ? Number(((margin / revenue) * 100).toFixed(1)) : 0,
        avgRevenuePerService: svcs.length > 0 ? Number((revenue / svcs.length).toFixed(2)) : 0,
        avgCostPerService: svcs.length > 0 ? Number((cost / svcs.length).toFixed(2)) : 0,
        incidentCount: incidents,
        avgQualityRating: qualRatings.length > 0 ? Number((qualRatings.reduce((a, b) => a + b, 0) / qualRatings.length).toFixed(1)) : 0,
        avgClientRating: clientRatings.length > 0 ? Number((clientRatings.reduce((a, b) => a + b, 0) / clientRatings.length).toFixed(1)) : 0,
        trend: prevRevenue === 0 ? 'stable' : revenue > prevRevenue * 1.05 ? 'up' : revenue < prevRevenue * 0.95 ? 'down' : 'stable',
      };
    }).sort((a, b) => b.grossMargin - a.grossMargin);

    res.json({ ok: true, period: { from, to }, clients });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Profitability by Worker ─────────────────────────────────────────────────

export async function getWorkerProfitability(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const services = getServices(docs);
    const workers = getWorkers(docs);

    const filtered = services.filter(s => inRange(s.date, from, to) && matchFilters(s, q));
    const completed = filtered.filter(s => s.status === 'completed');

    const grouped = {};
    for (const svc of completed) {
      const key = svc.assignedToName || svc.workerId || 'Sin asignar';
      if (!grouped[key]) grouped[key] = { services: [], workerId: svc.workerId || svc.assignedTo };
      grouped[key].services.push(svc);
    }

    const now = new Date();
    const workerResults = Object.entries(grouped).map(([name, data]) => {
      const svcs = data.services;
      const hPlanned = svcs.reduce((s, sv) => s + plannedMins(sv), 0) / 60;
      const hReal = svcs.reduce((s, sv) => s + realMins(sv), 0) / 60;
      const revenue = svcs.reduce((s, sv) => s + svcRevenue(sv), 0);
      const hourlyRate = getWorkerCost(svcs[0], workers);
      const labor = hReal * hourlyRate;
      const material = svcs.reduce((s, sv) => s + svcMaterialCost(sv), 0);
      const profit = revenue - labor - material;

      const lateArrivals = svcs.filter(sv => {
        const cin = sv.execution?.checkInAt || sv.checkInAt;
        if (!cin || !sv.time) return false;
        const scheduled = parseDate(sv.date + 'T' + sv.time + ':00');
        const actual = parseDate(cin);
        return scheduled && actual && (actual - scheduled) > 15 * 60000;
      }).length;

      const allAssigned = filtered.filter(s => (s.assignedToName || s.workerId) === name || s.workerId === data.workerId);
      const absences = allAssigned.filter(s => {
        if (s.status !== 'assigned') return false;
        const d = parseDate(s.date);
        return d && d < now && !s.execution?.checkInAt && !s.checkInAt;
      }).length;

      const incidents = svcs.reduce((s, sv) => s + (sv.execution?.incidents?.length || 0), 0);
      const qualRatings = svcs.filter(s => s.qualityRating > 0).map(s => s.qualityRating);
      const clientRatings = svcs.filter(s => s.clientRating > 0).map(s => s.clientRating);

      const clientCounts = {};
      svcs.forEach(s => { clientCounts[s.clientName] = (clientCounts[s.clientName] || 0) + 1; });
      const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

      const daysDiff = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));

      return {
        workerName: name,
        workerId: data.workerId || '',
        servicesCompleted: svcs.length,
        hoursPlanned: Number(hPlanned.toFixed(1)),
        hoursReal: Number(hReal.toFixed(1)),
        deviation: Number((hReal - hPlanned).toFixed(1)),
        revenue: Number(revenue.toFixed(2)),
        laborCost: Number(labor.toFixed(2)),
        materialCost: Number(material.toFixed(2)),
        profitability: Number(profit.toFixed(2)),
        profitabilityPercent: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : 0,
        revenuePerHour: hReal > 0 ? Number((revenue / hReal).toFixed(2)) : 0,
        servicesPerDay: Number((svcs.length / daysDiff).toFixed(1)),
        lateArrivals,
        absences,
        incidentCount: incidents,
        avgQualityRating: qualRatings.length > 0 ? Number((qualRatings.reduce((a, b) => a + b, 0) / qualRatings.length).toFixed(1)) : 0,
        avgClientRating: clientRatings.length > 0 ? Number((clientRatings.reduce((a, b) => a + b, 0) / clientRatings.length).toFixed(1)) : 0,
        efficiency: hReal > 0 ? Number(((hPlanned / hReal) * 100).toFixed(1)) : 0,
        topClients,
      };
    }).sort((a, b) => b.profitability - a.profitability);

    res.json({ ok: true, period: { from, to }, workers: workerResults });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Services Summary ────────────────────────────────────────────────────────

export async function getServicesSummary(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const services = getServices(docs).filter(s => inRange(s.date, from, to) && matchFilters(s, q));
    const completed = services.filter(s => s.status === 'completed');

    const byDate = {};
    for (const svc of completed) {
      const d = svc.date?.slice(0, 10) || 'unknown';
      if (!byDate[d]) byDate[d] = { date: d, count: 0, planned: 0, real: 0 };
      byDate[d].count++;
      byDate[d].planned += plannedMins(svc) / 60;
      byDate[d].real += realMins(svc) / 60;
    }

    const byWorker = {};
    for (const svc of completed) {
      const w = svc.assignedToName || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { name: w, planned: 0, real: 0, count: 0 };
      byWorker[w].planned += plannedMins(svc) / 60;
      byWorker[w].real += realMins(svc) / 60;
      byWorker[w].count++;
    }

    const byClient = {};
    for (const svc of completed) {
      const c = svc.clientName || 'Sin cliente';
      if (!byClient[c]) byClient[c] = { name: c, planned: 0, real: 0, count: 0 };
      byClient[c].planned += plannedMins(svc) / 60;
      byClient[c].real += realMins(svc) / 60;
      byClient[c].count++;
    }

    const recent = services.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50).map(s => ({
      id: s._id,
      date: s.date,
      time: s.time,
      clientName: s.clientName,
      workerName: s.assignedToName,
      cleaningType: s.cleaningType,
      hoursPlanned: Number((plannedMins(s) / 60).toFixed(1)),
      hoursReal: Number((realMins(s) / 60).toFixed(1)),
      deviation: Number(((realMins(s) - plannedMins(s)) / 60).toFixed(1)),
      status: s.status,
      qualityRating: s.qualityRating || 0,
    }));

    const statusCounts = { completed: 0, cancelled: 0, pending: 0, assigned: 0, in_progress: 0 };
    services.forEach(s => { if (statusCounts[s.status] !== undefined) statusCounts[s.status]++; });

    res.json({
      ok: true,
      period: { from, to },
      totals: {
        total: services.length,
        ...statusCounts,
        totalPlannedHours: Number((completed.reduce((s, sv) => s + plannedMins(sv), 0) / 60).toFixed(1)),
        totalRealHours: Number((completed.reduce((s, sv) => s + realMins(sv), 0) / 60).toFixed(1)),
      },
      byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      byWorker: Object.values(byWorker).sort((a, b) => b.count - a.count),
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
      recent,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Absenteeism ─────────────────────────────────────────────────────────────

export async function getAbsenteeismReport(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const services = getServices(docs).filter(s => inRange(s.date, from, to) && matchFilters(s, q));
    const now = new Date();

    const assigned = services.filter(s => s.assignedToName || s.workerId);
    const details = [];

    for (const svc of assigned) {
      const d = parseDate(svc.date);
      if (!d || d > now) continue;
      const checkIn = svc.execution?.checkInAt || svc.checkInAt;
      const scheduled = svc.time ? parseDate(svc.date + 'T' + svc.time + ':00') : null;

      if (!checkIn && (svc.status === 'assigned' || svc.status === 'pending')) {
        details.push({
          date: svc.date, workerName: svc.assignedToName || '', clientName: svc.clientName || '',
          address: svc.address || '', scheduledTime: svc.time || '', checkInAt: null,
          delayMinutes: null, type: 'absence',
        });
      } else if (checkIn && scheduled) {
        const actual = parseDate(checkIn);
        const delay = actual && scheduled ? Math.round((actual - scheduled) / 60000) : 0;
        if (delay > 15) {
          details.push({
            date: svc.date, workerName: svc.assignedToName || '', clientName: svc.clientName || '',
            address: svc.address || '', scheduledTime: svc.time || '', checkInAt: checkIn,
            delayMinutes: delay, type: 'late',
          });
        }
      }
    }

    const absences = details.filter(d => d.type === 'absence');
    const lates = details.filter(d => d.type === 'late');

    const byWorker = {};
    for (const d of details) {
      const w = d.workerName || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { workerName: w, assigned: 0, absences: 0, lateArrivals: 0, totalDelay: 0 };
      if (d.type === 'absence') byWorker[w].absences++;
      else { byWorker[w].lateArrivals++; byWorker[w].totalDelay += d.delayMinutes || 0; }
    }
    for (const svc of assigned) {
      const w = svc.assignedToName || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { workerName: w, assigned: 0, absences: 0, lateArrivals: 0, totalDelay: 0 };
      byWorker[w].assigned++;
    }
    const byWorkerArr = Object.values(byWorker).map(w => ({
      ...w,
      avgDelayMinutes: w.lateArrivals > 0 ? Number((w.totalDelay / w.lateArrivals).toFixed(0)) : 0,
      rate: w.assigned > 0 ? Number(((w.absences / w.assigned) * 100).toFixed(1)) : 0,
    }));

    const byDate = {};
    details.forEach(d => {
      if (!byDate[d.date]) byDate[d.date] = { date: d.date, absences: 0, lateArrivals: 0 };
      if (d.type === 'absence') byDate[d.date].absences++;
      else byDate[d.date].lateArrivals++;
    });

    res.json({
      ok: true,
      period: { from, to },
      totalAssigned: assigned.length,
      totalAbsences: absences.length,
      totalLateArrivals: lates.length,
      absenteeismRate: assigned.length > 0 ? Number(((absences.length / assigned.length) * 100).toFixed(1)) : 0,
      avgDelayMinutes: lates.length > 0 ? Number((lates.reduce((s, d) => s + (d.delayMinutes || 0), 0) / lates.length).toFixed(0)) : 0,
      byWorker: byWorkerArr.sort((a, b) => b.absences - a.absences),
      byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      details: details.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Incidents Summary ───────────────────────────────────────────────────────

export async function getIncidentsSummary(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);

    const dbIncidents = getIncidents(docs).filter(i => inRange(i.date || i.createdAt, from, to));
    const services = getServices(docs).filter(s => inRange(s.date, from, to) && matchFilters(s, q));

    const execIncidents = [];
    services.forEach(s => {
      (s.execution?.incidents || []).forEach(i => {
        execIncidents.push({ ...i, serviceName: s.serviceNumber, clientName: s.clientName, workerName: s.assignedToName, serviceDate: s.date });
      });
    });

    const all = [
      ...dbIncidents.map(i => ({ type: i.incidentType, severity: i.priority, resolved: !!i.resolvedAt, workerName: i.workerName, clientName: i.clientName, date: i.date, resolutionTime: i.resolvedAt && i.createdAt ? minutesDiff(i.createdAt, i.resolvedAt) : 0 })),
      ...execIncidents.map(i => ({ type: i.type, severity: i.severity, resolved: !!i.resolvedAt, workerName: i.workerName || '', clientName: i.clientName || '', date: i.serviceDate, resolutionTime: i.resolvedAt && i.timestamp ? minutesDiff(i.timestamp, i.resolvedAt) : 0 })),
    ];

    const resolved = all.filter(i => i.resolved);
    const byType = {};
    all.forEach(i => {
      if (!byType[i.type]) byType[i.type] = { type: i.type, count: 0, totalResTime: 0, resolvedCount: 0 };
      byType[i.type].count++;
      if (i.resolved) { byType[i.type].resolvedCount++; byType[i.type].totalResTime += i.resolutionTime; }
    });
    const bySeverity = {};
    all.forEach(i => { bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1; });
    const byWorker = {};
    all.forEach(i => {
      const w = i.workerName || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { workerName: w, count: 0, resolvedCount: 0 };
      byWorker[w].count++;
      if (i.resolved) byWorker[w].resolvedCount++;
    });
    const byClient = {};
    all.forEach(i => {
      const c = i.clientName || 'Sin cliente';
      if (!byClient[c]) byClient[c] = { clientName: c, count: 0 };
      byClient[c].count++;
    });
    const trend = {};
    all.forEach(i => {
      const d = (i.date || '').slice(0, 10);
      if (!trend[d]) trend[d] = { date: d, count: 0 };
      trend[d].count++;
    });

    res.json({
      ok: true,
      period: { from, to },
      totalIncidents: all.length,
      resolved: resolved.length,
      unresolved: all.length - resolved.length,
      avgResolutionMinutes: resolved.length > 0 ? Number((resolved.reduce((s, i) => s + i.resolutionTime, 0) / resolved.length).toFixed(0)) : 0,
      byType: Object.values(byType).map(t => ({ type: t.type, count: t.count, avgResolutionMinutes: t.resolvedCount > 0 ? Number((t.totalResTime / t.resolvedCount).toFixed(0)) : 0 })).sort((a, b) => b.count - a.count),
      bySeverity: Object.entries(bySeverity).map(([severity, count]) => ({ severity, count })),
      byWorker: Object.values(byWorker).sort((a, b) => b.count - a.count),
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
      trend: Object.values(trend).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Materials Cost ──────────────────────────────────────────────────────────

export async function getMaterialsCostReport(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const completed = getServices(docs).filter(s => s.status === 'completed' && inRange(s.date, from, to) && matchFilters(s, q));

    const totalCost = completed.reduce((s, sv) => s + svcMaterialCost(sv), 0);
    const withMaterial = completed.filter(s => svcMaterialCost(s) > 0);

    const byClient = {};
    for (const svc of withMaterial) {
      const c = svc.clientName || 'Sin cliente';
      if (!byClient[c]) byClient[c] = { clientName: c, cost: 0, servicesCount: 0 };
      byClient[c].cost += svcMaterialCost(svc);
      byClient[c].servicesCount++;
    }
    const byWorker = {};
    for (const svc of withMaterial) {
      const w = svc.assignedToName || 'Sin asignar';
      if (!byWorker[w]) byWorker[w] = { workerName: w, cost: 0, servicesCount: 0 };
      byWorker[w].cost += svcMaterialCost(svc);
      byWorker[w].servicesCount++;
    }
    const byMaterial = {};
    for (const svc of completed) {
      for (const m of (svc.materialsUsed || [])) {
        const name = m.materialName || 'Desconocido';
        if (!byMaterial[name]) byMaterial[name] = { materialName: name, quantity: 0, cost: 0, servicesCount: 0 };
        byMaterial[name].quantity += Number(m.quantity) || 0;
        byMaterial[name].cost += Number(m.totalCost) || 0;
        byMaterial[name].servicesCount++;
      }
    }
    const trend = {};
    for (const svc of withMaterial) {
      const m = (svc.date || '').slice(0, 7);
      if (!trend[m]) trend[m] = { month: m, cost: 0, servicesCount: 0 };
      trend[m].cost += svcMaterialCost(svc);
      trend[m].servicesCount++;
    }

    res.json({
      ok: true,
      period: { from, to },
      totalCost: Number(totalCost.toFixed(2)),
      totalDeliveries: withMaterial.length,
      avgCostPerService: completed.length > 0 ? Number((totalCost / completed.length).toFixed(2)) : 0,
      byClient: Object.values(byClient).map(c => ({ ...c, cost: Number(c.cost.toFixed(2)), avgPerService: c.servicesCount > 0 ? Number((c.cost / c.servicesCount).toFixed(2)) : 0 })).sort((a, b) => b.cost - a.cost),
      byWorker: Object.values(byWorker).map(w => ({ ...w, cost: Number(w.cost.toFixed(2)) })).sort((a, b) => b.cost - a.cost),
      byMaterial: Object.values(byMaterial).map(m => ({ ...m, cost: Number(m.cost.toFixed(2)) })).sort((a, b) => b.cost - a.cost),
      trend: Object.values(trend).sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export async function getBillingReport(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const completed = getServices(docs).filter(s => s.status === 'completed' && inRange(s.date, from, to) && matchFilters(s, q));

    let invoices = [];
    try {
      const invDb = getInvoicesDbName();
      await ensureDatabase(fakeReq, invDb);
      const invDocs = await getAllDocuments(fakeReq, invDb);
      invoices = invDocs.filter(d => d?.type === 'client_invoice' && d.user_id === userId && !d.deletedAt);
    } catch { /* no invoices db */ }

    const byMonth = {};
    for (const svc of completed) {
      const m = (svc.date || '').slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { month: m, billed: 0, collected: 0, pending: 0, count: 0 };
      byMonth[m].billed += svcRevenue(svc);
      byMonth[m].count++;
    }

    const byClient = {};
    for (const svc of completed) {
      const c = svc.clientName || 'Sin cliente';
      if (!byClient[c]) byClient[c] = { clientName: c, billed: 0, collected: 0, pending: 0, servicesCount: 0 };
      byClient[c].billed += svcRevenue(svc);
      byClient[c].servicesCount++;
    }

    for (const inv of invoices) {
      const m = (inv.date || inv.createdAt || '').slice(0, 7);
      if (byMonth[m]) {
        if (inv.status === 'paid') byMonth[m].collected += Number(inv.total) || 0;
      }
    }

    Object.values(byMonth).forEach(m => { m.pending = m.billed - m.collected; });
    Object.values(byClient).forEach(c => { c.pending = c.billed - c.collected; });

    const totalBilled = Object.values(byMonth).reduce((s, m) => s + m.billed, 0);
    const totalCollected = Object.values(byMonth).reduce((s, m) => s + m.collected, 0);

    res.json({
      ok: true,
      period: { from, to },
      totalBilled: Number(totalBilled.toFixed(2)),
      totalCollected: Number(totalCollected.toFixed(2)),
      totalPending: Number((totalBilled - totalCollected).toFixed(2)),
      collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0,
      byMonth: Object.values(byMonth).map(m => ({ ...m, billed: Number(m.billed.toFixed(2)), collected: Number(m.collected.toFixed(2)), pending: Number(m.pending.toFixed(2)) })).sort((a, b) => a.month.localeCompare(b.month)),
      byClient: Object.values(byClient).map(c => ({ ...c, billed: Number(c.billed.toFixed(2)), collected: Number(c.collected.toFixed(2)), pending: Number(c.pending.toFixed(2)) })).sort((a, b) => b.billed - a.billed),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Comparatives ────────────────────────────────────────────────────────────

export async function getComparativesReport(req, res) {
  try {
    const userId = req.params.userId;
    const account = await findAccountByUserId(userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const q = req.query;
    const docs = await loadCleaningDocs(userId);
    const workers = getWorkers(docs);
    const completed = getServices(docs).filter(s => s.status === 'completed' && inRange(s.date, from, to) && matchFilters(s, q));

    const byZone = {};
    for (const svc of completed) {
      const z = svc.zone || 'Sin zona';
      if (!byZone[z]) byZone[z] = { zone: z, count: 0, revenue: 0, laborCost: 0, materialCost: 0, qualitySum: 0, qualityCount: 0, incidents: 0, workers: new Set(), clients: new Set() };
      byZone[z].count++;
      byZone[z].revenue += svcRevenue(svc);
      byZone[z].laborCost += (realMins(svc) / 60) * getWorkerCost(svc, workers);
      byZone[z].materialCost += svcMaterialCost(svc);
      if (svc.qualityRating > 0) { byZone[z].qualitySum += svc.qualityRating; byZone[z].qualityCount++; }
      byZone[z].incidents += (svc.execution?.incidents?.length || 0);
      if (svc.assignedToName) byZone[z].workers.add(svc.assignedToName);
      if (svc.clientName) byZone[z].clients.add(svc.clientName);
    }

    const byType = {};
    for (const svc of completed) {
      const t = svc.cleaningType || 'general';
      if (!byType[t]) byType[t] = { cleaningType: t, count: 0, revenue: 0, laborCost: 0, materialCost: 0, totalMins: 0, incidents: 0 };
      byType[t].count++;
      byType[t].revenue += svcRevenue(svc);
      byType[t].laborCost += (realMins(svc) / 60) * getWorkerCost(svc, workers);
      byType[t].materialCost += svcMaterialCost(svc);
      byType[t].totalMins += realMins(svc);
      byType[t].incidents += (svc.execution?.incidents?.length || 0);
    }

    const zoneResults = Object.values(byZone).map(z => {
      const cost = z.laborCost + z.materialCost;
      const margin = z.revenue - cost;
      return {
        zone: z.zone, servicesCount: z.count, revenue: Number(z.revenue.toFixed(2)),
        laborCost: Number(z.laborCost.toFixed(2)), materialCost: Number(z.materialCost.toFixed(2)),
        grossMargin: Number(margin.toFixed(2)),
        grossMarginPercent: z.revenue > 0 ? Number(((margin / z.revenue) * 100).toFixed(1)) : 0,
        avgQualityRating: z.qualityCount > 0 ? Number((z.qualitySum / z.qualityCount).toFixed(1)) : 0,
        incidentCount: z.incidents, workersCount: z.workers.size, clientsCount: z.clients.size,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const typeResults = Object.values(byType).map(t => {
      const cost = t.laborCost + t.materialCost;
      const margin = t.revenue - cost;
      const hours = t.totalMins / 60;
      return {
        cleaningType: t.cleaningType, servicesCount: t.count, revenue: Number(t.revenue.toFixed(2)),
        laborCost: Number(t.laborCost.toFixed(2)), materialCost: Number(t.materialCost.toFixed(2)),
        grossMargin: Number(margin.toFixed(2)),
        grossMarginPercent: t.revenue > 0 ? Number(((margin / t.revenue) * 100).toFixed(1)) : 0,
        avgDurationMinutes: t.count > 0 ? Number((t.totalMins / t.count).toFixed(0)) : 0,
        avgRevenuePerHour: hours > 0 ? Number((t.revenue / hours).toFixed(2)) : 0,
        incidentCount: t.incidents,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    res.json({ ok: true, period: { from, to }, byZone: zoneResults, byCleaningType: typeResults });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
