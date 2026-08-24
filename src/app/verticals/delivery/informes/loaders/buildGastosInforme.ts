import { listFinanceMovements } from '../../../../lib/financeApi';
import type { FinanceMovementRecord } from '../../../../lib/financeTypes';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  type InformeDashboard,
  dateInRange,
  euro,
  flattenDashboardRows,
  pctChange,
  previousRangeSameLength,
  resolveInformeDateRange,
  round2,
} from './informeTypes';

function matchCenter(m: FinanceMovementRecord, centerId?: string) {
  if (!centerId) return true;
  return m.pointOfSaleId === centerId || m.workCenterId === centerId;
}

function sumByType(
  movements: FinanceMovementRecord[],
  type: 'cobro' | 'pago',
  from: string,
  to: string,
  centerId?: string,
  category?: string,
) {
  return movements
    .filter((m) => {
      if (m.type !== type) return false;
      if (!dateInRange(m.date, from, to)) return false;
      if (!matchCenter(m, centerId)) return false;
      if (category && (m.category || 'Sin categoría') !== category) return false;
      return true;
    })
    .reduce((s, m) => s + Number(m.totalAmount || 0), 0);
}

/** Heurística: categorías típicas fijas vs resto variable. Sin inventar si no hay etiqueta clara. */
function isLikelyFixedCategory(cat: string) {
  const c = cat.toLowerCase();
  return /alquiler|n[oó]mina|seguro|cuota|hipoteca|leasing|rent/i.test(c);
}

