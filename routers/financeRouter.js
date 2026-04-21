import { Router } from 'express';
import {
  listFinanceMovements,
  createFinanceMovement,
  updateFinanceMovement,
  removeFinanceMovement,
  markFinanceMovementPaid,
  createMovementFromInvoice,
  createMovementFromSale,
  suggestCategory,
  reconciliationSuggestions,
  getStockValuation,
} from '../controllers/financeController.js';
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  removeAccount,
  recalculateBalance,
} from '../controllers/bankAccountsController.js';
import {
  listObligations,
  createObligation,
  updateObligation,
  removeObligation,
  generateFromPresets,
} from '../controllers/taxObligationsController.js';

const financeRouter = Router();

// Bank accounts
financeRouter.get('/:userId/accounts', listAccounts);
financeRouter.post('/:userId/accounts', createAccount);
financeRouter.get('/:userId/accounts/:accountId', getAccount);
financeRouter.put('/:userId/accounts/:accountId', updateAccount);
financeRouter.delete('/:userId/accounts/:accountId', removeAccount);
financeRouter.post('/:userId/accounts/:accountId/recalculate', recalculateBalance);

// Tax obligations
financeRouter.get('/:userId/tax-obligations', listObligations);
financeRouter.post('/:userId/tax-obligations', createObligation);
financeRouter.post('/:userId/tax-obligations/generate', generateFromPresets);
financeRouter.put('/:userId/tax-obligations/:obligationId', updateObligation);
financeRouter.delete('/:userId/tax-obligations/:obligationId', removeObligation);

// Finance movements
financeRouter.get('/:userId', listFinanceMovements);
financeRouter.post('/:userId', createFinanceMovement);
financeRouter.post('/:userId/from-invoice', createMovementFromInvoice);
financeRouter.post('/:userId/from-sale', createMovementFromSale);
financeRouter.get('/:userId/suggest-category', suggestCategory);
financeRouter.get('/:userId/reconciliation-suggestions', reconciliationSuggestions);
financeRouter.get('/:userId/stock-valuation', getStockValuation);
financeRouter.put('/:userId/:movementId', updateFinanceMovement);
financeRouter.put('/:userId/:movementId/mark-paid', markFinanceMovementPaid);
financeRouter.delete('/:userId/:movementId', removeFinanceMovement);

export { financeRouter };
