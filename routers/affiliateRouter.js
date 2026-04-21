import { Router } from 'express';
import {
  getVerticals,
  submitAffiliateRequest,
  validateReferralCode,
  portalLogin,
  portalDashboard,
  portalRegisterClient,
  portalReferredAccounts,
  listAffiliatesAdmin,
  createAffiliateAdmin,
  updateAffiliateAdmin,
  updateAffiliateStatusAdmin,
  deleteAffiliateAdmin,
  listContactsAdmin,
  createContactAdmin,
  updateContactAdmin,
  deleteContactAdmin,
  listFollowUpsAdmin,
  createFollowUpAdmin,
  deleteFollowUpAdmin,
  listCommissionsAdmin,
  createCommissionAdmin,
  updateCommissionStatusAdmin,
  deleteCommissionAdmin,
} from '../controllers/affiliateController.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

export const affiliateRouter = Router();

// ── Public ─────────────────────────────────────────────────────────────────────
affiliateRouter.get('/verticals', getVerticals);
affiliateRouter.post('/request', apiLimiter, submitAffiliateRequest);
affiliateRouter.get('/referral/:code/validate', validateReferralCode);

// ── Portal (affiliate accesses with their code) ───────────────────────────────
affiliateRouter.post('/portal/login', apiLimiter, portalLogin);
affiliateRouter.get('/portal/:code/dashboard', portalDashboard);
affiliateRouter.post('/portal/:code/clients', apiLimiter, portalRegisterClient);
affiliateRouter.get('/portal/:code/referred', portalReferredAccounts);

// ── Admin (requires auth) ──────────────────────────────────────────────────────
affiliateRouter.get('/admin/:userId/affiliates', requireAuth, listAffiliatesAdmin);
affiliateRouter.post('/admin/:userId/affiliates', requireAuth, createAffiliateAdmin);
affiliateRouter.put('/admin/:userId/affiliates/:affiliateId', requireAuth, updateAffiliateAdmin);
affiliateRouter.put('/admin/:userId/affiliates/:affiliateId/status', requireAuth, updateAffiliateStatusAdmin);
affiliateRouter.delete('/admin/:userId/affiliates/:affiliateId', requireAuth, deleteAffiliateAdmin);

affiliateRouter.get('/admin/:userId/contacts', requireAuth, listContactsAdmin);
affiliateRouter.post('/admin/:userId/contacts', requireAuth, createContactAdmin);
affiliateRouter.put('/admin/:userId/contacts/:contactId', requireAuth, updateContactAdmin);
affiliateRouter.delete('/admin/:userId/contacts/:contactId', requireAuth, deleteContactAdmin);

affiliateRouter.get('/admin/:userId/followups', requireAuth, listFollowUpsAdmin);
affiliateRouter.post('/admin/:userId/followups', requireAuth, createFollowUpAdmin);
affiliateRouter.delete('/admin/:userId/followups/:followUpId', requireAuth, deleteFollowUpAdmin);

affiliateRouter.get('/admin/:userId/commissions', requireAuth, listCommissionsAdmin);
affiliateRouter.post('/admin/:userId/commissions', requireAuth, createCommissionAdmin);
affiliateRouter.put('/admin/:userId/commissions/:commissionId/status', requireAuth, updateCommissionStatusAdmin);
affiliateRouter.delete('/admin/:userId/commissions/:commissionId', requireAuth, deleteCommissionAdmin);
