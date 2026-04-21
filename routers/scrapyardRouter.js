import { Router } from 'express';
import {
  listParts, getPart, createPart, updatePart, deletePart, bulkCreateParts,
  startDismantling, getDismantlingSession, extractPart, markNotApplicable,
  addCustomPart, pauseDismantling, resumeDismantling, completeDismantling,
  updateDismantlingStatus, searchCompatibleParts,
  listWorkers, getWorker, createWorker, updateWorker, deleteWorker,
  listTasks, getTask, createTask, updateTask, deleteTask,
  startTask, pauseTask, resumeTask, completeTask,
  getWorkerProductivity,
} from '../controllers/scrapyardController.js';

const scrapyardRouter = Router();

// Workers CRUD
scrapyardRouter.get('/workers/:userId', listWorkers);
scrapyardRouter.get('/workers/:userId/:workerId', getWorker);
scrapyardRouter.post('/workers/:userId', createWorker);
scrapyardRouter.put('/workers/:userId/:workerId', updateWorker);
scrapyardRouter.delete('/workers/:userId/:workerId', deleteWorker);
scrapyardRouter.get('/workers/:userId/productivity/report', getWorkerProductivity);

// Tasks CRUD + time tracking
scrapyardRouter.get('/tasks/:userId', listTasks);
scrapyardRouter.get('/tasks/:userId/:taskId', getTask);
scrapyardRouter.post('/tasks/:userId', createTask);
scrapyardRouter.put('/tasks/:userId/:taskId', updateTask);
scrapyardRouter.delete('/tasks/:userId/:taskId', deleteTask);
scrapyardRouter.patch('/tasks/:userId/:taskId/start', startTask);
scrapyardRouter.patch('/tasks/:userId/:taskId/pause', pauseTask);
scrapyardRouter.patch('/tasks/:userId/:taskId/resume', resumeTask);
scrapyardRouter.patch('/tasks/:userId/:taskId/complete', completeTask);

// Parts CRUD — search-compatible BEFORE /:partId to avoid param collision
scrapyardRouter.get('/:userId/search-compatible', searchCompatibleParts);
scrapyardRouter.get('/:userId', listParts);
scrapyardRouter.get('/:userId/:partId', getPart);
scrapyardRouter.post('/:userId', createPart);
scrapyardRouter.post('/:userId/bulk', bulkCreateParts);
scrapyardRouter.put('/:userId/:partId', updatePart);
scrapyardRouter.delete('/:userId/:partId', deletePart);

// Dismantling
scrapyardRouter.post('/:userId/:vehicleId/dismantling/start', startDismantling);
scrapyardRouter.get('/:userId/:vehicleId/dismantling/session', getDismantlingSession);
scrapyardRouter.post('/:userId/:vehicleId/dismantling/extract', extractPart);
scrapyardRouter.patch('/:userId/:vehicleId/dismantling/not-applicable', markNotApplicable);
scrapyardRouter.post('/:userId/:vehicleId/dismantling/custom-part', addCustomPart);
scrapyardRouter.patch('/:userId/:vehicleId/dismantling/pause', pauseDismantling);
scrapyardRouter.patch('/:userId/:vehicleId/dismantling/resume', resumeDismantling);
scrapyardRouter.patch('/:userId/:vehicleId/dismantling/complete', completeDismantling);
scrapyardRouter.patch('/:userId/:vehicleId/dismantling-status', updateDismantlingStatus);

export { scrapyardRouter };
