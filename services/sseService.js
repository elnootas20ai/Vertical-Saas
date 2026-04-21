/**
 * SSE Service — gestión de conexiones Server-Sent Events
 *
 * Mantiene un Map de clientes activos indexado por userId.
 * Permite hacer broadcast a un usuario concreto o a todos los usuarios
 * de un mismo negocio (cuando varios miembros del equipo trabajan a la vez).
 */

import logger from './logger.js';

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const clientsByUser = new Map();

/** @type {Map<string, Set<string>>} userId → Set<businessId> */
const businessByUser = new Map();

/**
 * Registra una nueva conexión SSE.
 * @param {string} userId
 * @param {string|null} businessId
 * @param {import('http').ServerResponse} res
 */
export function addSSEClient(userId, businessId, res) {
  if (!clientsByUser.has(userId)) {
    clientsByUser.set(userId, new Set());
  }
  clientsByUser.get(userId).add(res);

  if (businessId) {
    if (!businessByUser.has(businessId)) {
      businessByUser.set(businessId, new Set());
    }
    businessByUser.get(businessId).add(userId);
  }

  logger.info({ tag: 'SSE', event: 'connect', userId, businessId: businessId ?? 'n/a', total: countClients() });
}

/**
 * Elimina una conexión SSE cuando el cliente se desconecta.
 * @param {string} userId
 * @param {string|null} businessId
 * @param {import('http').ServerResponse} res
 */
export function removeSSEClient(userId, businessId, res) {
  const conns = clientsByUser.get(userId);
  if (conns) {
    conns.delete(res);
    if (conns.size === 0) {
      clientsByUser.delete(userId);
      if (businessId && businessByUser.has(businessId)) {
        businessByUser.get(businessId).delete(userId);
        if (businessByUser.get(businessId).size === 0) {
          businessByUser.delete(businessId);
        }
      }
    }
  }
  logger.info({ tag: 'SSE', event: 'disconnect', userId, total: countClients() });
}

/**
 * Envía un evento SSE a todas las conexiones de un usuario.
 * @param {string} userId
 * @param {string} event  — nombre del evento (notification, vehicle_updated, lead_created, sale_created…)
 * @param {unknown} data  — payload serializable a JSON
 */
export function broadcastToUser(userId, event, data) {
  const conns = clientsByUser.get(userId);
  if (!conns || conns.size === 0) return;

  const message = formatSSE(event, data);
  for (const res of conns) {
    try {
      res.write(message);
    } catch {
      // La conexión ya estaba cerrada; se limpiará en el evento 'close'
    }
  }
}

/**
 * Envía un evento SSE a todos los usuarios activos de un negocio.
 * @param {string} businessId
 * @param {string} event
 * @param {unknown} data
 * @param {string|null} [excludeUserId]  — omitir al usuario que originó el cambio
 */
export function broadcastToBusiness(businessId, event, data, excludeUserId = null) {
  const userIds = businessByUser.get(businessId);
  if (!userIds || userIds.size === 0) return;

  for (const userId of userIds) {
    if (userId === excludeUserId) continue;
    broadcastToUser(userId, event, data);
  }
}

/**
 * Número total de conexiones SSE activas.
 */
export function countClients() {
  let total = 0;
  for (const conns of clientsByUser.values()) {
    total += conns.size;
  }
  return total;
}

/**
 * Formatea un mensaje en el protocolo SSE.
 * @param {string} event
 * @param {unknown} data
 */
function formatSSE(event, data) {
  const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${jsonData}\n\n`;
}
