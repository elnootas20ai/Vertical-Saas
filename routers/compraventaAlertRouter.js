import { Router } from 'express';
import {
  getCompraventaAlerts,
  getCompraventaAlertsSummary,
  acknowledgeCompraventaAlert,
  dismissCompraventaAlert,
  getCompraventaAlertHistory,
  getCompraventaAlertSettings,
  updateCompraventaAlertSettings,
  triggerCompraventaAlertCheck,
} from '../controllers/compraventaAlertController.js';

const compraventaAlertRouter = Router();

compraventaAlertRouter.get('/:userId', getCompraventaAlerts);
compraventaAlertRouter.get('/:userId/summary', getCompraventaAlertsSummary);
compraventaAlertRouter.get('/:userId/history', getCompraventaAlertHistory);
compraventaAlertRouter.get('/:userId/config', getCompraventaAlertSettings);
compraventaAlertRouter.put('/:userId/config', updateCompraventaAlertSettings);
compraventaAlertRouter.post('/:userId/check', triggerCompraventaAlertCheck);
compraventaAlertRouter.post('/:userId/:alertId/acknowledge', acknowledgeCompraventaAlert);
compraventaAlertRouter.post('/:userId/:alertId/dismiss', dismissCompraventaAlert);

export { compraventaAlertRouter };
