import {
  getButcherDbName,
  ensureDatabase,
  getAllDocuments,
  getClockinsDbName,
  getFinanceDbName,
} from '../services/couchdb.js';

function bad(res, msg) { return res.status(400).json({ ok: false, error: msg }); }

async function fetchAllDocs(req, dbName) {
  await ensureDatabase(req, dbName);
  const docs = await getAllDocuments(req, dbName);
  return (docs || []).filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
}

function parseRange(from, to) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return null;
  return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
}

function prevRange(from, to) {
  const f = new Date(from);
  const t = new Date(to);
  const dur = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - dur);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

function inRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

function filterDoc(doc, { storeId, workerId, category }) {
  if (storeId && (doc.storeId || doc.tiendaId || '') !== storeId) return false;
  if (workerId && (doc.soldBy || doc.registeredBy || doc.responsableId || '') !== workerId) return false;
  if (category && (doc.category || '') !== category) return false;
  return true;
}

async function loadButcherData(req, userId) {
  const db = getButcherDbName();
  const allDocs = await fetchAllDocs(req, db);
  const sales = allDocs.filter((d) => d.type === 'butcher_sale' && d.user_id === userId);
  const waste = allDocs.filter((d) => d.type === 'butcher_waste' && d.user_id === userId);
  const products = allDocs.filter((d) => d.type === 'butcher_product' && d.user_id === userId);
  const orders = allDocs.filter((d) => d.type === 'butcher_order' && d.user_id === userId);
  return { sales, waste, products, orders };
}

async function loadClockins(req, userId) {
  try {
    const db = getClockinsDbName();
    const docs = await fetchAllDocs(req, db);
    return docs.filter((d) => d.user_id === userId || d.business_id === userId);
  } catch { return []; }
}

async function loadFinance(req, userId) {
  try {
    const db = getFinanceDbName();
    const docs = await fetchAllDocs(req, db);
    return docs.filter((d) => d.user_id === userId);
  } catch { return []; }
}

