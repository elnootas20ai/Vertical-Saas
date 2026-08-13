import {
  fetchDeliveryReportKpis,
  fetchDeliveryEvolucion,
} from '../../../../lib/deliveryReportsApi';
import { filterDeliveryOrdersRequest } from '../../../../lib/deliveryApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  round2,
  lastDaysRange,
  emptyResult,
} from './informeTypes';

const STATUS_FUNNEL = [
  'pendiente',
  'confirmado',
  'en_preparacion',
  'listo',
  'en_camino',
  'entregado',
] as const;

export async function loadNegocioInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('negocio-') && id !== 'resumen') return null;
  // resumen is live elsewhere; skip here
  if (id === 'resumen') return null;

  const { from, to } = lastDaysRange(30);
  ctx.onProgress?.(20, 'Cargando métricas de negocio…');

  if (id === 'negocio-ticket-medio') {
    const [kpis, evol] = await Promise.all([
      fetchDeliveryReportKpis(ctx.userId, { from, to }, ctx.signal),
      fetchDeliveryEvolucion(ctx.userId, { from, to, granularity: 'day' }, ctx.signal),
    ]);
    const series = evol.series || [];
    const rows = series.map((s: any) => ({
      Periodo: s.periodo || s.label || s.date,
      Ingresos: round2(s.ingresos || 0),
      Pedidos: s.entregados ?? s.pedidos ?? 0,
      TicketMedio: round2(s.ticketMedio ?? (s.entregados ? s.ingresos / s.entregados : 0)),
    }));
    const tm = kpis.kpis?.ventasPeriodo?.ticketMedio ?? 0;
    return {
      rows,
      summary: `Ticket medio periodo ${euro(tm)} € (${from} → ${to}).`,
    };
  }

  if (id === 'negocio-volumen') {
    const evol = await fetchDeliveryEvolucion(ctx.userId, { from, to, granularity: 'day' }, ctx.signal);
    const series = evol.series || [];
    const rows = series.map((s: any) => ({
      Periodo: s.periodo || s.label || s.date,
      Pedidos: s.pedidos ?? 0,
      Entregados: s.entregados ?? 0,
      Cancelados: s.cancelados ?? 0,
      Ingresos: round2(s.ingresos || 0),
    }));
    const total = rows.reduce((s, r) => s + Number(r.Entregados || r.Pedidos), 0);
    return {
      rows,
      summary: `Volumen de operaciones ${from} → ${to}. Entregados/pedidos ≈ ${total.toLocaleString('es-ES')}.`,
    };
  }

  if (id === 'negocio-embudo' || id === 'negocio-conversiones' || id === 'negocio-ciclo') {
    ctx.onProgress?.(40, 'Analizando pedidos…');
    const { orders } = await filterDeliveryOrdersRequest(ctx.userId, {
      dateFrom: from,
      dateTo: to,
      businessId: ctx.businessId,
      limit: 2000,
    });

    if (id === 'negocio-embudo') {
      const counts = new Map<string, number>();
      for (const o of orders) {
        const st = String(o.status || 'otro');
        counts.set(st, (counts.get(st) || 0) + 1);
      }
      const total = orders.length || 1;
      const rows = STATUS_FUNNEL.map((st) => ({
        Etapa: st,
        Pedidos: counts.get(st) || 0,
        Pct: round2(((counts.get(st) || 0) / total) * 100),
      }));
      // leftover statuses
      for (const [st, n] of counts) {
        if (!(STATUS_FUNNEL as readonly string[]).includes(st)) {
          rows.push({ Etapa: st, Pedidos: n, Pct: round2((n / total) * 100) });
        }
      }
      return {
        rows,
        summary: `Embudo por estado de pedido (${orders.length} pedidos, 30 días).`,
      };
    }

    if (id === 'negocio-conversiones') {
      const byChannel = new Map<string, { total: number; delivered: number }>();
      for (const o of orders) {
        const ch = String(o.channel || 'tpv');
        const prev = byChannel.get(ch) || { total: 0, delivered: 0 };
        prev.total += 1;
        if (o.status === 'entregado') prev.delivered += 1;
        byChannel.set(ch, prev);
      }
      const rows = [...byChannel.entries()].map(([Canal, v]) => ({
        Canal,
        Pedidos: v.total,
        Entregados: v.delivered,
        ConversionPct: v.total > 0 ? round2((v.delivered / v.total) * 100) : 0,
      })).sort((a, b) => b.ConversionPct - a.ConversionPct);
      return {
        rows,
        summary: 'Conversión = entregados / pedidos por canal (30 días).',
      };
    }

    // ciclo: tiempo medio created → entregado si hay timestamps
    const gaps: { Canal: string; Pedido: string; Minutos: number }[] = [];
    for (const o of orders) {
      if (o.status !== 'entregado' || !o.createdAt) continue;
      const end = (o as any).deliveredAt || o.updatedAt || o.createdAt;
      const mins = (new Date(end).getTime() - new Date(o.createdAt).getTime()) / 60000;
      if (!Number.isFinite(mins) || mins < 0 || mins > 24 * 60) continue;
      gaps.push({
        Canal: String(o.channel || ''),
        Pedido: o.orderNumber || o.id,
        Minutos: round2(mins),
      });
    }
    const avg = gaps.length ? gaps.reduce((s, g) => s + g.Minutos, 0) / gaps.length : 0;
    return {
      rows: gaps.slice(0, 500),
      summary: `Ciclo pedido→entrega: media ${avg.toFixed(1)} min · ${gaps.length} pedidos medidos.`,
    };
  }

  if (id === 'negocio-prevision') {
    const evol = await fetchDeliveryEvolucion(ctx.userId, { from, to, granularity: 'day' }, ctx.signal);
    const series = (evol.series || []).map((s: any) => ({
      date: s.periodo || s.date,
      ingresos: Number(s.ingresos || 0),
      pedidos: Number(s.entregados ?? s.pedidos ?? 0),
    }));
    if (series.length < 3) {
      return emptyResult('Hacen falta más días de historial para proyectar ventas.');
    }
    const last7 = series.slice(-7);
    const avgIng = last7.reduce((s, d) => s + d.ingresos, 0) / last7.length;
    const avgPed = last7.reduce((s, d) => s + d.pedidos, 0) / last7.length;
    const rows = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      return {
        Fecha: d.toISOString().slice(0, 10),
        IngresosPrevistos: round2(avgIng),
        PedidosPrevistos: round2(avgPed),
        Metodo: 'Media móvil 7 días',
      };
    });
    return {
      rows,
      summary: `Previsión 14 días (media móvil 7d): ~${euro(avgIng)} €/día · ~${avgPed.toFixed(1)} pedidos/día.`,
    };
  }

  // Canales insight as bonus if someone opens wrong id
  if (id === 'canales') return null;

  return null;
}
