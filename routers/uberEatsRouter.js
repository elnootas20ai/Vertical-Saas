import { Router } from 'express';
import {
  activateUberPosForBusiness,
  actUberOrderForBusiness,
  actUberSandboxOrderForBusiness,
  completeUberEatsOAuth,
  deleteUberBindingForBusiness,
  getUberEatsOAuthConfig,
  getUberCertStatus,
  getUberDeliveryStoreForBusiness,
  getUberPosDataForBusiness,
  getUberStoreStatusForBusiness,
  listUberDeliveryStoresForBusiness,
  listUberBindingsForBusiness,
  listUberSandboxOrdersForBusiness,
  listUberStoresForBusiness,
  patchUberPosDataForBusiness,
  pushUberMenuForBusiness,
  selectUberStoreForBusiness,
  selectUberSalesPointForBusiness,
  saveUberBindingForBusiness,
  setUberStoreStatusForBusiness,
  startUberEatsOAuth,
  disconnectUberEatsForBusiness,
  updateUberMenuItemForBusiness,
} from '../controllers/uberEatsController.js';

const uberEatsRouter = Router();

uberEatsRouter.get('/oauth/config', getUberEatsOAuthConfig);
uberEatsRouter.get('/oauth/start', startUberEatsOAuth);
uberEatsRouter.post('/oauth/callback', completeUberEatsOAuth);
uberEatsRouter.get('/stores', listUberStoresForBusiness);
uberEatsRouter.post('/stores/select', selectUberStoreForBusiness);
uberEatsRouter.get('/bindings', listUberBindingsForBusiness);
uberEatsRouter.post('/bindings/save', saveUberBindingForBusiness);
uberEatsRouter.delete('/bindings', deleteUberBindingForBusiness);
uberEatsRouter.post('/store/pdv', selectUberSalesPointForBusiness);
uberEatsRouter.get('/pos-data', getUberPosDataForBusiness);
uberEatsRouter.post('/pos-data/activate', activateUberPosForBusiness);
uberEatsRouter.patch('/pos-data', patchUberPosDataForBusiness);
uberEatsRouter.get('/delivery-stores', listUberDeliveryStoresForBusiness);
uberEatsRouter.get('/delivery-store', getUberDeliveryStoreForBusiness);
uberEatsRouter.get('/store-status', getUberStoreStatusForBusiness);
uberEatsRouter.post('/store-status', setUberStoreStatusForBusiness);
uberEatsRouter.post('/menu/push', pushUberMenuForBusiness);
uberEatsRouter.post('/menu/item', updateUberMenuItemForBusiness);
uberEatsRouter.post('/order/action', actUberOrderForBusiness);
uberEatsRouter.get('/sandbox-orders', listUberSandboxOrdersForBusiness);
uberEatsRouter.post('/sandbox-orders/action', actUberSandboxOrderForBusiness);
uberEatsRouter.post('/disconnect', disconnectUberEatsForBusiness);
uberEatsRouter.get('/cert-status', getUberCertStatus);

export { uberEatsRouter };
