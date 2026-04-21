import { Router } from 'express';
import {
  listPurchaseEntries,
  createPurchaseEntry,
  updatePurchaseEntry,
  deletePurchaseEntry,
  confirmPurchaseEntry,
  validatePurchaseEntry,
  getPurchaseEntryStats,
  previewBatchCode,
  createFromOcr,
  linkInvoice,
  attachDocument,
  createFinanceFromEntry,
  searchSuppliers,
  searchProducts,
  searchInvoices,
} from '../controllers/butcherPurchaseController.js';

const butcherPurchaseRouter = Router();

butcherPurchaseRouter.get('/:userId/stats', getPurchaseEntryStats);
butcherPurchaseRouter.get('/:userId/batch-code', previewBatchCode);
butcherPurchaseRouter.get('/:userId/suppliers', searchSuppliers);
butcherPurchaseRouter.get('/:userId/products', searchProducts);
butcherPurchaseRouter.get('/:userId/invoices', searchInvoices);

butcherPurchaseRouter.get('/:userId', listPurchaseEntries);
butcherPurchaseRouter.post('/:userId', createPurchaseEntry);
butcherPurchaseRouter.post('/:userId/from-ocr', createFromOcr);

butcherPurchaseRouter.post('/:userId/:entryId/confirm', confirmPurchaseEntry);
butcherPurchaseRouter.post('/:userId/:entryId/validate', validatePurchaseEntry);
butcherPurchaseRouter.post('/:userId/:entryId/link-invoice', linkInvoice);
butcherPurchaseRouter.post('/:userId/:entryId/attach-document', attachDocument);
butcherPurchaseRouter.post('/:userId/:entryId/finance', createFinanceFromEntry);
butcherPurchaseRouter.put('/:userId/:entryId', updatePurchaseEntry);
butcherPurchaseRouter.delete('/:userId/:entryId', deletePurchaseEntry);

export { butcherPurchaseRouter };
