import { Router } from 'express';
import {
  generateAll,
  generateFromServices,
  generateFromContractsHandler,
  markOverdue,
} from '../controllers/cleaningBillingController.js';

const cleaningBillingRouter = Router();

cleaningBillingRouter.post('/:userId/generate', generateAll);
cleaningBillingRouter.post('/:userId/generate-services', generateFromServices);
cleaningBillingRouter.post('/:userId/generate-contracts', generateFromContractsHandler);
cleaningBillingRouter.post('/:userId/mark-overdue', markOverdue);

export { cleaningBillingRouter };
