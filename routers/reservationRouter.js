import { Router } from 'express';
import {
  listReservations,
  getReservation,
  createReservation,
  updateReservation,
  cancelReservation,
  convertReservation,
  removeReservation,
} from '../controllers/reservationController.js';

const reservationRouter = Router();

reservationRouter.get('/:userId', listReservations);
reservationRouter.get('/:userId/:reservationId', getReservation);
reservationRouter.post('/:userId', createReservation);
reservationRouter.put('/:userId/:reservationId', updateReservation);
reservationRouter.put('/:userId/:reservationId/cancel', cancelReservation);
reservationRouter.put('/:userId/:reservationId/convert', convertReservation);
reservationRouter.delete('/:userId/:reservationId', removeReservation);

export { reservationRouter };
