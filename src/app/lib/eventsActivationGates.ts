export type EventsSidebarLockFlags = {
  hasPricedService: boolean;
  hasClient: boolean;
  hasEvent: boolean;
};

/** Planificación operativa: tras la primera contratación. */
export const EVENTS_PLANNING_SIDEBAR_IDS = new Set([
  'events-pipeline',
  'events-venues',
  'events-vendors',
  'events-guests',
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
    if (!flags.hasClient) {
      return {
        disabled: true,
        title: 'Registra un cliente antes de abrir el asistente de contratación.',
      };
    }
  }

  if (itemId === 'events-pipeline' && !flags.hasEvent) {
    return {
      disabled: true,
      title: 'Crea tu primera contratación con el asistente para ver el pipeline.',
    };
  }

  if (EVENTS_PLANNING_SIDEBAR_IDS.has(itemId) && itemId !== 'events-pipeline' && !flags.hasEvent) {
    return {
      disabled: true,
      title: 'La planificación (invitados, catering, logística…) se habilita tras la primera contratación.',
    };
  }

  return { disabled: false };
}