export async function buildGastosInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(12, 'Cargando gastos…');
  const { from, to } = resolveInformeDateRange(ctx);
  const centerId = ctx.filters?.centerId;
  const categoryFilter = ctx.filters?.category;
  const providerFilter = ctx.filters?.provider;
  const compare = ctx.filters?.comparePrevious !== false;

  const [movements, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const pagos = movements.filter((m) => {
    if (m.type !== 'pago') return false;
    if (!dateInRange(m.date, from, to)) return false;
    if (!matchCenter(m, centerId)) return false;
    if (categoryFilter && (m.category || 'Sin categoría') !== categoryFilter) return false;
    if (providerFilter) {
      const company = String(m.companyName || m.concept || '').trim();
      if (company !== providerFilter) return false;
    }
    return true;
  });

  const prev = previousRangeSameLength(from, to);
  const total = round2(pagos.reduce((s, m) => s + Number(m.totalAmount || 0), 0));
  const totalPrev = round2(sumByType(movements, 'pago', prev.from, prev.to, centerId, categoryFilter));
  const income = round2(sumByType(movements, 'cobro', from, to, centerId));
  const pctOverIncome = income > 0 ? round2((total / income) * 100) : null;
  const deltaPrev = compare ? pctChange(total, totalPrev) : undefined;

  // By category over time (monthly buckets inside range — usually one month)
  const catMap = new Map<string, number>();
  const providerMap = new Map<string, number>();
  let fixed = 0;
  let variable = 0;
  for (const m of pagos) {
    const cat = m.category || 'Sin categoría';
    catMap.set(cat, round2((catMap.get(cat) || 0) + Number(m.totalAmount || 0)));
    const prov = String(m.companyName || '').trim() || 'Sin proveedor';
    providerMap.set(prov, round2((providerMap.get(prov) || 0) + Number(m.totalAmount || 0)));
    if (isLikelyFixedCategory(cat)) fixed += Number(m.totalAmount || 0);
    else variable += Number(m.totalAmount || 0);
  }

  const catRows = [...catMap.entries()]
    .map(([Categoria, Total]) => ({
      Categoria,
      Total,
      PctTotal: total > 0 ? round2((Total / total) * 100) : 0,
      Tipo: isLikelyFixedCategory(Categoria) ? 'Fijo' : 'Variable',
    }))
    .sort((a, b) => b.Total - a.Total);

  const providerRows = [...providerMap.entries()]
    .map(([Proveedor, Total]) => ({
      Proveedor,
      Total,
      PctTotal: total > 0 ? round2((Total / total) * 100) : 0,
    }))
    .sort((a, b) => b.Total - a.Total)
    .slice(0, 15);

  // Anomaly alerts vs previous month by category
  const prevPagos = movements.filter((m) =>
    m.type === 'pago' && dateInRange(m.date, prev.from, prev.to) && matchCenter(m, centerId),
  );
  const prevCat = new Map<string, number>();
  for (const m of prevPagos) {
    const cat = m.category || 'Sin categoría';
    prevCat.set(cat, (prevCat.get(cat) || 0) + Number(m.totalAmount || 0));
  }
  const alerts = catRows
    .map((r) => {
      const p = prevCat.get(r.Categoria) || 0;
      const ch = pctChange(r.Total, p);
      if (ch != null && ch >= 40 && p > 0) {
        return {
          id: `anom-${r.Categoria}`,
          severity: 'warning' as const,
          message: `${r.Categoria}: +${ch.toLocaleString('es-ES', { maximumFractionDigits: 0 })} % vs periodo anterior (${euro(p)} € → ${euro(r.Total)} €)`,
        };
      }
      return null;
    })
    .filter(Boolean) as NonNullable<InformeDashboard['alerts']>;

  // Duplicate payments heuristic: same company + same amount + same day
  const seen = new Map<string, number>();
  for (const m of pagos) {
    const key = `${String(m.companyName || '').trim()}|${round2(Number(m.totalAmount || 0))}|${String(m.date).slice(0, 10)}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count >= 2) {
      const [company, amount, date] = key.split('|');
      alerts.push({
        id: `dup-${key}`,
        severity: 'danger',
        message: `Posible pago duplicado: ${company || 'sin proveedor'} · ${euro(Number(amount))} € · ${date} (${count} veces)`,
      });
    }
  }

  const dashboard: InformeDashboard = {
    kpis: [
      {
        id: 'total',
        label: 'Gasto total',
        value: `${euro(total)} €`,
        deltaPct: deltaPrev,
      },
      {
        id: 'pct-ingresos',
        label: '% sobre ingresos',
        value: pctOverIncome == null ? 'n/d' : `${pctOverIncome} %`,
        hint: income > 0 ? `Ingresos ${euro(income)} €` : 'Sin ingresos en el periodo',
      },
      {
        id: 'vs-prev',
        label: 'vs periodo anterior',
        value: deltaPrev == null ? 'n/d' : `${deltaPrev > 0 ? '+' : ''}${deltaPrev} %`,
        hint: `${euro(totalPrev)} € ant.`,
      },
      {
        id: 'fijos',
        label: 'Fijos / variables',
        value: `${euro(round2(fixed))} € / ${euro(round2(variable))} €`,
        hint: 'Clasificación por categoría (heurística)',
      },
    ],
    chart: {
      type: 'bar',
      title: 'Gastos por categoría',
      points: catRows.slice(0, 8).map((r) => ({
        label: r.Categoria.length > 14 ? `${r.Categoria.slice(0, 12)}…` : r.Categoria,
        total: r.Total,
      })),
      series: [{ key: 'total', label: 'Gasto', color: '#e11d48' }],
    },
    tables: [
      {
        id: 'categorias',
        title: 'Por categoría',
        sortable: true,
        columns: [
          { key: 'Categoria', label: 'Categoría' },
          { key: 'Tipo', label: 'Tipo' },
          { key: 'Total', label: 'Total', align: 'right', format: 'money' },
          { key: 'PctTotal', label: '%', align: 'right', format: 'pct' },
        ],
        rows: catRows,
      },
      {
        id: 'fijos-var',
        title: 'Fijos vs variables',
        columns: [
          { key: 'Tipo', label: 'Tipo' },
          { key: 'Total', label: 'Total', align: 'right', format: 'money' },
        ],
        rows: [
          { Tipo: 'Fijos', Total: round2(fixed) },
          { Tipo: 'Variables', Total: round2(variable) },
        ],
      },
      {
        id: 'proveedores',
        title: 'Top proveedores por volumen',
        sortable: true,
        columns: [
          { key: 'Proveedor', label: 'Proveedor' },
          { key: 'Total', label: 'Total', align: 'right', format: 'money' },
          { key: 'PctTotal', label: '%', align: 'right', format: 'pct' },
        ],
        rows: providerRows,
      },
    ],
    alerts,
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
      categories: [...catMap.keys()].sort((a, b) => a.localeCompare(b, 'es')),
      providers: [...providerMap.keys()].filter((p) => p !== 'Sin proveedor').sort((a, b) => a.localeCompare(b, 'es')),
    },
  };

  ctx.onProgress?.(95, 'Componiendo informe…');
  return {
    rows: flattenDashboardRows(dashboard),
    summary: `Gastos: ${euro(total)} €${pctOverIncome != null ? ` (${pctOverIncome} % ingresos)` : ''}.`,
    reportTitle: 'Gastos',
    dashboard,
  };
}
