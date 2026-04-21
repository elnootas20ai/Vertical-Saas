import { Router } from 'express';
import {
  listButcherClients,
  createButcherClient,
  getButcherClient,
  updateButcherClient,
  deleteButcherClient,
  searchButcherClients,
  getButcherClientHistory,
  analyzeButcherClientHabits,
  linkButcherClientToCrm,
  unlinkButcherClientFromCrm,
} from '../controllers/butcherClientsController.js';

const butcherClientsRouter = Router();

butcherClientsRouter.get('/:userId', listButcherClients);
butcherClientsRouter.post('/:userId', createButcherClient);
butcherClientsRouter.get('/:userId/search', searchButcherClients);
butcherClientsRouter.get('/:userId/:clientId', getButcherClient);
butcherClientsRouter.put('/:userId/:clientId', updateButcherClient);
butcherClientsRouter.delete('/:userId/:clientId', deleteButcherClient);
butcherClientsRouter.get('/:userId/:clientId/history', getButcherClientHistory);
butcherClientsRouter.post('/:userId/:clientId/analyze-habits', analyzeButcherClientHabits);
butcherClientsRouter.post('/:userId/:clientId/link-crm', linkButcherClientToCrm);
butcherClientsRouter.delete('/:userId/:clientId/link-crm', unlinkButcherClientFromCrm);

export { butcherClientsRouter };
