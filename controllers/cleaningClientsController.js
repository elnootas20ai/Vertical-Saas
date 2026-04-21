import {
  getCleaningDbName,
  getClientsDbName,
  getInvoicesDbName,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  sanitizeClient,
  sanitizeCleaningService,
  sanitizeCleaningIncident,
  sanitizeServiceContract,
  listCleaningServicesByUser,
  listCleaningIncidentsByUser,
  listServiceContractsByUser,
  listCleaningWorkersByUser,
  listInvoicesByUser,
  listClientNotesByClient,
  sanitizeClientNote,
  sanitizeInvoice,
} from '../services/couchdb.js';

import { v4 as uuidv4 } from 'uuid';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function computeContractMonthlyRevenue(contract) {
  switch (contract.pricingModel) {
    case 'monthly':
      return Number(contract.monthlyPrice || 0);
    case 'per_service':
      return Number(contract.pricePerService || 0) * Number(contract.contractedVisitsPerMonth || 0);
    case 'per_hour':
      return Number(contract.pricePerHour || 0) * Number(contract.contractedHoursPerVisit || 0) * Number(contract.contractedVisitsPerMonth || 0);
    default:
      return Number(contract.monthlyPrice || 0);
  }
}

function classifyMargin(margin) {
  if (!Number.isFinite(margin)) return 'unknown';
  if (margin >= 30) return 'high';
  if (margin >= 15) return 'medium';
  if (margin >= 1) return 'low';
  return 'negative';
}

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24));
}

function isWithinLastDays(dateStr, days) {
  if (!dateStr) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateStr) >= cutoff;
}

function matchesSearch(text, search) {
  if (!search) return true;
  return String(text || '').toLowerCase().includes(search.toLowerCase());
}

function buildWorkerCostMap(workers) {
  const map = {};
  for (const w of workers) {
    const id = w._id || w.id;
    if (id) map[id] = Number(w.hourlyCost || 0);
  }
  return map;
}

function parseServiceHours(svc) {
  if (svc.checkInAt && svc.checkOutAt) {
    const diff = new Date(svc.checkOutAt) - new Date(svc.checkInAt);
    if (diff > 0) return diff / (1000 * 60 * 60);
  }
  const d = parseFloat(svc.duration);
  if (Number.isFinite(d) && d > 0) return d;
  return 0;
}

