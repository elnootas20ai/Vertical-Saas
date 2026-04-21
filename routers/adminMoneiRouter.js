import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getMoneiConfig,
  getPaymentsList,
  getSubscriptionsList,
  adminGetPayment,
  adminGetSubscription,
  adminCancelSubscription,
  adminPauseSubscription,
  adminResumeSubscription,
  adminRefundPayment,
  adminTestPayment,
  getDashboardStats,
  adminGrantFreeMonths,
} from '../controllers/adminMoneiController.js';

const adminMoneiRouter = Router();

adminMoneiRouter.get('/config', requireAuth, getMoneiConfig);
adminMoneiRouter.get('/dashboard', requireAuth, getDashboardStats);
adminMoneiRouter.get('/payments', requireAuth, getPaymentsList);
adminMoneiRouter.get('/subscriptions', requireAuth, getSubscriptionsList);
adminMoneiRouter.get('/payments/:id', requireAuth, adminGetPayment);
adminMoneiRouter.get('/subscriptions/:id', requireAuth, adminGetSubscription);
adminMoneiRouter.post('/subscriptions/:id/cancel', requireAuth, adminCancelSubscription);
adminMoneiRouter.post('/subscriptions/:id/pause', requireAuth, adminPauseSubscription);
adminMoneiRouter.post('/subscriptions/:id/resume', requireAuth, adminResumeSubscription);
adminMoneiRouter.post('/payments/:id/refund', requireAuth, adminRefundPayment);
adminMoneiRouter.post('/test-payment', requireAuth, adminTestPayment);
adminMoneiRouter.post('/grant-free-months', requireAuth, adminGrantFreeMonths);

export { adminMoneiRouter };
