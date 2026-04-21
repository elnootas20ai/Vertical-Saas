import { Router } from 'express';
import {
  listMovements,
  getMovementsByItem,
  getMovementsByWarehouse,
  getSummary,
  createAdjustment,
  createTransfer,
  createInternalConsumption,
} from '../controllers/stockMovementController.js';

const stockMovementRouter = Router();

stockMovementRouter.get('/:userId/summary', getSummary);
stockMovementRouter.get('/:userId/item/:catalogItemId', getMovementsByItem);
stockMovementRouter.get('/:userId/warehouse/:warehouseId', getMovementsByWarehouse);
stockMovementRouter.get('/:userId', listMovements);

stockMovementRouter.post('/:userId/adjustment', createAdjustment);
stockMovementRouter.post('/:userId/transfer', createTransfer);
stockMovementRouter.post('/:userId/internal-consumption', createInternalConsumption);

export { stockMovementRouter };
