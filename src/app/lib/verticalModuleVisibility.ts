import type { BusinessType } from './businessApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

/**
 * Módulos del menú ocultos por vertical (config, no borrado del core).
 * Ej.: delivery no usa comisiones por venta; los consumos de equipo van en Equipo → Consumos.
 */
export const VERTICAL_HIDDEN_MENU_ITEMS: Partial<Record<BusinessType, readonly string[]>> = {
  delivery: ['commissions', 'web-orders', 'delivery-clients'],
  restaurant: [
    'delivery-ops',
    'delivery-clients',
    'web-orders',
    'web-config',
    'delivery-integrations',
    'tpv-rapido',
    'tpv',
    'tpv-locales',
  ],
};

/** Tienda web / pedidos online — no aplica a bar/restaurante (solo sala, reservas y caja). */
export function isWebOrderingModuleEnabled(
  businessType: BusinessType | string | null | undefined,
): boolean {
  return !isRestaurantBusinessType(businessType);
}
export function isMenuItemVisibleForVertical(
  itemId: string,
  businessType: BusinessType | string | null | undefined,
): boolean {
  if (!businessType) return true;
  const hidden = VERTICAL_HIDDEN_MENU_ITEMS[businessType as BusinessType];
  return !hidden?.includes(itemId);
}

export function isVerticalModuleEnabled(
  moduleId: string,
  businessType: BusinessType | string | null | undefined,
): boolean {
  return isMenuItemVisibleForVertical(moduleId, businessType);
}
