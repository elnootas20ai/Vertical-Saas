import { listFinanceMovements } from '../../../../lib/financeApi';
import { fetchDeliveryTiendas as fetchTiendasReport } from '../../../../lib/deliveryReportsApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import { computeCoreEbitdaForMonth } from '../../../../lib/ebitdaMetrics';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  flattenDashboardRows,
  resolveInformeDateRange,
  round2,
  unavailableResult,
} from './informeTypes';
import { filterMovementsByDate, computePnLLines } from './financeInformeBuckets';

export async function buildRentabilidadCentroInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(20, 'Cargando rentabilidad por centro…');
  const { from, to } = resolveInformeDateRange(ctx);
  const monthKey = from.slice(0, 7);

  const [movements, centers, tiendasRes] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
    fetchTiendasReport(ctx.userId, { from, to }).catch(() => ({ tiendas: [] as any[] })),
  ]);

  const centerList = centers.filter((c) => c._id || c.id);
  if (centerList.length <= 1) {
    return unavailableResult(
      'Rentabilidad por centro solo aplica con más de una sucursal. Ahora tienes una o ninguna.',
    );
  }

  // Build per-center from finance movements tagged with workCenter/POS
  const byCenter = new Map<string, { name: string; movimientos: typeof movements }>();
  for (const c of centerList) {
    const id = c._id || c.id;
    byCenter.set(id, { name: c.name, movimientos: [] });
  }
  for (const m of filterMovementsByDate(movements, from, to)) {
    const id = m.pointOfSaleId || m.workCenterId;
    if (!id || !byCenter.has(id)) continue;
    byCenter.get(id)!.movimientos.push(m);
  }

  const rows = [...byCenter.entries()].map(([id, v]) => {
    const lines = computePnLLines(v.movimientos);
    const snap = computeCoreEbitdaForMonth(v.movimientos, monthKey);
    // Enrich with tiendas report if matching name
    const t = (tiendasRes.tiendas || []).find(
      (x: any) => String(x.nombre || x.name || '').toLowerCase() === v.name.toLowerCase()
        || String(x.id || '') === id,
    );
    return {
      Centro: v.name,
      Ingresos: lines.ingresos || round2(Number(t?.ingresos || 0)),
      Gastos: round2(lines.cogs + lines.opex + lines.gastosFinancieros + lines.impuestos),
      Margen: lines.margenBruto,
      EBITDA: snap.ebitda || lines.ebitda,
      Pedidos: t?.pedidos ?? '',
    };
  }).filter((r) => r.Ingresos !== 0 || r.Gastos !== 0 || r.Pedidos !== '');

  if (!rows.length) {
    // Fallback: tiendas report only
    for (const t of tiendasRes.tiendas || []) {
      rows.push({
        Centro: t.nombre || t.name || t.id,
        Ingresos: round2(t.ingresos || 0),
        Gastos: '',
        Margen: '',
        EBITDA: '',
        Pedidos: t.pedidos ?? 0,
      } as any);
    }
  }

  if (rows.length <= 1) {
    return unavailableResult(
      'No hay datos desglosados por más de un centro en este periodo.',
    );
  }

  const avgEbitda = rows.reduce((s, r) => s + Number(r.EBITDA || 0), 0) / rows.length;
  const ranked = rows
    .map((r) => ({
      ...r,
      VsMediaPct: Number(r.EBITDA) && avgEbitda
        ? round2(((Number(r.EBITDA) - avgEbitda) / Math.abs(avgEbitda)) * 100)
        : '',
    }))
    .sort((a, b) => Number(b.EBITDA || b.Ingresos) - Number(a.EBITDA || a.Ingresos));

  const dashboard: InformeDashboard = {
    kpis: [
      { id: 'centros', label: 'Centros', value: String(ranked.length) },
      { id: 'ing', label: 'Ingresos totales', value: `${euro(ranked.reduce((s, r) => s + Number(r.Ingresos || 0), 0))} €` },
      { id: 'ebitda', label: 'EBITDA medio', value: `${euro(round2(avgEbitda))} €` },
      { id: 'top', label: 'Mejor centro', value: String(ranked[0]?.Centro || '—') },
    ],
    chart: {
      type: 'bar',
      title: 'Comparativa por centro',
      points: ranked.map((r) => ({
        label: String(r.Centro).slice(0, 12),
        ingresos: Number(r.Ingresos || 0),
        ebitda: Number(r.EBITDA || 0),
      })),
      series: [
        { key: 'ingresos', label: 'Ingresos', color: '#2563eb' },
        { key: 'ebitda', label: 'EBITDA', color: '#22c55e' },
      ],
    },
    tables: [
      {
        id: 'ranking',
        title: 'Ranking por centro',
        sortable: true,
        columns: [
          { key: 'Centro', label: 'Centro' },
          { key: 'Ingresos', label: 'Ingresos', align: 'right', format: 'money' },
          { key: 'Gastos', label: 'Gastos', align: 'right', format: 'money' },
          { key: 'Margen', label: 'Margen', align: 'right', format: 'money' },
          { key: 'EBITDA', label: 'EBITDA', align: 'right', format: 'money' },
          { key: 'VsMediaPct', label: '% vs media', align: 'right', format: 'pct' },
        ],
        rows: ranked,
      },
    ],
    alerts: [{
      id: 'heatmap',
      severity: 'info',
      message: 'Mapa de calor geográfico no disponible: los centros no tienen coordenadas en el sistema.',
    }],
    filterOptions: {
      centers: centerList.map((c) => ({ id: c._id || c.id, name: c.name })),
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `Rentabilidad por centro: ${ranked.length} sucursales · mejor ${ranked[0]?.Centro || '—'}.`,
    reportTitle: 'Rentabilidad por centro',
    dashboard,
  };
}
