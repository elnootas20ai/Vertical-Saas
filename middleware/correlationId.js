/**
 * I-07: Correlation ID middleware — trazabilidad de request_id a través de toda la cadena.
 *
 * - Lee x-request-id del header entrante (útil si el proxy/balanceador ya lo generó).
 * - Si no existe o no es válido, genera un UUIDv4 nuevo.
 * - Adjunta el ID a req.requestId y al header de respuesta X-Request-ID.
 * - Usa AsyncLocalStorage para que cualquier código síncrono/asíncrono en la cadena
 *   pueda leer el requestId sin necesidad de recibir `req` explícitamente.
 */
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestStorage = new AsyncLocalStorage();

/**
 * Express middleware: asigna un requestId único por petición y ejecuta
 * el resto de la cadena dentro del contexto AsyncLocalStorage correspondiente.
 */
export function correlationIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  // Sólo propagamos el ID entrante si es un string seguro de longitud razonable
  const requestId =
    (typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming.trim())
      ? incoming.trim()
      : null) ?? uuidv4();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  requestStorage.run({ requestId, startedAt: Date.now() }, next);
}

/**
 * Devuelve el requestId del contexto activo (AsyncLocalStorage).
 * Retorna undefined si se llama fuera de un contexto de request
 * (p. ej., schedulers, scripts de startup).
 */
export function getRequestId() {
  return requestStorage.getStore()?.requestId;
}
