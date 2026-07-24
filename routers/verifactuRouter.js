import { Router } from 'express';
import {
  getSettings,
  saveSettings,
  listRecords,
  getRecord,
  issueRecord,
} from '../controllers/verifactuController.js';

const verifactuRouter = Router();

verifactuRouter.get('/:businessId/settings', getSettings);
verifactuRouter.put('/:businessId/settings', saveSettings);
verifactuRouter.get('/:businessId/records', listRecords);
verifactuRouter.get('/:businessId/records/:recordId', getRecord);
verifactuRouter.post('/:businessId/records', issueRecord);

export { verifactuRouter };