function computeProfitability(contracts, services, workers, period) {
  const workerCostMap = buildWorkerCostMap(workers);
  let totalRevenue = 0;
  let totalCost = 0;
  let hasCostData = false;

  for (const c of contracts) {
    if (c.contractStatus !== 'active') continue;
    totalRevenue += computeContractMonthlyRevenue(c);
  }

  const relevant = period
    ? services.filter((s) => String(s.date || '').startsWith(period))
    : services;

  for (const svc of relevant) {
    const wid = svc.assignedTo || svc.workerId || '';
    const cost = workerCostMap[wid];
    if (cost > 0) {
      hasCostData = true;
      totalCost += parseServiceHours(svc) * cost;
    }
  }

  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return {
    revenue: Math.round(totalRevenue * 100) / 100,
    cost: Math.round(totalCost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    classification: hasCostData ? classifyMargin(margin) : 'unknown',
  };
}

function findNearestRenewal(contracts) {
  const now = new Date();
  let nearest = null;
  for (const c of contracts) {
    if (c.contractStatus !== 'active' || !c.endDate) continue;
    const end = new Date(c.endDate);
    if (end > now && (!nearest || end < new Date(nearest))) nearest = c.endDate;
  }
  return nearest;
}

async function fetchClientsForUser(req, userId) {
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.filter((d) => d?.type === 'client' && !d?.deletedAt && d?.user_id === userId);
}

async function fetchClientDoc(req, userId, clientId) {
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, clientId);
  if (!doc || doc.type !== 'client' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

async function fetchClientLocations(req, userId, clientId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((d) => d?.type === 'cleaning_client_location' && !d?.deletedAt && d?.user_id === userId && d?.clientId === clientId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

async function fetchDismissedAlerts(req, userId) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.filter((d) => d?.type === 'cleaning_alert_dismissed' && !d?.deletedAt && d?.user_id === userId);
}

function buildLocationDocument(userId, clientId, data, now) {
  return {
    _id: `cloc-${uuidv4()}`,
    type: 'cleaning_client_location',
    user_id: userId,
    clientId,
    name: String(data.name || ''),
    address: String(data.address || ''),
    addressLine2: String(data.addressLine2 || ''),
    city: String(data.city || ''),
    postalCode: String(data.postalCode || ''),
    zone: String(data.zone || ''),
    coordinates: data.coordinates || null,
    contactName: String(data.contactName || ''),
    contactPhone: String(data.contactPhone || ''),
    contactEmail: String(data.contactEmail || ''),
    accessInstructions: String(data.accessInstructions || ''),
    parkingNotes: String(data.parkingNotes || ''),
    squareMeters: Number(data.squareMeters || 0),
    floors: Number(data.floors || 0),
    locationNotes: String(data.locationNotes || ''),
    isActive: data.isActive !== false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function extractLocationsFromContracts(contracts) {
  const seen = new Set();
  const locations = [];
  for (const c of contracts) {
    if (!c.address) continue;
    const key = `${c.address}|${c.city || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({
      source: 'contract',
      contractId: c._id,
      name: c.clientName || '',
      address: c.address || '',
      addressLine2: c.addressLine2 || '',
      city: c.city || '',
      postalCode: c.postalCode || '',
      zone: c.zone || '',
      coordinates: c.coordinates || null,
    });
  }
  return locations;
}

function generateClientAlerts(clientId, crmClient, contracts, services, incidents, invoices) {
  const alerts = [];
  const now = new Date();
  const clientName = crmClient?.name || contracts[0]?.clientName || clientId;

  for (const c of contracts) {
    if (c.contractStatus !== 'active' || !c.endDate || c.autoRenew) continue;
    const daysLeft = daysBetween(c.endDate, now);
    const noticeDays = Number(c.renewalNoticeDays || 30);
    if (daysLeft > 0 && daysLeft <= noticeDays) {
      alerts.push({
        alertId: `contract_expiring:${c._id}`,
        type: 'contract_expiring',
        severity: daysLeft <= 15 ? 'critical' : 'warning',
        clientId, clientName,
        contractId: c._id,
        contractNumber: c.contractNumber || '',
        message: `Contrato ${c.contractNumber || c._id} vence en ${daysLeft} días`,
        daysLeft, endDate: c.endDate,
      });
    }
  }

  const unpaid = invoices.filter(
    (inv) => inv.status === 'overdue' || (inv.status === 'pending' && inv.dueDate && new Date(inv.dueDate) < now)
  );
  if (unpaid.length > 0) {
    const totalUnpaid = unpaid.reduce((s, inv) => s + Number(inv.total || 0) - Number(inv.paid || 0), 0);
    alerts.push({
      alertId: `client_unpaid_invoices:${clientId}`,
      type: 'client_unpaid_invoices',
      severity: totalUnpaid > 500 ? 'critical' : 'warning',
      clientId, clientName,
      message: `${unpaid.length} factura(s) impagada(s) por ${totalUnpaid.toFixed(2)}€`,
      unpaidCount: unpaid.length,
      totalUnpaid: Math.round(totalUnpaid * 100) / 100,
    });
  }

  const recentIncidents = incidents.filter((i) => isWithinLastDays(i.createdAt || i.date, 90));
  const incByType = {};
  for (const inc of recentIncidents) {
    const t = inc.incidentType || 'other';
    incByType[t] = (incByType[t] || 0) + 1;
  }
  for (const [type, count] of Object.entries(incByType)) {
    if (count >= 3) {
      alerts.push({
        alertId: `client_repeated_incidents:${clientId}:${type}`,
        type: 'client_repeated_incidents',
        severity: count >= 5 ? 'critical' : 'warning',
        clientId, clientName,
        message: `${count} incidencias de tipo "${type}" en los últimos 90 días`,
        incidentType: type, count,
      });
    }
  }

  const responsible = crmClient?.responsible || '';
  if (!responsible || responsible === 'Sin asignar') {
    alerts.push({
      alertId: `client_no_responsible:${clientId}`,
      type: 'client_no_responsible',
      severity: 'warning',
      clientId, clientName,
      message: 'Cliente sin responsable asignado',
    });
  }

  const hasActive = contracts.some((c) => c.contractStatus === 'active');
  if (hasActive) {
    const recentCompleted = services.some((s) => s.status === 'completed' && isWithinLastDays(s.date, 30));
    if (!recentCompleted) {
      alerts.push({
        alertId: `client_inactive:${clientId}`,
        type: 'client_inactive',
        severity: 'warning',
        clientId, clientName,
        message: 'Contrato activo pero sin servicios completados en los últimos 30 días',
      });
    }
  }

  const activeContracts = contracts.filter((c) => c.contractStatus === 'active');
  if (activeContracts.length > 0 && services.length > 0) {
    const revenue = activeContracts.reduce((sum, c) => sum + computeContractMonthlyRevenue(c), 0);
    const totalCost = services.filter((s) => s.status === 'completed').reduce((sum, s) => sum + Number(s.totalCost || 0), 0);
    if (revenue > 0 && totalCost > 0) {
      const margin = ((revenue - totalCost) / revenue) * 100;
      if (margin < 10) {
        alerts.push({
          alertId: `client_low_profitability:${clientId}`,
          type: 'client_low_profitability',
          severity: margin <= 0 ? 'warning' : 'info',
          clientId, clientName,
          message: margin <= 0 ? `Rentabilidad negativa (margen: ${margin.toFixed(1)}%)` : `Rentabilidad baja (margen: ${margin.toFixed(1)}%)`,
          margin: Math.round(margin * 100) / 100,
        });
      }
    }
  }

  return alerts;
}

// ─── LIST CLEANING CLIENTS (CLI-01) ──────────────────────────────────────────

export async function listCleaningClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { status, responsible, zone, search } = req.query || {};

    const [contracts, incidents, clientsDb] = await Promise.all([
      listServiceContractsByUser(req, userId),
      listCleaningIncidentsByUser(req, userId),
      fetchClientsForUser(req, userId),
    ]);

    const clientIdSet = new Set();
    const contractsByClient = {};
    for (const c of contracts) {
      if (!c.clientId) continue;
      clientIdSet.add(c.clientId);
      if (!contractsByClient[c.clientId]) contractsByClient[c.clientId] = [];
      contractsByClient[c.clientId].push(c);
    }

    const incidentsByClient = {};
    for (const inc of incidents) {
      if (!inc.clientId) continue;
      if (!incidentsByClient[inc.clientId]) incidentsByClient[inc.clientId] = [];
      incidentsByClient[inc.clientId].push(inc);
    }

    const clientMap = {};
    for (const cl of clientsDb) {
      const id = cl._id || cl.id;
      if (id) clientMap[id] = cl;
    }

    let clients = [];

    for (const clientId of clientIdSet) {
      const crm = clientMap[clientId] || null;
      const cc = contractsByClient[clientId] || [];
      const ci = incidentsByClient[clientId] || [];
      const active = cc.filter((c) => c.contractStatus === 'active');
      const monthlyRevenue = active.reduce((sum, c) => sum + computeContractMonthlyRevenue(c), 0);

      clients.push({
        clientId,
        name: crm?.name || cc[0]?.clientName || '',
        clientType: crm?.clientType || cc[0]?.clientType || '',
        phone: crm?.phone || cc[0]?.clientPhone || '',
        email: crm?.email || cc[0]?.clientEmail || '',
        responsible: crm?.responsible || 'Sin asignar',
        zone: crm?.city || active[0]?.zone || '',
        status: active.length > 0 ? 'active' : 'inactive',
        totalContracts: cc.length,
        activeContracts: active.length,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        incidentCount: ci.length,
        openIncidents: ci.filter((i) => i.status === 'open').length,
        nearestRenewal: findNearestRenewal(cc),
        createdAt: crm?.createdAt || cc[0]?.createdAt || '',
      });
    }

    if (status) clients = clients.filter((c) => c.status === status);
    if (responsible) clients = clients.filter((c) => c.responsible === responsible);
    if (zone) clients = clients.filter((c) => matchesSearch(c.zone, zone));
    if (search) {
      clients = clients.filter((c) =>
        matchesSearch(c.name, search) || matchesSearch(c.email, search) ||
        matchesSearch(c.phone, search) || matchesSearch(c.clientId, search)
      );
    }

    clients.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    return res.json({ ok: true, clients });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar clientes de limpieza' });
  }
}

// ─── GET CLEANING CLIENT PROFILE (CLI-02) ────────────────────────────────────

export async function getCleaningClientProfile(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [crmRaw, contracts, allSvc, incidents, allInv, notes, workers, locations] = await Promise.all([
      fetchClientDoc(req, userId, clientId),
      listServiceContractsByUser(req, userId, { clientId }),
      listCleaningServicesByUser(req, userId),
      listCleaningIncidentsByUser(req, userId),
      listInvoicesByUser(req, userId),
      listClientNotesByClient(req, userId, clientId),
      listCleaningWorkersByUser(req, userId),
      fetchClientLocations(req, userId, clientId),
    ]);

    const crmClient = crmRaw ? sanitizeClient(crmRaw) : null;
    const clientSvc = allSvc.filter((s) => s.clientId === clientId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const clientInc = incidents.filter((i) => i.clientId === clientId).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const clientInv = allInv.filter((inv) => inv.clientId === clientId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const contractLocs = extractLocationsFromContracts(contracts);
    const allLocs = [...locations, ...contractLocs.filter((cl) => !locations.some((l) => l.address === cl.address && l.name === cl.name))];

    const profitability = computeProfitability(contracts, clientSvc, workers, null);
    const alerts = generateClientAlerts(clientId, crmClient, contracts, clientSvc, clientInc, clientInv);

    return res.json({
      ok: true,
      profile: {
        client: crmClient,
        clientId,
        contracts: contracts.map(sanitizeServiceContract),
        recentServices: clientSvc.slice(0, 20).map(sanitizeCleaningService),
        incidents: clientInc.map(sanitizeCleaningIncident),
        invoices: clientInv.map(sanitizeInvoice),
        notes: notes.map(sanitizeClientNote).filter(Boolean),
        locations: allLocs,
        profitability,
        alerts,
        summary: {
          totalContracts: contracts.length,
          activeContracts: contracts.filter((c) => c.contractStatus === 'active').length,
          totalServices: clientSvc.length,
          totalIncidents: clientInc.length,
          openIncidents: clientInc.filter((i) => i.status === 'open').length,
          totalInvoices: clientInv.length,
          unpaidInvoices: clientInv.filter((i) => i.status === 'overdue' || (i.status === 'pending' && i.dueDate && new Date(i.dueDate) < new Date())).length,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar perfil de cliente' });
  }
}

// ─── CLIENT STATS (CLI-03) ───────────────────────────────────────────────────

export async function getCleaningClientStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [contracts, invoices, workers, services] = await Promise.all([
      listServiceContractsByUser(req, userId),
      listInvoicesByUser(req, userId),
      listCleaningWorkersByUser(req, userId),
      listCleaningServicesByUser(req, userId),
    ]);

    const clientIds = [...new Set(contracts.map((c) => c.clientId).filter(Boolean))];
    const active = contracts.filter((c) => c.contractStatus === 'active');
    const activeClientIds = [...new Set(active.map((c) => c.clientId).filter(Boolean))];
    const monthlyRevenue = active.reduce((sum, c) => sum + computeContractMonthlyRevenue(c), 0);

    const workerCostMap = buildWorkerCostMap(workers);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthSvc = services.filter((s) => String(s.date || '').startsWith(currentMonth));

    let monthlyCost = 0;
    let hasCostData = false;
    for (const svc of monthSvc) {
      const cost = workerCostMap[svc.assignedTo || svc.workerId || ''];
      if (cost > 0) { hasCostData = true; monthlyCost += parseServiceHours(svc) * cost; }
    }

    const monthlyProfit = monthlyRevenue - monthlyCost;
    const avgMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;

    const unpaid = invoices.filter((inv) => inv.status === 'overdue' || (inv.status === 'pending' && inv.dueDate && new Date(inv.dueDate) < now));
    const unpaidClients = new Set(unpaid.map((inv) => inv.clientId).filter(Boolean));
    const expiring = active.filter((c) => {
      if (!c.endDate || c.autoRenew) return false;
      const d = daysBetween(c.endDate, now);
      return d > 0 && d <= (c.renewalNoticeDays || 30);
    });

    return res.json({
      ok: true,
      stats: {
        totalClients: clientIds.length,
        activeClients: activeClientIds.length,
        inactiveClients: clientIds.length - activeClientIds.length,
        totalContracts: contracts.length,
        activeContracts: active.length,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        monthlyCost: Math.round(monthlyCost * 100) / 100,
        monthlyProfit: Math.round(monthlyProfit * 100) / 100,
        avgMargin: Math.round(avgMargin * 100) / 100,
        hasCostData,
        clientsWithUnpaid: unpaidClients.size,
        unpaidTotal: Math.round(unpaid.reduce((s, i) => s + Number(i.total || 0) - Number(i.paid || 0), 0) * 100) / 100,
        expiringContracts: expiring.length,
        currentMonth,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas de clientes' });
  }
}

// ─── CLIENT ALERTS (CLI-04) ──────────────────────────────────────────────────

export async function listCleaningClientAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [contracts, services, incidents, invoices, clientsDb, dismissed] = await Promise.all([
      listServiceContractsByUser(req, userId),
      listCleaningServicesByUser(req, userId),
      listCleaningIncidentsByUser(req, userId),
      listInvoicesByUser(req, userId),
      fetchClientsForUser(req, userId),
      fetchDismissedAlerts(req, userId),
    ]);

    const clientMap = {};
    for (const cl of clientsDb) { const id = cl._id || cl.id; if (id) clientMap[id] = cl; }

    const clientIds = [...new Set(contracts.map((c) => c.clientId).filter(Boolean))];
    const dismissedIds = new Set(dismissed.map((d) => d.alertId));
    const allAlerts = [];

    for (const cid of clientIds) {
      const cc = contracts.filter((c) => c.clientId === cid);
      const cs = services.filter((s) => s.clientId === cid);
      const ci = incidents.filter((i) => i.clientId === cid);
      const cinv = invoices.filter((inv) => inv.clientId === cid);
      allAlerts.push(...generateClientAlerts(cid, clientMap[cid] || null, cc, cs, ci, cinv));
    }

    const filtered = allAlerts.filter((a) => !dismissedIds.has(a.alertId));
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    filtered.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

    return res.json({ ok: true, alerts: filtered });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar alertas de clientes' });
  }
}

export async function dismissCleaningClientAlert(req, res) {
  try {
    const { userId, alertId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!alertId) return badRequest(res, 'Falta alertId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const now = new Date().toISOString();
    const docId = `calert-dismiss-${uuidv4()}`;
    const doc = {
      _id: docId, type: 'cleaning_alert_dismissed', user_id: userId,
      alertId: String(alertId), dismissedAt: now,
      dismissedBy: account.fullName || userId,
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    await putDocument(req, db, docId, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_alert', action: `Descartó alerta ${alertId}`,
      entityId: docId, entityLabel: alertId, metadata: {},
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al descartar alerta' });
  }
}

// ─── CLIENT LOCATIONS (CLI-05) ───────────────────────────────────────────────

export async function listClientLocationsEndpoint(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const locations = await fetchClientLocations(req, userId, clientId);
    return res.json({ ok: true, locations });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar ubicaciones' });
  }
}

export async function createClientLocation(req, res) {
  try {
    const { userId, clientId } = req.params;
    const data = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    if (!data.name && !data.address) return badRequest(res, 'Se requiere al menos nombre o dirección');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const now = new Date().toISOString();
    const doc = buildLocationDocument(userId, clientId, data, now);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_client_location',
      action: `Creó ubicación "${doc.name}" para cliente ${clientId}`,
      entityId: doc._id, entityLabel: doc.name || doc.address, metadata: { clientId },
    });

    return res.status(201).json({ ok: true, location: { ...doc, _rev: saved.rev } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear ubicación' });
  }
}

export async function updateClientLocation(req, res) {
  try {
    const { userId, clientId, locationId } = req.params;
    const data = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    if (!locationId) return badRequest(res, 'Falta locationId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, locationId);
    if (!existing || existing.type !== 'cleaning_client_location' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Ubicación no encontrada' });
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      name: String(data.name ?? existing.name ?? ''),
      address: String(data.address ?? existing.address ?? ''),
      addressLine2: String(data.addressLine2 ?? existing.addressLine2 ?? ''),
      city: String(data.city ?? existing.city ?? ''),
      postalCode: String(data.postalCode ?? existing.postalCode ?? ''),
      zone: String(data.zone ?? existing.zone ?? ''),
      coordinates: data.coordinates !== undefined ? data.coordinates : existing.coordinates,
      contactName: String(data.contactName ?? existing.contactName ?? ''),
      contactPhone: String(data.contactPhone ?? existing.contactPhone ?? ''),
      contactEmail: String(data.contactEmail ?? existing.contactEmail ?? ''),
      accessInstructions: String(data.accessInstructions ?? existing.accessInstructions ?? ''),
      parkingNotes: String(data.parkingNotes ?? existing.parkingNotes ?? ''),
      squareMeters: Number(data.squareMeters ?? existing.squareMeters ?? 0),
      floors: Number(data.floors ?? existing.floors ?? 0),
      locationNotes: String(data.locationNotes ?? existing.locationNotes ?? ''),
      isActive: data.isActive !== undefined ? data.isActive !== false : existing.isActive,
      updatedAt: now,
    };
    const saved = await putDocument(req, db, locationId, updated);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_client_location',
      action: `Actualizó ubicación "${updated.name}" del cliente ${clientId}`,
      entityId: locationId, entityLabel: updated.name || updated.address, metadata: { clientId },
    });

    return res.json({ ok: true, location: { ...updated, _rev: saved.rev } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar ubicación' });
  }
}

export async function removeClientLocation(req, res) {
  try {
    const { userId, clientId, locationId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    if (!locationId) return badRequest(res, 'Falta locationId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, locationId);
    if (!existing || existing.type !== 'cleaning_client_location' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Ubicación no encontrada' });
    }

    await softDeleteDocument(req, db, locationId);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'cleaning_client_location',
      action: `Eliminó ubicación "${existing.name}" del cliente ${clientId}`,
      entityId: locationId, entityLabel: existing.name || existing.address, metadata: { clientId },
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar ubicación' });
  }
}

// ─── PROFITABILITY ───────────────────────────────────────────────────────────

export async function getCleaningClientProfitability(req, res) {
  try {
    const { userId, clientId } = req.params;
    const period = req.query?.period || '';
    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [contracts, allSvc, workers] = await Promise.all([
      listServiceContractsByUser(req, userId, { clientId }),
      listCleaningServicesByUser(req, userId),
      listCleaningWorkersByUser(req, userId),
    ]);

    const clientSvc = allSvc.filter((s) => s.clientId === clientId);
    const prof = computeProfitability(contracts, clientSvc, workers, period);
    const completed = clientSvc.filter((s) => s.status === 'completed');
    const periodSvc = period ? completed.filter((s) => String(s.date || '').startsWith(period)) : completed;

    return res.json({
      ok: true,
      profitability: {
        ...prof, clientId, period: period || 'all',
        totalServices: periodSvc.length,
        totalHours: Math.round(periodSvc.reduce((sum, s) => sum + parseServiceHours(s), 0) * 100) / 100,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular rentabilidad del cliente' });
  }
}

export async function getPortfolioProfitability(req, res) {
  try {
    const { userId } = req.params;
    const period = req.query?.period || '';
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [contracts, services, workers] = await Promise.all([
      listServiceContractsByUser(req, userId),
      listCleaningServicesByUser(req, userId),
      listCleaningWorkersByUser(req, userId),
    ]);

    const overall = computeProfitability(contracts, services, workers, period);
    const clientIds = [...new Set(contracts.map((c) => c.clientId).filter(Boolean))];

    const byClient = clientIds.map((cid) => {
      const cc = contracts.filter((c) => c.clientId === cid);
      const cs = services.filter((s) => s.clientId === cid);
      return { clientId: cid, clientName: cc[0]?.clientName || '', ...computeProfitability(cc, cs, workers, period) };
    });
    byClient.sort((a, b) => b.profit - a.profit);

    const distribution = { high: 0, medium: 0, low: 0, negative: 0, unknown: 0 };
    for (const c of byClient) distribution[c.classification] = (distribution[c.classification] || 0) + 1;

    return res.json({
      ok: true,
      profitability: { period: period || 'all', overall, byClient, distribution, totalClients: clientIds.length },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular rentabilidad del portfolio' });
  }
}
