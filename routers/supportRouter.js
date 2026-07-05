import { Router } from 'express';
import { submitBugReport, logClientError, getClientErrors } from '../controllers/supportController.js';

const supportRouter = Router();

supportRouter.post('/bug-report', submitBugReport);
supportRouter.post('/client-error', logClientError);
supportRouter.get('/client-errors', getClientErrors);

export { supportRouter };
