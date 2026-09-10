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
import {
  validate,
  validateParams,
  userIdParamSchema,
  createFinanceMovementSchema,
  updateFinanceMovementSchema,
  createBankAccountSchema,
} from '../middleware/validate.js';

const financeRouter = Router();

// Bank accounts
financeRouter.get('/:userId/accounts', validateParams(userIdParamSchema), listAccounts);
financeRouter.post('/:userId/accounts', validateParams(userIdParamSchema), validate(createBankAccountSchema), createAccount);
financeRouter.get('/:userId/accounts/:accountId', getAccount);
financeRouter.put('/:userId/accounts/:accountId', validate(createBankAccountSchema), updateAccount);
financeRouter.delete('/:userId/accounts/:accountId', removeAccount);
financeRouter.post('/:userId/accounts/:accountId/recalculate', recalculateBalance);

// Tax obligations
financeRouter.get('/:userId/tax-obligations', listObligations);
financeRouter.post('/:userId/tax-obligations', createObligation);
financeRouter.post('/:userId/tax-obligations/generate', generateFromPresets);
financeRouter.put('/:userId/tax-obligations/:obligationId', updateObligation);
financeRouter.delete('/:userId/tax-obligations/:obligationId', removeObligation);

// Finance movements
financeRouter.get('/:userId', validateParams(userIdParamSchema), listFinanceMovements);
financeRouter.post('/:userId', validateParams(userIdParamSchema), validate(createFinanceMovementSchema), createFinanceMovement);
financeRouter.post('/:userId/from-invoice', createMovementFromInvoice);
financeRouter.post('/:userId/from-sale', createMovementFromSale);
financeRouter.get('/:userId/suggest-category', suggestCategory);
financeRouter.get('/:userId/reconciliation-suggestions', reconciliationSuggestions);
financeRouter.get('/:userId/stock-valuation', getStockValuation);
financeRouter.put('/:userId/:movementId', validate(updateFinanceMovementSchema), updateFinanceMovement);
financeRouter.put('/:userId/:movementId/mark-paid', markFinanceMovementPaid);
financeRouter.delete('/:userId/:movementId', removeFinanceMovement);

export { financeRouter };
