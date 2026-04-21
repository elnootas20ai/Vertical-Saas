import { Router } from 'express';
import { getOrgChart, saveOrgChart } from '../controllers/orgchartController.js';

const orgchartRouter = Router();

orgchartRouter.get('/:businessId', getOrgChart);
orgchartRouter.put('/:businessId', saveOrgChart);

export { orgchartRouter };
