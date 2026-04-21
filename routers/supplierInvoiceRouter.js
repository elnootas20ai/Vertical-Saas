import { Router } from 'express';
import {
  listSupplierInvoices,
  getSupplierInvoice,
  createSupplierInvoice,
  updateSupplierInvoice,
  removeSupplierInvoice,
  approveSupplierInvoice,
  rejectSupplierInvoice,
  linkToFinance,
  supplierInvoiceStats,
  pollNow,
  rescanInvoice,
  getConfig,
  updateConfig,
  testImap,
} from '../controllers/supplierInvoiceController.js';

const supplierInvoiceRouter = Router();

supplierInvoiceRouter.get('/stats/:userId', supplierInvoiceStats);
supplierInvoiceRouter.get('/config/:userId', getConfig);
supplierInvoiceRouter.put('/config/:userId', updateConfig);
supplierInvoiceRouter.post('/test-imap', testImap);
supplierInvoiceRouter.post('/poll/:userId', pollNow);
supplierInvoiceRouter.get('/:userId', listSupplierInvoices);
supplierInvoiceRouter.get('/:userId/:invoiceId', getSupplierInvoice);
supplierInvoiceRouter.post('/:userId', createSupplierInvoice);
supplierInvoiceRouter.put('/:userId/:invoiceId', updateSupplierInvoice);
supplierInvoiceRouter.delete('/:userId/:invoiceId', removeSupplierInvoice);
supplierInvoiceRouter.post('/:userId/:invoiceId/approve', approveSupplierInvoice);
supplierInvoiceRouter.post('/:userId/:invoiceId/reject', rejectSupplierInvoice);
supplierInvoiceRouter.post('/:userId/:invoiceId/link-finance', linkToFinance);
supplierInvoiceRouter.post('/:userId/:invoiceId/rescan', rescanInvoice);

export { supplierInvoiceRouter };
