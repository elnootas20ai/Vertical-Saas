import { Router } from 'express';
import {
  listFiscalConsultations,
  createFiscalConsultation,
  deleteFiscalConsultation,
} from '../controllers/fiscalConsultationController.js';

const fiscalConsultationRouter = Router();

fiscalConsultationRouter.get('/:userId', listFiscalConsultations);
fiscalConsultationRouter.post('/:userId', createFiscalConsultation);
fiscalConsultationRouter.delete('/:userId/:id', deleteFiscalConsultation);

export { fiscalConsultationRouter };
