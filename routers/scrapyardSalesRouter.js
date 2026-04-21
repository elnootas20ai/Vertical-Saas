import { Router } from 'express';
import {
  listScrapyardSales,
  getScrapyardSale,
  createScrapyardSale,
  updateScrapyardSale,
  removeScrapyardSale,
  registerScrapyardPayment,
  changeScrapyardStatus,
  getScrapyardSalesMetrics,
} from '../controllers/scrapyardSalesController.js';

const scrapyardSalesRouter = Router();

scrapyardSalesRouter.get('/:userId/metrics', getScrapyardSalesMetrics);
scrapyardSalesRouter.get('/:userId', listScrapyardSales);
scrapyardSalesRouter.get('/:userId/:saleId', getScrapyardSale);
scrapyardSalesRouter.post('/:userId', createScrapyardSale);
scrapyardSalesRouter.put('/:userId/:saleId', updateScrapyardSale);
scrapyardSalesRouter.delete('/:userId/:saleId', removeScrapyardSale);
scrapyardSalesRouter.post('/:userId/:saleId/payment', registerScrapyardPayment);
scrapyardSalesRouter.post('/:userId/:saleId/status', changeScrapyardStatus);

export { scrapyardSalesRouter };
