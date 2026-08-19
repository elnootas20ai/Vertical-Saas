import { Router } from 'express';
import multer from 'multer';
import { resolveDataOwnerUserId } from '../services/couchdb.js';
import {
  listDeliveryOrders,
  createDeliveryOrder,
  updateDeliveryOrder,
  removeDeliveryOrder,
  cancelDeliveryOrder,
  reopenDeliveryOrder,
  refundDeliveryOrder,
  registerPayment,
  correctDeliveryOrderPayment,
  filterDeliveryOrders,
  clientOrderHistory,
  listCatalogItems,
  createCatalogItem,
  bulkCreateCatalogItems,
  bulkPatchCatalogItems,
  bulkApplyStaffPrices,
  bulkUpdateCatalogStock,
  bulkRemoveCatalogItems,
  updateCatalogItem,
  removeCatalogItem,
  listSuppliers,
  createSupplier,
  updateSupplier,
  removeSupplier,
  listPurchaseInvoices,
  createPurchaseInvoice,
  updatePurchaseInvoice,
  removePurchaseInvoice,
  validatePurchaseInvoice,
  rejectPurchaseInvoice,
  checkDuplicateInvoice,
  loadPurchaseInvoiceToStock,
  uploadInvoicePdf,
  getInvoicePdf,
  listDriverCashSessions,
  createDriverCashSession,
  updateDriverCashSession,
  removeDriverCashSession,
  listTpvRegisterSessions,
  listCajaBootstrap,
  createTpvRegisterSession,
  reopenTpvRegisterSession,
  updateTpvRegisterSession,
  removeTpvRegisterSession,
  listPointsOfSale,
  createPointOfSale,
  updatePointOfSale,
  removePointOfSale,
  regeneratePointOfSaleTerminalCode,
  listPdvTpvDevices,
  approvePdvTpvDevice,
  rejectPdvTpvDevice,
  revokePdvTpvDevice,
  unblockPdvTpvDevice,
  getDeliveryConfig,
  updateDeliveryConfig,
  listStaffConsumptions,
  createStaffConsumption,
  getOpsCenter,
  listDrivers,
  createDriver,
  updateDriver,
  removeDriver,
  getDriversStats,
  getRepartoConfig,
  saveRepartoConfig,
  autoAssignDriver,
  listScaleDevices,
  getScaleDevice,
  createScaleDevice,
  updateScaleDevice,
  removeScaleDevice,
  assignScaleToTerminal,
  getTerminalScale,
  reportScaleStatus,
} from '../controllers/deliveryController.js';

const invoiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const deliveryRouter = Router();

/**
 * Multi-tenant: si el `:userId` de la URL pertenece a un team member invitado,
 * reescribimos el param al userId del propietario del negocio. Así todos los
 * controladores aguas abajo operan contra los datos compartidos del negocio
 * (pedidos, PDVs, catálogo, sesiones de TPV…) en vez de contra el "vacío" del
 * worker. El caller original queda en `req.callerUserId`/`req.callerAccount`
 * para que los controladores apliquen filtros por worker cuando corresponda
 * (p.ej. su `employment.salesPointId`).
 *
 * Usamos `router.param` para que se ejecute en cualquier ruta con `:userId`
 * independientemente de la posición (`/orders/:userId`, `/catalog/:userId`…).
 */
