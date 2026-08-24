import { listFinanceMovements } from '../../../../lib/financeApi';
import type { FinanceMovementRecord } from '../../../../lib/financeTypes';
import { listDeliveryOrdersRequest, type DeliveryOrder } from '../../../../lib/deliveryApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  type InformeDashboard,
  type InformeTable,
  dateInRange,
  euro,
  flattenDashboardRows,
  pctChange,
  previousRangeSameLength,
  resolveInformeDateRange,
  round2,
  yearAgoRange,
} from './informeTypes';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function labelPayMethod(raw: string) {
  const m = String(raw || '').toLowerCase().trim();
  if (!m) return 'Sin método';
  if (m === 'efectivo' || m === 'cash') return 'Efectivo';
  if (m === 'tarjeta' || m === 'card' || m === 'tpv') return 'Tarjeta';
  if (m === 'transferencia' || m === 'transfer' || m === 'bizum') return m === 'bizum' ? 'Bizum' : 'Transferencia';
  if (m.includes('financ')) return 'Financiado';
  if (m === 'online' || m === 'glovo' || m === 'ubereats' || m === 'justeat') return 'Online / app';
  if (m === 'mixto') return 'Mixto';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function matchCenter(m: FinanceMovementRecord, centerId?: string) {
  if (!centerId) return true;
  return (
    m.pointOfSaleId === centerId
    || m.workCenterId === centerId
  );
}

function orderInCenter(o: DeliveryOrder, centerId?: string) {
  if (!centerId) return true;
  return o.salesPointId === centerId;
}

function orderDateIso(o: DeliveryOrder) {
  return String(o.paidAt || o.deliveredAt || o.createdAt || '').slice(0, 10);
}

function isPaidOrder(o: DeliveryOrder) {
  if (o.status === 'cancelled') return false;
  const st = String(o.paymentStatus || '');
  return st === 'paid' || st === 'partial' || Boolean(o.paidAt) || o.paymentCollected === true;
}

function sumCobros(movements: FinanceMovementRecord[], from: string, to: string, centerId?: string) {
  return movements
    .filter((m) => m.type === 'cobro' && dateInRange(m.date, from, to) && matchCenter(m, centerId))
    .reduce((s, m) => s + Number(m.totalAmount || 0), 0);
}

function filterOrders(
  orders: DeliveryOrder[],
  from: string,
  to: string,
  opts: { centerId?: string; employee?: string; category?: string; businessId?: string },
) {
  return orders.filter((o) => {
    if (!isPaidOrder(o)) return false;
    if (opts.businessId && o.business_id && o.business_id !== opts.businessId) return false;
    const d = orderDateIso(o);
    if (!dateInRange(d, from, to)) return false;
    if (!orderInCenter(o, opts.centerId)) return false;
    if (opts.employee) {
      const emp = String(o.paymentCollectedBy || '').trim();
      if (emp !== opts.employee) return false;
    }
    if (opts.category) {
      const hit = (o.items || []).some((it) => String(it.category || 'Sin categoría') === opts.category);
      if (!hit) return false;
    }
    return true;
  });
}

export async function buildIngresosInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(12, 'Cargando ingresos…');
  const range = resolveInformeDateRange(ctx);
  const { from, to } = range;
  const centerId = ctx.filters?.centerId;
  const compare = ctx.filters?.comparePrevious !== false;
  const categoryFilter = ctx.filters?.category;
  const employeeFilter = ctx.filters?.employee;

  const [movements, orders, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listDeliveryOrdersRequest(ctx.userId).catch(() => [] as DeliveryOrder[]),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  ctx.onProgress?.(40, 'Calculando KPIs…');

  const prev = previousRangeSameLength(from, to);
  const yoy = yearAgoRange(from, to);

  const total = round2(sumCobros(movements, from, to, centerId));
  const totalPrev = round2(sumCobros(movements, prev.from, prev.to, centerId));
  const totalYoy = round2(sumCobros(movements, yoy.from, yoy.to, centerId));

  const periodOrders = filterOrders(orders, from, to, {
    centerId,
    employee: employeeFilter,
    category: categoryFilter,
    businessId: ctx.businessId,
  });

  const orderRevenue = round2(periodOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0));
  const ticketMedio = periodOrders.length
    ? round2(orderRevenue / periodOrders.length)
    : null;

  // Daily series + year-ago overlay
  const dayKeys: string[] = [];
  {
    const cur = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    while (cur <= end) {
      dayKeys.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }

  const byDay = new Map<string, number>();
  const byDayYoy = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'cobro' || !matchCenter(m, centerId)) continue;
    const d = String(m.date || '').slice(0, 10);
    if (dateInRange(d, from, to)) byDay.set(d, round2((byDay.get(d) || 0) + Number(m.totalAmount || 0)));
    if (dateInRange(d, yoy.from, yoy.to)) byDayYoy.set(d, round2((byDayYoy.get(d) || 0) + Number(m.totalAmount || 0)));
  }

  const chartPoints = dayKeys.map((d, i) => {
    const yoyDay = (() => {
      const dt = new Date(`${d}T12:00:00`);
      dt.setFullYear(dt.getFullYear() - 1);
      return dt.toISOString().slice(0, 10);
    })();
    const label = `${String(d.slice(8, 10))}/${d.slice(5, 7)}`;
    return {
      label,
      actual: byDay.get(d) || 0,
      yearAgo: byDayYoy.get(yoyDay) || 0,
      _i: i,
    };
  });

  ctx.onProgress?.(65, 'Desgloses…');

  // By finance category
  const catMap = new Map<string, { total: number; count: number }>();
  for (const m of movements) {
    if (m.type !== 'cobro' || !dateInRange(m.date, from, to) || !matchCenter(m, centerId)) continue;
    const k = m.category || 'Sin categoría';
    if (categoryFilter && k !== categoryFilter) continue;
    const prev = catMap.get(k) || { total: 0, count: 0 };
    prev.total += Number(m.totalAmount || 0);
    prev.count += 1;
    catMap.set(k, prev);
  }
  const catRows = [...catMap.entries()]
    .map(([Categoria, v]) => ({
      Categoria: Categoria,
      Total: round2(v.total),
      Movimientos: v.count,
      PctTotal: total > 0 ? round2((v.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.Total - a.Total);

  // Payment method — prefer order payments, fallback finance payMethod
  const payMap = new Map<string, number>();
  if (periodOrders.length) {
    for (const o of periodOrders) {
      if (o.payments?.length) {
        for (const p of o.payments) {
          const k = labelPayMethod(p.method);
          payMap.set(k, round2((payMap.get(k) || 0) + Number(p.amount || 0)));
        }
      } else {
        const k = labelPayMethod(o.paymentMethod);
        payMap.set(k, round2((payMap.get(k) || 0) + Number(o.totalAmount || 0)));
      }
    }
  } else {
    for (const m of movements) {
      if (m.type !== 'cobro' || !dateInRange(m.date, from, to) || !matchCenter(m, centerId)) continue;
      const k = labelPayMethod(m.payMethod);
      payMap.set(k, round2((payMap.get(k) || 0) + Number(m.totalAmount || 0)));
    }
  }
  const payRows = [...payMap.entries()]
    .map(([Metodo, Total]) => ({
      Metodo,
      Total,
      PctTotal: total > 0 ? round2((Total / total) * 100) : (orderRevenue > 0 ? round2((Total / orderRevenue) * 100) : 0),
    }))
    .sort((a, b) => b.Total - a.Total);

  // Hour / weekday from orders
  const hourMap = new Map<number, number>();
  const weekdayMap = new Map<number, number>();
  for (const o of periodOrders) {
    const ts = o.paidAt || o.createdAt;
    if (!ts) continue;
    const dt = new Date(ts);
    if (Number.isNaN(dt.getTime())) continue;
    const h = dt.getHours();
    const w = dt.getDay();
    hourMap.set(h, round2((hourMap.get(h) || 0) + Number(o.totalAmount || 0)));
    weekdayMap.set(w, round2((weekdayMap.get(w) || 0) + Number(o.totalAmount || 0)));
  }
  const hourRows = [...hourMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, Total]) => ({
      Franja: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`,
      Total,
    }));
  const weekdayRows = [1, 2, 3, 4, 5, 6, 0].map((w) => ({
    Dia: WEEKDAYS[w],
    Total: weekdayMap.get(w) || 0,
  }));

  // Top 10 products
  const prodMap = new Map<string, { units: number; total: number; category: string }>();
  for (const o of periodOrders) {
    for (const it of o.items || []) {
      const name = String(it.name || 'Producto').trim() || 'Producto';
      const cat = String(it.category || 'Sin categoría');
      if (categoryFilter && cat !== categoryFilter) continue;
      const prev = prodMap.get(name) || { units: 0, total: 0, category: cat };
      prev.units += Number(it.quantity || 0);
      prev.total += Number(it.total || 0);
      prodMap.set(name, prev);
    }
  }
  const topProducts = [...prodMap.entries()]
    .map(([Producto, v]) => ({
      Producto,
      Categoria: v.category,
      Unidades: round2(v.units),
      Ingresos: round2(v.total),
    }))
    .sort((a, b) => b.Ingresos - a.Ingresos)
    .slice(0, 10);

  const employees = [
    ...new Set(
      orders
        .map((o) => String(o.paymentCollectedBy || '').trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  const productCategories = [
    ...new Set(
      orders.flatMap((o) => (o.items || []).map((it) => String(it.category || 'Sin categoría'))),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  const financeCategories = [...catMap.keys()].sort((a, b) => a.localeCompare(b, 'es'));

  const tables: InformeTable[] = [
    {
      id: 'por-categoria',
      title: 'Por categoría (contable)',
      sortable: true,
      columns: [
        { key: 'Categoria', label: 'Categoría' },
        { key: 'Movimientos', label: 'Mov.', align: 'right', format: 'number' },
        { key: 'Total', label: 'Total', align: 'right', format: 'money' },
        { key: 'PctTotal', label: '% total', align: 'right', format: 'pct' },
      ],
      rows: catRows,
    },
    {
      id: 'por-pago',
      title: 'Por método de pago',
      sortable: true,
      columns: [
        { key: 'Metodo', label: 'Método' },
        { key: 'Total', label: 'Total', align: 'right', format: 'money' },
        { key: 'PctTotal', label: '% total', align: 'right', format: 'pct' },
      ],
      rows: payRows,
    },
  ];

  if (hourRows.length || weekdayRows.length) {
    tables.push({
      id: 'por-franja',
      title: 'Por franja horaria',
      sortable: true,
      columns: [
        { key: 'Franja', label: 'Franja' },
        { key: 'Total', label: 'Total', align: 'right', format: 'money' },
      ],
      rows: hourRows,
    });
    tables.push({
      id: 'por-dia',
      title: 'Por día de la semana',
      sortable: true,
      columns: [
        { key: 'Dia', label: 'Día' },
        { key: 'Total', label: 'Total', align: 'right', format: 'money' },
      ],
      rows: weekdayRows,
    });
  }

  if (topProducts.length) {
    tables.push({
      id: 'top-productos',
      title: 'Top 10 productos / servicios',
      sortable: true,
      columns: [
        { key: 'Producto', label: 'Producto' },
        { key: 'Categoria', label: 'Categoría' },
        { key: 'Unidades', label: 'Uds.', align: 'right', format: 'number' },
        { key: 'Ingresos', label: 'Ingresos', align: 'right', format: 'money' },
      ],
      rows: topProducts,
    });
  }

  const deltaPrev = compare ? pctChange(total, totalPrev) : undefined;
  const deltaYoy = pctChange(total, totalYoy);

  const dashboard: InformeDashboard = {
    kpis: [
      {
        id: 'total',
        label: 'Ingresos totales',
        value: `${euro(total)} €`,
        deltaPct: deltaPrev,
        tone: (deltaPrev ?? 0) >= 0 ? 'positive' : 'negative',
      },
      {
        id: 'vs-prev',
        label: 'vs periodo anterior',
        value: deltaPrev == null ? 'n/d' : `${deltaPrev > 0 ? '+' : ''}${deltaPrev.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`,
        hint: compare ? `${euro(totalPrev)} € en periodo ant.` : undefined,
      },
      {
        id: 'vs-yoy',
        label: 'vs mismo periodo año ant.',
        value: deltaYoy == null ? 'n/d' : `${deltaYoy > 0 ? '+' : ''}${deltaYoy.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`,
        hint: `${euro(totalYoy)} € hace un año`,
      },
      {
        id: 'ticket',
        label: 'Ticket medio',
        value: ticketMedio == null ? 'n/d' : `${euro(ticketMedio)} €`,
        hint: ticketMedio == null
          ? 'Sin pedidos cobrados en el periodo'
          : `${periodOrders.length} pedidos`,
      },
    ],
    chart: {
      type: 'line',
      title: 'Evolución diaria (con overlay año anterior)',
      points: chartPoints,
      series: [
        { key: 'actual', label: 'Periodo', color: '#2563eb' },
        { key: 'yearAgo', label: 'Año anterior', color: '#94a3b8' },
      ],
    },
    tables,
    filterOptions: {
      centers: centers.map((c: { _id?: string; id?: string; name?: string }) => ({
        id: String(c._id || c.id || ''),
        name: String(c.name || c._id || 'Centro'),
      })).filter((c) => c.id),
      categories: [...new Set([...financeCategories, ...productCategories])],
      employees,
    },
  };

  ctx.onProgress?.(95, 'Componiendo informe…');

  const summary =
    `Ingresos ${from.slice(8, 10)}/${from.slice(5, 7)}/${from.slice(0, 4)} → ${to.slice(8, 10)}/${to.slice(5, 7)}/${to.slice(0, 4)}: `
    + `${euro(total)} €`
    + (ticketMedio != null ? ` · ticket medio ${euro(ticketMedio)} €` : '');

  return {
    rows: flattenDashboardRows(dashboard),
    summary,
    reportTitle: 'Ingresos',
    dashboard,
  };
}
