import { Router } from 'express';
import {
  completeUberEatsOAuth,
  getUberEatsOAuthConfig,
  listUberStoresForBusiness,
  selectUberStoreForBusiness,
  startUberEatsOAuth,
} from '../controllers/uberEatsController.js';

const uberEatsRouter = Router();

uberEatsRouter.get('/oauth/config', getUberEatsOAuthConfig);
uberEatsRouter.get('/oauth/start', startUberEatsOAuth);
uberEatsRouter.post('/oauth/callback', completeUberEatsOAuth);
uberEatsRouter.get('/stores', listUberStoresForBusiness);
uberEatsRouter.post('/stores/select', selectUberStoreForBusiness);

export { uberEatsRouter };
