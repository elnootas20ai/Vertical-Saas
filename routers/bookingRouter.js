import { Router } from 'express';
import {
  getPublicBookingInfo,
  getAvailableSlots,
  createPublicBooking,
} from '../controllers/appointmentsController.js';

// Public routes — no authentication required
const bookingRouter = Router();

bookingRouter.get('/:userId/info', getPublicBookingInfo);
bookingRouter.get('/:userId/slots', getAvailableSlots);
bookingRouter.post('/:userId/book', createPublicBooking);

export { bookingRouter };
