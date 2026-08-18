import { Router } from 'express';
import { sendEventQuoteByEmail } from '../controllers/eventsQuoteController.js';
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

export { eventsQuoteRouter };
