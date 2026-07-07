import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

export type CleaningActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasService: boolean;
  hasPricedService: boolean;
  hasClient: boolean;
  hasTeamMember: boolean;
};

export const EMPTY_CLEANING_ACTIVATION_FLAGS: CleaningActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasService: false,
  hasPricedService: false,
  hasClient: false,
  hasTeamMember: false,
};

function applyCleaningStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: CleaningActivationFlags,
): DeliveryActivationStepDef[] {
  return steps.map((step) => {
    if (step.id === 'cleaning_services') {
      return { ...step, locked: false, unlockRoute: step.route };
    }
    if (step.id === 'cleaning_clients' && !flags.hasService) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Crea al menos un servicio antes de registrar clientes.',
        unlockRoute: '/saas/cleaning-services',
      };
    }
    if (step.id === 'cleaning_team' && !flags.hasClient) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Registra un cliente antes de invitar al equipo.',
        unlockRoute: '/saas/vertical/limpieza/clientes',
      };
    }
    if (step.id === 'cleaning_operate' && !flags.hasPricedService) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Añade un servicio con precio antes de la puesta en marcha.',
        unlockRoute: '/saas/cleaning-services',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const CLEANING_ACTIVATION_STEP_DEFS = (
  flags: CleaningActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'cleaning_services',
    number: 1,
    label: 'Servicios',
    description: 'Programa tu primer servicio de limpieza con tipo, duración y precio',
    route: '/saas/cleaning-services',
    icon: 'settings',
    subSteps: [
      { id: 'first_service', label: 'Primer servicio creado', completed: flags.hasService },
      { id: 'service_price', label: 'Precio del servicio', completed: flags.hasPricedService },
    ],
  },
  {
    id: 'cleaning_clients',
    number: 2,
    label: 'Clientes',
    description: 'Registra clientes y contactos para contratos y facturación',
    route: '/saas/vertical/limpieza/clientes',
    icon: 'users',
    subSteps: [
      { id: 'first_client', label: 'Primer cliente registrado', completed: flags.hasClient },
    ],
  },
  {
    id: 'cleaning_team',
    number: 3,
    label: 'Equipo',
    description: 'Invita operarios o administradores para asignar servicios',
    route: '/saas/equipo',
    icon: 'users',
    subSteps: [
      { id: 'team_member', label: 'Miembro del equipo invitado', completed: flags.hasTeamMember },
    ],
  },
  {
    id: 'cleaning_company',
    number: 4,
    label: 'Empresa',
    description: 'Ajustes → Empresa: revisa nombre, CIF, dirección y teléfono',
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
    id: 'cleaning_operate',
    number: 5,
    label: 'Listo para operar',
    description: 'Con servicios, clientes, equipo y datos fiscales ya puedes ejecutar trabajos',
    route: '/saas/cleaning-hub',
    icon: 'rocket',
    subSteps: [
      {
        id: 'ops_ready',
        label: 'Servicios, clientes y empresa listos',
        completed:
          flags.hasPricedService &&
          flags.hasClient &&
          flags.hasTeamMember &&
          flags.hasCompanyName &&
          flags.hasTaxData &&
          flags.hasAddress &&
          flags.hasPhone,
      },
    ],
  },
];

export function buildCleaningActivationStepDefs(
  flags: CleaningActivationFlags,
): DeliveryActivationStepDef[] {
  return applyCleaningStepLocks(CLEANING_ACTIVATION_STEP_DEFS(flags), flags);
}
