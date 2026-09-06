/**
 * Compat layer — la API Uber Eats vive en uberEatsApi.js.
 * Mantiene imports existentes (controller, tests).
 */
export {
  getUberEatsAppAccessToken,
  listUberEatsStores,
  provisionUberEatsStore,
  getUberEatsPosData,
  patchUberEatsPosData,
  listUberDeliveryStores,
  getUberDeliveryStore,
} from './uberEatsApi.js';
