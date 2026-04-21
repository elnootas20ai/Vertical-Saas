import { Router } from 'express';
import {
  listWaste,
  recordWaste,
  reviewWaste,
  getWasteSummary,
  getWasteRate,
} from '../controllers/wasteController.js';

const wasteRouter = Router();

wasteRouter.get('/:userId/summary', getWasteSummary);
wasteRouter.get('/:userId/rate/:catalogItemId', getWasteRate);
wasteRouter.get('/:userId', listWaste);
wasteRouter.post('/:userId', recordWaste);
wasteRouter.put('/:userId/:wasteId/review', reviewWaste);

export { wasteRouter };
