import { Router } from 'express';
import {
  getCrmAlerts,
  getClientQuotes,
  listReminders,
  createReminder,
  updateReminder,
  deleteReminder,
} from '../controllers/crmController.js';

const crmRouter = Router();

// CRM Alerts
crmRouter.get('/:userId/alerts', getCrmAlerts);

// Client linked quotes
crmRouter.get('/:userId/clients/:clientId/quotes', getClientQuotes);

// Commercial reminders
crmRouter.get('/:userId/reminders', listReminders);
crmRouter.post('/:userId/reminders', createReminder);
crmRouter.put('/:userId/reminders/:reminderId', updateReminder);
crmRouter.delete('/:userId/reminders/:reminderId', deleteReminder);

export { crmRouter };
