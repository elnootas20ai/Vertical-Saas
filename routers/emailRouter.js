import { Router } from 'express';
import {
  sendEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendDocumentSignatureEmail,
  sendAppointmentReminderEmail,
  sendInvoiceEmail,
} from '../controllers/emailController.js';

const emailRouter = Router();

emailRouter.post('/send', sendEmail);
emailRouter.post('/invite', sendInviteEmail);
emailRouter.post('/password-reset', sendPasswordResetEmail);
emailRouter.post('/document-signature', sendDocumentSignatureEmail);
emailRouter.post('/appointment-reminder', sendAppointmentReminderEmail);
emailRouter.post('/send-invoice', sendInvoiceEmail);

export { emailRouter };
