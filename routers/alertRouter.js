import { Router } from 'express';
import {
  getAlerts,
  triggerAlertCheck,
  getAlertSettings,
  updateAlertSettings,
} from '../controllers/alertController.js';
import {
  listAlerts,
  listAlertHistory,
  getAlertTimeline,
  getAlertSummary,
  updateAlertStatus,
  bulkUpdateAlertStatus,
  resolveAllUnresolvedAlerts,
  assignAlert,
  deleteAlert,
} from '../controllers/alertCenterController.js';
import { requireBusinessAccess } from '../middleware/requireBusinessAccess.js';
import { requireUserScope } from '../middleware/requireUserScope.js';

const alertRouter = Router();

// ── Centro de alertas globales (por businessId) ──
alertRouter.get('/:businessId/center', requireBusinessAccess, listAlerts);
alertRouter.get('/:businessId/history', requireBusinessAccess, listAlertHistory);
alertRouter.get('/:businessId/summary', requireBusinessAccess, getAlertSummary);
alertRouter.get('/:businessId/:alertId/timeline', requireBusinessAccess, getAlertTimeline);
alertRouter.put('/:businessId/bulk-status', requireBusinessAccess, bulkUpdateAlertStatus);
alertRouter.post('/:businessId/resolve-all', requireBusinessAccess, resolveAllUnresolvedAlerts);
alertRouter.put('/:businessId/:alertId/status', requireBusinessAccess, updateAlertStatus);
alertRouter.put('/:businessId/:alertId/assign', requireBusinessAccess, assignAlert);
alertRouter.delete('/:businessId/:alertId', requireBusinessAccess, deleteAlert);

// ── Endpoints legacy (por userId) — backward compat ──
alertRouter.get('/:userId', requireUserScope, getAlerts);
alertRouter.post('/:userId/check', requireUserScope, triggerAlertCheck);
alertRouter.get('/:userId/config', requireUserScope, getAlertSettings);
alertRouter.put('/:userId/config', requireUserScope, updateAlertSettings);

export { alertRouter };
