/**
 * Reintentos ante conflictos CouchDB (409 / "conflict").
 * Útil cuando muchos clientes escriben el mismo doc (p. ej. business.members al unirse por QR).
 */

export function isCouchConflictError(err) {
  if (!err) return false;
  // 409 de negocio (OWNER_OF_OTHER_BUSINESS, etc.) no son conflictos de revisión CouchDB.
  const businessCode = String(err.code || '').trim();
  if (businessCode && businessCode !== 'conflict') return false;
  const status = Number(err.statusCode || err.status || 0);
  if (status === 409) return true;
  if (String(err.couchError || '').toLowerCase() === 'conflict') return true;
  return /conflict/i.test(String(err.message || err.reason || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withCouchConflictRetry(fn, opts = {}) {
  const maxAttempts = Math.max(1, Math.min(12, Number(opts.maxAttempts) || 6));
  const baseDelayMs = Math.max(10, Number(opts.baseDelayMs) || 45);
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isCouchConflictError(err) || attempt >= maxAttempts - 1) throw err;
      const jitter = Math.floor(Math.random() * 40);
      await sleep(baseDelayMs * (attempt + 1) + jitter);
    }
  }
  throw lastErr;
}
