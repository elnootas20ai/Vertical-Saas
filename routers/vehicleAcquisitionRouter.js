import { Router } from 'express';
import {
  listAcquisitions,
  getAcquisition,
  createAcquisition,
  updateAcquisition,
  changeStatus,
  approveAcquisition,
  rejectAcquisition,
  deleteAcquisition,
  getAcquisitionsByVehicle,
  getAcquisitionsBySeller,
  getAcquisitionStats,
  getEconomicHistory,
} from '../controllers/vehicleAcquisitionController.js';

const vehicleAcquisitionRouter = Router();

vehicleAcquisitionRouter.get('/:userId', listAcquisitions);
vehicleAcquisitionRouter.get('/:userId/stats', getAcquisitionStats);
vehicleAcquisitionRouter.get('/:userId/vehicle/:vehicleId', getAcquisitionsByVehicle);
vehicleAcquisitionRouter.get('/:userId/vehicle/:vehicleId/economic-history', getEconomicHistory);
vehicleAcquisitionRouter.get('/:userId/seller/:sellerId', getAcquisitionsBySeller);
vehicleAcquisitionRouter.get('/:userId/:id', getAcquisition);
vehicleAcquisitionRouter.post('/:userId', createAcquisition);
vehicleAcquisitionRouter.put('/:userId/:id', updateAcquisition);
vehicleAcquisitionRouter.patch('/:userId/:id/status', changeStatus);
vehicleAcquisitionRouter.post('/:userId/:id/approve', approveAcquisition);
vehicleAcquisitionRouter.post('/:userId/:id/reject', rejectAcquisition);
vehicleAcquisitionRouter.delete('/:userId/:id', deleteAcquisition);

export { vehicleAcquisitionRouter };
