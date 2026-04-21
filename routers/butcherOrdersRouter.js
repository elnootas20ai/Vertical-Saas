import { Router } from 'express';
import {
  listButcherOrders,
  createButcherOrder,
  getButcherOrder,
  updateButcherOrder,
  updateButcherOrderStatus,
  deleteButcherOrder,
  getButcherOrdersToday,
  convertOrderToSale,
} from '../controllers/butcherOrdersController.js';

const butcherOrdersRouter = Router();

butcherOrdersRouter.get('/:userId', listButcherOrders);
butcherOrdersRouter.post('/:userId', createButcherOrder);
butcherOrdersRouter.get('/:userId/today', getButcherOrdersToday);
butcherOrdersRouter.get('/:userId/:orderId', getButcherOrder);
butcherOrdersRouter.put('/:userId/:orderId', updateButcherOrder);
butcherOrdersRouter.patch('/:userId/:orderId/status', updateButcherOrderStatus);
butcherOrdersRouter.post('/:userId/:orderId/convert-sale', convertOrderToSale);
butcherOrdersRouter.delete('/:userId/:orderId', deleteButcherOrder);

export { butcherOrdersRouter };
