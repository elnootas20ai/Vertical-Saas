import type { Client } from '../../../context/AppContext';
import type { DeliveryInformeId } from './deliveryInformesCatalog';

const ACTIVE_DAYS = 45;
const RISK_DAYS = 60;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86400000;
}

function clientName(c: Client) {
  return String(c.name || c.phone || c.id || 'Cliente');
}

function avgTicket(c: Client) {
  const orders = Number(c.stats?.totalOrders || 0);
  const spent = Number(c.stats?.totalSpent || 0);
  if (orders <= 0) return 0;
  return spent / orders;
}

export type ClientInformeBuild = {
  rows: Record<string, unknown>[];
  summary: string;
};

/** Genera filas CSV desde stats persistidas del CRM (sin liveStats / sin escanear pedidos). */
export function buildClientInformeFromStats(
  informeId: DeliveryInformeId,
  clients: Client[],
): ClientInformeBuild | null {
  const withOrders = clients.filter((c) => Number(c.stats?.totalOrders || 0) > 0);

  if (informeId === 'clientes-activos') {
    const rows = clients
      .filter((c) => {
        const d = daysSince(c.stats?.lastOrderDate);
        return d != null && d <= ACTIVE_DAYS;
      })
      .map((c) => ({
        Cliente: clientName(c),
        Telefono: c.phone || '',
        Pedidos: Number(c.stats?.totalOrders || 0),
        Gastado: Number(c.stats?.totalSpent || 0).toFixed(2),
        UltimoPedido: c.stats?.lastOrderDate
          ? new Date(c.stats.lastOrderDate).toLocaleDateString('es-ES')
          : '',
        DiasSinPedir: Math.round(daysSince(c.stats?.lastOrderDate) || 0),
      }));
    return {
      rows,
      summary: `Clientes con pedido en los últimos ${ACTIVE_DAYS} días.`,
    };
  }

  if (informeId === 'clientes-nuevos-vs-recurrentes') {
    const rows = clients.map((c) => {
      const orders = Number(c.stats?.totalOrders || 0);
      const kind = orders <= 1 ? 'Nuevo' : 'Recurrente';
      return {
        Cliente: clientName(c),
        Tipo: kind,
        Pedidos: orders,
        Gastado: Number(c.stats?.totalSpent || 0).toFixed(2),
        UltimoPedido: c.stats?.lastOrderDate
          ? new Date(c.stats.lastOrderDate).toLocaleDateString('es-ES')
          : '',
      };
    });
    const nuevos = rows.filter((r) => r.Tipo === 'Nuevo').length;
    const rec = rows.filter((r) => r.Tipo === 'Recurrente').length;
    return {
      rows,
      summary: `${nuevos.toLocaleString('es-ES')} nuevos · ${rec.toLocaleString('es-ES')} recurrentes (1+ pedido = recurrente).`,
    };
  }

  if (informeId === 'clientes-ingresos') {
    const rows = [...withOrders]
      .sort((a, b) => Number(b.stats?.totalSpent || 0) - Number(a.stats?.totalSpent || 0))
      .map((c, i) => ({
        Posicion: i + 1,
        Cliente: clientName(c),
        Ingresos: Number(c.stats?.totalSpent || 0).toFixed(2),
        Pedidos: Number(c.stats?.totalOrders || 0),
        TicketMedio: avgTicket(c).toFixed(2),
      }));
    const total = rows.reduce((s, r) => s + Number(r.Ingresos), 0);
    return {
      rows,
      summary: `Ingresos por cliente. Total ${total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €.`,
    };
  }

  if (informeId === 'clientes-frecuencia-compra' || informeId === 'clientes-frecuencia') {
    const rows = withOrders.map((c) => ({
      Cliente: clientName(c),
      Pedidos: Number(c.stats?.totalOrders || 0),
      FrecuenciaDias: Number(c.stats?.orderFrequencyDays || 0) || '',
      UltimoPedido: c.stats?.lastOrderDate
        ? new Date(c.stats.lastOrderDate).toLocaleDateString('es-ES')
        : '',
      DiasSinPedir: daysSince(c.stats?.lastOrderDate) != null
        ? Math.round(daysSince(c.stats?.lastOrderDate) as number)
        : '',
    }));
    return {
      rows,
      summary: 'Frecuencia de compra según stats del cliente (sin reescanear pedidos).',
    };
  }

  if (informeId === 'clientes-en-riesgo' || informeId === 'clientes-inactivos') {
    const rows = withOrders
      .filter((c) => {
        const d = daysSince(c.stats?.lastOrderDate);
        return d == null || d >= RISK_DAYS;
      })
      .map((c) => ({
        Cliente: clientName(c),
        Pedidos: Number(c.stats?.totalOrders || 0),
        Gastado: Number(c.stats?.totalSpent || 0).toFixed(2),
        UltimoPedido: c.stats?.lastOrderDate
          ? new Date(c.stats.lastOrderDate).toLocaleDateString('es-ES')
          : 'Sin fecha',
        DiasSinPedir: daysSince(c.stats?.lastOrderDate) != null
          ? Math.round(daysSince(c.stats?.lastOrderDate) as number)
          : '',
      }));
    return {
      rows,
      summary: `Clientes con ≥${RISK_DAYS} días sin pedir (o sin fecha de último pedido).`,
    };
  }

  if (informeId === 'clientes-ltv') {
    const rows = [...withOrders]
      .sort((a, b) => Number(b.stats?.totalSpent || 0) - Number(a.stats?.totalSpent || 0))
      .map((c, i) => ({
        Posicion: i + 1,
        Cliente: clientName(c),
        LTV: Number(c.stats?.totalSpent || 0).toFixed(2),
        Pedidos: Number(c.stats?.totalOrders || 0),
        TicketMedio: avgTicket(c).toFixed(2),
        UltimoPedido: c.stats?.lastOrderDate
          ? new Date(c.stats.lastOrderDate).toLocaleDateString('es-ES')
          : '',
      }));
    return {
      rows,
      summary: 'Valor del cliente (LTV) ≈ gasto acumulado registrado en CRM.',
    };
  }

  if (informeId === 'clientes-proporcion-ticket') {
    const tickets = withOrders.map(avgTicket).filter((n) => n > 0);
    const mediaNegocio = tickets.length
      ? tickets.reduce((a, b) => a + b, 0) / tickets.length
      : 0;
    const rows = [...withOrders]
      .map((c) => {
        const tm = avgTicket(c);
        const pct = mediaNegocio > 0 ? (tm / mediaNegocio) * 100 : 0;
        return {
          Cliente: clientName(c),
          TicketMedio: tm.toFixed(2),
          TicketMedioNegocio: mediaNegocio.toFixed(2),
          ProporcionPct: pct.toFixed(1),
          Pedidos: Number(c.stats?.totalOrders || 0),
        };
      })
      .sort((a, b) => Number(b.ProporcionPct) - Number(a.ProporcionPct));
    return {
      rows,
      summary: `Proporción del ticket medio vs media del negocio (${mediaNegocio.toFixed(2)} €).`,
    };
  }

  if (informeId === 'clientes-concentracion') {
    const sorted = [...withOrders].sort(
      (a, b) => Number(b.stats?.totalSpent || 0) - Number(a.stats?.totalSpent || 0),
    );
    const total = sorted.reduce((s, c) => s + Number(c.stats?.totalSpent || 0), 0) || 1;
    let acc = 0;
    const rows = sorted.map((c, i) => {
      const spent = Number(c.stats?.totalSpent || 0);
      acc += spent;
      return {
        Posicion: i + 1,
        Cliente: clientName(c),
        Ingresos: spent.toFixed(2),
        PctSobreTotal: ((spent / total) * 100).toFixed(2),
        PctAcumulado: ((acc / total) * 100).toFixed(2),
      };
    });
    const top5 = rows.slice(0, 5);
    const top5Pct = top5.reduce((s, r) => s + Number(r.PctSobreTotal), 0);
    return {
      rows,
      summary: `Concentración: top 5 ≈ ${top5Pct.toFixed(1)}% de la facturación de clientes con pedidos.`,
    };
  }

  // Evolución y productos top se generan en loadClientesInformes.
  return null;
}

export const CLIENT_STATS_INFORME_IDS = new Set<DeliveryInformeId>([
  'clientes-activos',
  'clientes-nuevos-vs-recurrentes',
  'clientes-ingresos',
  'clientes-frecuencia-compra',
  'clientes-en-riesgo',
  'clientes-ltv',
  'clientes-proporcion-ticket',
  'clientes-concentracion',
  'clientes-frecuencia',
  'clientes-inactivos',
]);
