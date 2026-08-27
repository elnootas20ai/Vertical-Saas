/**
 * Analytics de escandallo, food cost y mermas.
 * Contexto cacheado por usuario+periodo (~45s) para no re-escanear CouchDB en cada KPI.
 */
import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
  listDeliveryOrdersByUser,
} from './couchdb.js';
import { filterStockInventoryItems } from './stockInventoryScope.js';

const CACHE_TTL_MS = 20_000;
const ctxCache = new Map();

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function pct(part, total) {
  const t = Number(total || 0);
  if (!(t > 0)) return null;
  return round1((Number(part || 0) / t) * 100);
}

function pctChange(cur, prev) {
  const p = Number(prev || 0);
  if (p === 0) return cur > 0 ? 100 : 0;
  return round1(((Number(cur || 0) - p) / Math.abs(p)) * 100);
}

function parseRange(dateFrom, dateTo) {
  const now = new Date();
  const to = dateTo ? String(dateTo).slice(0, 10) : now.toISOString().slice(0, 10);
  const from = dateFrom
    ? String(dateFrom).slice(0, 10)
    : new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function prevRange(from, to) {
  const f = new Date(`${from}T12:00:00`);
  const t = new Date(`${to}T12:00:00`);
  const dur = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - dur);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

function inRange(iso, from, to) {
  const day = String(iso || '').slice(0, 10);
  return day >= from && day <= to;
}

function orderCountsForRevenue(order) {
  const st = String(order?.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'devuelto') return false;
  if (st === 'entregado') return true;
  if (order?.paymentStatus === 'paid' || order?.paymentCollected === true) return true;
  const paid = Number(order?.paidAmount || 0);
  const total = Number(order?.totalAmount || 0);
  return total > 0 && paid + 0.02 >= total;
}

function movementDay(m) {
  return String(m?.createdAt || m?.date || '').slice(0, 10);
}

function movementCost(m) {
  const q = Math.abs(Number(m?.quantity || 0));
  const unit = Number(m?.unitCost || 0);
  if (q <= 0) return 0;
  if (unit > 0) return q * unit;
  return q * Number(m?.totalCost || 0) / q;
}

function hasCostingRecipe(item) {
  const cf = item?.customFields || {};
  if (cf.costingType === 'fixed' && Number(cf.fixedCost || item?.costPrice || 0) > 0) return true;
  if (cf.costingType === 'recipe' && Array.isArray(cf.costingRecipe) && cf.costingRecipe.length > 0) {
    return true;
  }
  if (Array.isArray(cf.costingRecipe) && cf.costingRecipe.length > 0) return true;
  return false;
}

function cacheKey(userId, from, to, businessId) {
  return `${userId}|${from}|${to}|${businessId || ''}`;
}

function mondayKey(dayStr) {
  const d = new Date(`${dayStr}T12:00:00`);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(mondayStr) {
  const d = new Date(`${mondayStr}T12:00:00`);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function computePhase3(raw, ctx) {
  const { curOrders, curMovements, curWasteRecords, from, to } = raw;
  const prevFrom = ctx.prevRange?.from;
  const prevTo = ctx.prevRange?.to;

  const periodComparison = {
    rows: [
      {
        metric: 'Ventas',
        actual: ctx.sales,
        previous: ctx.prevSales,
        deltaPct: pctChange(ctx.sales, ctx.prevSales),
        unit: 'eur',
      },
      {
        metric: 'Food cost',
        actual: pct(ctx.recipeCost, ctx.sales),
        previous: pct(ctx.prevRecipeCost, ctx.prevSales),
        deltaPp: round1((pct(ctx.recipeCost, ctx.sales) || 0) - (pct(ctx.prevRecipeCost, ctx.prevSales) || 0)),
        unit: 'pct',
      },
      {
        metric: 'Merma / ventas',
        actual: pct(ctx.wasteCost, ctx.sales),
        previous: pct(ctx.prevWasteCost, ctx.prevSales),
        deltaPp: round1((pct(ctx.wasteCost, ctx.sales) || 0) - (pct(ctx.prevWasteCost, ctx.prevSales) || 0)),
        unit: 'pct',
      },
      {
        metric: 'Margen operativo',
        actual: ctx.operatingMargin,
        previous: round2(ctx.prevSales - ctx.prevRecipeCost - ctx.prevWasteCost),
        deltaPct: pctChange(ctx.operatingMargin, ctx.prevSales - ctx.prevRecipeCost - ctx.prevWasteCost),
        unit: 'eur',
      },
    ],
    kpis: [
      {
        id: 'cmp_sales',
        label: 'Ventas vs ant.',
        value: `${pctChange(ctx.sales, ctx.prevSales) >= 0 ? '+' : ''}${pctChange(ctx.sales, ctx.prevSales)} %`,
        tone: ctx.sales >= ctx.prevSales ? 'positive' : 'negative',
      },
      {
        id: 'cmp_fc',
        label: 'Food cost vs ant.',
        value: `${round1((pct(ctx.recipeCost, ctx.sales) || 0) - (pct(ctx.prevRecipeCost, ctx.prevSales) || 0))} pp`,
        tone: (pct(ctx.recipeCost, ctx.sales) || 0) <= (pct(ctx.prevRecipeCost, ctx.prevSales) || 0) ? 'positive' : 'negative',
      },
      {
        id: 'cmp_waste',
        label: 'Merma vs ant.',
        value: `${round1((pct(ctx.wasteCost, ctx.sales) || 0) - (pct(ctx.prevWasteCost, ctx.prevSales) || 0))} pp`,
        tone: (pct(ctx.wasteCost, ctx.sales) || 0) <= (pct(ctx.prevWasteCost, ctx.prevSales) || 0) ? 'positive' : 'negative',
      },
    ],
  };

  const buckets = new Map();
  const touchWeek = (dayStr) => {
    const mk = mondayKey(dayStr);
    if (!buckets.has(mk)) {
      buckets.set(mk, { label: weekLabel(mk), sales: 0, recipeCost: 0, wasteCost: 0 });
    }
    return buckets.get(mk);
  };

  for (const o of curOrders || []) {
    const day = String(o.createdAt || '').slice(0, 10);
    if (!inRange(day, from, to) || !orderCountsForRevenue(o)) continue;
    touchWeek(day).sales += Number(o.totalAmount || 0);
  }
  for (const m of curMovements || []) {
    const day = movementDay(m);
    if (!inRange(day, from, to)) continue;
    const b = touchWeek(day);
    if (m.movementType === 'recipe_consumption') b.recipeCost += movementCost(m);
    if (m.movementType === 'waste') b.wasteCost += movementCost(m);
  }
  for (const w of curWasteRecords || []) {
    const day = String(w.createdAt || '').slice(0, 10);
    if (!inRange(day, from, to)) continue;
    touchWeek(day).wasteCost += Number(w.estimatedCost || 0);
  }

  const weeklyEvolution = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([, v]) => ({
      label: v.label,
      sales: round2(v.sales),
      recipeCost: round2(v.recipeCost),
      wasteCost: round2(v.wasteCost),
      foodCostPct: pct(v.recipeCost, v.sales),
      marginOper: round2(v.sales - v.recipeCost - v.wasteCost),
    }));

  const pdvMap = new Map();
  let totalSales = 0;
  for (const o of curOrders || []) {
    if (!orderCountsForRevenue(o)) continue;
    const day = String(o.createdAt || '').slice(0, 10);
    if (!inRange(day, from, to)) continue;
    const id = String(o.salesPointId || o.pointOfSaleId || '_sin_pdv').trim() || '_sin_pdv';
    const name = String(o.salesPointName || o.salesPointId || 'Sin tienda').trim() || 'Sin tienda';
    const prev = pdvMap.get(id) || { pdvId: id, name, sales: 0, orders: 0 };
    prev.sales += Number(o.totalAmount || 0);
    prev.orders += 1;
    pdvMap.set(id, prev);
    totalSales += Number(o.totalAmount || 0);
  }

  const pdvPnl = [...pdvMap.values()]
    .map((row) => {
      const share = totalSales > 0 ? row.sales / totalSales : 0;
      const recipeCost = round2(ctx.recipeCost * share);
      const wasteCost = round2(ctx.wasteCost * share);
      const shrinkage = round2(ctx.inventoryShrinkage * share);
      const operatingMargin = round2(row.sales - recipeCost - wasteCost - shrinkage);
      return {
        ...row,
        sales: round2(row.sales),
        sharePct: round1(share * 100),
        recipeCost,
        wasteCost,
        shrinkage,
        foodCostPct: pct(recipeCost, row.sales),
        wasteOnSalesPct: pct(wasteCost, row.sales),
        operatingMargin,
        marginPct: pct(operatingMargin, row.sales),
      };
    })
    .sort((a, b) => b.sales - a.sales);

  const chart = {
    type: 'line',
    title: 'Evolución semanal (ventas, merma, margen)',
    points: weeklyEvolution.map((w) => ({
      label: w.label,
      ventas: w.sales,
      merma: w.wasteCost,
      margen: w.marginOper,
    })),
    series: [
      { key: 'ventas', label: 'Ventas €', color: '#22c55e' },
      { key: 'merma', label: 'Merma €', color: '#f59e0b' },
      { key: 'margen', label: 'Margen op. €', color: '#2563eb' },
    ],
  };

  const exportRows = [
    { Sección: 'COMPARATIVA PERIODO', Metrica: '', Actual: '', Anterior: '', Variacion: '' },
    ...periodComparison.rows.map((r) => ({
      Sección: 'Comparativa',
      Metrica: r.metric,
      Actual: r.unit === 'pct' ? `${r.actual ?? '—'} %` : `${r.actual} €`,
      Anterior: r.unit === 'pct' ? `${r.previous ?? '—'} %` : `${r.previous} €`,
      Variacion: r.deltaPp != null ? `${r.deltaPp} pp` : `${r.deltaPct ?? '—'} %`,
    })),
    { Sección: 'EVOLUCIÓN SEMANAL', Metrica: '', Actual: '', Anterior: '', Variacion: '' },
    ...weeklyEvolution.map((w) => ({
      Sección: 'Semana',
      Metrica: w.label,
      Actual: `${w.sales} € ventas`,
      Anterior: `${w.wasteCost} € merma`,
      Variacion: `${w.marginOper} € margen`,
    })),
    { Sección: 'POR TIENDA', Metrica: '', Actual: '', Anterior: '', Variacion: '' },
    ...pdvPnl.map((p) => ({
      Sección: 'Tienda',
      Metrica: p.name,
      Actual: `${p.sales} € ventas`,
      Anterior: `${p.foodCostPct ?? '—'} % FC`,
      Variacion: `${p.operatingMargin} € margen op.`,
    })),
  ];

  return { periodComparison, weeklyEvolution, pdvPnl, chart, exportRows };
}

function ensurePhase3(cacheEntry) {
  if (cacheEntry?.data?.phase3) return cacheEntry.data.phase3;
  if (!cacheEntry?.raw || !cacheEntry?.data) return null;
  cacheEntry.data.phase3 = computePhase3(cacheEntry.raw, cacheEntry.data);
  return cacheEntry.data.phase3;
}

async function buildContext(req, userId, { dateFrom, dateTo, businessId = '' } = {}) {
  const { from, to } = parseRange(dateFrom, dateTo);
  const key = cacheKey(userId, from, to, businessId);
  const hit = ctxCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }

  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const [docs, orders] = await Promise.all([
    getAllDocuments(req, db),
    listDeliveryOrdersByUser(req, userId).catch(() => []),
  ]);

  const biz = String(businessId || '').trim();
  const scopedOrders = (orders || []).filter((o) => {
    if (!biz) return true;
    const ob = String(o.business_id || o.businessId || '').replace(/^business:/, '').trim();
    return !ob || ob === biz;
  });

  const prev = prevRange(from, to);
  const curOrders = scopedOrders.filter((o) => inRange(o.createdAt, from, to) && orderCountsForRevenue(o));
  const prevOrders = scopedOrders.filter((o) => inRange(o.createdAt, prev.from, prev.to) && orderCountsForRevenue(o));

  const sales = curOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
  const prevSales = prevOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);

  const movements = docs.filter(
    (d) => d?.type === 'stock_movement' && d?.user_id === userId && !d?.deletedAt,
  );
  const curMovements = movements.filter((m) => inRange(movementDay(m), from, to));
  const prevMovements = movements.filter((m) => inRange(movementDay(m), prev.from, prev.to));

  const sumRecipeCost = (list) => list
    .filter((m) => m.movementType === 'recipe_consumption')
    .reduce((s, m) => s + movementCost(m), 0);

  const sumWasteCost = (list) => {
    let fromMovements = list
      .filter((m) => m.movementType === 'waste')
      .reduce((s, m) => s + movementCost(m), 0);
    if (fromMovements > 0) return fromMovements;
    return 0;
  };

  const wasteRecords = docs.filter(
    (d) => d?.type === 'waste_record' && d?.user_id === userId && !d?.deletedAt,
  );
  const curWasteRecords = wasteRecords.filter((w) => inRange(w.createdAt, from, to));
  const prevWasteRecords = wasteRecords.filter((w) => inRange(w.createdAt, prev.from, prev.to));

  const wasteFromRecords = (list) => list.reduce((s, w) => s + Number(w.estimatedCost || 0), 0);

  const recipeCost = sumRecipeCost(curMovements);
  const prevRecipeCost = sumRecipeCost(prevMovements);
  let wasteCost = sumWasteCost(curMovements);
  if (!(wasteCost > 0)) wasteCost = wasteFromRecords(curWasteRecords);
  let prevWasteCost = sumWasteCost(prevMovements);
  if (!(prevWasteCost > 0)) prevWasteCost = wasteFromRecords(prevWasteRecords);

  const purchases = curMovements
    .filter((m) => m.movementType === 'purchase_reception')
    .reduce((s, m) => s + movementCost(m), 0);

  const catalogItems = docs.filter(
    (d) => d?.type === 'catalog_item' && d?.user_id === userId && !d?.deletedAt,
  );
  const saleProducts = catalogItems.filter(
    (d) => d.module !== 'stock' && d.active !== false,
  );
  const withRecipe = saleProducts.filter(hasCostingRecipe).length;
  const recipes = docs.filter((d) => d?.type === 'recipe' && d?.user_id === userId && d?.active !== false);
  const recipeCoverage = saleProducts.length > 0
    ? Math.round((Math.max(withRecipe, recipes.length) / saleProducts.length) * 1000) / 10
    : 0;

  const stockCounts = docs
    .filter((d) => d?.type === 'stock_count' && d?.user_id === userId && d?.status === 'completed')
    .sort((a, b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')));
  const latestCount = stockCounts[0] || null;
  const inventoryVariance = latestCount && inRange(latestCount.completedAt || latestCount.updatedAt, from, to)
    ? Number(latestCount.totalDifferenceValue || 0)
    : (latestCount ? Number(latestCount.totalDifferenceValue || 0) : 0);
  const inventoryShrinkage = latestCount
    ? (latestCount.lines || [])
      .filter((l) => Number(l.differenceValue || 0) < 0)
      .reduce((s, l) => s + Math.abs(Number(l.differenceValue || 0)), 0)
    : 0;

  const wasteByType = {};
  for (const w of curWasteRecords) {
    const t = w.wasteType || 'other';
    wasteByType[t] = (wasteByType[t] || 0) + Number(w.estimatedCost || 0);
  }

  const wasteTopItems = Object.values(
    curWasteRecords.reduce((acc, w) => {
      const id = w.catalogItemId || w.catalogItemName || 'unknown';
      if (!acc[id]) {
        acc[id] = {
          catalogItemId: w.catalogItemId || '',
          name: w.catalogItemName || 'Artículo',
          totalCost: 0,
          totalQuantity: 0,
          count: 0,
        };
      }
      acc[id].totalCost += Number(w.estimatedCost || 0);
      acc[id].totalQuantity += Number(w.quantity || 0);
      acc[id].count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.totalCost - a.totalCost).slice(0, 15);

  const inventoryItems = filterStockInventoryItems(catalogItems);
  const escandalloRows = saleProducts.map((item) => {
    const salePrice = Number(item.unitPrice || item.price || 0);
    const unitCost = Number(item.costPrice || 0);
    const fc = pct(unitCost, salePrice);
    const margin = salePrice > 0 ? round1(((salePrice - unitCost) / salePrice) * 100) : null;
    return {
      catalogItemId: item._id,
      name: item.name || item._id,
      category: item.category || '',
      unitCost: round2(unitCost),
      salePrice: round2(salePrice),
      foodCostPct: fc,
      marginPct: margin,
      hasRecipe: hasCostingRecipe(item),
    };
  }).sort((a, b) => (b.foodCostPct || 0) - (a.foodCostPct || 0));

  const grossMargin = sales - recipeCost;
  const operatingMargin = grossMargin - wasteCost - inventoryShrinkage;

  const consumptionByIngredient = new Map();
  for (const m of curMovements) {
    if (m.movementType !== 'recipe_consumption') continue;
    const id = String(m.catalogItemId || '').trim();
    if (!id) continue;
    const prev = consumptionByIngredient.get(id) || { qty: 0, cost: 0, name: m.catalogItemName || '' };
    const q = Math.abs(Number(m.quantity || 0));
    prev.qty += q;
    prev.cost += movementCost(m);
    if (m.catalogItemName) prev.name = m.catalogItemName;
    consumptionByIngredient.set(id, prev);
  }

  const wasteQtyByIngredient = new Map();
  for (const w of curWasteRecords) {
    const id = String(w.catalogItemId || '').trim();
    if (!id) continue;
    const prev = wasteQtyByIngredient.get(id) || { qty: 0, cost: 0, name: w.catalogItemName || '' };
    prev.qty += Number(w.quantity || 0);
    prev.cost += Number(w.estimatedCost || 0);
    if (w.catalogItemName) prev.name = w.catalogItemName;
    wasteQtyByIngredient.set(id, prev);
  }

  const wasteByIngredient = [];
  const ingredientIds = new Set([...consumptionByIngredient.keys(), ...wasteQtyByIngredient.keys()]);
  for (const catalogItemId of ingredientIds) {
    const cons = consumptionByIngredient.get(catalogItemId) || { qty: 0, cost: 0, name: '' };
    const waste = wasteQtyByIngredient.get(catalogItemId) || { qty: 0, cost: 0, name: '' };
    const name = waste.name || cons.name || catalogItemId;
    const totalBase = cons.qty + waste.qty;
    wasteByIngredient.push({
      catalogItemId,
      name,
      consumptionQty: round2(cons.qty),
      consumptionCost: round2(cons.cost),
      wasteQty: round2(waste.qty),
      wasteCost: round2(waste.cost),
      wasteRatePct: totalBase > 0 ? round1((waste.qty / totalBase) * 100) : null,
    });
  }
  wasteByIngredient.sort((a, b) => b.wasteCost - a.wasteCost);

  const inventoryVarianceLines = (latestCount?.lines || [])
    .filter((l) => l.countedStock != null && l.differenceValue != null)
    .map((l) => ({
      catalogItemId: l.catalogItemId,
      name: l.catalogItemName || l.catalogItemId,
      theoretical: Number(l.theoreticalStock || 0),
      counted: Number(l.countedStock || 0),
      difference: Number(l.difference || 0),
      differencePct: l.differencePercent,
      differenceValue: round2(Number(l.differenceValue || 0)),
      unit: l.unit || 'ud',
    }))
    .sort((a, b) => Math.abs(b.differenceValue) - Math.abs(a.differenceValue))
    .slice(0, 25);

  const analyticsAlerts = [];
  const wastePctOnSales = pct(wasteCost, sales);
  if (wastePctOnSales != null && wastePctOnSales > 4) {
    analyticsAlerts.push({
      id: 'high_waste',
      severity: wastePctOnSales > 6 ? 'danger' : 'warning',
      message: `Merma ${wastePctOnSales} % sobre ventas (objetivo ≤ 4 %).`,
    });
  }
  if (recipeCoverage < 70 && saleProducts.length > 0) {
    analyticsAlerts.push({
      id: 'low_recipe_coverage',
      severity: 'warning',
      message: `Solo ${recipeCoverage} % del catálogo tiene escandallo.`,
    });
  }
  if (Math.abs(inventoryVariance) > 200 || inventoryShrinkage > 150) {
    analyticsAlerts.push({
      id: 'inventory_variance',
      severity: 'warning',
      message: `Variación inventario ${inventoryVariance.toLocaleString('es-ES')} € · shrinkage ${inventoryShrinkage.toLocaleString('es-ES')} €.`,
    });
  }
  const highFc = escandalloRows.filter((r) => (r.foodCostPct || 0) > 35).length;
  if (highFc > 0) {
    analyticsAlerts.push({
      id: 'high_food_cost_products',
      severity: 'info',
      message: `${highFc} producto(s) con food cost > 35 %.`,
    });
  }

  const data = {
    range: { from, to },
    prevRange: prev,
    sales: round2(sales),
    prevSales: round2(prevSales),
    recipeCost: round2(recipeCost),
    prevRecipeCost: round2(prevRecipeCost),
    wasteCost: round2(wasteCost),
    prevWasteCost: round2(prevWasteCost),
    purchases: round2(purchases),
    grossMargin: round2(grossMargin),
    operatingMargin: round2(operatingMargin),
    recipeCoverage,
    saleProductsTotal: saleProducts.length,
    withRecipeCount: withRecipe,
    inventoryVariance: round2(inventoryVariance),
    inventoryShrinkage: round2(inventoryShrinkage),
    latestCountAt: latestCount?.completedAt || latestCount?.updatedAt || null,
    wasteByType,
    wasteTopItems,
    wasteByIngredient,
    inventoryVarianceLines,
    analyticsAlerts,
    escandalloRows,
    inventoryItemsCount: inventoryItems.length,
  };

  ctxCache.set(key, {
    at: Date.now(),
    data,
    raw: { curOrders, curMovements, curWasteRecords, from, to },
  });
  if (ctxCache.size > 40) {
    const oldest = [...ctxCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) ctxCache.delete(oldest);
  }

  return data;
}

const WASTE_TYPE_LABELS = {
  expiry: 'Caducidad',
  breakage: 'Rotura',
  spoilage: 'Deterioro',
  theft: 'Robo',
  overproduction: 'Sobreproducción',
  preparation_error: 'Error preparación',
  spillage: 'Derrame',
  return_unusable: 'Devolución no usable',
  other: 'Otro',
};

export async function getStockAnalyticsKpi(req, userId, kpiId, opts = {}) {
  const ctx = opts._ctx || await buildContext(req, userId, opts);
  const vs = (cur, prev) => pctChange(cur, prev);

  switch (kpiId) {
    case 'food_cost_pct':
      return {
        id: kpiId,
        label: 'Food cost teórico',
        value: pct(ctx.recipeCost, ctx.sales),
        unit: 'pct',
        amount: ctx.recipeCost,
        vsPrevPeriod: vs(pct(ctx.recipeCost, ctx.sales), pct(ctx.prevRecipeCost, ctx.prevSales)),
        tone: toneFoodCost(pct(ctx.recipeCost, ctx.sales)),
        hint: 'Consumo por receta ÷ ventas cobradas',
      };
    case 'gross_margin':
      return {
        id: kpiId,
        label: 'Margen bruto teórico',
        value: ctx.grossMargin,
        unit: 'eur',
        pct: pct(ctx.grossMargin, ctx.sales),
        vsPrevPeriod: vs(ctx.grossMargin, ctx.prevSales - ctx.prevRecipeCost),
        tone: toneMargin(pct(ctx.grossMargin, ctx.sales)),
        hint: 'Ventas − coste recetas',
      };
    case 'waste_on_sales_pct':
      return {
        id: kpiId,
        label: 'Merma / ventas',
        value: pct(ctx.wasteCost, ctx.sales),
        unit: 'pct',
        amount: ctx.wasteCost,
        vsPrevPeriod: vs(pct(ctx.wasteCost, ctx.sales), pct(ctx.prevWasteCost, ctx.prevSales)),
        tone: toneWaste(pct(ctx.wasteCost, ctx.sales)),
        hint: 'Coste merma registrada ÷ ventas',
      };
    case 'inventory_variance':
      return {
        id: kpiId,
        label: 'Variación inventario',
        value: ctx.inventoryVariance,
        unit: 'eur',
        shrinkage: ctx.inventoryShrinkage,
        vsPrevPeriod: null,
        tone: toneVariance(ctx.inventoryVariance),
        hint: ctx.latestCountAt
          ? `Último conteo ${String(ctx.latestCountAt).slice(0, 10)}`
          : 'Sin conteo completado',
      };
    case 'recipe_coverage':
      return {
        id: kpiId,
        label: 'Catálogo con escandallo',
        value: ctx.recipeCoverage,
        unit: 'pct',
        count: ctx.withRecipeCount,
        total: ctx.saleProductsTotal,
        vsPrevPeriod: null,
        tone: ctx.recipeCoverage >= 90 ? 'ok' : ctx.recipeCoverage >= 70 ? 'warn' : 'bad',
        hint: `${ctx.withRecipeCount} de ${ctx.saleProductsTotal} productos`,
      };
    case 'operating_margin':
      return {
        id: kpiId,
        label: 'Margen operativo est.',
        value: ctx.operatingMargin,
        unit: 'eur',
        pct: pct(ctx.operatingMargin, ctx.sales),
        vsPrevPeriod: null,
        tone: toneMargin(pct(ctx.operatingMargin, ctx.sales)),
        hint: 'Ventas − recetas − merma − shrinkage inventario',
      };
    default:
      throw new Error(`KPI desconocido: ${kpiId}`);
  }
}

function toneFoodCost(v) {
  if (v == null) return 'neutral';
  if (v <= 30) return 'ok';
  if (v <= 35) return 'warn';
  return 'bad';
}

function toneWaste(v) {
  if (v == null) return 'neutral';
  if (v <= 2) return 'ok';
  if (v <= 4) return 'warn';
  return 'bad';
}

function toneMargin(v) {
  if (v == null) return 'neutral';
  if (v >= 65) return 'ok';
  if (v >= 55) return 'warn';
  return 'bad';
}

function toneVariance(v) {
  const abs = Math.abs(Number(v || 0));
  if (abs <= 50) return 'ok';
  if (abs <= 200) return 'warn';
  return 'bad';
}

export async function getStockAnalyticsBlock(req, userId, blockId, opts = {}) {
  const ctx = opts._ctx || await buildContext(req, userId, opts);

  switch (blockId) {
    case 'waste_overview':
      return {
        kpis: [
          {
            id: 'waste_cost',
            label: 'Coste merma',
            value: `${ctx.wasteCost.toLocaleString('es-ES')} €`,
            tone: toneWaste(pct(ctx.wasteCost, ctx.sales)) === 'bad' ? 'negative' : 'warning',
          },
          {
            id: 'waste_pct',
            label: '% sobre ventas',
            value: pct(ctx.wasteCost, ctx.sales) != null ? `${pct(ctx.wasteCost, ctx.sales)} %` : '—',
          },
          {
            id: 'waste_pct_purchases',
            label: '% sobre compras',
            value: pct(ctx.wasteCost, ctx.purchases) != null ? `${pct(ctx.wasteCost, ctx.purchases)} %` : '—',
          },
          {
            id: 'waste_records',
            label: 'Registros',
            value: String(ctx.wasteTopItems.reduce((s, i) => s + i.count, 0)),
          },
        ],
        summary: `Mermas ${ctx.range.from} → ${ctx.range.to}: ${ctx.wasteCost.toLocaleString('es-ES')} € (${pct(ctx.wasteCost, ctx.sales) ?? '—'} % ventas).`,
      };

    case 'waste_by_type': {
      const points = Object.entries(ctx.wasteByType)
        .map(([type, cost]) => ({
          label: WASTE_TYPE_LABELS[type] || type,
          cost: round2(cost),
          pct: pct(cost, ctx.wasteCost),
        }))
        .sort((a, b) => b.cost - a.cost);
      return {
        chart: {
          type: 'bar',
          title: 'Merma por motivo',
          points,
          series: [{ key: 'cost', label: 'Coste (€)', color: '#f59e0b' }],
        },
      };
    }

    case 'waste_top_items':
      return {
        table: {
          id: 'waste_top',
          title: 'Top ingredientes con merma',
          columns: [
            { key: 'name', label: 'Artículo', align: 'left', format: 'text' },
            { key: 'totalCost', label: 'Coste (€)', align: 'right', format: 'money' },
            { key: 'totalQuantity', label: 'Cantidad', align: 'right', format: 'number' },
            { key: 'count', label: 'Registros', align: 'right', format: 'number' },
          ],
          rows: ctx.wasteTopItems.map((r) => ({
            name: r.name,
            totalCost: round2(r.totalCost),
            totalQuantity: round2(r.totalQuantity),
            count: r.count,
          })),
        },
      };

    case 'escandallo_overview':
      return {
        kpis: [
          {
            id: 'fc_avg',
            label: 'Food cost medio',
            value: avgFoodCost(ctx.escandalloRows),
            tone: 'neutral',
          },
          {
            id: 'high_fc',
            label: 'Productos > 35 % FC',
            value: String(ctx.escandalloRows.filter((r) => (r.foodCostPct || 0) > 35).length),
            tone: 'warning',
          },
          {
            id: 'no_recipe',
            label: 'Sin escandallo',
            value: String(ctx.escandalloRows.filter((r) => !r.hasRecipe).length),
          },
          {
            id: 'coverage',
            label: 'Cobertura catálogo',
            value: `${ctx.recipeCoverage} %`,
          },
        ],
        summary: `Escandallo: ${ctx.withRecipeCount}/${ctx.saleProductsTotal} productos con coste definido.`,
      };

    case 'escandallo_products':
      return {
        table: {
          id: 'escandallo_table',
          title: 'Productos por food cost',
          columns: [
            { key: 'name', label: 'Producto', align: 'left', format: 'text' },
            { key: 'foodCostPct', label: 'Food cost %', align: 'right', format: 'pct' },
            { key: 'marginPct', label: 'Margen %', align: 'right', format: 'pct' },
            { key: 'unitCost', label: 'Coste (€)', align: 'right', format: 'money' },
            { key: 'salePrice', label: 'PVP (€)', align: 'right', format: 'money' },
          ],
          rows: ctx.escandalloRows.slice(0, 40).map((r) => ({
            name: r.name,
            foodCostPct: r.foodCostPct,
            marginPct: r.marginPct,
            unitCost: r.unitCost,
            salePrice: r.salePrice,
          })),
        },
      };

    case 'inventory_overview':
      return {
        kpis: [
          {
            id: 'var_eur',
            label: 'Variación (€)',
            value: `${ctx.inventoryVariance.toLocaleString('es-ES')} €`,
            tone: ctx.inventoryVariance < 0 ? 'negative' : 'positive',
          },
          {
            id: 'shrink',
            label: 'Shrinkage (€)',
            value: `${ctx.inventoryShrinkage.toLocaleString('es-ES')} €`,
            tone: 'warning',
          },
          {
            id: 'count_date',
            label: 'Último conteo',
            value: ctx.latestCountAt ? String(ctx.latestCountAt).slice(0, 10) : '—',
          },
        ],
      };

    case 'inventory_variance_table':
      return {
        table: {
          id: 'inventory_variance',
          title: 'Desviación por artículo (último conteo)',
          columns: [
            { key: 'name', label: 'Artículo', align: 'left', format: 'text' },
            { key: 'theoretical', label: 'Teórico', align: 'right', format: 'number' },
            { key: 'counted', label: 'Contado', align: 'right', format: 'number' },
            { key: 'difference', label: 'Dif.', align: 'right', format: 'number' },
            { key: 'differencePct', label: 'Dif. %', align: 'right', format: 'pct' },
            { key: 'differenceValue', label: 'Dif. €', align: 'right', format: 'money' },
          ],
          rows: ctx.inventoryVarianceLines,
        },
      };

    case 'waste_by_ingredient':
      return {
        table: {
          id: 'waste_ingredient_rate',
          title: 'Tasa merma por ingrediente',
          columns: [
            { key: 'name', label: 'Ingrediente', align: 'left', format: 'text' },
            { key: 'consumptionQty', label: 'Consumo', align: 'right', format: 'number' },
            { key: 'wasteQty', label: 'Merma', align: 'right', format: 'number' },
            { key: 'wasteRatePct', label: 'Tasa %', align: 'right', format: 'pct' },
            { key: 'wasteCost', label: 'Coste €', align: 'right', format: 'money' },
          ],
          rows: ctx.wasteByIngredient.slice(0, 30),
        },
      };

    case 'pnl_summary':
      return {
        kpis: [
          { id: 'sales', label: 'Ventas', value: `${ctx.sales.toLocaleString('es-ES')} €` },
          { id: 'recipe', label: '(−) Coste recetas', value: `−${ctx.recipeCost.toLocaleString('es-ES')} €`, tone: 'negative' },
          { id: 'waste', label: '(−) Merma', value: `−${ctx.wasteCost.toLocaleString('es-ES')} €`, tone: 'negative' },
          { id: 'shrink', label: '(−) Shrinkage inv.', value: `−${ctx.inventoryShrinkage.toLocaleString('es-ES')} €`, tone: 'negative' },
          { id: 'op', label: '(=) Margen operativo', value: `${ctx.operatingMargin.toLocaleString('es-ES')} €`, tone: 'positive' },
        ],
        summary: `Margen operativo estimado: ${ctx.operatingMargin.toLocaleString('es-ES')} € (${pct(ctx.operatingMargin, ctx.sales) ?? '—'} % sobre ventas).`,
      };

    case 'period_comparison': {
      const p3 = ctx.phase3 || null;
      if (!p3) return { kpis: [], summary: 'Sin comparativa.' };
      return {
        kpis: p3.periodComparison.kpis,
        table: {
          id: 'period_comparison',
          title: 'Comparativa vs periodo anterior',
          columns: [
            { key: 'metric', label: 'Métrica', align: 'left', format: 'text' },
            { key: 'actual', label: 'Actual', align: 'right', format: 'text' },
            { key: 'previous', label: 'Anterior', align: 'right', format: 'text' },
            { key: 'delta', label: 'Variación', align: 'right', format: 'text' },
          ],
          rows: p3.periodComparison.rows.map((r) => ({
            metric: r.metric,
            actual: r.unit === 'pct' ? (r.actual != null ? `${r.actual} %` : '—') : `${r.actual} €`,
            previous: r.unit === 'pct' ? (r.previous != null ? `${r.previous} %` : '—') : `${r.previous} €`,
            delta: r.deltaPp != null ? `${r.deltaPp} pp` : `${r.deltaPct ?? '—'} %`,
          })),
        },
        summary: `Periodo anterior ${ctx.prevRange?.from} → ${ctx.prevRange?.to}.`,
      };
    }

    case 'weekly_evolution': {
      const p3 = ctx.phase3 || null;
      if (!p3?.weeklyEvolution?.length) {
        return { chart: { type: 'line', title: 'Evolución semanal', points: [], series: [] } };
      }
      return { chart: p3.chart };
    }

    case 'pdv_pnl': {
      const p3 = ctx.phase3 || null;
      return {
        table: {
          id: 'pdv_pnl',
          title: 'Margen operativo por tienda (estimado)',
          columns: [
            { key: 'name', label: 'Tienda', align: 'left', format: 'text' },
            { key: 'sales', label: 'Ventas €', align: 'right', format: 'money' },
            { key: 'foodCostPct', label: 'FC %', align: 'right', format: 'pct' },
            { key: 'wasteOnSalesPct', label: 'Merma %', align: 'right', format: 'pct' },
            { key: 'operatingMargin', label: 'Margen op. €', align: 'right', format: 'money' },
            { key: 'marginPct', label: 'Margen %', align: 'right', format: 'pct' },
          ],
          rows: (p3?.pdvPnl || []).map((p) => ({
            name: p.name,
            sales: p.sales,
            foodCostPct: p.foodCostPct,
            wasteOnSalesPct: p.wasteOnSalesPct,
            operatingMargin: p.operatingMargin,
            marginPct: p.marginPct,
          })),
        },
        summary: 'Costes repartidos por peso de ventas en cada PDV.',
      };
    }

    default:
      throw new Error(`Bloque desconocido: ${blockId}`);
  }
}

function avgFoodCost(rows) {
  const vals = rows.map((r) => r.foodCostPct).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return '—';
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return `${round1(avg)} %`;
}

export const STOCK_ANALYTICS_KPI_IDS = [
  'food_cost_pct',
  'gross_margin',
  'waste_on_sales_pct',
  'inventory_variance',
  'recipe_coverage',
  'operating_margin',
];

export const STOCK_ANALYTICS_BLOCK_IDS = [
  'waste_overview',
  'waste_by_type',
  'waste_top_items',
  'waste_by_ingredient',
  'escandallo_overview',
  'escandallo_products',
  'inventory_overview',
  'inventory_variance_table',
  'period_comparison',
  'weekly_evolution',
  'pdv_pnl',
  'pnl_summary',
];

const REPORT_BLOCKS = {
  escandallo: ['escandallo_overview', 'escandallo_products', 'inventory_overview', 'inventory_variance_table'],
  reductores: ['waste_overview', 'waste_by_type', 'waste_top_items', 'waste_by_ingredient', 'pnl_summary'],
  gerencial: ['period_comparison', 'weekly_evolution', 'pdv_pnl', 'waste_by_ingredient', 'pnl_summary'],
};

async function attachPhase3(req, userId, opts, ctx) {
  const { from, to } = parseRange(opts.dateFrom, opts.dateTo);
  const key = cacheKey(userId, from, to, opts.businessId || '');
  const entry = ctxCache.get(key);
  if (entry) {
    const phase3 = ensurePhase3(entry);
    if (phase3) ctx.phase3 = phase3;
  }
  return ctx;
}

/** Una sola pasada por datos: todos los KPIs + alertas. */
export async function getStockAnalyticsOverview(req, userId, opts = {}) {
  const ctx = await buildContext(req, userId, opts);
  const enrichedOpts = { ...opts, _ctx: ctx };
  const kpis = [];
  for (const kpiId of STOCK_ANALYTICS_KPI_IDS) {
    kpis.push(await getStockAnalyticsKpi(req, userId, kpiId, enrichedOpts));
  }
  return {
    range: ctx.range,
    kpis,
    alerts: ctx.analyticsAlerts,
    generatedAt: new Date().toISOString(),
  };
}

/** Fase 3: evolución, comparativa y P&L por tienda (una petición, reutiliza caché). */
export async function getStockAnalyticsInsights(req, userId, opts = {}) {
  let ctx = await buildContext(req, userId, opts);
  ctx = await attachPhase3(req, userId, opts, ctx);
  const p3 = ctx.phase3;
  if (!p3) {
    return {
      range: ctx.range,
      prevRange: ctx.prevRange,
      periodComparison: { rows: [], kpis: [] },
      weeklyEvolution: [],
      pdvPnl: [],
      chart: { type: 'line', title: 'Evolución semanal', points: [], series: [] },
      exportRows: [],
      generatedAt: new Date().toISOString(),
    };
  }
  return {
    range: ctx.range,
    prevRange: ctx.prevRange,
    periodComparison: p3.periodComparison,
    weeklyEvolution: p3.weeklyEvolution,
    pdvPnl: p3.pdvPnl,
    chart: p3.chart,
    exportRows: p3.exportRows,
    generatedAt: new Date().toISOString(),
  };
}

/** Informe completo en una petición (sin bloques secuenciales). */
export async function getStockAnalyticsReport(req, userId, reportId, opts = {}) {
  const blockIds = REPORT_BLOCKS[reportId];
  if (!blockIds) throw new Error(`Informe desconocido: ${reportId}`);
  let ctx = await buildContext(req, userId, opts);
  if (reportId === 'gerencial') {
    ctx = await attachPhase3(req, userId, opts, ctx);
  }
  const enrichedOpts = { ...opts, _ctx: ctx };
  const dashboard = {
    kpis: [],
    tables: [],
    alerts: (ctx.analyticsAlerts || []).map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
    })),
  };
  const summaryParts = [];
  let chart;

  for (const blockId of blockIds) {
    const block = await getStockAnalyticsBlock(req, userId, blockId, enrichedOpts);
    if (block.kpis) dashboard.kpis.push(...block.kpis);
    if (block.summary) summaryParts.push(block.summary);
    if (block.chart) chart = block.chart;
    if (block.table) dashboard.tables.push(block.table);
  }
  if (chart) dashboard.chart = chart;

  return {
    reportId,
    range: ctx.range,
    prevRange: ctx.prevRange,
    summary: summaryParts.join(' ') || `Informe ${reportId}`,
    dashboard,
    exportRows: reportId === 'gerencial' && ctx.phase3?.exportRows ? ctx.phase3.exportRows : [],
  };
}
