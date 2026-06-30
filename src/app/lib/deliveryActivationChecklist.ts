import { applyDeliveryStepLocks } from './deliveryActivationGates';
export { hasValidBusinessHoursConfig } from './businessHoursUtils';

export type DeliveryActivationSubStep = {
  id: string;
  label: string;
  completed: boolean;
};

export type DeliveryActivationStepDef = {
  id: string;
  number: number;
  label: string;
  description: string;
  route: string;
  icon: string;
  subSteps: DeliveryActivationSubStep[];
  locked?: boolean;
  lockedReason?: string;
  unlockRoute?: string;
};

export type DeliveryActivationFlags = {
  hasCompanyName: boolean;
  hasTaxData: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasActiveRetailStore: boolean;
  hasActivePdv: boolean;
  brandSetupComplete: boolean;
  hasCatalogProduct: boolean;
  hasPricedProduct: boolean;
  hasBusinessHours: boolean;
};

/** Progreso 0/5 mientras cargan datos reales (evita ocultar el sidebar). */
export const EMPTY_DELIVERY_ACTIVATION_FLAGS: DeliveryActivationFlags = {
  hasCompanyName: false,
  hasTaxData: false,
  hasAddress: false,
  hasPhone: false,
  hasActiveRetailStore: false,
  hasActivePdv: false,
  brandSetupComplete: false,
  hasCatalogProduct: false,
  hasPricedProduct: false,
  hasBusinessHours: false,
};

const DELIVERY_ACTIVATION_STEP_DEFS = (
  flags: DeliveryActivationFlags,
): DeliveryActivationStepDef[] => [
  {
    id: 'delivery_store',
    number: 1,
    label: 'Tienda y PDV',
    description: 'Crea el local; la caja TPV y el código tablet se preparan solos',
    route: '/saas/settings/tienda',
    icon: 'store',
    subSteps: [
      { id: 'retail_store', label: 'Primera tienda creada', completed: flags.hasActiveRetailStore },
      { id: 'pdv_active', label: 'PDV de caja activo', completed: flags.hasActivePdv },
    ],
  },
  {
    id: 'delivery_brand',
    number: 2,
    label: 'Personaliza tu marca',
    description: 'Crea tu carta (nombre, categorías, tiendas); Ir abre el asistente',
    route: '/saas/settings/marca?action=setup-brand',
    icon: 'brand',
    subSteps: [
      {
        id: 'brand_ready',
        label: 'Marca principal personalizada',
        completed: flags.brandSetupComplete,
      },
    ],
  },
  {
    id: 'delivery_catalog',
    number: 3,
    label: 'Catálogo',
    description: 'Importa Excel o añade productos con precio; Ir en cada dato',
    route: '/saas/catalog',
    icon: 'package',
    subSteps: [
      { id: 'first_product', label: 'Primer producto o plato', completed: flags.hasCatalogProduct },
      { id: 'product_price', label: 'Precio de venta', completed: flags.hasPricedProduct },
    ],
  },
  {
    id: 'delivery_company',
    number: 4,
    label: 'Empresa',
    description: 'Ajustes → Empresa: revisa nombre, CIF, dirección y teléfono (suele faltar el teléfono)',
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
    id: 'delivery_operate',
    number: 5,
    label: 'Listo para vender',
    description: 'Horario en la tienda y acceso al TPV rápido',
    route: '/saas/settings/horarios',
    icon: 'clock',
    subSteps: [
      { id: 'business_hours', label: 'Horario de apertura', completed: flags.hasBusinessHours },
      {
        id: 'tpv_ready',
        label: 'Tienda, marca y catálogo listos',
        completed:
          flags.hasActivePdv &&
          flags.brandSetupComplete &&
          flags.hasPricedProduct,
      },
    ],
  },
];

export function buildDeliveryActivationStepDefs(
  flags: DeliveryActivationFlags,
): DeliveryActivationStepDef[] {
  return applyDeliveryStepLocks(DELIVERY_ACTIVATION_STEP_DEFS(flags), flags);
}

