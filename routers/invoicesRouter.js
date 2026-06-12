import { Router } from 'express';
import {
  listInvoices,
  createInvoice,
  updateInvoice,
  removeInvoice,
  getNextNumber,
  sendInvoice,
  registerPayment,
  linkInvoiceToFinance,
} from '../controllers/invoicesController.js';

const invoicesRouter = Router();

invoicesRouter.get('/:userId/next-number', getNextNumber);
invoicesRouter.get('/:userId', listInvoices);
invoicesRouter.post('/:userId', createInvoice);
invoicesRouter.put('/:userId/:invoiceId', updateInvoice);
invoicesRouter.delete('/:userId/:invoiceId', removeInvoice);
invoicesRouter.post('/:userId/:invoiceId/send', sendInvoice);
invoicesRouter.post('/:userId/:invoiceId/payment', registerPayment);
invoicesRouter.post('/:userId/:invoiceId/link-finance', linkInvoiceToFinance);

export { invoicesRouter };
