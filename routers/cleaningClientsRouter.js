import { Router } from 'express';
import {
  listCleaningClients,
  getCleaningClientProfile,
  getCleaningClientStats,
  listCleaningClientAlerts,
  dismissCleaningClientAlert,
  listClientLocationsEndpoint,
  createClientLocation,
  updateClientLocation,
  removeClientLocation,
  getCleaningClientProfitability,
  getPortfolioProfitability,
} from '../controllers/cleaningClientsController.js';

const cleaningClientsRouter = Router();

cleaningClientsRouter.get('/:userId', listCleaningClients);
cleaningClientsRouter.get('/:userId/stats', getCleaningClientStats);
cleaningClientsRouter.get('/:userId/alerts', listCleaningClientAlerts);
cleaningClientsRouter.get('/:userId/profitability', getPortfolioProfitability);

cleaningClientsRouter.post('/:userId/alerts/:alertId/dismiss', dismissCleaningClientAlert);

cleaningClientsRouter.get('/:userId/:clientId', getCleaningClientProfile);
cleaningClientsRouter.get('/:userId/:clientId/profitability', getCleaningClientProfitability);
cleaningClientsRouter.get('/:userId/:clientId/locations', listClientLocationsEndpoint);
cleaningClientsRouter.post('/:userId/:clientId/locations', createClientLocation);
cleaningClientsRouter.put('/:userId/:clientId/locations/:locationId', updateClientLocation);
cleaningClientsRouter.delete('/:userId/:clientId/locations/:locationId', removeClientLocation);

export { cleaningClientsRouter };
