import {
  listDeliveryOrdersByUser,
  listScopedPointsOfSaleForUser,
} from '../services/couchdb.js';

const AGGREGATOR_COMMISSION_PCT = {
  glovo: 30,
  ubereats: 30,
  justeat: 25,
  flipdish: 20,
};

const CHANNEL_LABELS = {
  direct: 'Directo',
  phone: 'Teléfono',
  web: 'Web',
  app: 'App',
  tpv: 'TPV',
  glovo: 'Glovo',
  justeat: 'Just Eat',
  ubereats: 'Uber Eats',
  flipdish: 'Flipdish',
};

function bad(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

function parseRange(from, to) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
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

function orderDate(o) {
  return String(o.createdAt || '').slice(0, 10);
}

function inRangeDate(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

function pickPrimaryPdvId(pdvs) {
  const active = (pdvs || []).filter((p) => p && p.active !== false);
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const ta = String(a.createdAt || '');
    const tb = String(b.createdAt || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a._id || '').localeCompare(String(b._id || ''));
  });
  return sorted[0]._id || null;
}

function orderMatchesPdvScope(order, pdvId, primaryPdvId, pdvName) {
  const filterId = String(pdvId || '').trim();
  if (!filterId) return true;
  const oid = String(order.salesPointId || '').trim();
  if (!oid) {
    const primary = String(primaryPdvId || '').trim();
    if (primary && filterId === primary) return true;
    const orderStore = String(order.salesPointName || '').trim().toLowerCase();
    const pdvLabel = String(pdvName || '').trim().toLowerCase();
    if (orderStore && pdvLabel && orderStore === pdvLabel) return true;
    return false;
  }
  return oid === filterId;
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function loadScopedOrders(req, userId, filters) {
  const { salesPointId, channel } = filters;
  const orders = await listDeliveryOrdersByUser(req, userId);
  const pdvs = await listScopedPointsOfSaleForUser(req, userId).catch(() => []);
  const primaryPdvId = pickPrimaryPdvId(pdvs);
  const pdvDoc = salesPointId ? pdvs.find((p) => p._id === salesPointId) : null;
  const pdvName = pdvDoc?.name || '';

  return orders.filter((o) => {
    if (!orderMatchesPdvScope(o, salesPointId, primaryPdvId, pdvName)) return false;
    if (channel && o.channel !== channel) return false;
    return true;
  });
}

function filterByRange(orders, from, to) {
  return orders.filter((o) => inRangeDate(orderDate(o), from, to));
}

function deliveredOrders(orders) {
  return orders.filter((o) => o.status === 'entregado');
}

function sumRevenue(orders) {
  return orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
}

function timingMetrics(order) {
  const kitchen = minutesBetween(order.kitchenStartedAt, order.kitchenCompletedAt);
  const assemblyStart = order.assemblyStartedAt || order.createdAt;
  const assembly = minutesBetween(assemblyStart, order.assemblyCompletedAt);
  // Ida estimada (salida → vuelta / 2). Recogida no aplica.
  let delivery = null;
  if (String(order.deliveryType || '') !== 'recogida') {
    const roundTrip = minutesBetween(order.departedAt || order.assemblyCompletedAt, order.deliveredAt);
    if (roundTrip != null && roundTrip > 0) delivery = roundTrip / 2;
  }
  const total = minutesBetween(order.createdAt, order.deliveredAt);
  return { kitchen, assembly, delivery, total };
}

function avgMetric(orders, field) {
  const vals = orders.map((o) => timingMetrics(o)[field]).filter((v) => v != null);
  if (!vals.length) return 0;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function channelLabel(ch) {
  return CHANNEL_LABELS[ch] || ch || 'Directo';
}

function commissionPct(ch) {
  return AGGREGATOR_COMMISSION_PCT[ch] || 0;
}

// ─── GET /api/delivery-reports/:userId/kpis ─────────────────────────────────
export async function getDeliveryReportKpis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId, channel } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango de fechas inválido');
    const prev = prevRange(range.from, range.to);
    const filters = { salesPointId, channel };

    const all = await loadScopedOrders(req, userId, filters);
    const cur = filterByRange(all, range.from, range.to);
    const prevOrders = filterByRange(all, prev.from, prev.to);

    const curDelivered = deliveredOrders(cur);
    const prevDelivered = deliveredOrders(prevOrders);

    const revenue = sumRevenue(curDelivered);
    const prevRevenue = sumRevenue(prevDelivered);
    const tickets = curDelivered.length;
    const prevTickets = prevDelivered.length;

    const incidents = cur.filter((o) => o.status === 'incident').length;
    const cancelled = cur.filter((o) => o.status === 'cancelled').length;
    const prevIncidents = prevOrders.filter((o) => o.status === 'incident').length;
    const prevCancelled = prevOrders.filter((o) => o.status === 'cancelled').length;

    const today = new Date().toISOString().slice(0, 10);
    const todayDelivered = deliveredOrders(filterByRange(all, today, today));

    return res.json({
      ok: true,
      range,
      kpis: {
        ventasHoy: {
          total: round2(sumRevenue(todayDelivered)),
          pedidos: todayDelivered.length,
          ticketMedio: todayDelivered.length ? round2(sumRevenue(todayDelivered) / todayDelivered.length) : 0,
        },
        ventasPeriodo: {
          total: round2(revenue),
          pedidos: tickets,
          ticketMedio: tickets ? round2(revenue / tickets) : 0,
          vsPrevPeriod: pctChange(revenue, prevRevenue),
          pedidosVsPrev: pctChange(tickets, prevTickets),
        },
        tiemposMedios: {
          cocina: avgMetric(curDelivered, 'kitchen'),
          montaje: avgMetric(curDelivered, 'assembly'),
          reparto: avgMetric(curDelivered, 'delivery'),
          total: avgMetric(curDelivered, 'total'),
          cocinaVsPrev: round1(avgMetric(curDelivered, 'kitchen') - avgMetric(prevDelivered, 'kitchen')),
        },
        incidencias: {
          total: incidents + cancelled,
          incidentes: incidents,
          cancelados: cancelled,
          vsPrevPeriod: pctChange(incidents + cancelled, prevIncidents + prevCancelled),
        },
        pedidosActivos: cur.filter((o) => ['nuevo', 'cocina', 'listo', 'en_reparto', 'incident'].includes(o.status)).length,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error calculando KPIs delivery' });
  }
}

// ─── GET /api/delivery-reports/:userId/evolucion ────────────────────────────
export async function getDeliveryEvolucion(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId, channel, granularity = 'day' } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const all = await loadScopedOrders(req, userId, { salesPointId, channel });
    const orders = filterByRange(all, range.from, range.to);

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

    const map = {};
    for (const o of orders) {
      const k = toKey(orderDate(o));
      if (!map[k]) map[k] = { periodo: k, ingresos: 0, pedidos: 0, entregados: 0, incidencias: 0 };
      map[k].pedidos += 1;
      if (o.status === 'entregado') {
        map[k].entregados += 1;
        map[k].ingresos += Number(o.totalAmount || 0);
      }
      if (o.status === 'incident' || o.status === 'cancelled') map[k].incidencias += 1;
    }

    const series = Object.values(map)
      .map((d) => ({
        ...d,
        ingresos: round2(d.ingresos),
        ticketMedio: d.entregados ? round2(d.ingresos / d.entregados) : 0,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    return res.json({ ok: true, series, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/delivery-reports/:userId/canales ──────────────────────────────
export async function getDeliveryCanales(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const all = await loadScopedOrders(req, userId, { salesPointId });
    const orders = filterByRange(all, range.from, range.to);
    const delivered = deliveredOrders(orders);
    const totalRevenue = sumRevenue(delivered);

    const byChannel = {};
    for (const o of delivered) {
      const ch = o.channel || 'direct';
      if (!byChannel[ch]) {
        byChannel[ch] = { canal: ch, label: channelLabel(ch), pedidos: 0, ingresos: 0, comisionPct: commissionPct(ch) };
      }
      byChannel[ch].pedidos += 1;
      byChannel[ch].ingresos += Number(o.totalAmount || 0);
    }

    const canales = Object.values(byChannel).map((c) => {
      const comision = round2(c.ingresos * (c.comisionPct / 100));
      const margenNeto = round2(c.ingresos - comision);
      return {
        ...c,
        ingresos: round2(c.ingresos),
        pctVentas: totalRevenue > 0 ? round1((c.ingresos / totalRevenue) * 100) : 0,
        comision,
        margenNeto,
        margenPct: c.ingresos > 0 ? round1((margenNeto / c.ingresos) * 100) : 0,
        ticketMedio: c.pedidos ? round2(c.ingresos / c.pedidos) : 0,
      };
    }).sort((a, b) => b.ingresos - a.ingresos);

    const comisionesTotal = round2(canales.reduce((s, c) => s + c.comision, 0));
    const mejorMargen = canales.length
      ? canales.reduce((best, c) => (c.margenPct > best.margenPct ? c : best), canales[0])
      : null;

    return res.json({
      ok: true,
      range,
      resumen: {
        ingresosTotal: round2(totalRevenue),
        comisionesTotal,
        margenNetoTotal: round2(totalRevenue - comisionesTotal),
        canalTop: canales[0]?.label || null,
        canalMasRentable: mejorMargen?.label || null,
      },
      canales,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/delivery-reports/:userId/rendimiento ──────────────────────────
export async function getDeliveryRendimiento(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId, channel } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const all = await loadScopedOrders(req, userId, { salesPointId, channel });
    const delivered = deliveredOrders(filterByRange(all, range.from, range.to));

    const byChannel = {};
    const byHour = {};
    const driverMap = {};

    for (const o of delivered) {
      const t = timingMetrics(o);
      const ch = o.channel || 'direct';
      if (!byChannel[ch]) byChannel[ch] = { canal: ch, label: channelLabel(ch), count: 0, kitchen: 0, assembly: 0, delivery: 0, total: 0 };
      const bucket = byChannel[ch];
      bucket.count += 1;
      if (t.kitchen != null) bucket.kitchen += t.kitchen;
      if (t.assembly != null) bucket.assembly += t.assembly;
      if (t.delivery != null) bucket.delivery += t.delivery;
      if (t.total != null) bucket.total += t.total;

      const hour = (o.createdAt || '').slice(11, 13);
      if (hour) {
        if (!byHour[hour]) byHour[hour] = { hora: `${hour}:00`, pedidos: 0, totalMin: 0 };
        byHour[hour].pedidos += 1;
        if (t.total != null) byHour[hour].totalMin += t.total;
      }

      const driver = String(o.assignedDriver || o.driverId || '').trim();
      if (driver && t.delivery != null) {
        if (!driverMap[driver]) driverMap[driver] = { nombre: driver, repartos: 0, deliveryMin: 0 };
        driverMap[driver].repartos += 1;
        driverMap[driver].deliveryMin += t.delivery;
      }
    }

    const canales = Object.values(byChannel).map((c) => ({
      canal: c.canal,
      label: c.label,
      pedidos: c.count,
      cocinaMin: c.count ? round1(c.kitchen / c.count) : 0,
      montajeMin: c.count ? round1(c.assembly / c.count) : 0,
      repartoMin: c.count ? round1(c.delivery / c.count) : 0,
      totalMin: c.count ? round1(c.total / c.count) : 0,
    })).sort((a, b) => a.totalMin - b.totalMin);

    const franjas = Object.values(byHour).map((h) => ({
      ...h,
      tiempoMedio: h.pedidos ? round1(h.totalMin / h.pedidos) : 0,
    })).sort((a, b) => a.hora.localeCompare(b.hora));

    const repartidores = Object.values(driverMap).map((d) => ({
      nombre: d.nombre,
      repartos: d.repartos,
      tiempoMedio: d.repartos ? round1(d.deliveryMin / d.repartos) : 0,
    })).sort((a, b) => a.tiempoMedio - b.tiempoMedio);

    const detalle = delivered
      .slice(-50)
      .reverse()
      .map((o) => {
        const t = timingMetrics(o);
        return {
          id: o._id,
          orderNumber: o.orderNumber,
          fecha: o.createdAt,
          canal: channelLabel(o.channel),
          cocinaMin: t.kitchen != null ? round1(t.kitchen) : null,
          montajeMin: t.assembly != null ? round1(t.assembly) : null,
          repartoMin: t.delivery != null ? round1(t.delivery) : null,
          totalMin: t.total != null ? round1(t.total) : null,
          repartidor: o.assignedDriver || o.driverId || '',
        };
      });

    return res.json({
      ok: true,
      range,
      medias: {
        cocina: avgMetric(delivered, 'kitchen'),
        montaje: avgMetric(delivered, 'assembly'),
        reparto: avgMetric(delivered, 'delivery'),
        total: avgMetric(delivered, 'total'),
      },
      canales,
      franjas,
      repartidores,
      detalle,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/delivery-reports/:userId/incidencias ──────────────────────────
export async function getDeliveryIncidencias(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId, channel } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const all = await loadScopedOrders(req, userId, { salesPointId, channel });
    const orders = filterByRange(all, range.from, range.to);
    const problem = orders.filter((o) => o.status === 'incident' || o.status === 'cancelled');

    const byType = { incident: 0, cancelled: 0 };
    const byChannel = {};
    const byReason = {};

    for (const o of problem) {
      byType[o.status] = (byType[o.status] || 0) + 1;
      const ch = o.channel || 'direct';
      byChannel[ch] = (byChannel[ch] || 0) + 1;
      const reason = String(o.cancelReason || o.incidentType || o.status).trim() || 'Sin detalle';
      byReason[reason] = (byReason[reason] || 0) + 1;
    }

    const lista = problem
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, 100)
      .map((o) => ({
        id: o._id,
        orderNumber: o.orderNumber,
        fecha: o.createdAt,
        estado: o.status,
        canal: channelLabel(o.channel),
        cliente: o.customerName,
        importe: round2(o.totalAmount || 0),
        motivo: o.cancelReason || o.incidentNotes || o.incidentType || '',
      }));

    const entregados = deliveredOrders(orders).length;
    const tasaIncidencia = orders.length > 0 ? round1((problem.length / orders.length) * 100) : 0;

    return res.json({
      ok: true,
      range,
      resumen: {
        total: problem.length,
        incidentes: byType.incident || 0,
        cancelados: byType.cancelled || 0,
        tasaIncidenciaPct: tasaIncidencia,
        importePerdido: round2(problem.reduce((s, o) => s + Number(o.totalAmount || 0), 0)),
      },
      porCanal: Object.entries(byChannel).map(([canal, count]) => ({
        canal,
        label: channelLabel(canal),
        count,
      })).sort((a, b) => b.count - a.count),
      porMotivo: Object.entries(byReason).map(([motivo, count]) => ({ motivo, count }))
        .sort((a, b) => b.count - a.count),
      lista,
      entregados,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/delivery-reports/:userId/top-productos ────────────────────────
export async function getDeliveryTopProductos(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to, salesPointId, limit: lim } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');
    const maxItems = Number(lim) || 15;

    const all = await loadScopedOrders(req, userId, { salesPointId });
    const delivered = deliveredOrders(filterByRange(all, range.from, range.to));

    const prodMap = {};
    for (const o of delivered) {
      for (const it of (o.items || [])) {
        const key = it.catalogItemId || it.id || it.name || 'unknown';
        if (!prodMap[key]) {
          prodMap[key] = {
            id: key,
            nombre: it.name || key,
            categoria: it.category || '',
            unidades: 0,
            ingresos: 0,
          };
        }
        prodMap[key].unidades += Number(it.quantity || 0);
        prodMap[key].ingresos += Number(it.total || 0) || Number(it.unitPrice || 0) * Number(it.quantity || 0);
      }
    }

    const products = Object.values(prodMap)
      .map((p) => ({
        ...p,
        unidades: round1(p.unidades),
        ingresos: round2(p.ingresos),
      }))
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, maxItems);

    return res.json({ ok: true, products, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}

// ─── GET /api/delivery-reports/:userId/tiendas ──────────────────────────────
export async function getDeliveryTiendas(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a informes delivery' });
    }

    const { from, to } = req.query;
    const range = parseRange(from, to);
    if (!range) return bad(res, 'Rango inválido');

    const pdvs = await listScopedPointsOfSaleForUser(req, userId).catch(() => []);
    const primaryPdvId = pickPrimaryPdvId(pdvs);
    const all = await listDeliveryOrdersByUser(req, userId);
    const orders = filterByRange(all, range.from, range.to);

    const tiendas = pdvs.map((pdv) => {
      const scoped = orders.filter((o) =>
        orderMatchesPdvScope(o, pdv._id, primaryPdvId, pdv.name),
      );
      const delivered = deliveredOrders(scoped);
      const ingresos = sumRevenue(delivered);
      return {
        id: pdv._id,
        nombre: pdv.name || pdv.code || pdv._id,
        pedidos: scoped.length,
        entregados: delivered.length,
        ingresos: round2(ingresos),
        ticketMedio: delivered.length ? round2(ingresos / delivered.length) : 0,
        incidencias: scoped.filter((o) => o.status === 'incident' || o.status === 'cancelled').length,
      };
    }).sort((a, b) => b.ingresos - a.ingresos);

    return res.json({ ok: true, tiendas, range });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error' });
  }
}
