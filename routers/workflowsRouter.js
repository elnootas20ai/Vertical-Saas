import { Router } from 'express';
import {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  triggerWorkflowRun,
} from '../controllers/workflowsController.js';

const workflowsRouter = Router();

workflowsRouter.get('/:userId', listWorkflows);
workflowsRouter.post('/:userId', createWorkflow);
workflowsRouter.post('/:userId/run', triggerWorkflowRun);
workflowsRouter.put('/:userId/:workflowId', updateWorkflow);
workflowsRouter.delete('/:userId/:workflowId', deleteWorkflow);

export { workflowsRouter };
