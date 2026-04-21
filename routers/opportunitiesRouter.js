import { Router } from 'express';
import {
  listOpportunities,
  getOpportunityStats,
  getOpportunityDetail,
  createOpportunity,
  updateOpportunity,
  changeOpportunityStage,
  updateNextAction,
  removeOpportunity,
  getOpportunityActivity,
  getTeamStats,
} from '../controllers/opportunitiesController.js';

const opportunitiesRouter = Router();

opportunitiesRouter.get('/:userId', listOpportunities);
opportunitiesRouter.get('/:userId/stats', getOpportunityStats);
opportunitiesRouter.get('/:userId/activity', getOpportunityActivity);
opportunitiesRouter.get('/:userId/team-stats', getTeamStats);
opportunitiesRouter.get('/:userId/:opportunityId', getOpportunityDetail);
opportunitiesRouter.post('/:userId', createOpportunity);
opportunitiesRouter.put('/:userId/:opportunityId', updateOpportunity);
opportunitiesRouter.put('/:userId/:opportunityId/stage', changeOpportunityStage);
opportunitiesRouter.put('/:userId/:opportunityId/next-action', updateNextAction);
opportunitiesRouter.delete('/:userId/:opportunityId', removeOpportunity);

export { opportunitiesRouter };
