import { Router } from 'express';
import {
  getDeliveryAlerts,
  getActiveDeliveryAlerts,
  getDeliveryAlertSettings,
  updateDeliveryAlertSettings,
  triggerDeliveryAlertCheck,
  getDeliveryAlertStats,
} from '../controllers/deliveryAlertController.js';

const deliveryAlertRouter = Router();

deliveryAlertRouter.get('/:userId', getDeliveryAlerts);
deliveryAlertRouter.get('/:userId/active', getActiveDeliveryAlerts);
deliveryAlertRouter.get('/:userId/config', getDeliveryAlertSettings);
deliveryAlertRouter.put('/:userId/config', updateDeliveryAlertSettings);
deliveryAlertRouter.post('/:userId/check', triggerDeliveryAlertCheck);
deliveryAlertRouter.get('/:userId/stats', getDeliveryAlertStats);

export { deliveryAlertRouter };
