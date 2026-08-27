import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

/**
 * Bar/restaurante: sin módulo Almacén en UI ni sync automático.
 * El stock de ingredientes entra por import Excel / carta; no pipeline delivery.
 */
export function restaurantWarehouseViaExcelOnly(
  businessType: string | null | undefined,
): boolean {
  return isRestaurantBusinessType(businessType);
}
