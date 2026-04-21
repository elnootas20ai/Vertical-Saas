/**
 * UserHistory model — esquema y validadores para los documentos de historial
 * de usuario (type: 'user_history_event') almacenados en CouchDB.
 *
 * Cada evento captura una acción relevante del usuario: vista de producto,
 * búsqueda, compra, añadir al carrito, etc. El servicio de recomendaciones
 * los consume para generar sugerencias personalizadas.
 */

export const HISTORY_EVENT_TYPES = [
  'view',       // El usuario visualizó un producto/vehículo/servicio
  'search',     // El usuario realizó una búsqueda
  'purchase',   // El usuario completó una compra
  'cart_add',   // El usuario añadió al carrito
  'cart_remove',// El usuario eliminó del carrito
  'lead',       // El usuario generó un lead sobre un ítem
  'wishlist',   // El usuario marcó como favorito
];

export const ENTITY_TYPES = ['vehicle', 'product', 'service', 'lead', 'catalog_item'];

/**
 * Construye un documento de evento de historial listo para persistir en CouchDB.
 *
 * @param {string} userId        — ID del usuario propietario del negocio
 * @param {string} sessionUserId — ID del usuario final (cliente o visitante)
 * @param {object} event         — datos del evento recibidos desde el cliente
 * @returns {object}
 */
export function buildUserHistoryEvent(userId, sessionUserId, event) {
  const now = new Date().toISOString();

  return {
    _id: `uhe:${userId}:${sessionUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    type: 'user_history_event',
    userId,
    sessionUserId,
    eventType: event.eventType,
    entityType: event.entityType || null,
    entityId: event.entityId || null,
    entityName: event.entityName || null,
    entityCategory: event.entityCategory || null,
    entityTags: Array.isArray(event.entityTags) ? event.entityTags : [],
    entityPrice: typeof event.entityPrice === 'number' ? event.entityPrice : null,
    searchQuery: event.searchQuery || null,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Elimina campos internos de CouchDB (_rev, etc.) antes de enviar al cliente.
 *
 * @param {object} doc
 * @returns {object}
 */
export function sanitizeHistoryEvent(doc) {
  const { _id, _rev, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Valida los parámetros de un evento de historial recibidos vía API.
 *
 * @param {object} event
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateHistoryEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['Se requiere un objeto event en el body'] };
  }

  if (!HISTORY_EVENT_TYPES.includes(event.eventType)) {
    errors.push(`eventType inválido. Valores permitidos: ${HISTORY_EVENT_TYPES.join(', ')}`);
  }

  if (event.entityType && !ENTITY_TYPES.includes(event.entityType)) {
    errors.push(`entityType inválido. Valores permitidos: ${ENTITY_TYPES.join(', ')}`);
  }

  if (event.entityId && typeof event.entityId !== 'string') {
    errors.push('entityId debe ser una cadena de texto');
  }

  if (event.entityPrice !== undefined && event.entityPrice !== null && isNaN(Number(event.entityPrice))) {
    errors.push('entityPrice debe ser un número');
  }

  if (event.searchQuery && typeof event.searchQuery !== 'string') {
    errors.push('searchQuery debe ser una cadena de texto');
  }

  return { ok: errors.length === 0, errors };
}
