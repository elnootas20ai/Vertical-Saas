import type { BusinessType } from './businessApi';

/**
 * Módulos del menú ocultos por vertical (config, no borrado del core).
 * Ej.: delivery no usa comisiones por venta; los consumos de equipo van en Equipo → Consumos.
 */
export const VERTICAL_HIDDEN_MENU_ITEMS: Partial<Record<BusinessType, readonly string[]>> = {
  delivery: ['commissions'],
};

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
