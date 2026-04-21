import { Router } from 'express';
import {
  listSignatureRequests,
  getSignatureRequest,
  createSignatureRequest,
  updateSignatureRequest,
  cancelSignatureRequest,
  sendSignatureRequest,
  sendReminder,
  resendToSigner,
} from '../controllers/signatureController.js';

const signatureRouter = Router();

signatureRouter.get('/:userId', listSignatureRequests);
signatureRouter.get('/:userId/:requestId', getSignatureRequest);
signatureRouter.post('/:userId', createSignatureRequest);
signatureRouter.put('/:userId/:requestId', updateSignatureRequest);
signatureRouter.delete('/:userId/:requestId', cancelSignatureRequest);
signatureRouter.post('/:userId/:requestId/send', sendSignatureRequest);
signatureRouter.post('/:userId/:requestId/remind', sendReminder);
signatureRouter.post('/:userId/:requestId/signers/:signerId/resend', resendToSigner);

export { signatureRouter };
