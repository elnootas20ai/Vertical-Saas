import type { Business } from '../../lib/businessApi';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
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

function namesLooselyMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Propietario real de una tienda vista desde una empresa restaurante.
 * Nunca “roba” tiendas de delivery; corrige etiquetas erróneas (p. ej. badlona en bodegeta).
 */
export function resolveRestaurantRetailOwnerId(
  wc: WorkCenter,
  activeBusiness: RestaurantBusinessRef,
  allBusinesses: RestaurantBusinessRef[],
): string {
  const activeId = normalizeBusinessScopeId(activeBusiness.business_id);
  const tagged = readWorkCenterBusinessId(wc);
  if (!tagged || !isRetailRecord(wc)) return tagged;

  if (tagged !== activeId) return tagged;

  const storeName = String(wc.name || '').trim();
  const bizName = String(activeBusiness.name || '').trim();
  if (namesLooselyMatch(storeName, bizName)) return activeId;

  const deliveryOwners = allBusinesses.filter((b) =>
    isStrictDeliveryBusinessType(b.businessType),
  );
  if (deliveryOwners.length === 0) return activeId;

  const byStoreName = deliveryOwners.find((b) =>
    namesLooselyMatch(storeName, String(b.name || '')),
  );
  if (byStoreName) return normalizeBusinessScopeId(byStoreName.business_id);

  const restCreated = activeBusiness.createdAt
    ? new Date(activeBusiness.createdAt).getTime()
    : NaN;
  const wcCreated = wc.createdAt ? new Date(wc.createdAt).getTime() : NaN;
  const predatesRestaurant =
    !Number.isFinite(restCreated) ||
    !Number.isFinite(wcCreated) ||
    wcCreated < restCreated - 60_000;

  if (predatesRestaurant && deliveryOwners[0]) {
    return normalizeBusinessScopeId(deliveryOwners[0].business_id);
  }

  return activeId;
}

/** Solo tiendas que pertenecen a esta empresa restaurante — sin heredar huérfanas. */
export function filterRestaurantRetailWorkCenters(
  workCenters: WorkCenter[],
  activeBusiness: RestaurantBusinessRef,
  allBusinesses: RestaurantBusinessRef[],
): WorkCenter[] {
  const activeId = normalizeBusinessScopeId(activeBusiness.business_id);
  if (!activeId) return [];

  return workCenters
    .filter((wc) => !wc.deletedAt && isRetailRecord(wc))
    .filter((wc) => !isSalaManagedWorkCenter(wc))
    .filter(
      (wc) =>
        resolveRestaurantRetailOwnerId(wc, activeBusiness, allBusinesses) === activeId,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
