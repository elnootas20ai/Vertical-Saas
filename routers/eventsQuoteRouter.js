import { Router } from 'express';
import { sendEventQuoteByEmail, sendEventReviewInvite } from '../controllers/eventsQuoteController.js';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import { burstLimiter, planAwareLimiter } from '../middleware/rateLimiter.js';

const eventsQuoteRouter = Router();

eventsQuoteRouter.post(
  '/:userId/:eventId/send',
  requireAuthAndEmailVerified,
  burstLimiter,
  planAwareLimiter,
  sendEventQuoteByEmail,
);

eventsQuoteRouter.post(
  '/:userId/:eventId/send-review',
  requireAuthAndEmailVerified,
  burstLimiter,
  planAwareLimiter,
  sendEventReviewInvite,
);

export { eventsQuoteRouter };
