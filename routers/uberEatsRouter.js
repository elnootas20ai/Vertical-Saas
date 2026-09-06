import { Router } from 'express';
import {
  activateUberPosForBusiness,
  actUberOrderForBusiness,
  completeUberEatsOAuth,
  getUberEatsOAuthConfig,
  getUberCertStatus,
  getUberDeliveryStoreForBusiness,
  getUberPosDataForBusiness,
  getUberStoreStatusForBusiness,
  listUberDeliveryStoresForBusiness,
  listUberStoresForBusiness,
  patchUberPosDataForBusiness,
  pushUberMenuForBusiness,
  selectUberStoreForBusiness,
  selectUberSalesPointForBusiness,
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
uberEatsRouter.post('/disconnect', disconnectUberEatsForBusiness);
uberEatsRouter.get('/cert-status', getUberCertStatus);

export { uberEatsRouter };
