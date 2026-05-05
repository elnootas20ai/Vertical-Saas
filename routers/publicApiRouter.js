import { Router } from 'express';
import { couchRequest, ensureDatabase, listBusinessesByUser } from '../services/couchdb.js';
import { validateApiToken } from './tokenRouter.js';
import { dispatchWebhooks } from '../services/webhookService.js';

const publicApiRouter = Router();

function normalizeDbName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DB_BASE = process.env.VITE_COUCHDB_DB || 'vertial';
const VEHICLES_DB = 'vehicles';
const ACCOUNTS_DB = 'accounts';
const LEADS_DB = normalizeDbName(process.env.VITE_CRM_LEADS_DB || `${DB_BASE}-leads`);
const CLIENTS_DB = normalizeDbName(process.env.VITE_CRM_CLIENTS_DB || `${DB_BASE}-clients`);
const SALES_DB = normalizeDbName(process.env.VITE_SALES_DB || `${DB_BASE}-sales`);
const FINANCE_DB = normalizeDbName(process.env.VITE_FINANCE_DB || process.env.VITE_PAYMENTS_DB || 'pay');
const CALLS_DB = normalizeDbName(process.env.VITE_CALLS_DB || `${DB_BASE}-calls`);
const DOCUMENTS_DB = normalizeDbName(process.env.VITE_DOCUMENTS_DB || `${DB_BASE}-documents`);

async function fetchAllDocs(req, dbName, filter) {
  await ensureDatabase(req, dbName).catch(() => {});
  const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
  if (!resp.ok) return [];
  const body = await resp.json().catch(() => ({ rows: [] }));
  return (body.rows || [])
    .map((row) => row.doc)
    .filter(
      (d) =>
        d &&
        !String(d._id || '').startsWith('_design/') &&
        !d.deletedAt &&
        (filter ? filter(d) : true),
    );
}

