import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

export type WorkshopActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasClient: boolean;
  hasWorkOrder: boolean;
  hasPart: boolean;
  hasTeamMember: boolean;
};

export const EMPTY_WORKSHOP_ACTIVATION_FLAGS: WorkshopActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasClient: false,
  hasWorkOrder: false,
  hasPart: false,
  hasTeamMember: false,
};

function applyWorkshopStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: WorkshopActivationFlags,
): DeliveryActivationStepDef[] {
  return steps.map((step) => {
    if (step.id === 'workshop_company') {
      return { ...step, locked: false, unlockRoute: step.route };
    }
    if (step.id === 'workshop_clients' && !flags.hasCompanyName) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Completa los datos de empresa antes de registrar clientes.',
        unlockRoute: '/saas/settings/empresa',
      };
    }
    if (step.id === 'workshop_orders' && !flags.hasClient) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Registra un cliente antes de abrir la primera OT.',
        unlockRoute: '/saas/clientes',
      };
    }
    if (step.id === 'workshop_parts' && !flags.hasWorkOrder) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Abre al menos una orden de trabajo antes de gestionar recambios.',
        unlockRoute: '/saas/workshop',
      };
    }
    if (step.id === 'workshop_team' && !flags.hasPart) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Añade recambios al inventario antes de invitar al equipo.',
        unlockRoute: '/saas/parts',
      };
    }
    if (step.id === 'workshop_operate' && !flags.hasTeamMember) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Invita al menos un miembro del equipo antes de la puesta en marcha.',
        unlockRoute: '/saas/equipo',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const WORKSHOP_ACTIVATION_STEP_DEFS = (
  flags: WorkshopActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'workshop_company',
    number: 1,
    label: 'Empresa',
    description: 'Ajustes → Empresa: nombre, CIF, dirección y teléfono',
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
    id: 'workshop_clients',
    number: 2,
    label: 'Clientes',
    description: 'Registra clientes para vincular órdenes de trabajo',
    route: '/saas/clientes',
    icon: 'users',
    subSteps: [
      { id: 'first_client', label: 'Primer cliente registrado', completed: flags.hasClient },
    ],
  },
  {
    id: 'workshop_orders',
    number: 3,
    label: 'Órdenes de trabajo',
    description: 'Crea la primera OT con vehículo y servicio',
    route: '/saas/workshop',
    icon: 'settings',
    subSteps: [
      { id: 'first_order', label: 'Primera OT creada', completed: flags.hasWorkOrder },
    ],
  },
  {
    id: 'workshop_parts',
    number: 4,
    label: 'Recambios',
    description: 'Da de alta piezas y stock del taller',
    route: '/saas/parts',
    icon: 'settings',
    subSteps: [
      { id: 'first_part', label: 'Primer recambio registrado', completed: flags.hasPart },
    ],
  },
  {
    id: 'workshop_team',
    number: 5,
    label: 'Equipo',
    description: 'Invita mecánicos o administradores para asignar OTs',
    route: '/saas/equipo',
    icon: 'users',
    subSteps: [
      { id: 'team_member', label: 'Miembro del equipo invitado', completed: flags.hasTeamMember },
    ],
  },
  {
    id: 'workshop_operate',
    number: 6,
    label: 'Listo para operar',
    description: 'Con clientes, OTs, recambios y equipo ya puedes operar el taller',
    route: '/saas/workshop',
    icon: 'rocket',
    subSteps: [
      {
        id: 'ops_ready',
        label: 'Empresa, OTs, recambios y equipo listos',
        completed:
          flags.hasCompanyName &&
          flags.hasTaxData &&
          flags.hasAddress &&
          flags.hasPhone &&
          flags.hasClient &&
          flags.hasWorkOrder &&
          flags.hasPart &&
          flags.hasTeamMember,
      },
    ],
  },
];

export function buildWorkshopActivationStepDefs(
  flags: WorkshopActivationFlags,
): DeliveryActivationStepDef[] {
  return applyWorkshopStepLocks(WORKSHOP_ACTIVATION_STEP_DEFS(flags), flags);
}
