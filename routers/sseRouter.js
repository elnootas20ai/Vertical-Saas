import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { addSSEClient, removeSSEClient } from '../services/sseService.js';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';

const sseRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';

function resolveSseToken(req) {
  const queryToken = String(req.query.token || '').trim();
  if (queryToken) return queryToken;
  return String(req.cookies?.access_token || '').trim();
}

/**
 * GET /api/sse/token
 * Devuelve un JWT corto para EventSource cuando la sesión va solo por cookie httpOnly.
 */
sseRouter.get('/token', requireAuthAndEmailVerified, (req, res) => {
  const userId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  const token = jwt.sign({ userId, purpose: 'sse' }, JWT_SECRET, { expiresIn: '15m' });
  return res.json({ ok: true, token });
});

/**
 * GET /api/sse
 *
 * Endpoint Server-Sent Events. El cliente envía el JWT como query param
 * porque EventSource no admite cabeceras personalizadas.
 * Si no hay query token, se usa la cookie httpOnly `access_token`.
 *
 * Query params:
 *   - token     : JWT access token (opcional si hay cookie de sesión)
 *   - businessId: ID del negocio al que pertenece el usuario (opcional)
 */
sseRouter.get('/', (req, res) => {
  const token = resolveSseToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }

  const userId = payload.userId || payload.user_id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
  const businessId = req.query.businessId || null;

  // Cabeceras SSE — deshabilitar buffering en proxies
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Ping inicial para confirmar conexión al cliente
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  addSSEClient(userId, businessId, res);

  // Heartbeat cada 25 s para mantener la conexión activa a través de proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSSEClient(userId, businessId, res);
  });
});

export { sseRouter };
