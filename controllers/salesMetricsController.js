import {
  getSalesDbName,
  ensureDatabase,
  couchRequest,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function fetchAllDocs(req, dbName) {
  const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
  if (!resp.ok) return [];
  const body = await resp.json().catch(() => ({ rows: [] }));
  return (body.rows || [])
    .map((row) => row.doc)
    .filter((d) => d && !String(d._id || '').startsWith('_design/'));
}

function toStartOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toWeekKey(d) {
  const start = toStartOfDay(d);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(start.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function toMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isCompletedSale(sale) {
  const stage = String(sale.stage || '').toLowerCase();
  return stage === 'sold' || stage === 'delivered';
}

function parseDateRange(from, to) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return null;
  return { from: toStartOfDay(fromDate), to: new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999) };
}

function computePreviousPeriod(from, to) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: toStartOfDay(prevFrom), to: prevTo };
}

function aggregatePeriod(sales) {
  return sales.reduce(
    (acc, s) => {
      acc.revenue += Number(s.totalPrice || 0);
      acc.cost += Number(s.purchasePrice || 0);
      acc.count += 1;
      return acc;
    },
    { revenue: 0, cost: 0, count: 0 },
  );
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export async function getSalesMetrics(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { from, to, granularity = 'day' } = req.query;

    const range = parseDateRange(from, to);
    if (!range) return badRequest(res, 'Rango de fechas inválido');

    const salesDb = getSalesDbName();
    await ensureDatabase(req, salesDb);
    const allDocs = await fetchAllDocs(req, salesDb);

    const userSales = allDocs.filter(
      (d) => d.type === 'sale' && !d.deletedAt && d.user_id === userId,
    );

    const completedInRange = userSales.filter((s) => {
      if (!isCompletedSale(s)) return false;
      const d = new Date(s.createdAt || s.updatedAt);
      return d >= range.from && d <= range.to;
    });

    const prevRange = computePreviousPeriod(range.from, range.to);
    const completedInPrev = userSales.filter((s) => {
      if (!isCompletedSale(s)) return false;
      const d = new Date(s.createdAt || s.updatedAt);
      return d >= prevRange.from && d <= prevRange.to;
    });

    // ── Summary ──
    const current = aggregatePeriod(completedInRange);
    current.margin = current.revenue - current.cost;
    current.avgTicket = current.count > 0 ? Math.round(current.revenue / current.count) : 0;

    const previous = aggregatePeriod(completedInPrev);
    previous.margin = previous.revenue - previous.cost;

    const comparison = {
      revenue: pctChange(current.revenue, previous.revenue),
      cost: pctChange(current.cost, previous.cost),
      margin: pctChange(current.margin, previous.margin),
      count: pctChange(current.count, previous.count),
    };

    // ── Time series ──
    const dailyMap = {};
    const weeklyMap = {};
    const monthlyMap = {};

    for (const s of completedInRange) {
      const d = new Date(s.createdAt || s.updatedAt);
      const dayKey = d.toISOString().slice(0, 10);
      const weekKey = toWeekKey(new Date(d));
      const monthKey = toMonthKey(d);

      if (!dailyMap[dayKey]) dailyMap[dayKey] = { date: dayKey, revenue: 0, cost: 0, margin: 0, count: 0 };
      dailyMap[dayKey].revenue += Number(s.totalPrice || 0);
      dailyMap[dayKey].cost += Number(s.purchasePrice || 0);
      dailyMap[dayKey].margin += Number(s.totalPrice || 0) - Number(s.purchasePrice || 0);
      dailyMap[dayKey].count += 1;

      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { week: weekKey, revenue: 0, cost: 0, margin: 0, count: 0 };
      weeklyMap[weekKey].revenue += Number(s.totalPrice || 0);
      weeklyMap[weekKey].cost += Number(s.purchasePrice || 0);
      weeklyMap[weekKey].margin += Number(s.totalPrice || 0) - Number(s.purchasePrice || 0);
      weeklyMap[weekKey].count += 1;

      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { month: monthKey, revenue: 0, cost: 0, margin: 0, count: 0 };
      monthlyMap[monthKey].revenue += Number(s.totalPrice || 0);
      monthlyMap[monthKey].cost += Number(s.purchasePrice || 0);
      monthlyMap[monthKey].margin += Number(s.totalPrice || 0) - Number(s.purchasePrice || 0);
      monthlyMap[monthKey].count += 1;
    }

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    const weekly = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // ── Top products (vehicles) ──
    const productMap = {};
    for (const s of completedInRange) {
      const name = s.vehicleName || 'Sin nombre';
      if (!productMap[name]) productMap[name] = { name, count: 0, revenue: 0 };
      productMap[name].count += 1;
      productMap[name].revenue += Number(s.totalPrice || 0);
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Stage distribution ──
    const stageMap = {};
    for (const s of userSales) {
      const st = s.stage || 'unknown';
      stageMap[st] = (stageMap[st] || 0) + 1;
    }

    // ── Trend (last 12 months) ──
    const trend = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = toMonthKey(d);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthSales = userSales.filter((s) => {
        if (!isCompletedSale(s)) return false;
        const sd = new Date(s.createdAt || s.updatedAt);
        return sd >= d && sd <= endOfMonth;
      });
      const agg = aggregatePeriod(monthSales);
      trend.push({ month: mk, revenue: agg.revenue, cost: agg.cost, margin: agg.revenue - agg.cost, count: agg.count });
    }

    return res.json({
      ok: true,
      metrics: {
        summary: {
          totalRevenue: current.revenue,
          totalCost: current.cost,
          totalMargin: current.margin,
          totalSales: current.count,
          avgTicket: current.avgTicket,
        },
        comparison: {
          current: { revenue: current.revenue, cost: current.cost, margin: current.margin, count: current.count },
          previous: { revenue: previous.revenue, cost: previous.cost, margin: previous.margin, count: previous.count },
          change: comparison,
        },
        daily,
        weekly,
        monthly,
        topProducts,
        stageDistribution: stageMap,
        trend,
      },
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error calculando métricas de ventas',
    });
  }
}
