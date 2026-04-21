import * as cacheService from '../services/cache.js';

/**
 * Middleware Express que cachea respuestas JSON de endpoints GET.
 *
 * @param {object} opts
 * @param {number} opts.ttl        - TTL en ms (default 30s)
 * @param {function} opts.keyFn    - Genera la cache key a partir del req (default: req.originalUrl)
 * @param {function} opts.condition - Si devuelve false, se salta el cache para esta petición
 */
export function cacheResponse(opts = {}) {
  const {
    ttl = cacheService.TTL_PRESETS.DOCS_LIST,
    keyFn = (req) => `http:${req.originalUrl}`,
    condition,
  } = opts;

  return (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (typeof condition === 'function' && !condition(req)) {
      return next();
    }

    const cacheKey = typeof keyFn === 'function' ? keyFn(req) : `http:${req.originalUrl}`;
    const cached = cacheService.get(cacheKey);

    if (cached !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body != null) {
        cacheService.set(cacheKey, body, ttl);
      }
      return originalJson(body);
    };

    return next();
  };
}

/**
 * Middleware que invalida entradas de caché para una DB al recibir escrituras.
 *
 * @param {function} dbNameFn - Extrae el nombre de la DB del req (default: req.params.dbName)
 */
export function invalidateOnWrite(dbNameFn) {
  const getDbName = dbNameFn || ((req) => req.params.dbName);

  return (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const dbName = getDbName(req);
        if (dbName) {
          cacheService.invalidateDb(dbName);
          cacheService.invalidateByPrefix('http:/api/dashboard');
          cacheService.invalidateByPrefix('http:/api/views');
          cacheService.invalidateByPrefix('http:/api/backup/summary');
        }
      }
      return originalJson(body);
    };

    return next();
  };
}
