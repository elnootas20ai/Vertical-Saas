import type { DeliveryActivationStepDef } from './deliveryActivationChecklist';

export type CompraventaActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasActiveRetailStore: boolean;
  hasActivePdv: boolean;
  hasClient: boolean;
  hasVehicle: boolean;
  hasPricedVehicle: boolean;
};

export const EMPTY_COMPRAVENTA_ACTIVATION_FLAGS: CompraventaActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasActiveRetailStore: false,
  hasActivePdv: false,
  hasClient: false,
  hasVehicle: false,
  hasPricedVehicle: false,
};

const TIENDA_PATH = '/saas/settings/tienda?action=new-pdv';

function applyCompraventaStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: CompraventaActivationFlags,
): DeliveryActivationStepDef[] {
  const storeReady = flags.hasActiveRetailStore && flags.hasActivePdv;

  return steps.map((step) => {
    if (step.id === 'compraventa_store') {
      return { ...step, locked: false, unlockRoute: TIENDA_PATH };
    }
    if (!storeReady) {
      return {
        ...step,
        locked: true,
        lockedReason: flags.hasActiveRetailStore
          ? 'Falta el PDV de caja. Edita el expositor en Ajustes → Tienda.'
          : 'Primero crea tu expositor y PDV en Ajustes → Tienda.',
        unlockRoute: TIENDA_PATH,
      };
    }
    if (step.id === 'compraventa_stock' && !flags.hasClient) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Registra al menos un cliente antes del stock.',
        unlockRoute: '/saas/crm/clientes?tab=clients',
      };
    }
    if (step.id === 'compraventa_operate' && !flags.hasPricedVehicle) {
      return {
        ...step,
        locked: true,
        lockedReason: 'Añade al menos un vehículo con precio de venta.',
        unlockRoute: '/saas/vehicles',
      };
    }
    return { ...step, locked: false, unlockRoute: step.route };
  });
}

const COMPRAVENTA_ACTIVATION_STEP_DEFS = (
  flags: CompraventaActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'compraventa_store',
    number: 1,
    label: 'Expositor y PDV',
    description: 'Crea tu expositor; la caja TPV y el código tablet se preparan solos',
    route: '/saas/settings/tienda',
    icon: 'store',
    subSteps: [
      { id: 'retail_store', label: 'Primer expositor creado', completed: flags.hasActiveRetailStore },
      { id: 'pdv_active', label: 'PDV de caja activo', completed: flags.hasActivePdv },
    ],
  },
  {
    id: 'compraventa_clients',
    number: 2,
    label: 'Clientes',
    description: 'Registra compradores y contactos para operaciones y documentos',
    route: '/saas/crm/clientes?tab=clients',
    icon: 'users',
    subSteps: [
      { id: 'first_client', label: 'Primer cliente registrado', completed: flags.hasClient },
    ],
  },
  {
    id: 'compraventa_stock',
    number: 3,
    label: 'Stock de vehículos',
    description: 'Da de alta vehículos con precio de venta para publicar y vender',
    route: '/saas/vehicles',
    icon: 'package',
    subSteps: [
      { id: 'first_vehicle', label: 'Primer vehículo en stock', completed: flags.hasVehicle },
      { id: 'vehicle_price', label: 'Precio de venta', completed: flags.hasPricedVehicle },
    ],
  },
  {
    id: 'compraventa_company',
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
    id: 'compraventa_operate',
    number: 5,
    label: 'Listo para vender',
    description: 'Con expositor, clientes, stock y datos fiscales ya puedes operar',
    route: '/saas/vertical/compraventa',
    icon: 'rocket',
    subSteps: [
      {
        id: 'ops_ready',
        label: 'Expositor, stock y empresa listos',
        completed:
          flags.hasActivePdv &&
          flags.hasClient &&
          flags.hasPricedVehicle &&
          flags.hasCompanyName &&
          flags.hasTaxData &&
          flags.hasAddress &&
          flags.hasPhone,
      },
    ],
  },
];

export function buildCompraventaActivationStepDefs(
  flags: CompraventaActivationFlags,
): DeliveryActivationStepDef[] {
  return applyCompraventaStepLocks(COMPRAVENTA_ACTIVATION_STEP_DEFS(flags), flags);
}
