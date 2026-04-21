import { Router } from 'express';
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationController.js';

const notificationRouter = Router();

notificationRouter.get('/:userId', listNotifications);
notificationRouter.post('/:userId', createNotification);
notificationRouter.put('/:userId/read-all', markAllNotificationsRead);
notificationRouter.put('/:userId/:notificationId/read', markNotificationRead);

export { notificationRouter };
