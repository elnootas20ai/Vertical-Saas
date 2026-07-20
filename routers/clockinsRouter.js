import { Router } from 'express';
import {
  listClockins,
  listActiveNow,
  getStats,
  getPerformance,
  getOrgClockStatus,
  adjustClockinEntry,
  checkInMember,
  appendClockinEntry,
  getAbsenteeism,
  getOvertime,
  getPayrollSummary,
  getLaborCost,
  exportClockins,
  crossCheck,
  notifyClockinEvent,
  getDailySummary,
  getMemberWorkBlock,
  getMembersWorkBlocks,
} from '../controllers/clockinsController.js';

const clockinsRouter = Router();

clockinsRouter.get('/:businessId', listClockins);
clockinsRouter.get('/:businessId/active', listActiveNow);
clockinsRouter.get('/:businessId/stats', getStats);
clockinsRouter.get('/:businessId/performance', getPerformance);
clockinsRouter.get('/:businessId/org-status', getOrgClockStatus);
clockinsRouter.get('/:businessId/absenteeism', getAbsenteeism);
clockinsRouter.get('/:businessId/overtime', getOvertime);
clockinsRouter.get('/:businessId/labor-cost', getLaborCost);
clockinsRouter.get('/:businessId/payroll-summary', getPayrollSummary);
clockinsRouter.get('/:businessId/export', exportClockins);
clockinsRouter.get('/:businessId/cross-check', crossCheck);
clockinsRouter.get('/:businessId/work-blocks', getMembersWorkBlocks);
clockinsRouter.get('/:businessId/work-block/:memberId', getMemberWorkBlock);
clockinsRouter.put('/:businessId/adjust', adjustClockinEntry);
clockinsRouter.post('/:businessId/check-in', checkInMember);
clockinsRouter.put('/:businessId/record/:recordId/entry', appendClockinEntry);
// El propio trabajador notifica al equipo de gestión cuando ficha (entrada,
// salida, descanso). El backend resuelve a quién avisar y emite SSE + push.
clockinsRouter.post('/:businessId/notify', notifyClockinEvent);
// Resumen del día (scheduled vs clocked, retrasos, no-shows...) para dashboards.
clockinsRouter.get('/:businessId/daily-summary', getDailySummary);

export { clockinsRouter };