// ─── GET /api/butcher-reports/:userId/kpis ──────────────────────────────────
export async function getButcherReportKpis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');

    const { from, to, storeId, workerId, category } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango de fechas inválido');
    const prev = prevRange(range.from, range.to);
    const filters = { storeId, workerId, category };

    const { sales, waste, products, orders } = await loadButcherData(req, userId);
    const finance = await loadFinance(req, userId);
    const clockins = await loadClockins(req, userId);

    const completed = sales.filter((s) => s.status === 'completed');
    const curSales = completed.filter((s) => inRange(s.date, range.from, range.to) && filterDoc(s, filters));
    const prevSales = completed.filter((s) => inRange(s.date, prev.from, prev.to) && filterDoc(s, filters));

    const today = new Date().toISOString().slice(0, 10);
    const todaySales = completed.filter((s) => s.date === today && filterDoc(s, filters));
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdaySales = completed.filter((s) => s.date === yesterdayStr && filterDoc(s, filters));

    const sumTotal = (arr) => arr.reduce((s, x) => s + Number(x.total || 0), 0);
    const sumCost = (arr) => arr.reduce((s, x) => {
      return s + (x.items || []).reduce((c, it) => {
        const prod = products.find((p) => p._id === it.productId);
        const cost = prod ? Number(prod.costPerKg || 0) : Number(it.pricePerUnit || 0) * 0.6;
        return c + cost * Number(it.quantity || 0);
      }, 0);
    }, 0);

    const ventasHoyTotal = sumTotal(todaySales);
    const ventasAyerTotal = sumTotal(yesterdaySales);
    const ventasPeriodo = sumTotal(curSales);
    const ventasPrevPeriodo = sumTotal(prevSales);
    const costePeriodo = sumCost(curSales);
    const margenPeriodo = ventasPeriodo - costePeriodo;
    const margenPct = ventasPeriodo > 0 ? Math.round((margenPeriodo / ventasPeriodo) * 1000) / 10 : 0;
    const costePrev = sumCost(prevSales);
    const margenPrev = ventasPrevPeriodo - costePrev;
    const margenPctPrev = ventasPrevPeriodo > 0 ? Math.round((margenPrev / ventasPrevPeriodo) * 1000) / 10 : 0;

    const curWaste = waste.filter((w) => inRange(w.date, range.from, range.to) && filterDoc(w, filters));
    const prevWaste = waste.filter((w) => inRange(w.date, prev.from, prev.to) && filterDoc(w, filters));
    const mermaKg = curWaste.reduce((s, w) => s + Number(w.wasteKg || 0), 0);
    const mermaCoste = curWaste.reduce((s, w) => {
      const prod = products.find((p) => p._id === w.productId);
      return s + Number(w.wasteKg || 0) * Number(prod?.costPerKg || 10);
    }, 0);
    const mermaPrevKg = prevWaste.reduce((s, w) => s + Number(w.wasteKg || 0), 0);

    const monthStart = today.slice(0, 7) + '-01';
    const purchases = orders.filter((o) => o.date >= monthStart && (!storeId || o.storeId === storeId));
    const comprasMes = purchases.reduce((s, o) => s + Number(o.total || 0), 0);

    const opex = finance
      .filter((m) => m.type === 'pago' && inRange((m.date || '').slice(0, 10), range.from, range.to))
      .reduce((s, m) => s + Number(m.totalAmount || m.amount || 0), 0);

    const beneficio = margenPeriodo - mermaCoste - opex;
    const beneficioPct = ventasPeriodo > 0 ? Math.round((beneficio / ventasPeriodo) * 1000) / 10 : 0;

    const stockCriticoItems = products.filter((p) => p.active && p.stockKg < p.minStockKg && p.minStockKg > 0);

    const activeWorkerIds = new Set();
    const todayClockins = clockins.filter((c) => (c.date || (c.clockIn || '').slice(0, 10)) === today);
    todayClockins.forEach((c) => { if (c.memberId || c.worker_id) activeWorkerIds.add(c.memberId || c.worker_id); });

    return res.json({
      ok: true,
      kpis: {
        ventasHoy: { total: ventasHoyTotal, tickets: todaySales.length, ticketMedio: todaySales.length > 0 ? Math.round(ventasHoyTotal / todaySales.length * 100) / 100 : 0, vsPrevDay: pctChange(ventasHoyTotal, ventasAyerTotal) },
        ventasPeriodo: { total: ventasPeriodo, tickets: curSales.length, ticketMedio: curSales.length > 0 ? Math.round(ventasPeriodo / curSales.length * 100) / 100 : 0, vsPrevPeriod: pctChange(ventasPeriodo, ventasPrevPeriodo) },
        margenEstimado: { total: margenPeriodo, pct: margenPct, vsPrevPeriod: Math.round((margenPct - margenPctPrev) * 10) / 10 },
        mermaTotal: { kg: Math.round(mermaKg * 10) / 10, coste: Math.round(mermaCoste * 100) / 100, pctSobreVentas: ventasPeriodo > 0 ? Math.round((mermaCoste / ventasPeriodo) * 1000) / 10 : 0, vsPrevPeriod: pctChange(mermaKg, mermaPrevKg) },
        stockCritico: { count: stockCriticoItems.length, items: stockCriticoItems.slice(0, 5).map((p) => ({ nombre: p.name, stock: p.stockKg, minimo: p.minStockKg, unidad: p.unit })) },
        comprasMes: { total: comprasMes, facturas: purchases.length },
        beneficioEstimado: { total: Math.round(beneficio * 100) / 100, pct: beneficioPct },
        trabajadoresActivos: { count: activeWorkerIds.size },
      },
      range,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error calculando KPIs' });
  }
}

