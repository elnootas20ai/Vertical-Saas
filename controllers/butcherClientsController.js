import {
  getButcherDbName,
  buildButcherClientDocument,
  sanitizeButcherClient,
  listButcherClientsByUser,
  searchButcherClientsFn,
  listButcherOrdersByUser,
  listButcherSalesByUser,
  updateButcherClientCounters,
} from '../services/butcherShop.js';
import { ensureDatabase, getDocument, putDocument } from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function bad(res, error) { return res.status(400).json({ ok: false, error }); }

export async function listButcherClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const raw = await listButcherClientsByUser(req, userId);
    const sanitized = raw.map(sanitizeButcherClient).filter(Boolean);
    const { items, meta } = applyQueryOptions(sanitized, req.query);
    return res.json({ ok: true, clients: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar clientes' });
  }
}

export async function createButcherClient(req, res) {
  try {
    const { userId } = req.params;
    const { client } = req.body || {};
    if (!userId) return bad(res, 'Falta userId');
    if (!client || !client.name?.trim()) return bad(res, 'El nombre es obligatorio');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = buildButcherClientDocument(userId, client);
    await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, client: sanitizeButcherClient(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al crear cliente' });
  }
}

export async function getButcherClient(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, clientId);
    if (!doc || doc.type !== 'butcher_client' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }
    return res.json({ ok: true, client: sanitizeButcherClient(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar cliente' });
  }
}

export async function updateButcherClient(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { client } = req.body || {};
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');
    if (!client) return bad(res, 'Falta el objeto client');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, clientId);
    if (!existing || existing.type !== 'butcher_client' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }
    const updated = buildButcherClientDocument(userId, client, existing);
    await putDocument(req, db, updated._id, updated);
    return res.json({ ok: true, client: sanitizeButcherClient(updated) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al actualizar cliente' });
  }
}

export async function deleteButcherClient(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, clientId);
    if (!existing || existing.type !== 'butcher_client' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }
    existing.active = false;
    existing.updatedAt = new Date().toISOString();
    await putDocument(req, db, existing._id, existing);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al eliminar cliente' });
  }
}

export async function searchButcherClients(req, res) {
  try {
    const { userId } = req.params;
    const q = String(req.query.q || '').trim();
    if (!userId) return bad(res, 'Falta userId');
    const results = await searchButcherClientsFn(req, userId, q);
    return res.json({ ok: true, clients: results.slice(0, 20).map(sanitizeButcherClient) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error en búsqueda' });
  }
}

export async function getButcherClientHistory(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');

    const [orders, sales] = await Promise.all([
      listButcherOrdersByUser(req, userId),
      listButcherSalesByUser(req, userId),
    ]);

    const clientOrders = orders.filter((o) => o.clientId === clientId);
    const clientSales = sales.filter((s) => s.clientId === clientId);

    const timeline = [
      ...clientOrders.map((o) => ({ type: 'order', date: o.createdAt, ref: o.orderNumber, total: o.total, status: o.status, items: o.items })),
      ...clientSales.map((s) => ({ type: 'sale', date: s.createdAt, ref: s.ticketNumber, total: s.total, status: s.status, items: s.items })),
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const totalSpent = clientSales.filter((s) => s.status === 'completed').reduce((sum, s) => sum + Number(s.total || 0), 0);
    const completedSales = clientSales.filter((s) => s.status === 'completed');
    const avgTicket = completedSales.length > 0 ? totalSpent / completedSales.length : 0;

    const productMap = {};
    for (const sale of completedSales) {
      for (const item of (sale.items || [])) {
        const key = (item.productName || '').toLowerCase();
        if (!key) continue;
        if (!productMap[key]) productMap[key] = { productName: item.productName, totalSpent: 0, count: 0 };
        productMap[key].totalSpent += Number(item.subtotal || 0);
        productMap[key].count += 1;
      }
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

    return res.json({
      ok: true,
      history: {
        timeline: timeline.slice(0, Number(req.query.limit || 50)),
        stats: { totalSpent, avgTicket, totalOrders: clientOrders.length, totalSales: completedSales.length },
        topProducts,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar historial' });
  }
}

export async function analyzeButcherClientHabits(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const client = await getDocument(req, db, clientId);
    if (!client || client.type !== 'butcher_client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    const sales = await listButcherSalesByUser(req, userId);
    const clientSales = sales.filter((s) => s.clientId === clientId && s.status === 'completed');
    if (clientSales.length < 2) {
      return res.json({ ok: true, message: 'Insuficientes ventas para analizar hábitos', habits: null });
    }

    const productMap = {};
    const dayCount = {};
    const dates = [];
    for (const sale of clientSales) {
      dates.push(new Date(sale.date || sale.createdAt));
      const dayOfWeek = new Date(sale.date || sale.createdAt).toLocaleDateString('es-ES', { weekday: 'long' });
      dayCount[dayOfWeek] = (dayCount[dayOfWeek] || 0) + 1;

      for (const item of (sale.items || [])) {
        const key = (item.productName || '').toLowerCase();
        if (!key) continue;
        if (!productMap[key]) productMap[key] = { productName: item.productName, totalQty: 0, count: 0, unit: item.unit || 'kg' };
        productMap[key].totalQty += Number(item.quantity || 0);
        productMap[key].count += 1;
      }
    }

    const usualProducts = Object.values(productMap)
      .filter((p) => p.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((p) => ({
        productName: p.productName,
        productId: null,
        quantity: Math.round((p.totalQty / p.count) * 10) / 10,
        unit: p.unit,
        frequency: `${p.count} compras`,
      }));

    const preferredDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    client.preferences = client.preferences || {};
    client.preferences.usualProducts = usualProducts;
    client.preferences.preferredDay = preferredDay;
    client.lastHabitAnalysis = new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    await putDocument(req, db, client._id, client);

    return res.json({
      ok: true,
      habits: {
        usualProducts,
        preferredDay,
        totalSalesAnalyzed: clientSales.length,
      },
      client: sanitizeButcherClient(client),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al analizar hábitos' });
  }
}

export async function linkButcherClientToCrm(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { crmClientId } = req.body || {};
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');
    if (!crmClientId) return bad(res, 'Falta crmClientId');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const client = await getDocument(req, db, clientId);
    if (!client || client.type !== 'butcher_client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    client.linkedCrmClientId = String(crmClientId);
    client.updatedAt = new Date().toISOString();
    await putDocument(req, db, client._id, client);

    return res.json({ ok: true, client: sanitizeButcherClient(client) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al vincular con CRM' });
  }
}

export async function unlinkButcherClientFromCrm(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return bad(res, 'Faltan parámetros');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const client = await getDocument(req, db, clientId);
    if (!client || client.type !== 'butcher_client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    client.linkedCrmClientId = '';
    client.updatedAt = new Date().toISOString();
    await putDocument(req, db, client._id, client);

    return res.json({ ok: true, client: sanitizeButcherClient(client) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al desvincular del CRM' });
  }
}
