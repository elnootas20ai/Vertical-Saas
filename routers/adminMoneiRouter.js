import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
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
  adminReactivateAccount,
  adminClearMoneiLink,
} from '../controllers/adminMoneiController.js';

const adminMoneiRouter = Router();

adminMoneiRouter.get('/config', requireAuthAndEmailVerified, getMoneiConfig);
adminMoneiRouter.get('/dashboard', requireAuthAndEmailVerified, getDashboardStats);
adminMoneiRouter.get('/payments', requireAuthAndEmailVerified, getPaymentsList);
adminMoneiRouter.get('/subscriptions', requireAuthAndEmailVerified, getSubscriptionsList);
adminMoneiRouter.get('/payments/:id', requireAuthAndEmailVerified, adminGetPayment);
adminMoneiRouter.get('/subscriptions/:id', requireAuthAndEmailVerified, adminGetSubscription);
adminMoneiRouter.post('/subscriptions/:id/cancel', requireAuthAndEmailVerified, adminCancelSubscription);
adminMoneiRouter.post('/subscriptions/:id/pause', requireAuthAndEmailVerified, adminPauseSubscription);
adminMoneiRouter.post('/subscriptions/:id/resume', requireAuthAndEmailVerified, adminResumeSubscription);
adminMoneiRouter.post('/payments/:id/refund', requireAuthAndEmailVerified, adminRefundPayment);
adminMoneiRouter.post('/test-payment', requireAuthAndEmailVerified, adminTestPayment);
adminMoneiRouter.post('/grant-free-months', requireAuthAndEmailVerified, adminGrantFreeMonths);
adminMoneiRouter.post('/reactivate-account', requireAuthAndEmailVerified, adminReactivateAccount);
adminMoneiRouter.post('/clear-monei-link', requireAuthAndEmailVerified, adminClearMoneiLink);

export { adminMoneiRouter };
