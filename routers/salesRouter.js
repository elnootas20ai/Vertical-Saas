import { Router } from 'express';
import { listSales, createSale, updateSale, removeSale } from '../controllers/salesController.js';

const salesRouter = Router();

salesRouter.get('/:userId', listSales);
salesRouter.post('/:userId', createSale);
salesRouter.put('/:userId/:saleId', updateSale);
salesRouter.delete('/:userId/:saleId', removeSale);

export { salesRouter };