async function getDoc(req, dbName, docId) {
  const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/${encodeURIComponent(docId)}`);
  if (!resp.ok) return null;
  return resp.json().catch(() => null);
}

function paginateDocs(docs, query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
  const total = docs.length;
  const start = (page - 1) * limit;
  const items = docs.slice(start, start + limit);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

// Aplicar middleware de autenticación a todas las rutas
publicApiRouter.use(validateApiToken);

// ─── Info de la API ────────────────────────────────────────────────────────────
publicApiRouter.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'Vertial API',
    version: '1',
    userId: req.apiUserId,
    permissions: req.apiPermissions,
    endpoints: {
      vehicles: '/api/v1/vehicles',
      sales: '/api/v1/sales',
      clients: '/api/v1/clients',
      pipeline: '/api/v1/pipeline',
      documents: '/api/v1/documents',
      finance: '/api/v1/finance',
      team: '/api/v1/team',
      calls: '/api/v1/calls',
      dashboard: '/api/v1/dashboard/kpis',
    },
  });
});

// ─── Vehículos ────────────────────────────────────────────────────────────────
publicApiRouter.get('/vehicles', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, VEHICLES_DB, (d) => d.user_id === req.apiUserId);
    const { items, ...meta } = paginateDocs(docs, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/vehicles/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, VEHICLES_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.post('/vehicles', async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.apiUserId, createdAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(VEHICLES_DB)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error creando vehículo', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'vehicle.created', { ...body, _id: payload.id });
    return res.status(201).json({ ok: true, id: payload.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.put('/vehicles/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, VEHICLES_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }
    const updated = { ...doc, ...req.body, user_id: req.apiUserId, updatedAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(VEHICLES_DB)}/${encodeURIComponent(req.params.id)}`, {
      method: 'PUT',
      body: JSON.stringify(updated),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error actualizando vehículo', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'vehicle.updated', updated);
    return res.json({ ok: true, id: req.params.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Ventas ───────────────────────────────────────────────────────────────────
publicApiRouter.get('/sales', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, SALES_DB, (d) => d.user_id === req.apiUserId);
    const { items, ...meta } = paginateDocs(docs, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/sales/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, SALES_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.post('/sales', async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.apiUserId, createdAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(SALES_DB)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error creando venta', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'sale.created', { ...body, _id: payload.id });
    return res.status(201).json({ ok: true, id: payload.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Clientes ─────────────────────────────────────────────────────────────────
publicApiRouter.get('/clients', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, CLIENTS_DB, (d) => d.user_id === req.apiUserId);
    const { items, ...meta } = paginateDocs(docs, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/clients/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, CLIENTS_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.post('/clients', async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.apiUserId, createdAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(CLIENTS_DB)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error creando cliente', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'client.created', { ...body, _id: payload.id });
    return res.status(201).json({ ok: true, id: payload.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Pipeline (Leads) ─────────────────────────────────────────────────────────
publicApiRouter.get('/pipeline', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, LEADS_DB, (d) => d.user_id === req.apiUserId && d.type === 'lead');
    const { items, ...meta } = paginateDocs(docs, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/pipeline/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, LEADS_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.post('/pipeline', async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.apiUserId, type: 'lead', createdAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(LEADS_DB)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error creando lead', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'lead.created', { ...body, _id: payload.id });
    return res.status(201).json({ ok: true, id: payload.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.put('/pipeline/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, LEADS_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' });
    }
    const updated = { ...doc, ...req.body, user_id: req.apiUserId, updatedAt: new Date().toISOString() };
    const resp = await couchRequest(req, `/${encodeURIComponent(LEADS_DB)}/${encodeURIComponent(req.params.id)}`, {
      method: 'PUT',
      body: JSON.stringify(updated),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: 'Error actualizando lead', details: payload });
    dispatchWebhooks(req, req.apiUserId, 'lead.updated', updated);
    return res.json({ ok: true, id: req.params.id, rev: payload.rev });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Documentos ───────────────────────────────────────────────────────────────
publicApiRouter.get('/documents', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, DOCUMENTS_DB, (d) => d.user_id === req.apiUserId);
    const { items, ...meta } = paginateDocs(docs, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/documents/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, DOCUMENTS_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Finanzas ─────────────────────────────────────────────────────────────────
publicApiRouter.get('/finance', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, FINANCE_DB, (d) => d.user_id === req.apiUserId);
    const { items, ...meta } = paginateDocs(docs, req.query);

    const totalIncome = items
      .filter((d) => d.type === 'income')
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    const totalExpense = items
      .filter((d) => d.type === 'expense')
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    return res.json({
      ok: true,
      data: items,
      summary: { totalIncome, totalExpense, balance: totalIncome - totalExpense },
      meta,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Equipo ───────────────────────────────────────────────────────────────────
publicApiRouter.get('/team', async (req, res) => {
  try {
    const businesses = await listBusinessesByUser(req, req.apiUserId);
    const memberIds = new Set();
    for (const biz of businesses) {
      if (biz.owner_user_id) memberIds.add(biz.owner_user_id);
      if (Array.isArray(biz.members)) {
        for (const m of biz.members) if (m.user_id) memberIds.add(m.user_id);
      }
    }

    const docs = await fetchAllDocs(req, ACCOUNTS_DB, (d) => d.type === 'account' && memberIds.has(d.user_id));
    const sanitized = docs.map((d) => ({
      id: d._id,
      userId: d.user_id,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      role: d.role,
      phone: d.phone,
      avatarUrl: d.avatarUrl,
      createdAt: d.createdAt,
    }));
    const { items, ...meta } = paginateDocs(sanitized, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Llamadas IA ──────────────────────────────────────────────────────────────
publicApiRouter.get('/calls', async (req, res) => {
  try {
    const docs = await fetchAllDocs(req, CALLS_DB, (d) => d.user_id === req.apiUserId);
    const sanitized = docs.map((d) => ({
      id: d._id,
      title: d.title,
      status: d.status,
      duration: d.duration,
      transcript: d.transcript,
      summary: d.summary,
      createdAt: d.createdAt,
    }));
    const { items, ...meta } = paginateDocs(sanitized, req.query);
    return res.json({ ok: true, data: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

publicApiRouter.get('/calls/:id', async (req, res) => {
  try {
    const doc = await getDoc(req, CALLS_DB, req.params.id);
    if (!doc || doc.user_id !== req.apiUserId) {
      return res.status(404).json({ ok: false, error: 'Llamada no encontrada' });
    }
    return res.json({ ok: true, data: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Dashboard KPIs ───────────────────────────────────────────────────────────
publicApiRouter.get('/dashboard/kpis', async (req, res) => {
  try {
    const userId = req.apiUserId;
    const leadsDb = LEADS_DB;
    const salesDb = SALES_DB;

    async function fetchAll(dbName) {
      await ensureDatabase(req, dbName).catch(() => {});
      const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
      if (!resp.ok) return [];
      const body = await resp.json().catch(() => ({ rows: [] }));
      return (body.rows || [])
        .map((row) => row.doc)
        .filter((d) => d && !String(d._id || '').startsWith('_design/'));
    }

    const [vehicleDocs, leadDocs, saleDocs] = await Promise.all([
      fetchAll(VEHICLES_DB),
      fetchAll(leadsDb),
      fetchAll(salesDb),
    ]);

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const userVehicles = vehicleDocs.filter((v) => v.user_id === userId && v.active !== false);
    const userLeads = leadDocs.filter((l) => l.user_id === userId && l.type === 'lead');

    const inStockStatuses = ['entrada', 'preparacion', 'listo', 'available', 'workshop'];
    const stockCount = userVehicles.filter((v) => inStockStatuses.includes(v.status)).length;
    const reservedCount = userVehicles.filter((v) => v.status === 'reservado' || v.status === 'reserved').length;
    const soldThisMonth = userVehicles.filter(
      (v) => (v.status === 'vendido' || v.status === 'sold') && v.soldAt && String(v.soldAt) >= firstOfMonth,
    );
    const salesVolume = soldThisMonth.reduce((s, v) => s + Number(v.salePrice || 0), 0);
    const pendingSales = saleDocs.filter((s) => s.status === 'pending');

    return res.json({
      ok: true,
      data: {
        stockCount,
        reservedCount,
        totalVehicles: userVehicles.length,
        soldThisMonth: soldThisMonth.length,
        salesVolume,
        oportunidades: userLeads.filter((l) => l.status !== 'won' && l.status !== 'lost').length,
        cobrosPendientes: pendingSales.reduce((s, x) => s + Number(x.totalAmount || 0), 0),
      },
      updatedAt: now.toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export { publicApiRouter };
