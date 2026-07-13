import { Router } from 'express';
import {
  getVerticals,
  submitAffiliateRequest,
  validateReferralCode,
  handleAffiliateEmailAction,
  portalLogin,
  portalLoginWithAccount,
  portalAcceptContract,
  portalSubmitKyc,
  portalDashboard,
  portalRegisterClient,
  portalReferredAccounts,
  listAffiliatesAdmin,
  affiliateRequestsSummaryAdmin,
  createAffiliateAdmin,
  updateAffiliateAdmin,
  updateAffiliateStatusAdmin,
  getAffiliateKycAdmin,
  updateAffiliateKycStatusAdmin,
  linkAffiliateAccountAdmin,
  deleteAffiliateAdmin,
  clearAffiliateRequestsAdmin,
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
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

export const affiliateRouter = Router();

// ── Public ─────────────────────────────────────────────────────────────────────
affiliateRouter.get('/verticals', getVerticals);
affiliateRouter.post('/request', apiLimiter, submitAffiliateRequest);
affiliateRouter.get('/email-action', apiLimiter, handleAffiliateEmailAction);
affiliateRouter.get('/referral/:code/validate', validateReferralCode);

// ── Portal (affiliate accesses with their code) ───────────────────────────────
affiliateRouter.post('/portal/login', apiLimiter, portalLogin);
affiliateRouter.post('/portal/login-account', apiLimiter, portalLoginWithAccount);
affiliateRouter.post('/portal/:code/accept-contract', apiLimiter, portalAcceptContract);
affiliateRouter.post('/portal/:code/kyc', apiLimiter, portalSubmitKyc);
affiliateRouter.get('/portal/:code/dashboard', portalDashboard);
affiliateRouter.post('/portal/:code/clients', apiLimiter, portalRegisterClient);
affiliateRouter.get('/portal/:code/referred', portalReferredAccounts);

// ── Admin (requires auth) ──────────────────────────────────────────────────────
affiliateRouter.get('/admin/:userId/affiliates/summary', requireAuthAndEmailVerified, affiliateRequestsSummaryAdmin);
affiliateRouter.get('/admin/:userId/affiliates', requireAuthAndEmailVerified, listAffiliatesAdmin);
affiliateRouter.post('/admin/:userId/affiliates/clear-requests', requireAuthAndEmailVerified, clearAffiliateRequestsAdmin);
affiliateRouter.post('/admin/:userId/affiliates', requireAuthAndEmailVerified, createAffiliateAdmin);
affiliateRouter.put('/admin/:userId/affiliates/:affiliateId', requireAuthAndEmailVerified, updateAffiliateAdmin);
affiliateRouter.put('/admin/:userId/affiliates/:affiliateId/status', requireAuthAndEmailVerified, updateAffiliateStatusAdmin);
affiliateRouter.get('/admin/:userId/affiliates/:affiliateId/kyc', requireAuthAndEmailVerified, getAffiliateKycAdmin);
affiliateRouter.put('/admin/:userId/affiliates/:affiliateId/kyc', requireAuthAndEmailVerified, updateAffiliateKycStatusAdmin);
affiliateRouter.post('/admin/:userId/affiliates/:affiliateId/link-account', requireAuthAndEmailVerified, linkAffiliateAccountAdmin);
affiliateRouter.delete('/admin/:userId/affiliates/:affiliateId', requireAuthAndEmailVerified, deleteAffiliateAdmin);

affiliateRouter.get('/admin/:userId/contacts', requireAuthAndEmailVerified, listContactsAdmin);
affiliateRouter.post('/admin/:userId/contacts', requireAuthAndEmailVerified, createContactAdmin);
affiliateRouter.put('/admin/:userId/contacts/:contactId', requireAuthAndEmailVerified, updateContactAdmin);
affiliateRouter.delete('/admin/:userId/contacts/:contactId', requireAuthAndEmailVerified, deleteContactAdmin);

affiliateRouter.get('/admin/:userId/followups', requireAuthAndEmailVerified, listFollowUpsAdmin);
affiliateRouter.post('/admin/:userId/followups', requireAuthAndEmailVerified, createFollowUpAdmin);
affiliateRouter.delete('/admin/:userId/followups/:followUpId', requireAuthAndEmailVerified, deleteFollowUpAdmin);

affiliateRouter.get('/admin/:userId/commissions', requireAuthAndEmailVerified, listCommissionsAdmin);
affiliateRouter.post('/admin/:userId/commissions', requireAuthAndEmailVerified, createCommissionAdmin);
affiliateRouter.put('/admin/:userId/commissions/:commissionId/status', requireAuthAndEmailVerified, updateCommissionStatusAdmin);
affiliateRouter.delete('/admin/:userId/commissions/:commissionId', requireAuthAndEmailVerified, deleteCommissionAdmin);
