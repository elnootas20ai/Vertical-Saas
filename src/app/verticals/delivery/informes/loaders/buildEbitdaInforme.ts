import { listFinanceMovements } from '../../../../lib/financeApi';
import { computeCoreEbitdaForMonth, computeEbitdaMonthly } from '../../../../lib/ebitdaMetrics';
import { getEbitdaSectorBenchmarkPct } from '../../../../lib/ebitdaSectorBenchmarks';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  flattenDashboardRows,
  informePeriodLabel,
  informePeriodRange,
  monthKeyNow,
  round2,
} from './informeTypes';

export async function buildEbitdaInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(30, 'Calculando EBITDA…');
  const year = ctx.period?.year ?? new Date().getFullYear();
  const periodLabel = ctx.period ? informePeriodLabel(ctx.period) : `año ${year}`;
  const monthKey = ctx.period ? informePeriodRange(ctx.period).monthKey : monthKeyNow();

  const [movements, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const monthly = computeEbitdaMonthly(movements, year);
  const snap = computeCoreEbitdaForMonth(movements, monthKey);
  const benchmark = getEbitdaSectorBenchmarkPct({
    businessType: ctx.businessType,
    verticalId: 'delivery',
  });

  const waterfallRows = [
    { Paso: 'Ingresos', Importe: round2(snap.income) },
    { Paso: '− COGS', Importe: round2(-snap.cogs) },
    { Paso: '− Opex', Importe: round2(-snap.opex) },
    { Paso: '= EBITDA', Importe: round2(snap.ebitda) },
  ];

  const monthRows = monthly.months.map((m) => ({
    Mes: m.label || m.month,
    Ingresos: round2(m.income),
    COGS: round2(m.cogs),
    Opex: round2(m.opex),
    EBITDA: round2(m.ebitda),
    MargenPct: round2(m.ebitdaMargin),
  }));

  const focus = ctx.period
    ? monthRows.filter((_, i) => i + 1 === ctx.period!.month)
    : monthRows;

  const dashboard = {
    kpis: [
      { id: 'ebitda', label: 'EBITDA', value: `${euro(snap.ebitda)} €` },
      { id: 'margen', label: 'EBITDA % ingresos', value: `${snap.ebitdaMargin.toFixed(1)} %` },
      {
        id: 'benchmark',
        label: 'Benchmark sector',
        value: benchmark != null ? `${benchmark} %` : 'n/d',
        hint: benchmark != null
          ? `Diferencia ${round2(snap.ebitdaMargin - benchmark)} pp`
          : undefined,
      },
      { id: 'ing', label: 'Ingresos del mes', value: `${euro(snap.income)} €` },
    ],
    chart: {
      type: 'line' as const,
      title: 'Evolución margen EBITDA %',
      points: monthly.months
        .filter((m) => m.income !== 0 || m.ebitda !== 0)
        .map((m) => ({
          label: m.label,
          margen: round2(m.ebitdaMargin),
          ...(benchmark != null ? { benchmark } : {}),
        })),
      series: [
        { key: 'margen', label: 'EBITDA %', color: '#2563eb' },
        ...(benchmark != null
          ? [{ key: 'benchmark', label: `Sector ${benchmark}%`, color: '#94a3b8' }]
          : []),
      ],
    },
    tables: [
      {
        id: 'mensual',
        title: ctx.period ? `Detalle · ${periodLabel}` : `Año ${year}`,
        sortable: true,
        columns: [
          { key: 'Mes', label: 'Mes' },
          { key: 'Ingresos', label: 'Ingresos', align: 'right' as const, format: 'money' as const },
          { key: 'COGS', label: 'COGS', align: 'right' as const, format: 'money' as const },
          { key: 'Opex', label: 'Opex', align: 'right' as const, format: 'money' as const },
          { key: 'EBITDA', label: 'EBITDA', align: 'right' as const, format: 'money' as const },
          { key: 'MargenPct', label: 'Margen %', align: 'right' as const, format: 'pct' as const },
        ],
        rows: focus.length ? focus : monthRows,
      },
      {
        id: 'waterfall',
        title: 'Puente Ingresos → EBITDA',
        columns: [
          { key: 'Paso', label: 'Paso' },
          { key: 'Importe', label: 'Importe', align: 'right' as const, format: 'money' as const },
        ],
        rows: waterfallRows,
      },
    ],
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `EBITDA · ${periodLabel}: ${euro(snap.ebitda)} € (${snap.ebitdaMargin.toFixed(1)} %)${benchmark != null ? ` · sector ${benchmark}%` : ''}.`,
    reportTitle: 'EBITDA',
    dashboard,
  };
}
