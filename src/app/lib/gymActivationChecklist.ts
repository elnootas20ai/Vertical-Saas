import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

export type GymActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasMember: boolean;
  hasClass: boolean;
  hasMembership: boolean;
  hasTeamMember: boolean;
};

export const EMPTY_GYM_ACTIVATION_FLAGS: GymActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasMember: false,
  hasClass: false,
  hasMembership: false,
  hasTeamMember: false,
};

function applyGymStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: GymActivationFlags,
): DeliveryActivationStepDef[] {
  return steps.map((step) => {
    if (step.id === 'gym_company') {
      return { ...step, locked: false, unlockRoute: step.route };
    }
    if (step.id === 'gym_members' && !flags.hasCompanyName) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Completa los datos de empresa antes de registrar socios.',
        unlockRoute: '/saas/settings/empresa',
      };
    }
    if (step.id === 'gym_classes' && !flags.hasMember) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Registra al menos un socio antes de programar clases.',
        unlockRoute: '/saas/gym-members',
      };
    }
    if (step.id === 'gym_memberships' && !flags.hasClass) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Crea al menos una clase antes de definir cuotas.',
        unlockRoute: '/saas/gym-classes',
      };
    }
    if (step.id === 'gym_operate' && !flags.hasMembership) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Define al menos una membresía antes de abrir el centro.',
        unlockRoute: '/saas/gym-memberships',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const GYM_ACTIVATION_STEP_DEFS = (
  flags: GymActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'gym_company',
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
    id: 'gym_members',
    number: 2,
    label: 'Socios',
    description: 'Registra miembros con plan y estado de membresía',
    route: '/saas/gym-members',
    icon: 'users',
    subSteps: [
      { id: 'first_member', label: 'Primer socio registrado', completed: flags.hasMember },
    ],
  },
  {
    id: 'gym_classes',
    number: 3,
    label: 'Clases',
    description: 'Programa clases con instructor, horario y capacidad',
    route: '/saas/gym-classes',
    icon: 'settings',
    subSteps: [
      { id: 'first_class', label: 'Primera clase creada', completed: flags.hasClass },
    ],
  },
  {
    id: 'gym_memberships',
    number: 4,
    label: 'Cuotas',
    description: 'Define planes de membresía y precios',
    route: '/saas/gym-memberships',
    icon: 'settings',
    subSteps: [
      { id: 'first_membership', label: 'Primera cuota definida', completed: flags.hasMembership },
    ],
  },
  {
    id: 'gym_operate',
    number: 5,
    label: 'Listo para operar',
    description: 'Con socios, clases y cuotas ya puedes controlar accesos',
    route: '/saas/gym-hub',
    icon: 'rocket',
    subSteps: [
      {
        id: 'ops_ready',
        label: 'Empresa, socios y cuotas listos',
        completed:
          flags.hasCompanyName &&
          flags.hasTaxData &&
          flags.hasAddress &&
          flags.hasPhone &&
          flags.hasMember &&
          flags.hasClass &&
          flags.hasMembership &&
          flags.hasTeamMember,
      },
    ],
  },
];

export function buildGymActivationStepDefs(
  flags: GymActivationFlags,
): DeliveryActivationStepDef[] {
  return applyGymStepLocks(GYM_ACTIVATION_STEP_DEFS(flags), flags);
}
