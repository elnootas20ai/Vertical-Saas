import { Router } from 'express';
import {
  listWorkOrders,
  createWorkOrder,
  updateWorkOrder,
  removeWorkOrder,
  listParts,
  createPart,
  updatePart,
  removePart,
} from '../controllers/workshopController.js';

const workshopRouter = Router();

// Work Orders
workshopRouter.get('/orders/:userId', listWorkOrders);
workshopRouter.post('/orders/:userId', createWorkOrder);
workshopRouter.put('/orders/:userId/:workOrderId', updateWorkOrder);
workshopRouter.delete('/orders/:userId/:workOrderId', removeWorkOrder);

// Parts (recambios/inventario)
workshopRouter.get('/parts/:userId', listParts);
workshopRouter.post('/parts/:userId', createPart);
workshopRouter.put('/parts/:userId/:partId', updatePart);
workshopRouter.delete('/parts/:userId/:partId', removePart);

export { workshopRouter };
