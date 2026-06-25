import { Router } from 'express';
import { submitBugReport } from '../controllers/supportController.js';

const supportRouter = Router();

supportRouter.post('/bug-report', submitBugReport);

export { supportRouter };
