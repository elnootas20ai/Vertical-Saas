import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { addSSEClient, removeSSEClient } from '../services/sseService.js';

const sseRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';

/**
 * GET /api/sse
 *
 * Endpoint Server-Sent Events. El cliente envía el JWT como query param
 * porque EventSource no admite cabeceras personalizadas.
 *
 * Query params:
 *   - token     : JWT access token (obligatorio)
 *   - businessId: ID del negocio al que pertenece el usuario (opcional)
 */
sseRouter.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }

  const userId = payload.userId;
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
