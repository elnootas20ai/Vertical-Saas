import { fetchAllClientsForExport } from '../../../../lib/crmApi';
import { filterDeliveryOrdersRequest } from '../../../../lib/deliveryApi';
import { fetchDeliveryTopProductos as fetchTopProductos } from '../../../../lib/deliveryReportsApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  buildClientInformeFromStats,
  CLIENT_STATS_INFORME_IDS,
} from '../buildClientInformeFromStats';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  round2,
  lastDaysRange,
  emptyResult,
} from './informeTypes';

export async function loadClientesInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('clientes-')) return null;

  if (CLIENT_STATS_INFORME_IDS.has(id)) {
    ctx.onProgress?.(20, 'Cargando clientes (stats guardadas)…');
    const clients = await fetchAllClientsForExport(
      ctx.userId,
      (done, total) => {
        if (total > 0) ctx.onProgress?.(20 + Math.round((done / total) * 70), 'Clientes…');
      },
      ctx.businessId,
      { liveStats: false, businessType: 'delivery' },
    );
    const built = buildClientInformeFromStats(id, clients);
    if (!built) return emptyResult('No se pudo construir el informe de clientes.');
    return built;
  }

  if (id === 'clientes-productos-top') {
    ctx.onProgress?.(30, 'Cargando productos…');
    const { from, to } = lastDaysRange(30);
    const res = await fetchTopProductos(ctx.userId, { from, to, limit: 50 }, ctx.signal);
    const rows = (res.products || []).map((p: any, i: number) => ({
      Posicion: i + 1,
      Producto: p.nombre || p.name || '',
      Unidades: p.unidades ?? p.qty ?? '',
      Ingresos: round2(p.ingresos || p.revenue || 0),
    }));
    return {
      rows,
      summary: `Top productos (30 días): ${rows.length} líneas.`,
    };
  }

  if (id === 'clientes-evolucion-ticket') {
    ctx.onProgress?.(25, 'Analizando tickets por cliente…');
    const { from, to } = lastDaysRange(90);
    const { orders } = await filterDeliveryOrdersRequest(ctx.userId, {
      dateFrom: from,
      dateTo: to,
      businessId: ctx.businessId,
      limit: 3000,
    });
    const byClient = new Map<string, { name: string; tickets: number[]; dates: string[] }>();
    for (const o of orders) {
      if (!o.clientId || String(o.clientId).startsWith('tpv-')) continue;
      const amount = Number(o.totalAmount || 0);
      if (amount <= 0) continue;
      const prev = byClient.get(o.clientId) || {
        name: o.customerName || o.clientId,
        tickets: [] as number[],
        dates: [] as string[],
      };
      prev.tickets.push(amount);
      prev.dates.push(o.createdAt || '');
      byClient.set(o.clientId, prev);
    }
    const rows: Record<string, unknown>[] = [];
    for (const [, v] of byClient) {
      if (v.tickets.length < 2) continue;
      const first = v.tickets[0];
      const last = v.tickets[v.tickets.length - 1];
      const avg = v.tickets.reduce((a, b) => a + b, 0) / v.tickets.length;
      rows.push({
        Cliente: v.name,
        Pedidos: v.tickets.length,
        PrimerTicket: round2(first),
        UltimoTicket: round2(last),
        TicketMedio: round2(avg),
        VariacionPct: first > 0 ? round2(((last - first) / first) * 100) : 0,
        Tendencia: last > first * 1.05 ? 'Sube' : last < first * 0.95 ? 'Baja' : 'Estable',
      });
    }
    rows.sort((a, b) => Number(b.VariacionPct) - Number(a.VariacionPct));
    return {
      rows,
      summary: `Evolución de ticket vs sí mismo (90 días): ${rows.length} clientes con ≥2 pedidos. Total pedidos analizados ${orders.length}.`,
    };
  }

  return null;
}
