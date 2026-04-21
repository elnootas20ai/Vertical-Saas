import { Router } from 'express';
import {
  listLeads, createLead, updateLead, removeLead,
  checkLeadDuplicates, getLeadAttribution,
  recalculateLeadScores, mergeLead, bulkCreateLeads,
} from '../controllers/leadsController.js';

const leadsRouter = Router();

leadsRouter.get('/:userId', listLeads);
leadsRouter.get('/:userId/attribution', getLeadAttribution);
leadsRouter.post('/:userId', createLead);
leadsRouter.post('/:userId/bulk', bulkCreateLeads);
leadsRouter.post('/:userId/check-duplicates', checkLeadDuplicates);
leadsRouter.post('/:userId/merge', mergeLead);
leadsRouter.post('/:userId/recalculate-scores', recalculateLeadScores);
leadsRouter.put('/:userId/:leadId', updateLead);
leadsRouter.delete('/:userId/:leadId', removeLead);

export { leadsRouter };
