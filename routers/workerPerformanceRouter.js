import { Router } from 'express';
import { getWorkerPerformance } from '../controllers/workerPerformanceController.js';

const workerPerformanceRouter = Router();

workerPerformanceRouter.get('/:userId', getWorkerPerformance);

export { workerPerformanceRouter };
