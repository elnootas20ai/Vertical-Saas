import { Router } from 'express';
import {
  generateAlerts,
  listAlerts,
  getAlertsSummary,
  acknowledgeAlert,
} from '../controllers/clockinAlertsController.js';

const clockinAlertsRouter = Router();

clockinAlertsRouter.post('/:businessId/generate', generateAlerts);
clockinAlertsRouter.get('/:businessId', listAlerts);
clockinAlertsRouter.get('/:businessId/summary', getAlertsSummary);
clockinAlertsRouter.put('/:businessId/acknowledge', acknowledgeAlert);

export { clockinAlertsRouter };
