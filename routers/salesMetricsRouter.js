import { Router } from 'express';
import { getSalesMetrics } from '../controllers/salesMetricsController.js';

const salesMetricsRouter = Router();

salesMetricsRouter.get('/:userId', getSalesMetrics);

export { salesMetricsRouter };
