import { Router } from 'express';
import {
  listTradeIns,
  createTradeIn,
  updateTradeIn,
  deleteTradeIn,
  acceptTradeIn,
  rejectTradeIn,
} from '../controllers/tradeInController.js';

const tradeInRouter = Router();

tradeInRouter.get('/:userId', listTradeIns);
tradeInRouter.post('/:userId', createTradeIn);
tradeInRouter.post('/:userId/:tradeInId/accept', acceptTradeIn);
tradeInRouter.post('/:userId/:tradeInId/reject', rejectTradeIn);
tradeInRouter.put('/:userId/:tradeInId', updateTradeIn);
tradeInRouter.delete('/:userId/:tradeInId', deleteTradeIn);

export { tradeInRouter };
