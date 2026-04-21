import { Router } from 'express';
import { listDocuments, createDocument, updateDocument, removeDocument, getDocumentAlerts, getDocumentHistory, docPermission } from '../controllers/documentsController.js';

const documentsRouter = Router();

documentsRouter.get('/:userId/alerts', getDocumentAlerts);
documentsRouter.get('/:userId/history/:documentId', getDocumentHistory);
documentsRouter.get('/:userId', listDocuments);
documentsRouter.post('/:userId', createDocument);
documentsRouter.put('/:userId/:documentId', updateDocument);
documentsRouter.delete('/:userId/:documentId', docPermission('delete'), removeDocument);

export { documentsRouter };
