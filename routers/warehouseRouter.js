import { Router } from 'express';
import {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
} from '../controllers/warehouseController.js';

const warehouseRouter = Router();

warehouseRouter.get('/:userId', listWarehouses);
warehouseRouter.post('/:userId', createWarehouse);
warehouseRouter.put('/:userId/:warehouseId', updateWarehouse);
warehouseRouter.delete('/:userId/:warehouseId', removeWarehouse);

export { warehouseRouter };
