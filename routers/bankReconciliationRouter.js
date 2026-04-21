import { Router } from 'express';
import {
  listBankTransactions,
  importBankFile,
  autoMatch,
  updateBankTransaction,
  reconcileTransaction,
  unlinkTransaction,
  removeBankTransaction,
  getStats,
  getAlerts,
} from '../controllers/bankReconciliationController.js';

const bankReconciliationRouter = Router();

bankReconciliationRouter.get('/:userId', listBankTransactions);
bankReconciliationRouter.post('/:userId/import', importBankFile);
bankReconciliationRouter.post('/:userId/auto-match', autoMatch);
bankReconciliationRouter.get('/:userId/stats', getStats);
bankReconciliationRouter.get('/:userId/alerts', getAlerts);
bankReconciliationRouter.put('/:userId/:txId', updateBankTransaction);
bankReconciliationRouter.post('/:userId/:txId/reconcile', reconcileTransaction);
bankReconciliationRouter.delete('/:userId/:txId/link', unlinkTransaction);
bankReconciliationRouter.delete('/:userId/:txId', removeBankTransaction);

export { bankReconciliationRouter };
