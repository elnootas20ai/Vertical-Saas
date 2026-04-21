import { Router } from 'express';
import { getPortalData } from '../controllers/portalController.js';

const portalRouter = Router();

// Public route — no auth required (token-based access)
portalRouter.get('/data/:token', getPortalData);

export { portalRouter };
