import { Router } from 'express';
import {
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
  setUberStoreStatusForBusiness,
  startUberEatsOAuth,
  disconnectUberEatsForBusiness,
} from '../controllers/uberEatsController.js';

const uberEatsRouter = Router();

uberEatsRouter.get('/oauth/config', getUberEatsOAuthConfig);
uberEatsRouter.get('/oauth/start', startUberEatsOAuth);
uberEatsRouter.post('/oauth/callback', completeUberEatsOAuth);
uberEatsRouter.get('/stores', listUberStoresForBusiness);
uberEatsRouter.post('/stores/select', selectUberStoreForBusiness);
uberEatsRouter.get('/pos-data', getUberPosDataForBusiness);
uberEatsRouter.patch('/pos-data', patchUberPosDataForBusiness);
uberEatsRouter.get('/delivery-stores', listUberDeliveryStoresForBusiness);
uberEatsRouter.get('/delivery-store', getUberDeliveryStoreForBusiness);
uberEatsRouter.get('/store-status', getUberStoreStatusForBusiness);
uberEatsRouter.post('/store-status', setUberStoreStatusForBusiness);
uberEatsRouter.post('/menu/push', pushUberMenuForBusiness);
uberEatsRouter.post('/disconnect', disconnectUberEatsForBusiness);
uberEatsRouter.get('/cert-status', getUberCertStatus);

export { uberEatsRouter };
