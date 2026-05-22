import type { DeliveryActivationFlags, DeliveryActivationStepDef } from './deliveryActivationChecklist';

export const DELIVERY_TIENDA_SETTINGS_PATH = '/saas/settings/tienda';
export const DELIVERY_MARCA_SETTINGS_PATH = '/saas/settings/marca';

export function isDeliveryStoreAndPdvReady(
  flags: Pick<DeliveryActivationFlags, 'hasActiveRetailStore' | 'hasActivePdv'>,
): boolean {
  return flags.hasActiveRetailStore && flags.hasActivePdv;
}

export type DeliveryStepLockInfo = {
  locked: boolean;
  lockedReason?: string;
  /** Ruta del paso que hay que completar antes. */
  unlockRoute: string;
};

export function getDeliveryStepLock(
  stepId: string,
  flags: DeliveryActivationFlags,
): DeliveryStepLockInfo {
  const pdvReady = isDeliveryStoreAndPdvReady(flags);

  if (stepId === 'delivery_store') {
    return { locked: false, unlockRoute: DELIVERY_TIENDA_SETTINGS_PATH };
  }

  if (!pdvReady) {
    return {
      locked: true,
      lockedReason: 'Primero crea tu tienda y un PDV (caja) activos.',
      unlockRoute: DELIVERY_TIENDA_SETTINGS_PATH,
    };
  }

  if (stepId === 'delivery_catalog' && !flags.brandSetupComplete) {
    return {
      locked: true,
      lockedReason: 'Configura tu marca antes del catálogo.',
      unlockRoute: DELIVERY_MARCA_SETTINGS_PATH,
    };
  }

  if (stepId === 'delivery_operate' && !flags.brandSetupComplete) {
    return {
      locked: true,
      lockedReason: 'Completa la marca antes de la puesta en marcha.',
      unlockRoute: DELIVERY_MARCA_SETTINGS_PATH,
    };
  }

  if (stepId === 'delivery_operate' && !flags.hasPricedProduct) {
    return {
      locked: true,
      lockedReason: 'Añade al menos un producto con precio en el catálogo.',
      unlockRoute: '/saas/catalog',
    };
  }

  return { locked: false, unlockRoute: '' };
}

/** Ítems del menú lateral que exigen tienda + PDV (delivery). */
export const DELIVERY_SIDEBAR_REQUIRES_PDV = new Set([
  'catalog',
  'articles',
  'suppliers',
  'orders',
  'purchase-orders',
  'supplier-billing',
  'costing',
  'tpv-rapido',
  'caja',
  'delivery-ops',
  'delivery-clients',
  'delivery',
  'sala',
  'web-orders',
  'web-config',
]);

/** Catálogo en sidebar: además exige marca configurada. */
export const DELIVERY_SIDEBAR_REQUIRES_BRAND = new Set([
  'catalog',
  'articles',
  'suppliers',
  'orders',
  'purchase-orders',
  'supplier-billing',
  'costing',
]);

export function getDeliverySidebarItemLock(
  itemId: string,
  flags: { pdvReady: boolean; brandReady: boolean },
): { disabled: boolean; title?: string } {
  if (!DELIVERY_SIDEBAR_REQUIRES_PDV.has(itemId)) {
    return { disabled: false };
  }
  if (!flags.pdvReady) {
    return {
      disabled: true,
      title: 'Primero crea tu tienda y un PDV en Ajustes → Tienda',
    };
  }
  if (DELIVERY_SIDEBAR_REQUIRES_BRAND.has(itemId) && !flags.brandReady) {
    return {
      disabled: true,
      title: 'Configura tu marca en Ajustes → Marca antes del catálogo',
    };
  }
  return { disabled: false };
}

export function applyDeliveryStepLocks(
  steps: DeliveryActivationStepDef[],
  flags: DeliveryActivationFlags,
): Array<DeliveryActivationStepDef & { locked: boolean; lockedReason?: string; unlockRoute: string }> {
  return steps.map((step) => {
    const lock = getDeliveryStepLock(step.id, flags);
    return {
      ...step,
      locked: lock.locked,
      lockedReason: lock.lockedReason,
      unlockRoute: lock.unlockRoute || step.route,
    };
  });
}
