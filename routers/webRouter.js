import { Router } from 'express';
import {
  getPublicStorefront,
  getPublicStorefrontByHost,
  getPublicShippingRates,
  createPublicOrder,
  getWebConfig,
  saveWebConfig,
  getDeliveryIntegrations,
  saveDeliveryIntegrations,
  listWebOrders,
  updateWebOrder,
  acceptPublicOrder,
  rejectPublicOrder,
  verifyWebCustomDomain,
  getPublicCustomerKiosk,
  getCustomerKiosks,
  createCustomerKiosk,
  deleteCustomerKiosk,
} from '../controllers/webController.js';
import { getPublicMesaByToken } from '../controllers/mesaQrController.js';
import { requireBusinessAccess } from '../middleware/requireBusinessAccess.js';
import { burstLimiter } from '../middleware/rateLimiter.js';

const webPublicRouter = Router();
webPublicRouter.get('/host-storefront', getPublicStorefrontByHost);
webPublicRouter.get('/kiosk/:token', getPublicCustomerKiosk);
webPublicRouter.get('/storefront/:slug', getPublicStorefront);
webPublicRouter.post('/storefront/:slug/shipping-rates', burstLimiter, getPublicShippingRates);
webPublicRouter.post('/storefront/:slug/orders', burstLimiter, createPublicOrder);
webPublicRouter.get('/mesa/:token', getPublicMesaByToken);

const webProtectedRouter = Router();
webProtectedRouter.use(requireBusinessAccess);
webProtectedRouter.get('/config/:businessId', getWebConfig);
webProtectedRouter.put('/config/:businessId', saveWebConfig);
webProtectedRouter.post('/config/:businessId/verify-domain', verifyWebCustomDomain);
webProtectedRouter.get('/kiosks/:businessId', getCustomerKiosks);
webProtectedRouter.post('/kiosks/:businessId', createCustomerKiosk);
webProtectedRouter.delete('/kiosks/:businessId/:kioskId', deleteCustomerKiosk);
webProtectedRouter.get('/integrations/:businessId', getDeliveryIntegrations);
webProtectedRouter.put('/integrations/:businessId', saveDeliveryIntegrations);
webProtectedRouter.get('/orders/:businessId', listWebOrders);
webProtectedRouter.put('/orders/:businessId/:orderId', updateWebOrder);
webProtectedRouter.post('/orders/:businessId/:orderId/accept', acceptPublicOrder);
webProtectedRouter.post('/orders/:businessId/:orderId/reject', rejectPublicOrder);

export { webPublicRouter, webProtectedRouter };
