import { listFinanceMovements } from '../../../../lib/financeApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  type InformeDashboard,
  euro,
  flattenDashboardRows,
  informePeriodLabel,
  pctChange,
  previousRangeSameLength,
  resolveInformeDateRange,
  round2,
  yearAgoRange,
} from './informeTypes';
import {
  computePnLLines,
  filterMovementsByDate,
  pnlHierarchyRows,
} from './financeInformeBuckets';

function monthKeysFromJanTo(period: { year: number; month: number }) {
  const keys: string[] = [];
  for (let m = 1; m <= period.month; m += 1) {
    keys.push(`${period.year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

export async function buildCuentaResultadosInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(20, 'Componiendo cuenta de resultados…');
  const { from, to } = resolveInformeDateRange(ctx);
  const centerId = ctx.filters?.centerId;
  const prev = previousRangeSameLength(from, to);
  const yoy = yearAgoRange(from, to);

  const [movements, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const cur = computePnLLines(filterMovementsByDate(movements, from, to, centerId));
  const prevL = computePnLLines(filterMovementsByDate(movements, prev.from, prev.to, centerId));
  const yoyL = computePnLLines(filterMovementsByDate(movements, yoy.from, yoy.to, centerId));

  const hierarchy = pnlHierarchyRows(cur, { prev: prevL, yoy: yoyL });

  const dashboard: InformeDashboard = {
    kpis: [
      { id: 'ing', label: 'Ingresos', value: `${euro(cur.ingresos)} €`, deltaPct: pctChange(cur.ingresos, prevL.ingresos) },
      { id: 'bruto', label: 'Margen bruto', value: `${euro(cur.margenBruto)} €`, hint: `${cur.margenBrutoPct} %` },
      { id: 'ebitda', label: 'EBITDA', value: `${euro(cur.ebitda)} €`, hint: `${cur.ebitdaPct} %` },
      { id: 'neto', label: 'Resultado neto', value: `${euro(cur.resultadoNeto)} €`, deltaPct: pctChange(cur.resultadoNeto, prevL.resultadoNeto) },
    ],
    chart: {
      type: 'bar',
      title: 'Comparativa mes actual vs anterior vs año ant.',
      points: [
        { label: 'Ingresos', actual: cur.ingresos, anterior: prevL.ingresos, yoy: yoyL.ingresos },
        { label: 'COGS', actual: cur.cogs, anterior: prevL.cogs, yoy: yoyL.cogs },
        { label: 'Opex', actual: cur.opex, anterior: prevL.opex, yoy: yoyL.opex },
        { label: 'Neto', actual: cur.resultadoNeto, anterior: prevL.resultadoNeto, yoy: yoyL.resultadoNeto },
      ],
      series: [
        { key: 'actual', label: 'Actual', color: '#2563eb' },
        { key: 'anterior', label: 'Mes ant.', color: '#94a3b8' },
        { key: 'yoy', label: 'Año ant.', color: '#14b8a6' },
      ],
    },
    tables: [
      {
        id: 'pnl',
        title: 'Cuenta de resultados (jerárquica)',
        columns: [
          { key: 'Concepto', label: 'Partida' },
          { key: 'Actual', label: 'Mes actual', align: 'right', format: 'money' },
          { key: 'MesAnterior', label: 'Mes anterior', align: 'right', format: 'money' },
          { key: 'AnoAnterior', label: 'Mismo mes año ant.', align: 'right', format: 'money' },
          { key: 'VarPct', label: '% var.', align: 'right', format: 'pct' },
        ],
        rows: hierarchy,
      },
      {
        id: 'opex',
        title: 'Desglose gastos operativos',
        sortable: true,
        columns: [
          { key: 'categoria', label: 'Categoría' },
          { key: 'total', label: 'Total', align: 'right', format: 'money' },
        ],
        rows: cur.opexByCategory,
      },
    ],
    alerts: cur.amortizaciones === 0
      ? [{
          id: 'amort',
          severity: 'info',
          message: 'Amortizaciones = 0 €: no hay categoría de amortización en finanzas (no se inventa). EBIT = EBITDA.',
        }]
      : undefined,
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
    },
  };

  const label = ctx.period ? informePeriodLabel(ctx.period) : `${from} → ${to}`;
  return {
    rows: flattenDashboardRows(dashboard),
    summary: `P&L ${label}: ingresos ${euro(cur.ingresos)} € · EBITDA ${euro(cur.ebitda)} € · neto ${euro(cur.resultadoNeto)} €.`,
    reportTitle: 'Cuenta de resultados',
    dashboard,
  };
}

export async function buildResultadoYtdInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(20, 'Calculando resultado acumulado…');
  if (!ctx.period) {
    return {
      rows: [],
      summary: 'Selecciona un mes para el YTD.',
      unavailable: true,
      unavailableReason: 'Selecciona un mes para el resultado acumulado.',
    };
  }

  const centerId = ctx.filters?.centerId;
  const year = ctx.period.year;
  const endMonth = ctx.period.month;
  const from = `${year}-01-01`;
  const { to } = resolveInformeDateRange(ctx);
  const yoyFrom = `${year - 1}-01-01`;
  const yoyTo = `${year - 1}-${String(endMonth).padStart(2, '0')}-${String(new Date(year - 1, endMonth, 0).getDate()).padStart(2, '0')}`;

  const [movements, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const cur = computePnLLines(filterMovementsByDate(movements, from, to, centerId));
  const yoy = computePnLLines(filterMovementsByDate(movements, yoyFrom, yoyTo, centerId));
  const hierarchy = pnlHierarchyRows(cur, { yoy });

  // Race chart: cumulative net by month this year vs last year
  const keys = monthKeysFromJanTo(ctx.period);
  let runCur = 0;
  let runYoy = 0;
  const racePoints = keys.map((key, idx) => {
    const m = idx + 1;
    const lastDay = new Date(year, m, 0).getDate();
    const mf = `${key}-01`;
    const mt = `${key}-${String(lastDay).padStart(2, '0')}`;
    const yf = `${year - 1}-${String(m).padStart(2, '0')}-01`;
    const yt = `${year - 1}-${String(m).padStart(2, '0')}-${String(new Date(year - 1, m, 0).getDate()).padStart(2, '0')}`;
    const ml = computePnLLines(filterMovementsByDate(movements, mf, mt, centerId));
    const yl = computePnLLines(filterMovementsByDate(movements, yf, yt, centerId));
    runCur = round2(runCur + ml.resultadoNeto);
    runYoy = round2(runYoy + yl.resultadoNeto);
    return {
      label: key.slice(5),
      esteAno: runCur,
      anoAnterior: runYoy,
    };
  });

  // Projection: average monthly net * 12
  const monthsElapsed = endMonth;
  const avgMonthly = monthsElapsed > 0 ? cur.resultadoNeto / monthsElapsed : 0;
  const projection = round2(avgMonthly * 12);

  const dashboard: InformeDashboard = {
    kpis: [
      { id: 'ytd-neto', label: 'Resultado YTD', value: `${euro(cur.resultadoNeto)} €`, deltaPct: pctChange(cur.resultadoNeto, yoy.resultadoNeto) },
      { id: 'ytd-ing', label: 'Ingresos YTD', value: `${euro(cur.ingresos)} €` },
      { id: 'ytd-ebitda', label: 'EBITDA YTD', value: `${euro(cur.ebitda)} €` },
      {
        id: 'proy',
        label: 'Proyección cierre año',
        value: `${euro(projection)} €`,
        hint: `Al ritmo actual (${euro(round2(avgMonthly))} €/mes)`,
      },
    ],
    chart: {
      type: 'line',
      title: 'Carrera acumulada · este año vs anterior',
      points: racePoints,
      series: [
        { key: 'esteAno', label: String(year), color: '#2563eb' },
        { key: 'anoAnterior', label: String(year - 1), color: '#94a3b8' },
      ],
    },
    tables: [
      {
        id: 'pnl-ytd',
        title: `P&L acumulado enero → ${informePeriodLabel(ctx.period)}`,
        columns: [
          { key: 'Concepto', label: 'Partida' },
          { key: 'Actual', label: 'YTD', align: 'right', format: 'money' },
          { key: 'AnoAnterior', label: 'YTD año ant.', align: 'right', format: 'money' },
          { key: 'VarPct', label: '% var.', align: 'right', format: 'pct' },
        ],
        rows: hierarchy.map((r) => ({
          ...r,
          MesAnterior: undefined,
        })),
      },
    ],
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `YTD ${year} hasta ${informePeriodLabel(ctx.period)}: neto ${euro(cur.resultadoNeto)} € · proyección cierre ${euro(projection)} €.`,
    reportTitle: 'Resultado acumulado (YTD)',
    dashboard,
  };
}
