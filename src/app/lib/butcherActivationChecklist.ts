import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

export type ButcherActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasProduct: boolean;
  hasPricedProduct: boolean;
  hasScaleOrManual: boolean;
  hasSale: boolean;
  hasTeamMember: boolean;
};

export const EMPTY_BUTCHER_ACTIVATION_FLAGS: ButcherActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasProduct: false,
  hasPricedProduct: false,
  hasScaleOrManual: false,
  hasSale: false,
  hasTeamMember: false,
};

function applyLocks(
  steps: DeliveryActivationStepDef[],
  flags: ButcherActivationFlags,
): DeliveryActivationStepDef[] {
  return steps.map((step) => {
    if (step.id === 'butcher_products') {
      return { ...step, locked: false, unlockRoute: step.route };
    }
    if (step.id === 'butcher_scale' && !flags.hasPricedProduct) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Crea al menos un corte con precio €/kg antes de la báscula.',
        unlockRoute: '/saas/butcher-products',
      };
    }
    if (step.id === 'butcher_tpv' && !flags.hasPricedProduct) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Necesitas productos con precio para cobrar en el TPV.',
        unlockRoute: '/saas/butcher-products',
      };
    }
    if (step.id === 'butcher_company' && !flags.hasSale) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Haz la primera venta en el TPV antes de cerrar los datos de empresa.',
        unlockRoute: '/saas/vertical/carniceria/tpv',
      };
    }
    if (step.id === 'butcher_operate' && !(flags.hasSale && flags.hasCompanyName && flags.hasTaxData)) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Completa primera venta y datos fiscales.',
        unlockRoute: '/saas/butcher-hub',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const STEPS = (flags: ButcherActivationFlags): DeliveryActivationStepDef[] => [
  {
    id: 'butcher_products',
    number: 1,
    label: 'Productos',
    description: 'Da de alta cortes a €/kg (mismo listado del TPV)',
    route: '/saas/butcher-products',
    icon: 'package',
    subSteps: [
      { id: 'first_product', label: 'Primer corte creado', completed: flags.hasProduct },
      { id: 'priced_product', label: 'Precio €/kg > 0', completed: flags.hasPricedProduct },
    ],
  },
  {
    id: 'butcher_scale',
    number: 2,
    label: 'Báscula',
    description: 'Registra y asigna la báscula al TPV (o usa peso manual)',
    route: '/saas/vertical/carniceria/basculas',
    icon: 'settings',
    subSteps: [
      { id: 'scale_ready', label: 'Báscula asignada o modo manual listo', completed: flags.hasScaleOrManual },
    ],
  },
  {
    id: 'butcher_tpv',
    number: 3,
    label: 'Primera venta',
    description: 'Cobra un ticket en el TPV de mostrador',
    route: '/saas/vertical/carniceria/tpv',
    icon: 'rocket',
    subSteps: [
      { id: 'first_sale', label: 'Venta cobrada', completed: flags.hasSale },
    ],
  },
  {
    id: 'butcher_company',
    number: 4,
    label: 'Empresa',
    description: 'Nombre, CIF, dirección y teléfono',
    route: '/saas/settings/empresa',
    icon: 'building',
    subSteps: [
      { id: 'company_name', label: 'Nombre comercial', completed: flags.hasCompanyName },
      { id: 'tax_data', label: 'CIF / NIF', completed: flags.hasTaxData },
      { id: 'address', label: 'Dirección', completed: flags.hasAddress },
      { id: 'contact', label: 'Teléfono', completed: flags.hasPhone },
    ],
  },
  {
    id: 'butcher_operate',
    number: 5,
    label: 'Listo',
    description: 'Centro operativo, compras, merma y equipo',
    route: '/saas/butcher-hub',
    icon: 'rocket',
    subSteps: [
      {
        id: 'ops_ready',
        label: 'Productos, venta y empresa listos',
        completed:
          flags.hasPricedProduct
          && flags.hasSale
          && flags.hasCompanyName
          && flags.hasTaxData
          && flags.hasAddress
          && flags.hasPhone,
      },
      { id: 'team', label: 'Equipo invitado (opcional)', completed: flags.hasTeamMember },
    ],
  },
];

export function buildButcherActivationStepDefs(
  flags: ButcherActivationFlags,
): DeliveryActivationStepDef[] {
  return applyLocks(STEPS(flags), flags);
}
