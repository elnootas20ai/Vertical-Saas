import { Router } from 'express';
import {
  listMaterials, createMaterial, updateMaterial, removeMaterial, materialsSummary,
  listDeliveries, getDelivery, createDelivery, updateDelivery, confirmDelivery, removeDelivery,
  listReturns, createReturn, updateReturn, acceptReturn,
  listRequests, createRequest, approveRequest, rejectRequest,
  listInventoryCounts, createInventoryCount, updateInventoryCount, approveInventoryCount,
  registerServiceConsumption, getServiceConsumption,
} from '../controllers/cleaningMaterialsController.js';

const cleaningMaterialsRouter = Router();

// Materials (catalog items with subtype: cleaning_material)
cleaningMaterialsRouter.get('/materials/:userId', listMaterials);
cleaningMaterialsRouter.post('/materials/:userId', createMaterial);
cleaningMaterialsRouter.get('/materials/:userId/summary', materialsSummary);
cleaningMaterialsRouter.put('/materials/:userId/:materialId', updateMaterial);
cleaningMaterialsRouter.delete('/materials/:userId/:materialId', removeMaterial);

// Deliveries (entregas de material a trabajador)
cleaningMaterialsRouter.get('/deliveries/:userId', listDeliveries);
cleaningMaterialsRouter.post('/deliveries/:userId', createDelivery);
cleaningMaterialsRouter.get('/deliveries/:userId/:deliveryId', getDelivery);
cleaningMaterialsRouter.put('/deliveries/:userId/:deliveryId', updateDelivery);
cleaningMaterialsRouter.post('/deliveries/:userId/:deliveryId/confirm', confirmDelivery);
cleaningMaterialsRouter.delete('/deliveries/:userId/:deliveryId', removeDelivery);

// Returns (devoluciones)
cleaningMaterialsRouter.get('/returns/:userId', listReturns);
cleaningMaterialsRouter.post('/returns/:userId', createReturn);
cleaningMaterialsRouter.put('/returns/:userId/:returnId', updateReturn);
cleaningMaterialsRouter.post('/returns/:userId/:returnId/accept', acceptReturn);

// Requests (solicitudes del trabajador)
cleaningMaterialsRouter.get('/requests/:userId', listRequests);
cleaningMaterialsRouter.post('/requests/:userId', createRequest);
cleaningMaterialsRouter.post('/requests/:userId/:requestId/approve', approveRequest);
cleaningMaterialsRouter.post('/requests/:userId/:requestId/reject', rejectRequest);

// Inventory counts
cleaningMaterialsRouter.get('/inventory/:userId', listInventoryCounts);
cleaningMaterialsRouter.post('/inventory/:userId', createInventoryCount);
cleaningMaterialsRouter.put('/inventory/:userId/:countId', updateInventoryCount);
cleaningMaterialsRouter.post('/inventory/:userId/:countId/approve', approveInventoryCount);

// Service consumption (MAT-04)
cleaningMaterialsRouter.get('/consumption/:userId/:serviceId', getServiceConsumption);
cleaningMaterialsRouter.post('/consumption/:userId/:serviceId', registerServiceConsumption);

export { cleaningMaterialsRouter };
