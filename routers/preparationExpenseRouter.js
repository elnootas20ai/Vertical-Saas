import { Router } from 'express';
import {
  listExpenses,
  listExpensesByVehicle,
  getExpenseSummary,
  createExpense,
  updateExpense,
  validateExpense,
  removeExpense,
  attachDocument,
  detachDocument,
  registerPayment,
} from '../controllers/preparationExpenseController.js';

const preparationExpenseRouter = Router();

preparationExpenseRouter.get('/:userId', listExpenses);
preparationExpenseRouter.get('/:userId/vehicle/:vehicleId', listExpensesByVehicle);
preparationExpenseRouter.get('/:userId/summary', getExpenseSummary);

preparationExpenseRouter.post('/:userId', createExpense);
preparationExpenseRouter.put('/:userId/:expenseId', updateExpense);
preparationExpenseRouter.put('/:userId/:expenseId/validate', validateExpense);
preparationExpenseRouter.delete('/:userId/:expenseId', removeExpense);

preparationExpenseRouter.post('/:userId/:expenseId/attach-document', attachDocument);
preparationExpenseRouter.delete('/:userId/:expenseId/detach-document', detachDocument);

preparationExpenseRouter.post('/:userId/:expenseId/register-payment', registerPayment);

export { preparationExpenseRouter };
