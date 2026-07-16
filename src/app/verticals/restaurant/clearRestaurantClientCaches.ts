/**
 * Limpia cachés de cliente del vertical bar/restaurante (sin tocar Delivery).
 */

import { clearAllRetailScopeCaches } from '../retailScopeRegistry';
import { clearRestaurantRetailCache } from './restaurantRetailCache';

const SALA_PENDING_KEY = 'vertial.sala.setupPending';
const SALA_PREFIXES = [
  'vertial.sala.setupPending',
  'vertial.sala.legacyCleanupDone:',
  'vertial.sala.storeTerminalsPurged:',
  'vertial.restaurant.freshStart:',
];

function removeStorageKeysByPrefix(storage: Storage, prefixes: string[]) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key) continue;
    if (prefixes.some((p) => key === p || key.startsWith(p))) {
      storage.removeItem(key);
    }
  }
}

export function clearRestaurantClientCaches(businessId?: string): void {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  try {
    clearRestaurantRetailCache(bid || undefined);
    clearAllRetailScopeCaches(bid || undefined);
  } catch {
    /* ignore */
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SALA_PENDING_KEY);
      removeStorageKeysByPrefix(sessionStorage, SALA_PREFIXES);
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof localStorage !== 'undefined') {
      removeStorageKeysByPrefix(localStorage, [
        'vertial.restaurantRetail:v1:',
        'vertial.sala.legacyCleanupDone:',
        'vertial.sala.storeTerminalsPurged:',
        ...(bid ? [`vertial.restaurant.freshStart:${bid}`] : []),
      ]);
    }
  } catch {
    /* ignore */
  }
}
