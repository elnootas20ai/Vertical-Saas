import { Router } from 'express';
import {
  acceptQuote,
  rejectQuote,
  getPublicQuote,
  sendQuoteByEmail,
} from '../controllers/quoteController.js';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import { burstLimiter, planAwareLimiter } from '../middleware/rateLimiter.js';

const quoteRouter = Router();

// Public endpoints — token-based, no login required
quoteRouter.get('/public', getPublicQuote);
quoteRouter.get('/accept', acceptQuote);
quoteRouter.get('/reject', rejectQuote);

// Authenticated endpoint — send quote by email
quoteRouter.post('/send/:quoteId', requireAuthAndEmailVerified, burstLimiter, planAwareLimiter, sendQuoteByEmail);

export { quoteRouter };
