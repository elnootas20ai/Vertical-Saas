import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createAndActivate,
  getStatus,
  cancelUserSubscription,
  confirmSubscription,
  webhookSubscriptionStatus,
  webhookPaymentStatus,
} from '../controllers/subscriptionController.js';

const subscriptionRouter = Router();

// Rutas protegidas (requieren JWT)
subscriptionRouter.post('/create', requireAuth, createAndActivate);
subscriptionRouter.get('/status', requireAuth, getStatus);
subscriptionRouter.post('/cancel', requireAuth, cancelUserSubscription);
subscriptionRouter.post('/confirm', requireAuth, confirmSubscription);

// Webhooks de MONEI (públicos — MONEI no envía JWT)
subscriptionRouter.post('/webhook/status', webhookSubscriptionStatus);
subscriptionRouter.post('/webhook/payment', webhookPaymentStatus);

export { subscriptionRouter };
