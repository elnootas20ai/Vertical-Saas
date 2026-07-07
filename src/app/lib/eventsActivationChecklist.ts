import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

/** Flags reales del vertical eventos (sin PDV, marca delivery ni TPV). */
export type EventsActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasService: boolean;
  hasPricedService: boolean;
  hasClient: boolean;
  hasEvent: boolean;
  hasTeamMember: boolean;
};

export const EMPTY_EVENTS_ACTIVATION_FLAGS: EventsActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasService: false,
  hasPricedService: false,
  hasClient: false,
  hasEvent: false,
  hasTeamMember: false,
};

function applyEventsStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: EventsActivationFlags,
): DeliveryActivationStepDef[] {
  return steps.map((step) => {
    if (step.id === 'events_company') {
      return { ...step, locked: false, unlockRoute: step.route };
    }
    if (step.id === 'events_services' && !flags.hasCompanyName) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Completa el nombre comercial en Empresa antes del catálogo.',
        unlockRoute: '/saas/settings/empresa',
      };
    }
    if (step.id === 'events_clients' && !flags.hasPricedService) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Añade al menos un servicio con precio antes de registrar clientes.',
        unlockRoute: '/saas/events-services',
      };
    }
    if (step.id === 'events_first_contract' && !flags.hasClient) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Registra un cliente antes de crear la primera contratación.',
        unlockRoute: '/saas/clients',
      };
    }
    if (step.id === 'events_operate' && !flags.hasEvent) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Crea tu primera contratación con el asistente.',
        unlockRoute: '/saas/vertical/eventos/nueva-contratacion',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const EVENTS_ACTIVATION_STEP_DEFS = (
  flags: EventsActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'events_company',
    number: 1,
    label: 'Empresa',
    description: 'Datos fiscales para presupuestos y contratos',
    route: '/saas/settings/empresa',
    icon: 'building',
    subSteps: [
      { id: 'company_name', label: 'Nombre comercial', completed: flags.hasCompanyName },
      { id: 'tax_data', label: 'CIF / NIF', completed: flags.hasTaxData },
      { id: 'address', label: 'Dirección', completed: flags.hasAddress },
      { id: 'contact', label: 'Teléfono de contacto', completed: flags.hasPhone },
    ],
  },
  {
    id: 'events_services',
    number: 2,
    label: 'Catálogo de servicios',
    description: 'DJ, catering, coordinación… con precio fijo, por persona u hora',
    route: '/saas/events-services',
    icon: 'package',
    subSteps: [
      { id: 'events_catalog_service', label: 'Primer servicio en catálogo', completed: flags.hasService },
      { id: 'events_catalog_price', label: 'Servicio con precio', completed: flags.hasPricedService },
    ],
  },
  {
    id: 'events_clients',
    number: 3,
    label: 'Clientes',
    description: 'Contactos a los que enviarás presupuestos y contratos',
    route: '/saas/clients',
    icon: 'users',
    subSteps: [
      { id: 'events_first_client', label: 'Primer cliente registrado', completed: flags.hasClient },
    ],
  },
  {
    id: 'events_first_contract',
    number: 4,
    label: 'Primera contratación',
    description: 'Asistente: evento, líneas de presupuesto y fase inicial',
    route: '/saas/vertical/eventos/nueva-contratacion',
    icon: 'settings',
    subSteps: [
      { id: 'events_first_event', label: 'Evento creado en pipeline', completed: flags.hasEvent },
    ],
  },
  {
    id: 'events_operate',
    number: 5,
    label: 'Listo para operar',
    description: 'Pipeline, planificación (invitados, catering, logística) y cierre',
    route: '/saas/vertical/eventos',
    icon: 'rocket',
    subSteps: [
      {
        id: 'events_ops_ready',
        label: 'Empresa, servicios, cliente y contratación listos',
        completed:
          flags.hasCompanyName &&
          flags.hasTaxData &&
          flags.hasAddress &&
          flags.hasPhone &&
          flags.hasPricedService &&
          flags.hasClient &&
          flags.hasEvent,
      },
    ],
  },
];

export function buildEventsActivationStepDefs(
  flags: EventsActivationFlags,
): DeliveryActivationStepDef[] {
  return applyEventsStepLocks(EVENTS_ACTIVATION_STEP_DEFS(flags), flags);
}
