import { Router } from 'express';
import {
  getPublicStorefront,
  getPublicShippingRates,
  createPublicOrder,
  getWebConfig,
  saveWebConfig,
  getDeliveryIntegrations,
  saveDeliveryIntegrations,
  listWebOrders,
  updateWebOrder,
} from '../controllers/webController.js';
import { getPublicMesaByToken } from '../controllers/mesaQrController.js';

const webPublicRouter = Router();
webPublicRouter.get('/storefront/:slug', getPublicStorefront);
webPublicRouter.post('/storefront/:slug/shipping-rates', getPublicShippingRates);
webPublicRouter.post('/storefront/:slug/orders', createPublicOrder);
webPublicRouter.get('/mesa/:token', getPublicMesaByToken);

const webProtectedRouter = Router();
webProtectedRouter.get('/config/:businessId', getWebConfig);
webProtectedRouter.put('/config/:businessId', saveWebConfig);
webProtectedRouter.get('/integrations/:businessId', getDeliveryIntegrations);
webProtectedRouter.put('/integrations/:businessId', saveDeliveryIntegrations);
webProtectedRouter.get('/orders/:businessId', listWebOrders);
webProtectedRouter.put('/orders/:businessId/:orderId', updateWebOrder);

export { webPublicRouter, webProtectedRouter };
