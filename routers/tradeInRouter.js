import { Router } from 'express';
import { listTradeIns, createTradeIn, updateTradeIn, deleteTradeIn } from '../controllers/tradeInController.js';

const tradeInRouter = Router();

tradeInRouter.get('/:userId', listTradeIns);
tradeInRouter.post('/:userId', createTradeIn);
tradeInRouter.put('/:userId/:tradeInId', updateTradeIn);
tradeInRouter.delete('/:userId/:tradeInId', deleteTradeIn);

export { tradeInRouter };
