import { Router } from 'express';
import {
  sendEventQuoteByEmail,
  sendEventReviewInvite,
  notifyEventAcceptedHttp,
  notifyEventFullyPaidHttp,
} from '../controllers/eventsQuoteController.js';
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

eventsQuoteRouter.post(
  '/:userId/:eventId/notify-accepted',
  requireAuthAndEmailVerified,
  burstLimiter,
  planAwareLimiter,
  notifyEventAcceptedHttp,
);

eventsQuoteRouter.post(
  '/:userId/:eventId/notify-fully-paid',
  requireAuthAndEmailVerified,
  burstLimiter,
  planAwareLimiter,
  notifyEventFullyPaidHttp,
);

export { eventsQuoteRouter };
