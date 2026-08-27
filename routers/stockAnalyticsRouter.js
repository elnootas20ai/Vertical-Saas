import { Router } from 'express';
import { getKpi, getBlock, listMeta, getOverview, getReport, getInsights } from '../controllers/stockAnalyticsController.js';

const stockAnalyticsRouter = Router();

stockAnalyticsRouter.get('/:userId/meta', listMeta);
stockAnalyticsRouter.get('/:userId/overview', getOverview);
stockAnalyticsRouter.get('/:userId/insights', getInsights);
stockAnalyticsRouter.get('/:userId/report/:reportId', getReport);
stockAnalyticsRouter.get('/:userId/kpi/:kpiId', getKpi);
stockAnalyticsRouter.get('/:userId/block/:blockId', getBlock);

export { stockAnalyticsRouter };
