import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import {
  createAndActivate,
  getStatus,
  getBillingCapabilities,
  cancelUserSubscription,
  confirmSubscription,
  webhookSubscriptionStatus,
  webhookPaymentStatus,
  purchaseAddon,
  getTransferInstructions,
  notifyTransferPayment,
} from '../controllers/subscriptionController.js';

const subscriptionRouter = Router();

subscriptionRouter.get('/capabilities', getBillingCapabilities);

// Rutas protegidas (requieren JWT)
subscriptionRouter.post('/create', requireAuthAndEmailVerified, createAndActivate);
subscriptionRouter.post('/addons/purchase', requireAuthAndEmailVerified, purchaseAddon);
subscriptionRouter.get('/status', requireAuthAndEmailVerified, getStatus);
subscriptionRouter.get('/transfer-instructions', requireAuthAndEmailVerified, getTransferInstructions);
subscriptionRouter.post('/notify-transfer-payment', requireAuthAndEmailVerified, notifyTransferPayment);
subscriptionRouter.post('/cancel', requireAuthAndEmailVerified, cancelUserSubscription);
subscriptionRouter.post('/confirm', requireAuthAndEmailVerified, confirmSubscription);

// Webhooks de MONEI (públicos — MONEI no envía JWT)
subscriptionRouter.post('/webhook/status', webhookSubscriptionStatus);
subscriptionRouter.post('/webhook/payment', webhookPaymentStatus);

export { subscriptionRouter };