// ─── GET /api/butcher-reports/:userId/ventas-trabajador ─────────────────────
export async function getButcherVentasTrabajador(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to, storeId } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const { sales, products } = await loadButcherData(req, userId);
    const clockins = await loadClockins(req, userId);
    const completed = sales.filter((s) => s.status === 'completed' && inRange(s.date, range.from, range.to));
    if (storeId) completed.filter((s) => s.storeId === storeId);

    const workerMap = {};
    for (const s of completed) {
      const wId = s.soldBy || 'unknown';
      if (!workerMap[wId]) workerMap[wId] = { id: wId, nombre: wId, ventas: 0, tickets: 0, mermaKg: 0, horas: 0 };
      workerMap[wId].ventas += Number(s.total || 0);
      workerMap[wId].tickets += 1;
    }

    const waste = (await loadButcherData(req, userId)).waste.filter((w) => inRange(w.date, range.from, range.to));
    for (const w of waste) {
      const wId = w.registeredBy || 'unknown';
      if (!workerMap[wId]) workerMap[wId] = { id: wId, nombre: wId, ventas: 0, tickets: 0, mermaKg: 0, horas: 0 };
      workerMap[wId].mermaKg += Number(w.wasteKg || 0);
    }

    for (const c of clockins) {
      if (!inRange((c.date || (c.clockIn || '').slice(0, 10)), range.from, range.to)) continue;
      const wId = c.memberId || c.worker_id || 'unknown';
      if (!workerMap[wId]) workerMap[wId] = { id: wId, nombre: c.memberName || c.worker_name || wId, ventas: 0, tickets: 0, mermaKg: 0, horas: 0 };
      if (!workerMap[wId].nombre || workerMap[wId].nombre === wId) workerMap[wId].nombre = c.memberName || c.worker_name || wId;
      if (c.clockIn && c.clockOut) {
        const hrs = (new Date(c.clockOut).getTime() - new Date(c.clockIn).getTime()) / 3600000;
        if (hrs > 0 && hrs < 24) workerMap[wId].horas += hrs;
      }
    }

    const workers = Object.values(workerMap).map((w) => ({
      ...w,
      ticketMedio: w.tickets > 0 ? Math.round(w.ventas / w.tickets * 100) / 100 : 0,
      ventasPorHora: w.horas > 0 ? Math.round(w.ventas / w.horas * 100) / 100 : 0,
      horas: Math.round(w.horas * 10) / 10,
      mermaKg: Math.round(w.mermaKg * 10) / 10,
    })).sort((a, b) => b.ventas - a.ventas);

    return res.json({ ok: true, workers, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/butcher-reports/:userId/top-productos ─────────────────────────
export async function getButcherTopProductos(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to, storeId, limit: lim } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');
    const maxItems = Number(lim) || 10;

    const { sales, products, waste } = await loadButcherData(req, userId);
    const completed = sales.filter((s) => s.status === 'completed' && inRange(s.date, range.from, range.to));

    const prodMap = {};
    for (const s of completed) {
      for (const it of (s.items || [])) {
        const key = it.productId || it.productName || 'unknown';
        if (!prodMap[key]) {
          const prod = products.find((p) => p._id === key);
          prodMap[key] = { id: key, nombre: it.productName || prod?.name || key, categoria: prod?.category || '', unidades: 0, ingresos: 0, coste: 0, stockActual: prod?.stockKg || 0, stockMinimo: prod?.minStockKg || 0, mermaKg: 0 };
        }
        prodMap[key].unidades += Number(it.quantity || 0);
        prodMap[key].ingresos += Number(it.subtotal || 0);
        const prod = products.find((p) => p._id === key);
        prodMap[key].coste += Number(it.quantity || 0) * Number(prod?.costPerKg || Number(it.pricePerUnit || 0) * 0.6);
      }
    }

    for (const w of waste.filter((w) => inRange(w.date, range.from, range.to))) {
      const key = w.productId || w.productName || 'unknown';
      if (prodMap[key]) prodMap[key].mermaKg += Number(w.wasteKg || 0);
    }

    const topProducts = Object.values(prodMap).map((p) => ({
      ...p,
      margen: Math.round((p.ingresos - p.coste) * 100) / 100,
      margenPct: p.ingresos > 0 ? Math.round(((p.ingresos - p.coste) / p.ingresos) * 1000) / 10 : 0,
      unidades: Math.round(p.unidades * 100) / 100,
      ingresos: Math.round(p.ingresos * 100) / 100,
      alertaStock: p.stockActual < p.stockMinimo && p.stockMinimo > 0,
      mermaKg: Math.round(p.mermaKg * 10) / 10,
    })).sort((a, b) => b.ingresos - a.ingresos).slice(0, maxItems);

    return res.json({ ok: true, products: topProducts, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/butcher-reports/:userId/evolucion ─────────────────────────────
export async function getButcherEvolucion(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to, granularity = 'day', storeId, workerId, category } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');
    const filters = { storeId, workerId, category };

    const { sales, waste, products, orders } = await loadButcherData(req, userId);
    const completed = sales.filter((s) => s.status === 'completed' && inRange(s.date, range.from, range.to) && filterDoc(s, filters));
    const curWaste = waste.filter((w) => inRange(w.date, range.from, range.to) && filterDoc(w, filters));
    const curOrders = orders.filter((o) => inRange(o.date || (o.createdAt || '').slice(0, 10), range.from, range.to));

    function toKey(dateStr) {
      if (granularity === 'month') return dateStr.slice(0, 7);
      if (granularity === 'week') {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff)).toISOString().slice(0, 10);
      }
      return dateStr;
    }

    const ventasMap = {};
    const mermaMap = {};
    const comprasMap = {};

    for (const s of completed) {
      const k = toKey(s.date);
      if (!ventasMap[k]) ventasMap[k] = { periodo: k, total: 0, tickets: 0, margen: 0 };
      ventasMap[k].total += Number(s.total || 0);
      ventasMap[k].tickets += 1;
      const cost = (s.items || []).reduce((c, it) => {
        const prod = products.find((p) => p._id === it.productId);
        return c + Number(it.quantity || 0) * Number(prod?.costPerKg || Number(it.pricePerUnit || 0) * 0.6);
      }, 0);
      ventasMap[k].margen += Number(s.total || 0) - cost;
    }

    for (const w of curWaste) {
      const k = toKey(w.date);
      if (!mermaMap[k]) mermaMap[k] = { periodo: k, kg: 0, coste: 0 };
      mermaMap[k].kg += Number(w.wasteKg || 0);
      const prod = products.find((p) => p._id === w.productId);
      mermaMap[k].coste += Number(w.wasteKg || 0) * Number(prod?.costPerKg || 10);
    }

    for (const o of curOrders) {
      const k = toKey(o.date || (o.createdAt || '').slice(0, 10));
      if (!comprasMap[k]) comprasMap[k] = { periodo: k, total: 0 };
      comprasMap[k].total += Number(o.total || 0);
    }

    const round2 = (arr) => arr.map((d) => {
      const out = { ...d };
      for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = Math.round(out[k] * 100) / 100;
      return out;
    });

    return res.json({
      ok: true,
      series: {
        ventas: round2(Object.values(ventasMap).sort((a, b) => a.periodo.localeCompare(b.periodo))),
        merma: round2(Object.values(mermaMap).sort((a, b) => a.periodo.localeCompare(b.periodo))),
        compras: round2(Object.values(comprasMap).sort((a, b) => a.periodo.localeCompare(b.periodo))),
      },
      range,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/butcher-reports/:userId/categorias ────────────────────────────
export async function getButcherCategorias(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to, storeId } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const { sales, waste, products } = await loadButcherData(req, userId);
    const completed = sales.filter((s) => s.status === 'completed' && inRange(s.date, range.from, range.to));

    const CATS = ['vacuno', 'cerdo', 'pollo', 'cordero', 'elaborados', 'otros'];
    const catMap = {};
    for (const cat of CATS) catMap[cat] = { categoria: cat, ventas: 0, coste: 0, mermaKg: 0, mermaCoste: 0, meses: {} };

    for (const s of completed) {
      for (const it of (s.items || [])) {
        const prod = products.find((p) => p._id === it.productId);
        const cat = prod?.category && CATS.includes(prod.category) ? prod.category : 'otros';
        const rev = Number(it.subtotal || 0);
        const cost = Number(it.quantity || 0) * Number(prod?.costPerKg || Number(it.pricePerUnit || 0) * 0.6);
        catMap[cat].ventas += rev;
        catMap[cat].coste += cost;
        const mk = s.date.slice(0, 7);
        if (!catMap[cat].meses[mk]) catMap[cat].meses[mk] = { ventas: 0 };
        catMap[cat].meses[mk].ventas += rev;
      }
    }

    for (const w of waste.filter((w) => inRange(w.date, range.from, range.to))) {
      const cat = w.category && CATS.includes(w.category) ? w.category : 'otros';
      catMap[cat].mermaKg += Number(w.wasteKg || 0);
      const prod = products.find((p) => p._id === w.productId);
      catMap[cat].mermaCoste += Number(w.wasteKg || 0) * Number(prod?.costPerKg || 10);
    }

    const totalVentas = Object.values(catMap).reduce((s, c) => s + c.ventas, 0);
    const categorias = Object.values(catMap).map((c) => ({
      categoria: c.categoria,
      ventas: Math.round(c.ventas * 100) / 100,
      margen: Math.round((c.ventas - c.coste) * 100) / 100,
      margenPct: c.ventas > 0 ? Math.round(((c.ventas - c.coste) / c.ventas) * 1000) / 10 : 0,
      pctDelTotal: totalVentas > 0 ? Math.round((c.ventas / totalVentas) * 1000) / 10 : 0,
      mermaKg: Math.round(c.mermaKg * 10) / 10,
      mermaCoste: Math.round(c.mermaCoste * 100) / 100,
      evolucion: Object.entries(c.meses).map(([mes, d]) => ({ mes, ventas: Math.round(d.ventas * 100) / 100 })).sort((a, b) => a.mes.localeCompare(b.mes)),
    })).sort((a, b) => b.ventas - a.ventas);

    return res.json({ ok: true, categorias, totalVentas: Math.round(totalVentas * 100) / 100, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/butcher-reports/:userId/tiendas ───────────────────────────────
export async function getButcherTiendas(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { from, to } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const { sales, waste, products, orders } = await loadButcherData(req, userId);
    const completed = sales.filter((s) => s.status === 'completed' && inRange(s.date, range.from, range.to));
    const clockins = await loadClockins(req, userId);

    const storeMap = {};

    function getStore(id) {
      const sid = id || 'default';
      if (!storeMap[sid]) storeMap[sid] = { id: sid, nombre: sid === 'default' ? 'Tienda Principal' : sid, ventas: 0, tickets: 0, coste: 0, mermaKg: 0, mermaCoste: 0, compras: 0, workers: new Set() };
      return storeMap[sid];
    }

    for (const s of completed) {
      const st = getStore(s.storeId || s.tiendaId);
      st.ventas += Number(s.total || 0);
      st.tickets += 1;
      st.coste += (s.items || []).reduce((c, it) => {
        const prod = products.find((p) => p._id === it.productId);
        return c + Number(it.quantity || 0) * Number(prod?.costPerKg || Number(it.pricePerUnit || 0) * 0.6);
      }, 0);
      if (s.soldBy) st.workers.add(s.soldBy);
    }

    for (const w of waste.filter((w) => inRange(w.date, range.from, range.to))) {
      const st = getStore(w.storeId || w.tiendaId);
      st.mermaKg += Number(w.wasteKg || 0);
      const prod = products.find((p) => p._id === w.productId);
      st.mermaCoste += Number(w.wasteKg || 0) * Number(prod?.costPerKg || 10);
    }

    for (const o of orders.filter((o) => inRange(o.date || (o.createdAt || '').slice(0, 10), range.from, range.to))) {
      const st = getStore(o.storeId || 'default');
      st.compras += Number(o.total || 0);
    }

    const tiendas = Object.values(storeMap).map((st) => ({
      id: st.id,
      nombre: st.nombre,
      ventas: Math.round(st.ventas * 100) / 100,
      tickets: st.tickets,
      ticketMedio: st.tickets > 0 ? Math.round(st.ventas / st.tickets * 100) / 100 : 0,
      margen: Math.round((st.ventas - st.coste) * 100) / 100,
      margenPct: st.ventas > 0 ? Math.round(((st.ventas - st.coste) / st.ventas) * 1000) / 10 : 0,
      mermaKg: Math.round(st.mermaKg * 10) / 10,
      mermaCoste: Math.round(st.mermaCoste * 100) / 100,
      compras: Math.round(st.compras * 100) / 100,
      beneficio: Math.round((st.ventas - st.coste - st.mermaCoste) * 100) / 100,
      empleados: st.workers.size,
      ventaPorEmpleado: st.workers.size > 0 ? Math.round(st.ventas / st.workers.size * 100) / 100 : 0,
    })).sort((a, b) => b.ventas - a.ventas);

    return res.json({ ok: true, tiendas, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}
