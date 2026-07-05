import logger from './logger.js';

const MAX_ENTRIES = 400;
/** @type {Array<Record<string, unknown>>} */
const buffer = [];

/**
 * Registro en memoria de errores del cliente (TPV, caja…).
 * Superadmin ve todo; cada cuenta solo ve los suyos.
 */
export function pushClientError(entry) {
  const row = {
    id: `ce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  buffer.unshift(row);
  if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES;
  logger.warn(
    {
      tag: 'CLIENT_ERROR',
      userId: row.userId,
      businessId: row.businessId,
      context: row.context,
      page: row.page,
      message: row.message,
    },
    String(row.message || 'client error'),
  );
  return row;
}

export function listClientErrors({ userId = '', limit = 50, all = false } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const filtered = all
    ? buffer
    : buffer.filter((e) => String(e.userId || '') === String(userId || ''));
  return filtered.slice(0, cap);
}
