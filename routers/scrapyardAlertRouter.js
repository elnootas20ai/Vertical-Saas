/**
 * Scrapyard Alert Router — Endpoints REST para alertas de desguaces.
 */

import { Router } from 'express';
import {
  getScrapyardAlerts,
  getScrapyardAlertSummary,
  acknowledgeAlert,
  dismissAlert,
  getScrapyardAlertHistory,
} from '../controllers/scrapyardAlertController.js';

const router = Router();

router.get('/:userId', getScrapyardAlerts);
router.get('/:userId/summary', getScrapyardAlertSummary);
router.get('/:userId/history', getScrapyardAlertHistory);
router.put('/:alertId/acknowledge', acknowledgeAlert);
router.put('/:alertId/dismiss', dismissAlert);

export default router;
