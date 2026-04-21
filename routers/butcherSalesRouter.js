import { Router } from 'express';
import {
  listButcherSales,
  createButcherSale,
  getButcherSale,
  voidButcherSale,
  getButcherSalesToday,
  getButcherSalesStats,
} from '../controllers/butcherSalesController.js';

const butcherSalesRouter = Router();

butcherSalesRouter.get('/:userId', listButcherSales);
butcherSalesRouter.post('/:userId', createButcherSale);
butcherSalesRouter.get('/:userId/today', getButcherSalesToday);
butcherSalesRouter.get('/:userId/stats', getButcherSalesStats);
butcherSalesRouter.get('/:userId/:saleId', getButcherSale);
butcherSalesRouter.patch('/:userId/:saleId/void', voidButcherSale);

export { butcherSalesRouter };
