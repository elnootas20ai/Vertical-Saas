import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import { getClientUsage } from '../controllers/adminClientsController.js';

const adminClientsRouter = Router();

adminClientsRouter.get('/clients/:userId/usage', requireAuthAndEmailVerified, getClientUsage);

export { adminClientsRouter };
