import {
  getButcherDbName,
  buildButcherSaleDocument,
  sanitizeButcherSale,
  listButcherSalesByUser,
  getNextButcherTicketNumber,
  updateButcherClientCounters,
  analyzeButcherClientHabitsAsync,
} from '../services/butcherShop.js';
import { ensureDatabase, getDocument, putDocument } from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function bad(res, error) { return res.status(400).json({ ok: false, error }); }

export async function listButcherSales(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const raw = await listButcherSalesByUser(req, userId);
    const sanitized = raw.map(sanitizeButcherSale).filter(Boolean);
    const { items, meta } = applyQueryOptions(sanitized, req.query);
    return res.json({ ok: true, sales: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar ventas' });
  }
}

export async function createButcherSale(req, res) {
  try {
    const { userId } = req.params;
    const { sale } = req.body || {};
    if (!userId) return bad(res, 'Falta userId');
    if (!sale) return bad(res, 'Falta el objeto sale');

    const ticketNumber = await getNextButcherTicketNumber(req, userId);
    const total = (sale.items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.pricePerUnit || 0)), 0);
    const totalWeight = (sale.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = buildButcherSaleDocument(userId, { ...sale, ticketNumber, total, totalWeight });
    await putDocument(req, db, doc._id, doc);

    updateButcherClientCounters(req, userId, sale.clientId, total).catch(() => {});
    if (sale.clientId) {
      analyzeButcherClientHabitsAsync(req, userId, sale.clientId).catch(() => {});
    }

    return res.json({ ok: true, sale: sanitizeButcherSale(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al crear venta' });
  }
}

export async function getButcherSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    if (!userId || !saleId) return bad(res, 'Faltan parámetros');
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, saleId);
    if (!doc || doc.type !== 'butcher_sale' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
    }
    return res.json({ ok: true, sale: sanitizeButcherSale(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar venta' });
  }
}

export async function voidButcherSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    if (!userId || !saleId) return bad(res, 'Faltan parámetros');
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, saleId);
    if (!doc || doc.type !== 'butcher_sale' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
    }
    if (doc.status === 'voided') return bad(res, 'La venta ya está anulada');

    doc.status = 'voided';
    doc.updatedAt = new Date().toISOString();
    await putDocument(req, db, doc._id, doc);

    if (doc.clientId) {
      try {
        const client = await getDocument(req, db, doc.clientId);
        if (client && client.type === 'butcher_client') {
          client.totalOrders = Math.max(0, (Number(client.totalOrders) || 0) - 1);
          client.totalSpent = Math.max(0, (Number(client.totalSpent) || 0) - Number(doc.total || 0));
          client.updatedAt = new Date().toISOString();
          await putDocument(req, db, client._id, client);
        }
      } catch { /* non-blocking */ }
    }

    return res.json({ ok: true, sale: sanitizeButcherSale(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al anular venta' });
  }
}

export async function getButcherSalesToday(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const today = new Date().toISOString().slice(0, 10);
    const all = await listButcherSalesByUser(req, userId);
    const todaySales = all.filter((s) => s.date === today).map(sanitizeButcherSale);
    const completed = todaySales.filter((s) => s.status === 'completed');
    const totalRevenue = completed.reduce((s, x) => s + x.total, 0);
    const byMethod = { cash: 0, card: 0, bizum: 0, mixed: 0 };
    for (const s of completed) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total;

    return res.json({ ok: true, sales: todaySales, stats: { count: completed.length, totalRevenue, byMethod } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar ventas de hoy' });
  }
}

export async function getButcherSalesStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const all = await listButcherSalesByUser(req, userId);
    const completed = all.filter((s) => s.status === 'completed');

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    const salesToday = completed.filter((s) => s.date === today);
    const salesWeek = completed.filter((s) => s.date >= weekAgo);
    const salesMonth = completed.filter((s) => s.date >= monthStart);

    const sum = (arr) => arr.reduce((s, x) => s + Number(x.total || 0), 0);
    const avg = (arr) => arr.length > 0 ? sum(arr) / arr.length : 0;

    const productMap = {};
    for (const sale of completed) {
      for (const item of (sale.items || [])) {
        const key = (item.productName || '').toLowerCase();
        if (!key) continue;
        if (!productMap[key]) productMap[key] = { name: item.productName, qty: 0, revenue: 0 };
        productMap[key].qty += Number(item.quantity || 0);
        productMap[key].revenue += Number(item.subtotal || 0);
      }
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return res.json({
      ok: true,
      stats: {
        today: { count: salesToday.length, revenue: sum(salesToday) },
        week: { count: salesWeek.length, revenue: sum(salesWeek) },
        month: { count: salesMonth.length, revenue: sum(salesMonth) },
        avgTicket: avg(completed),
        topProducts,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar estadísticas' });
  }
}
