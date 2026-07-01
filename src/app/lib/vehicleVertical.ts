import type { Business, BusinessType } from './businessApi';
import { isCompraventaBusinessType } from './compraventaSetup';
import { isDeliveryBusinessType } from './deliverySetup';

const VEHICLE_INVENTORY_VERTICALS = new Set<BusinessType>([
  'carDealership',
  'workshop',
  'scrapyard',
  'spareParts',
  'carWash',
  'taxi',
]);

export function supportsVehicleInventoryModule(businessType?: string | null): boolean {
  return VEHICLE_INVENTORY_VERTICALS.has(String(businessType || '') as BusinessType);
}

export function findVehicleInventoryBusiness(businesses: Business[]): Business | null {
  return businesses.find((b) => supportsVehicleInventoryModule(b.businessType)) ?? null;
}

/** Solo compraventa filtra stock por empresa; el resto usa inventario del titular. */
export function resolveVehicleListBusinessId(
  business?: Pick<Business, 'businessType' | 'business_id'> | null,
): string | null {
  if (isCompraventaBusinessType(business?.businessType)) {
    return business?.business_id || null;
  }
  return null;
}

export function getVerticalHomePath(businessType?: string | null): string {
  const bt = String(businessType || '');
  if (isDeliveryBusinessType(bt)) return '/saas/delivery-ops';
  if (bt === 'scrapyard') return '/saas/vertical/desguaces';
  if (bt === 'workshop') return '/saas/workshop';
  if (bt === 'butcherShop') return '/saas/vertical/carniceria';
  if (bt === 'cleaning') return '/saas/cleaning-hub';
  if (bt === 'construction') return '/saas/construction-ops';
  if (supportsVehicleInventoryModule(bt)) return '/saas/dashboard';
  return '/saas/dashboard';
}
