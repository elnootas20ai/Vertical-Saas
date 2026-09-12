import {
  acceptRestaurantPublicOrder,
  acceptRestaurantTakeawayPublicOrder,
} from './restaurantPublicOrderAdapter.js';
import { acceptDeliveryPublicOrder } from './deliveryPublicOrderAdapter.js';
import { acceptButcherPublicOrder } from './butcherPublicOrderAdapter.js';
import { acceptRetailPublicOrder } from './retailPublicOrderAdapter.js';

const ADAPTERS = new Map([
  ['restaurant_table', acceptRestaurantPublicOrder],
  ['restaurant_takeaway', acceptRestaurantTakeawayPublicOrder],
  ['delivery_ops', acceptDeliveryPublicOrder],
  ['butcher_ops', acceptButcherPublicOrder],
  ['retail_ops', acceptRetailPublicOrder],
]);

export function getPublicOrderAdapter(targetKind) {
  return ADAPTERS.get(String(targetKind || '').trim()) || null;
}

export function listPublicOrderAdapterTargets() {
  return [...ADAPTERS.keys()];
}
