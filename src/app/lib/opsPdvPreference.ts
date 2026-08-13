/**
 * Preferencia PDV del scope/caja según vertical.
 * Restaurant → restaurantOps.*; Delivery → deliveryOps.*.
 * Evita que bar/restaurante escriba o lea las claves de Delivery.
 */
import { isRestaurantBusinessType } from './deliveryOpsTypes';
import {
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from './deliveryOpsPdvSelection';
import {
  notifyRestaurantActiveStoreChanged,
  readRestaurantOpsSelectedPdvId,
  writeRestaurantOpsSelectedPdvId,
} from '../verticals/restaurant/restaurantOpsPdvSelection';

/** Literales propios: evita TDZ/ciclos al montar ActiveStoreScope. */
export const DELIVERY_ACTIVE_STORE_CHANGED = 'vertial-delivery-active-store';
export const RESTAURANT_ACTIVE_STORE_CHANGED = 'vertial-restaurant-active-store';

export function readOpsSelectedPdvId(
  businessType: string | null | undefined,
  businessId: string,
  dataUserId: string,
): string | null {
  if (isRestaurantBusinessType(businessType)) {
    return readRestaurantOpsSelectedPdvId(businessId, dataUserId);
  }
  return readDeliveryOpsSelectedPdvId(businessId, dataUserId);
}

export function writeOpsSelectedPdvId(
  businessType: string | null | undefined,
  businessId: string,
  dataUserId: string,
  value: string | null,
): void {
  if (isRestaurantBusinessType(businessType)) {
    writeRestaurantOpsSelectedPdvId(businessId, dataUserId, value);
    return;
  }
  writeDeliveryOpsSelectedPdvId(businessId, dataUserId, value);
}

export function notifyOpsActiveStoreChanged(businessType: string | null | undefined): void {
  if (isRestaurantBusinessType(businessType)) {
    notifyRestaurantActiveStoreChanged();
    return;
  }
  notifyDeliveryActiveStoreChanged();
}

/** Eventos a escuchar en scope global (ambos verticales pueden refrescar). */
export const OPS_ACTIVE_STORE_CHANGED_EVENTS = [
  DELIVERY_ACTIVE_STORE_CHANGED,
  RESTAURANT_ACTIVE_STORE_CHANGED,
] as const;
