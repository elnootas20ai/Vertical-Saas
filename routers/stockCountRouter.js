import { Router } from 'express';
import {
  listStockCounts,
  createStockCount,
  getStockCount,
  updateCountLine,
  completeStockCount,
  generateAdjustments,
  getStockCountPurchaseList,
  createPurchaseOrdersFromStockCount,
} from '../controllers/stockCountController.js';

const stockCountRouter = Router();

stockCountRouter.get('/:userId', listStockCounts);
stockCountRouter.post('/:userId', createStockCount);
stockCountRouter.get('/:userId/:countId/purchase-list', getStockCountPurchaseList);
stockCountRouter.post('/:userId/:countId/purchase-list/create-orders', createPurchaseOrdersFromStockCount);
stockCountRouter.get('/:userId/:countId', getStockCount);
stockCountRouter.put('/:userId/:countId/line/:lineIdx', updateCountLine);
stockCountRouter.post('/:userId/:countId/complete', completeStockCount);
stockCountRouter.post('/:userId/:countId/generate-adjustments', generateAdjustments);

export { stockCountRouter };
