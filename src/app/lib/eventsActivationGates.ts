export type EventsSidebarLockFlags = {
  hasPricedService: boolean;
  hasClient: boolean;
  hasEvent: boolean;
};

/** Planificación operativa: tras la primera contratación. Contrataciones siempre abierta. */
export const EVENTS_PLANNING_SIDEBAR_IDS = new Set([
  'events-venues',
  'events-vendors',
  'events-catering',
  'events-logistics',
]);

export function getEventsSidebarItemLock(
  itemId: string,
  flags: EventsSidebarLockFlags,
): { disabled: boolean; title?: string } {
  if (itemId === 'events-new-contract') {
    if (!flags.hasPricedService) {
      return {
        disabled: true,
        title: 'Añade al menos un servicio con precio en Servicios antes de crear contrataciones.',
      };
    }
    // Sin cliente: el asistente abre y empieza creando el cliente (no bloquear aquí).
  }

  if (EVENTS_PLANNING_SIDEBAR_IDS.has(itemId) && !flags.hasEvent) {
    return {
      disabled: true,
      title: 'La planificación (invitados, catering, logística…) se habilita tras la primera contratación.',
    };
  }

  return { disabled: false };
}
