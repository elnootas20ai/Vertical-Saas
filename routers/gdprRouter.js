import { Router } from 'express';
import {
  listConsents,
  createConsent,
  updateConsent,
  listRequests,
  createRequest,
  updateRequest,
  rightToErasure,
} from '../controllers/gdprController.js';

const gdprRouter = Router();

// Consentimientos
gdprRouter.get('/consents/:userId', listConsents);
gdprRouter.post('/consents/:userId', createConsent);
gdprRouter.put('/consents/:userId/:consentId', updateConsent);

// Solicitudes de derechos RGPD
gdprRouter.get('/requests/:userId', listRequests);
gdprRouter.post('/requests/:userId', createRequest);
gdprRouter.put('/requests/:userId/:requestId', updateRequest);

// LEG-02: Derecho al olvido (Art. 17 RGPD)
gdprRouter.post('/erasure/:userId', rightToErasure);

export { gdprRouter };