deliveryRouter.param('userId', async (req, res, next, rawUserId) => {
  try {
    if (!rawUserId) return next();
    // Evitar resolver dos veces si ya pasó por aquí (rutas anidadas).
    if (req.callerUserId) return next();

    const authUserId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
    const authResolution = authUserId
      ? await resolveDataOwnerUserId(req, authUserId)
      : { ownerUserId: authUserId, account: null, isInvited: false };
    const urlResolution = await resolveDataOwnerUserId(req, rawUserId);

    const callerIsWorker = Boolean(authResolution.isInvited);
    const callerAccount = callerIsWorker ? authResolution.account : urlResolution.account;
    const callerUserId = callerIsWorker ? authUserId : rawUserId;

    let dataUserId = rawUserId;
    if (callerIsWorker && authResolution.ownerUserId) {
      dataUserId = authResolution.ownerUserId;
    } else if (urlResolution.isInvited && urlResolution.ownerUserId) {
      dataUserId = urlResolution.ownerUserId;
    }

    req.callerUserId = callerUserId;
    req.callerAccount = callerAccount;
    req.callerIsWorker = callerIsWorker;
    if (dataUserId && dataUserId !== rawUserId) {
      req.params.userId = dataUserId;
    }
    return next();
  } catch (err) {
    // No bloqueamos: legacy fallback al userId tal cual.
    console.error('[deliveryRouter] resolveDataOwnerUserId error:', err?.message || err);
    return next();
  }
});

deliveryRouter.get('/orders/:userId', listDeliveryOrders);
deliveryRouter.get('/orders/:userId/filter', filterDeliveryOrders);
deliveryRouter.get('/orders/:userId/client/:clientId/history', clientOrderHistory);
deliveryRouter.post('/orders/:userId', createDeliveryOrder);
deliveryRouter.put('/orders/:userId/:orderId', updateDeliveryOrder);
deliveryRouter.put('/orders/:userId/:orderId/cancel', cancelDeliveryOrder);
deliveryRouter.put('/orders/:userId/:orderId/reopen', reopenDeliveryOrder);
deliveryRouter.put('/orders/:userId/:orderId/refund', refundDeliveryOrder);
deliveryRouter.put('/orders/:userId/:orderId/payment', registerPayment);
deliveryRouter.put('/orders/:userId/:orderId/payment-method', correctDeliveryOrderPayment);
deliveryRouter.delete('/orders/:userId/:orderId', removeDeliveryOrder);

deliveryRouter.get('/catalog/:userId', listCatalogItems);
deliveryRouter.post('/catalog/:userId', createCatalogItem);
deliveryRouter.post('/catalog/:userId/bulk', bulkCreateCatalogItems);
deliveryRouter.post('/catalog/:userId/bulk-patch', bulkPatchCatalogItems);
deliveryRouter.post('/catalog/:userId/bulk-delete', bulkRemoveCatalogItems);
deliveryRouter.post('/catalog/:userId/bulk-staff-prices', bulkApplyStaffPrices);
deliveryRouter.post('/catalog/:userId/bulk-stock', bulkUpdateCatalogStock);
deliveryRouter.put('/catalog/:userId/:itemId', updateCatalogItem);
deliveryRouter.delete('/catalog/:userId/:itemId', removeCatalogItem);

deliveryRouter.get('/suppliers/:userId', listSuppliers);
deliveryRouter.post('/suppliers/:userId', createSupplier);
deliveryRouter.put('/suppliers/:userId/:supplierId', updateSupplier);
deliveryRouter.delete('/suppliers/:userId/:supplierId', removeSupplier);

deliveryRouter.get('/invoices/:userId', listPurchaseInvoices);
deliveryRouter.post('/invoices/:userId', createPurchaseInvoice);
deliveryRouter.post('/invoices/:userId/check-duplicate', checkDuplicateInvoice);
deliveryRouter.post('/invoices/:userId/:invoiceId/load-stock', loadPurchaseInvoiceToStock);
deliveryRouter.put('/invoices/:userId/:invoiceId', updatePurchaseInvoice);
deliveryRouter.put('/invoices/:userId/:invoiceId/validate', validatePurchaseInvoice);
deliveryRouter.put('/invoices/:userId/:invoiceId/reject', rejectPurchaseInvoice);
deliveryRouter.post('/invoices/:userId/:invoiceId/pdf', invoiceUpload.single('file'), uploadInvoicePdf);
deliveryRouter.get('/invoices/:userId/:invoiceId/pdf', getInvoicePdf);
deliveryRouter.delete('/invoices/:userId/:invoiceId', removePurchaseInvoice);

