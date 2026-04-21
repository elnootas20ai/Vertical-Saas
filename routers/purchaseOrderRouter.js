import { Router } from 'express';
import {
  listPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  removePurchaseOrder,
  triggerAutoOrders,
  getLowStockReport,
  markOrderReceived,
  approvePurchaseOrder,
  receiveWithInvoice,
  getSalesForecast,
  getPurchaseKpis,
  getSuggestions,
  getSmartPurchaseList,
  sendPurchaseOrder,
  createBulkPurchaseOrders,
} from '../controllers/purchaseOrderController.js';

const purchaseOrderRouter = Router();

purchaseOrderRouter.get('/:userId/low-stock', getLowStockReport);
purchaseOrderRouter.get('/:userId/forecast', getSalesForecast);
purchaseOrderRouter.get('/:userId/suggestions', getSuggestions);
purchaseOrderRouter.get('/:userId/smart-list', getSmartPurchaseList);
purchaseOrderRouter.get('/:userId/kpis', getPurchaseKpis);
purchaseOrderRouter.post('/:userId/auto-generate', triggerAutoOrders);
purchaseOrderRouter.post('/:userId/bulk', createBulkPurchaseOrders);

purchaseOrderRouter.get('/:userId', listPurchaseOrders);
purchaseOrderRouter.post('/:userId', createPurchaseOrder);

purchaseOrderRouter.post('/:userId/:orderId/approve', approvePurchaseOrder);
purchaseOrderRouter.post('/:userId/:orderId/send', sendPurchaseOrder);
purchaseOrderRouter.post('/:userId/:orderId/receive', markOrderReceived);
purchaseOrderRouter.post('/:userId/:orderId/receive-with-invoice', receiveWithInvoice);
purchaseOrderRouter.put('/:userId/:orderId', updatePurchaseOrder);
purchaseOrderRouter.delete('/:userId/:orderId', removePurchaseOrder);

export { purchaseOrderRouter };
