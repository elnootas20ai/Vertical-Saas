/**
 * Tickets de producto del vertical Heladería (MVP → siguientes fases).
 * Visible en UI; no toca delivery ni core de otros verticales.
 */

export type HeladeriaTicketStatus = 'mvp' | 'next' | 'done';

export type HeladeriaTicket = {
  id: string;
  title: string;
  area: 'ops' | 'tpv' | 'caja' | 'encargos' | 'integraciones' | 'general';
  status: HeladeriaTicketStatus;
  note: string;
};

export const HELADERIA_TICKETS: HeladeriaTicket[] = [
  {
    id: 'HEL-001',
    title: 'Centro operativo en vivo',
    area: 'ops',
    status: 'mvp',
    note: 'Shell MVP listo. Siguiente: pedidos del día y alertas reales.',
  },
  {
    id: 'HEL-002',
    title: 'TPV Heladería independiente',
    area: 'tpv',
    status: 'mvp',
    note: 'Cobro local MVP. Siguiente: PDV, impresora y caja abierta.',
  },
  {
    id: 'HEL-003',
    title: 'Caja del día',
    area: 'caja',
    status: 'mvp',
    note: 'Resumen mock. Siguiente: aperturas/cierres y arqueo.',
  },
  {
    id: 'HEL-004',
    title: 'Encargos anticipados',
    area: 'encargos',
    status: 'mvp',
    note: 'Lista demo. Siguiente: alta, estados y aviso a mostrador.',
  },
  {
    id: 'HEL-005',
    title: 'Integraciones marketplace',
    area: 'integraciones',
    status: 'mvp',
    note: 'Canales listados. Siguiente: conexión Glovo/Uber/Just Eat/web.',
  },
  {
    id: 'HEL-006',
    title: 'No acoplar a Delivery',
    area: 'general',
    status: 'done',
    note: 'Módulo propio en verticals/heladeria. Delivery intacto.',
  },
];

export function ticketsForArea(area: HeladeriaTicket['area']): HeladeriaTicket[] {
  return HELADERIA_TICKETS.filter((t) => t.area === area || t.area === 'general');
}
