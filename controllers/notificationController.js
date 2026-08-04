import {
  buildNotificationDocument,
  findAccountByUserId,
  findNotificationById,
  listNotificationsByUser,
  sanitizeNotification,
  saveNotification,
} from '../services/couchdb.js';
import { broadcastToUser } from '../services/sseService.js';
import { sendPushToUser } from '../services/pushService.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureNotificationOwner(req, userId, notificationId) {
  const notification = await findNotificationById(req, notificationId);
  if (!notification || notification.type !== 'notification' || notification.user_id !== userId) {
    return null;
  }

  return notification;
}

export async function listNotifications(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) {
      return badRequest(res, 'Falta userId');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const notifications = await listNotificationsByUser(req, userId);
    return res.json({
      ok: true,
      notifications: notifications.map(sanitizeNotification),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar notificaciones',
    });
  }
}

export async function createNotification(req, res) {
  try {
    const { userId } = req.params;
    const {
      level = 'info',
      category = 'system',
      title,
      message,
      entityId = '',
      entityType = '',
      route = '',
      metadata = {},
      read = false,
      createdAt,
    } = req.body || {};

    if (!userId) {
      return badRequest(res, 'Falta userId');
    }
    if (!title || !message) {
      return badRequest(res, 'title y message son obligatorios');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const notification = buildNotificationDocument({
      userId,
      level,
      category,
      title,
      message,
      entityId,
      entityType,
      route,
      metadata,
      read,
      createdAt,
    });
    const savedNotification = await saveNotification(req, notification);
    const sanitized = sanitizeNotification(savedNotification);

    // Broadcast SSE al usuario en tiempo real
    broadcastToUser(userId, 'notification', sanitized);

    // Enviar Web Push (app cerrada o en segundo plano)
    const pushRoute =
      sanitized.route
      || (String(account.role || '') === 'Usuario' ? '/saas/worker/notifications' : '/saas/dashboard');
    sendPushToUser(req, userId, {
      title: sanitized.title,
      body: sanitized.message,
      data: { route: pushRoute, notificationId: sanitized.id },
    }).catch((err) => console.warn('[Push] Error enviando push al crear notificación:', err?.message));

    return res.status(201).json({
      ok: true,
      notification: sanitized,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear la notificación',
    });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { userId, notificationId } = req.params;
    const { read = true } = req.body || {};

    if (!userId || !notificationId) {
      return badRequest(res, 'Faltan userId o notificationId');
    }

    const notification = await ensureNotificationOwner(req, userId, notificationId);
    if (!notification) {
      return res.status(404).json({ ok: false, error: 'Notificación no encontrada' });
    }

    const now = new Date().toISOString();
    const nextRead = Boolean(read);
    const savedNotification = await saveNotification(req, {
      ...notification,
      read: nextRead,
      status: nextRead ? 'seen' : 'new',
      seenAt: nextRead ? (notification.seenAt || now) : null,
      updatedAt: now,
    });

    return res.json({
      ok: true,
      notification: sanitizeNotification(savedNotification),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar la notificación',
    });
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) {
      return badRequest(res, 'Falta userId');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const notifications = await listNotificationsByUser(req, userId);
    // Incluye docs con read=true pero status aún 'new' (bug antiguo de la campanita).
    const unreadNotifications = notifications.filter((notification) => {
      const status = notification.status || (notification.read ? 'seen' : 'new');
      return status === 'new' || !notification.read;
    });
    const updatedNotifications = [];
    const now = new Date().toISOString();

    for (const notification of unreadNotifications) {
      const savedNotification = await saveNotification(req, {
        ...notification,
        read: true,
        status: 'seen',
        seenAt: notification.seenAt || now,
        updatedAt: now,
      });
      updatedNotifications.push(savedNotification);
    }

    return res.json({
      ok: true,
      notifications: updatedNotifications.map(sanitizeNotification),
      updated: updatedNotifications.length,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al marcar notificaciones como leídas',
    });
  }
}
