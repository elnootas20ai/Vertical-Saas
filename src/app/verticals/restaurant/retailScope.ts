import type { Business } from '../../lib/businessApi';
import { readWorkCenterBusinessId } from '../../lib/deliverySetup';
import { isSalaManagedWorkCenter } from '../../lib/salaRoomTerminal';
import type { WorkCenter } from '../../lib/workCentersApi';

export type RestaurantBusinessRef = Pick<
  Business,
  'business_id' | 'businessType' | 'createdAt' | 'name'
>;

function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function isRetailRecord(wc: WorkCenter): boolean {
  return (
    !wc.deletedAt &&
    (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen')
  );
}

/**
 * Propietario de tienda para restaurante/bar: solo la etiqueta `businessId`.
 * Sin heurísticas por nombre ni “préstamos” a delivery — cada vertical lee su tag.
 */
export function resolveRestaurantRetailOwnerId(
  wc: WorkCenter,
  _activeBusiness?: RestaurantBusinessRef,
  _allBusinesses?: RestaurantBusinessRef[],
): string {
  if (!isRetailRecord(wc)) return '';
  return readWorkCenterBusinessId(wc);
}

/** Solo tiendas etiquetadas con esta empresa restaurante. */
export function filterRestaurantRetailWorkCenters(
  workCenters: WorkCenter[],
  activeBusiness: RestaurantBusinessRef,
  _allBusinesses?: RestaurantBusinessRef[],
): WorkCenter[] {
  const activeId = normalizeBusinessScopeId(activeBusiness.business_id);
  if (!activeId) return [];

  return workCenters
    .filter((wc) => !wc.deletedAt && isRetailRecord(wc))
    .filter((wc) => !isSalaManagedWorkCenter(wc))
    .filter((wc) => resolveRestaurantRetailOwnerId(wc) === activeId)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
