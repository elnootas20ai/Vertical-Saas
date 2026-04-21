import { Router } from 'express';
import {
  listAppointments,
  createAppointment,
  updateAppointment,
  removeAppointment,
  getBookingConfig,
  saveBookingConfig,
} from '../controllers/appointmentsController.js';

const appointmentsRouter = Router();

appointmentsRouter.get('/:userId', listAppointments);
appointmentsRouter.post('/:userId', createAppointment);
appointmentsRouter.put('/:userId/:appointmentId', updateAppointment);
appointmentsRouter.delete('/:userId/:appointmentId', removeAppointment);

// Booking configuration (per commercial)
appointmentsRouter.get('/:userId/booking-config', getBookingConfig);
appointmentsRouter.put('/:userId/booking-config', saveBookingConfig);

export { appointmentsRouter };
