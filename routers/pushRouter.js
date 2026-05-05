import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  saveSubscription,
  deleteSubscription,
  VAPID_PUBLIC_KEY,
} from '../services/pushService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';

const pushRouter = Router();

function requirePushAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token de autenticación requerido' });
  }
  try {
    req.authUser = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

/**
 * GET /api/push/vapid-public-key
 * Devuelve la clave pública VAPID para que el cliente la use al suscribirse.
 */
pushRouter.get('/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ ok: false, error: 'Web Push no configurado en el servidor' });
  }
  return res.json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /api/push/subscribe
 * Registra una suscripción push para el usuario autenticado.
 * Body: { subscription: PushSubscriptionJSON }
 */
pushRouter.post('/subscribe', requirePushAuth, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const { subscription } = req.body || {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ ok: false, error: 'Suscripción push inválida' });
    }

    await saveSubscription(req, userId, subscription);
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[Push] Error al guardar suscripción:', error?.message);
    return res.status(500).json({ ok: false, error: 'Error al guardar suscripción' });
  }
});

/**
 * DELETE /api/push/unsubscribe
 * Elimina una suscripción push del usuario autenticado.
 * Body: { endpoint: string }
 */
pushRouter.delete('/unsubscribe', requirePushAuth, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ ok: false, error: 'Falta el endpoint de la suscripción' });
    }

    await deleteSubscription(req, userId, endpoint);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[Push] Error al eliminar suscripción:', error?.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar suscripción' });
  }
});

export { pushRouter };
