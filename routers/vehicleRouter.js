import { Router } from 'express';
import {
  bulkCreateVehicles,
  checkDuplicates,
  createVehicle,
  listVehicles,
  removeVehicle,
  updateVehicle,
  updateCommercialStatus,
  addWarranty,
  updateWarranty,
  deleteWarranty,
  addWarrantyClaim,
  addAssociatedCost,
  deleteAssociatedCost,
  addVehicleDocument,
  updateVehicleDocument,
  removeVehicleDocument,
} from '../controllers/vehicleController.js';

const vehicleRouter = Router();

vehicleRouter.get('/:userId', listVehicles);
vehicleRouter.post('/:userId', createVehicle);
vehicleRouter.post('/:userId/bulk', bulkCreateVehicles);
vehicleRouter.post('/:userId/check-duplicates', checkDuplicates);
vehicleRouter.put('/:userId/:vehicleId', updateVehicle);
vehicleRouter.delete('/:userId/:vehicleId', removeVehicle);

// Commercial status
vehicleRouter.put('/:userId/:vehicleId/commercial-status', updateCommercialStatus);

// Warranties
vehicleRouter.post('/:userId/:vehicleId/warranties', addWarranty);
vehicleRouter.put('/:userId/:vehicleId/warranties/:warrantyId', updateWarranty);
vehicleRouter.delete('/:userId/:vehicleId/warranties/:warrantyId', deleteWarranty);
vehicleRouter.post('/:userId/:vehicleId/warranties/:warrantyId/claims', addWarrantyClaim);

// Associated costs
vehicleRouter.post('/:userId/:vehicleId/costs', addAssociatedCost);
vehicleRouter.delete('/:userId/:vehicleId/costs/:costId', deleteAssociatedCost);

// Vehicle documents
vehicleRouter.post('/:userId/:vehicleId/documents', addVehicleDocument);
vehicleRouter.put('/:userId/:vehicleId/documents/:documentId', updateVehicleDocument);
vehicleRouter.delete('/:userId/:vehicleId/documents/:documentId', removeVehicleDocument);

export { vehicleRouter };
