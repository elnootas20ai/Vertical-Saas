import { listFinanceMovements } from '../../../../lib/financeApi';
import { listDeliveryOrdersRequest, type DeliveryOrder } from '../../../../lib/deliveryApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  type InformeDashboard,
  euro,
  flattenDashboardRows,
  pctChange,
  previousRangeSameLength,
  resolveInformeDateRange,
  round2,
  yearAgoRange,
} from './informeTypes';
import { computePnLLines, filterMovementsByDate } from './financeInformeBuckets';

function isPaidOrder(o: DeliveryOrder) {
  if (o.status === 'cancelled') return false;
  const st = String(o.paymentStatus || '');
  return st === 'paid' || st === 'partial' || Boolean(o.paidAt) || o.paymentCollected === true;
}

export async function buildMargenInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(15, 'Calculando márgenes…');
  const { from, to } = resolveInformeDateRange(ctx);
  const centerId = ctx.filters?.centerId;
  const compare = ctx.filters?.comparePrevious !== false;
  const prev = previousRangeSameLength(from, to);
  const yoy = yearAgoRange(from, to);

  const [movements, orders, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listDeliveryOrdersRequest(ctx.userId).catch(() => [] as DeliveryOrder[]),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const cur = computePnLLines(filterMovementsByDate(movements, from, to, centerId));
  const prevLines = computePnLLines(filterMovementsByDate(movements, prev.from, prev.to, centerId));
  const yoyLines = computePnLLines(filterMovementsByDate(movements, yoy.from, yoy.to, centerId));

  // Margen por producto (solo si hay pedidos con items)
  const prodMap = new Map<string, { revenue: number; units: number; category: string }>();
  for (const o of orders) {
    if (!isPaidOrder(o)) continue;
    const d = String(o.paidAt || o.createdAt || '').slice(0, 10);
    if (d < from || d > to) continue;
    if (centerId && o.salesPointId !== centerId) continue;
    if (ctx.businessId && o.business_id && o.business_id !== ctx.businessId) continue;
    for (const it of o.items || []) {
      const name = String(it.name || 'Producto').trim() || 'Producto';
      const prevP = prodMap.get(name) || { revenue: 0, units: 0, category: String(it.category || 'Sin categoría') };
      prevP.revenue += Number(it.total || 0);
      prevP.units += Number(it.quantity || 0);
      prodMap.set(name, prevP);
    }
  }

  // Sin coste por producto en pedidos → margen producto no inventado; usamos % ingreso vs ticket medio solo informativo
  // Si no hay COGS asignable por producto, mostramos ingresos y marcamos margen n/d
  const productRows = [...prodMap.entries()]
    .map(([Producto, v]) => ({
      Producto,
      Categoria: v.category,
      Ingresos: round2(v.revenue),
      Unidades: round2(v.units),
      MargenPct: '', // sin coste unitario real
      Nota: 'Sin coste de producto en pedidos',
    }))
    .sort((a, b) => b.Ingresos - a.Ingresos)
    .slice(0, 25);

  // Insight: productos con mucha venta (top ingresos) — sin margen real no se puede detectar "poco margen"
  const alerts: InformeDashboard['alerts'] = [];
  if (productRows.length && cur.cogs <= 0 && cur.ingresos > 0) {
    alerts.push({
      id: 'no-cogs',
      severity: 'info',
      message: 'No hay COGS registrados en el periodo: el margen bruto coincide con los ingresos. Registra costes de ventas para un margen real.',
    });
  }

  // Objetivo: butcherTargetMarginPct no está en ctx; no inventamos. KPI sin objetivo si no hay dato.
  const dashboard: InformeDashboard = {
    kpis: [
      {
        id: 'bruto-eur',
        label: 'Margen bruto',
        value: `${euro(cur.margenBruto)} €`,
        deltaPct: compare ? pctChange(cur.margenBruto, prevLines.margenBruto) : undefined,
      },
      {
        id: 'bruto-pct',
        label: 'Margen bruto %',
        value: `${cur.margenBrutoPct} %`,
        deltaPct: compare ? pctChange(cur.margenBrutoPct, prevLines.margenBrutoPct) : undefined,
      },
      {
        id: 'neto-eur',
        label: 'Margen neto',
        value: `${euro(cur.resultadoNeto)} €`,
        deltaPct: compare ? pctChange(cur.resultadoNeto, prevLines.resultadoNeto) : undefined,
      },
      {
        id: 'neto-pct',
        label: 'Margen neto %',
        value: `${cur.margenNetoPct} %`,
        hint: `Año ant. ${yoyLines.margenNetoPct} %`,
      },
    ],
    chart: {
      type: 'composed',
      title: 'Margen % y margen por bloque',
      points: [
        { label: 'Bruto', margenPct: cur.margenBrutoPct, importe: cur.margenBruto },
        { label: 'EBITDA', margenPct: cur.ebitdaPct, importe: cur.ebitda },
        { label: 'Neto', margenPct: cur.margenNetoPct, importe: cur.resultadoNeto },
      ],
      series: [
        { key: 'importe', label: '€', color: '#22c55e' },
        { key: 'margenPct', label: '%', color: '#2563eb' },
      ],
    },
    tables: [
      {
        id: 'resumen',
        title: 'Resumen de margen',
        columns: [
          { key: 'Concepto', label: 'Concepto' },
          { key: 'Importe', label: 'Importe', align: 'right', format: 'money' },
          { key: 'Pct', label: '% s/ ingresos', align: 'right', format: 'pct' },
        ],
        rows: [
          { Concepto: 'Ingresos', Importe: cur.ingresos, Pct: 100 },
          { Concepto: 'COGS', Importe: cur.cogs, Pct: cur.ingresos > 0 ? round2((cur.cogs / cur.ingresos) * 100) : 0 },
          { Concepto: 'Margen bruto', Importe: cur.margenBruto, Pct: cur.margenBrutoPct },
          { Concepto: 'Opex', Importe: cur.opex, Pct: cur.ingresos > 0 ? round2((cur.opex / cur.ingresos) * 100) : 0 },
          { Concepto: 'EBITDA', Importe: cur.ebitda, Pct: cur.ebitdaPct },
          { Concepto: 'Resultado neto', Importe: cur.resultadoNeto, Pct: cur.margenNetoPct },
        ],
      },
      {
        id: 'opex',
        title: 'Gastos operativos por categoría',
        sortable: true,
        columns: [
          { key: 'categoria', label: 'Categoría' },
          { key: 'total', label: 'Total', align: 'right', format: 'money' },
        ],
        rows: cur.opexByCategory,
      },
      ...(productRows.length
        ? [{
            id: 'productos',
            title: 'Productos / servicios (ingresos; margen unitario n/d sin coste)',
            sortable: true,
            columns: [
              { key: 'Producto', label: 'Producto' },
              { key: 'Categoria', label: 'Categoría' },
              { key: 'Unidades', label: 'Uds.', align: 'right' as const, format: 'number' as const },
              { key: 'Ingresos', label: 'Ingresos', align: 'right' as const, format: 'money' as const },
              { key: 'Nota', label: 'Nota' },
            ],
            rows: productRows,
          }]
        : []),
    ],
    alerts,
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `Margen bruto ${euro(cur.margenBruto)} € (${cur.margenBrutoPct} %) · neto ${euro(cur.resultadoNeto)} € (${cur.margenNetoPct} %).`,
    reportTitle: 'Margen',
    dashboard,
  };
}
