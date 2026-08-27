import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

/**
 * Bar/restaurante: las categorías de marca no vienen del preset del asistente (Ajustes → Marca).
 * Solo se persisten cuando el catálogo las aporta (import Excel / productos reales).
 */
export function restaurantBrandCategoriesFromCatalogOnly(
  businessType: string | null | undefined,
): boolean {
  return isRestaurantBusinessType(businessType);
}
