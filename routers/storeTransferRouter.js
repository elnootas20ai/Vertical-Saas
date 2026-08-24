import { Router } from 'express';
import {
  listTransfers,
  listDestinations,
  createTransfer,
  receiveTransfer,
  cancelTransfer,
} from '../controllers/storeTransferController.js';

const storeTransferRouter = Router();

storeTransferRouter.get('/:userId/destinations', listDestinations);
storeTransferRouter.get('/:userId', listTransfers);

storeTransferRouter.post('/:userId', createTransfer);
storeTransferRouter.post('/:userId/:transferId/receive', receiveTransfer);
storeTransferRouter.post('/:userId/:transferId/cancel', cancelTransfer);

export { storeTransferRouter };
