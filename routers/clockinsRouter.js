import { Router } from 'express';
import {
  listClockins,
  listActiveNow,
  getStats,
  getPerformance,
  getOrgClockStatus,
  adjustClockinEntry,
  getAbsenteeism,
  getOvertime,
  getPayrollSummary,
  exportClockins,
  crossCheck,
} from '../controllers/clockinsController.js';

const clockinsRouter = Router();

clockinsRouter.get('/:businessId', listClockins);
clockinsRouter.get('/:businessId/active', listActiveNow);
clockinsRouter.get('/:businessId/stats', getStats);
clockinsRouter.get('/:businessId/performance', getPerformance);
clockinsRouter.get('/:businessId/org-status', getOrgClockStatus);
clockinsRouter.get('/:businessId/absenteeism', getAbsenteeism);
clockinsRouter.get('/:businessId/overtime', getOvertime);
clockinsRouter.get('/:businessId/payroll-summary', getPayrollSummary);
clockinsRouter.get('/:businessId/export', exportClockins);
clockinsRouter.get('/:businessId/cross-check', crossCheck);
clockinsRouter.put('/:businessId/adjust', adjustClockinEntry);

export { clockinsRouter };
