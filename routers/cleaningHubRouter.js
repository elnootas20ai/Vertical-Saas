/**
 * Cleaning Hub Router — Rutas del dashboard de limpieza
 *
 * Sirve los endpoints que espera cleaningHubApi.ts del frontend.
 */

import { Router } from 'express';
import {
  getCleaningHubKpis,
  getCleaningHubToday,
  getCleaningHubAlerts,
  getCleaningHubWorkers,
  getCleaningHubMaterials,
  getCleaningHubMetrics,
} from '../controllers/cleaningHubController.js';

export const cleaningHubRouter = Router();

cleaningHubRouter.get('/kpis/:userId', getCleaningHubKpis);
cleaningHubRouter.get('/today/:userId', getCleaningHubToday);
cleaningHubRouter.get('/alerts/:userId', getCleaningHubAlerts);
cleaningHubRouter.get('/workers/:userId', getCleaningHubWorkers);
cleaningHubRouter.get('/materials/:userId', getCleaningHubMaterials);
cleaningHubRouter.get('/metrics/:userId', getCleaningHubMetrics);
