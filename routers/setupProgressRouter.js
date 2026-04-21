import { Router } from 'express';
import {
  getProgress,
  getStatus,
  completeStep,
  skipStep,
  skipAll,
  resetProgress,
  verifyAll,
} from '../controllers/setupProgressController.js';

const setupProgressRouter = Router();

setupProgressRouter.get('/:userId', getProgress);
setupProgressRouter.get('/:userId/status', getStatus);
setupProgressRouter.get('/:userId/verify-all', verifyAll);
setupProgressRouter.put('/:userId/step/:stepKey', completeStep);
setupProgressRouter.put('/:userId/step/:stepKey/skip', skipStep);
setupProgressRouter.put('/:userId/skip-all', skipAll);
setupProgressRouter.put('/:userId/reset', resetProgress);

export { setupProgressRouter };
