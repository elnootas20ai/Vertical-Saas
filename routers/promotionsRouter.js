import { Router } from 'express';
import {
  listPromotions,
  createPromotion,
  updatePromotion,
  removePromotion,
  syncPromotions,
} from '../controllers/promotionsController.js';

const promotionsRouter = Router();

promotionsRouter.get('/:userId', listPromotions);
promotionsRouter.post('/:userId/sync', syncPromotions);
promotionsRouter.post('/:userId', createPromotion);
promotionsRouter.put('/:userId/:promotionId', updatePromotion);
promotionsRouter.delete('/:userId/:promotionId', removePromotion);

export { promotionsRouter };
