import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import { burstLimiter } from '../middleware/rateLimiter.js';
import {
  getWebAnalyticsAdmin,
  trackWebAnalyticsEvent,
} from '../controllers/webAnalyticsController.js';

const webAnalyticsPublicRouter = Router();
webAnalyticsPublicRouter.post('/event', burstLimiter, trackWebAnalyticsEvent);

const webAnalyticsAdminRouter = Router();
webAnalyticsAdminRouter.get('/', requireAuthAndEmailVerified, getWebAnalyticsAdmin);

export { webAnalyticsPublicRouter, webAnalyticsAdminRouter };
