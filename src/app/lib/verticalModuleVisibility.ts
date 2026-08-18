import type { BusinessType } from './businessApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

/**
 * Módulos del menú ocultos por vertical (config, no borrado del core).
 * Ej.: delivery no usa comisiones por venta; los consumos de equipo van en Equipo → Consumos.
 */
export const VERTICAL_HIDDEN_MENU_ITEMS: Partial<Record<BusinessType, readonly string[]>> = {
  delivery: ['commissions', 'web-orders', 'delivery-clients', 'restaurant-ops'],
  restaurant: [
    'delivery-ops',
    'delivery-clients',
    'web-orders',
    'web-config',
    'delivery-integrations',
    'delivery-kitchen',
    'delivery-reparto',
    'delivery-montaje',
    'delivery',
    'tpv',
    'tpv-locales',
    'commissions',
    'dealership-workers',
    'sales-metrics',
    'ebitda',
    'bank-reconciliation',
    'gastos-preparacion',
  ],
  events: [
    'tpv',
    'tpv-rapido',
    'tpv-locales',
    'caja',
    'catalog',
    'catalog-stock',
    'costing',
    'delivery-ops',
    'restaurant-ops',
    'delivery-clients',
    'web-orders',
    'web-config',
    'delivery-integrations',
    'delivery-kitchen',
    'delivery-reparto',
    'delivery-montaje',
    'delivery',
    'sala',
    'reservas',
    'lista-espera',
    'sales',
    'pipeline',
    'promotions',
    'quotes',
    'worker-tpv',
    'events-guests',
  ],
  /** Inmobiliaria: sin catálogo TPV ni proveedores (cartera = propiedades). */
  realEstate: ['catalog', 'catalog-stock', 'costing', 'suppliers', 'compras-stock'],
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

const EVENTS_HIDDEN_SETTINGS_TABS = new Set(['brands', 'salesPoints', 'tpvPrinter']);

export function isSettingsTabVisibleForVertical(
  tabId: string,
  businessType: BusinessType | string | null | undefined,
): boolean {
  if (String(businessType || '').trim() !== 'events') return true;
  return !EVENTS_HIDDEN_SETTINGS_TABS.has(tabId);
}
