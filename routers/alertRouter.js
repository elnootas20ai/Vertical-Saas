import { Router } from 'express';
import {
  getAlerts,
  triggerAlertCheck,
  getAlertSettings,
  updateAlertSettings,
} from '../controllers/alertController.js';
import {
  listAlerts,
  getAlertSummary,
  updateAlertStatus,
  bulkUpdateAlertStatus,
  assignAlert,
  deleteAlert,
} from '../controllers/alertCenterController.js';

const alertRouter = Router();

// ── Centro de alertas globales (por businessId) ──
alertRouter.get('/:businessId/center', listAlerts);
alertRouter.get('/:businessId/summary', getAlertSummary);
alertRouter.put('/:businessId/bulk-status', bulkUpdateAlertStatus);
alertRouter.put('/:businessId/:alertId/status', updateAlertStatus);
alertRouter.put('/:businessId/:alertId/assign', assignAlert);
alertRouter.delete('/:businessId/:alertId', deleteAlert);

// ── Endpoints legacy (por userId) — backward compat ──
alertRouter.get('/:userId', getAlerts);
alertRouter.post('/:userId/check', triggerAlertCheck);
alertRouter.get('/:userId/config', getAlertSettings);
alertRouter.put('/:userId/config', updateAlertSettings);

export { alertRouter };