deliveryRouter.get('/driver-sessions/:userId', listDriverCashSessions);
deliveryRouter.post('/driver-sessions/:userId', createDriverCashSession);
deliveryRouter.put('/driver-sessions/:userId/:sessionId', updateDriverCashSession);
deliveryRouter.delete('/driver-sessions/:userId/:sessionId', removeDriverCashSession);

deliveryRouter.get('/caja-bootstrap/:userId', listCajaBootstrap);

deliveryRouter.get('/tpv-sessions/:userId', listTpvRegisterSessions);
deliveryRouter.post('/tpv-sessions/:userId', createTpvRegisterSession);
deliveryRouter.post('/tpv-sessions/:userId/:sessionId/reopen', reopenTpvRegisterSession);
deliveryRouter.put('/tpv-sessions/:userId/:sessionId', updateTpvRegisterSession);
deliveryRouter.delete('/tpv-sessions/:userId/:sessionId', removeTpvRegisterSession);

deliveryRouter.get('/points-of-sale/:userId', listPointsOfSale);
deliveryRouter.post('/points-of-sale/:userId', createPointOfSale);
deliveryRouter.put('/points-of-sale/:userId/:pdvId', updatePointOfSale);
deliveryRouter.post('/points-of-sale/:userId/:pdvId/regenerate-terminal-code', regeneratePointOfSaleTerminalCode);
deliveryRouter.get('/points-of-sale/:userId/:pdvId/tpv-devices', listPdvTpvDevices);
deliveryRouter.post('/points-of-sale/:userId/:pdvId/tpv-devices/approve', approvePdvTpvDevice);
deliveryRouter.post('/points-of-sale/:userId/:pdvId/tpv-devices/reject', rejectPdvTpvDevice);
deliveryRouter.post('/points-of-sale/:userId/:pdvId/tpv-devices/revoke', revokePdvTpvDevice);
deliveryRouter.post('/points-of-sale/:userId/:pdvId/tpv-devices/unblock', unblockPdvTpvDevice);
deliveryRouter.delete('/points-of-sale/:userId/:pdvId', removePointOfSale);

deliveryRouter.get('/drivers/:userId', listDrivers);
deliveryRouter.get('/drivers/:userId/stats', getDriversStats);
deliveryRouter.post('/drivers/:userId', createDriver);
deliveryRouter.put('/drivers/:userId/:driverId', updateDriver);
deliveryRouter.delete('/drivers/:userId/:driverId', removeDriver);
deliveryRouter.post('/drivers/:userId/auto-assign/:orderId', autoAssignDriver);

deliveryRouter.get('/config/:userId', getDeliveryConfig);
deliveryRouter.put('/config/:userId', updateDeliveryConfig);
deliveryRouter.get('/staff-consumptions/:userId', listStaffConsumptions);
deliveryRouter.post('/staff-consumptions/:userId', createStaffConsumption);
deliveryRouter.get('/ops-center/:userId', getOpsCenter);

deliveryRouter.get('/reparto-config/:userId', getRepartoConfig);
deliveryRouter.put('/reparto-config/:userId', saveRepartoConfig);

deliveryRouter.get('/scale-devices/:userId', listScaleDevices);
deliveryRouter.get('/scale-devices/:userId/:deviceId', getScaleDevice);
deliveryRouter.post('/scale-devices/:userId', createScaleDevice);
deliveryRouter.put('/scale-devices/:userId/:deviceId', updateScaleDevice);
deliveryRouter.delete('/scale-devices/:userId/:deviceId', removeScaleDevice);
deliveryRouter.put('/points-of-sale/:userId/:pdvId/terminals/:terminalId/scale', assignScaleToTerminal);
deliveryRouter.get('/points-of-sale/:userId/:pdvId/terminals/:terminalId/scale', getTerminalScale);
deliveryRouter.post('/scale-devices/:userId/:deviceId/status', reportScaleStatus);

export { deliveryRouter };
