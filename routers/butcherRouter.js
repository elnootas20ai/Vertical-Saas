import { Router } from 'express';
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listBatches, createBatch, updateBatch, deleteBatch,
  listWaste, createWaste, getWasteSummary, reviewButcherWaste, getButcherWasteRate, getButcherWasteReporting,
  listScales, createScale, updateScale, pingScale,
  listInventoryCounts, createInventoryCount, getDiscrepancies,
  getButcherAlertsSummary,
} from '../controllers/butcherController.js';

const butcherRouter = Router();

butcherRouter.get('/products/:userId', listProducts);
butcherRouter.post('/products/:userId', createProduct);
butcherRouter.put('/products/:userId/:productId', updateProduct);
butcherRouter.delete('/products/:userId/:productId', deleteProduct);

butcherRouter.get('/batches/:userId', listBatches);
butcherRouter.post('/batches/:userId', createBatch);
butcherRouter.put('/batches/:userId/:batchId', updateBatch);
butcherRouter.delete('/batches/:userId/:batchId', deleteBatch);

butcherRouter.get('/waste/:userId/summary', getWasteSummary);
butcherRouter.get('/waste/:userId/reporting', getButcherWasteReporting);
butcherRouter.get('/waste/:userId/rate/:catalogItemId', getButcherWasteRate);
butcherRouter.get('/waste/:userId', listWaste);
butcherRouter.post('/waste/:userId', createWaste);
butcherRouter.put('/waste/:userId/:wasteId/review', reviewButcherWaste);

butcherRouter.get('/scales/:businessId', listScales);
butcherRouter.post('/scales/:businessId', createScale);
butcherRouter.put('/scales/:businessId/:scaleId', updateScale);
butcherRouter.post('/scales/:businessId/:scaleId/ping', pingScale);

butcherRouter.get('/inventory/:userId/discrepancies', getDiscrepancies);
butcherRouter.get('/inventory/:userId', listInventoryCounts);
butcherRouter.post('/inventory/:userId', createInventoryCount);

butcherRouter.get('/alerts/:userId/summary', getButcherAlertsSummary);

export { butcherRouter };
