import { Router } from 'express';
import {
  completeUberEatsOAuth,
  getUberEatsOAuthConfig,
  startUberEatsOAuth,
} from '../controllers/uberEatsController.js';

const uberEatsRouter = Router();

uberEatsRouter.get('/oauth/config', getUberEatsOAuthConfig);
uberEatsRouter.get('/oauth/start', startUberEatsOAuth);
uberEatsRouter.post('/oauth/callback', completeUberEatsOAuth);

export { uberEatsRouter };
