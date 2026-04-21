import { Router } from 'express';
import { listSegments, createSegment, updateSegment, deleteSegment } from '../controllers/crmSegmentsController.js';

const crmSegmentsRouter = Router();

crmSegmentsRouter.get('/:userId', listSegments);
crmSegmentsRouter.post('/:userId', createSegment);
crmSegmentsRouter.put('/:userId/:segmentId', updateSegment);
crmSegmentsRouter.delete('/:userId/:segmentId', deleteSegment);

export { crmSegmentsRouter };
