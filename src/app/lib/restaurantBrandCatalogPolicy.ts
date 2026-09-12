import { isRestaurantBusinessType } from './deliveryOpsTypes';

/**
 * Bar/restaurante: las categorías de marca no vienen del preset del asistente.
 * Solo se persisten cuando el catálogo las aporta.
 */
export function restaurantBrandCategoriesFromCatalogOnly(
  businessType: string | null | undefined,
): boolean {
  return isRestaurantBusinessType(businessType);
}
