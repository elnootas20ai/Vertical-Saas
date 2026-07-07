import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import {
  getMoneiConnectSignupUrl,
  getMoneiConnectStatus,
  moneiConnectPartnerWebhook,
} from '../controllers/moneiConnectController.js';

const moneiConnectRouter = Router();

moneiConnectRouter.get('/signup-url', requireAuthAndEmailVerified, getMoneiConnectSignupUrl);
moneiConnectRouter.get('/status', requireAuthAndEmailVerified, getMoneiConnectStatus);
moneiConnectRouter.post('/webhook', moneiConnectPartnerWebhook);

export { moneiConnectRouter };
