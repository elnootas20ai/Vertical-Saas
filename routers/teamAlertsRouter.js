import { Router } from 'express';
import { getTeamAlerts, getTeamAlertsSummary } from '../controllers/teamAlertsController.js';

const teamAlertsRouter = Router();

teamAlertsRouter.get('/:businessId', getTeamAlerts);
teamAlertsRouter.get('/:businessId/summary', getTeamAlertsSummary);

export { teamAlertsRouter };
