/**
 * B-07: Centralised error handling and uniform API response format.
 *
 * Formato estándar de error:
 *   { success: false, ok: false, error: { code, message, details } }
 *
 * Formato estándar de éxito:
 *   { success: true, ok: true, ...data }
 */

// ─── AppError ────────────────────────────────────────────────────────────────

export class AppError extends Error {
  /**
   * @param {string} message  - Mensaje legible por humanos
   * @param {number} statusCode - Código HTTP (400, 401, 403, 404, 422, 429, 500…)
   * @param {string} code       - Código máquina (VALIDATION_ERROR, NOT_FOUND, …)
   * @param {object} details    - Contexto adicional opcional
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ─── Códigos de error predefinidos ────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION_ERROR:    'VALIDATION_ERROR',
  NOT_FOUND:           'NOT_FOUND',
  UNAUTHORIZED:        'UNAUTHORIZED',
  FORBIDDEN:           'FORBIDDEN',
  CONFLICT:            'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR:      'INTERNAL_ERROR',
  BAD_REQUEST:         'BAD_REQUEST',
  UNPROCESSABLE:       'UNPROCESSABLE_ENTITY',
};

// ─── Helpers de respuesta ─────────────────────────────────────────────────────

/**
 * Envía una respuesta de éxito con el formato estándar.
 * Incluye `ok: true` por retrocompatibilidad con clientes existentes.
 */
export function apiSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, success: true, ...data });
}

/**
 * Envía una respuesta de error con el formato estándar.
 * Incluye `ok: false` por retrocompatibilidad con clientes existentes.
 */
export function apiError(res, code, message, statusCode = 400, details = {}) {
  return res.status(statusCode).json({
    ok: false,
    success: false,
    error: { code, message, details },
  });
}

// ─── Middleware Express ───────────────────────────────────────────────────────

/**
 * Reemplaza el handler 404 por defecto con el formato estándar.
 * Debe montarse ANTES del errorHandler y DESPUÉS de todas las rutas.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Ruta no encontrada',
      details: { path: req.originalUrl, method: req.method },
    },
  });
}

/**
 * Middleware centralizado de errores (4 parámetros = Express error handler).
 * Debe montarse al FINAL de todos los middlewares.
 *
 * Captura:
 *  - AppError lanzados con throw new AppError(...)
 *  - Errores de Zod (name === 'ZodError')
 *  - Errores genéricos de JS
 *  - Errores propagados por Express 5 (async handlers sin try/catch)
 */
export function errorHandler(err, req, res, _next) {
  // Errores de validación Zod
  if (err?.name === 'ZodError') {
    return res.status(422).json({
      ok: false,
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Datos de entrada inválidos',
        details: err.errors ?? [],
      },
    });
  }

  // AppError estructurado
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      ok: false,
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Errores JWT / jsonwebtoken
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return res.status(401).json({
      ok: false,
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido',
        details: {},
      },
    });
  }

  // Cualquier otro error
  const statusCode = typeof err?.status === 'number' ? err.status : 500;
  const technicalMessage = err?.message || 'Error interno del servidor';
  // Producción: mensaje usable en tienda (el detalle técnico no ayuda al camarero).
  const publicMessage = process.env.NODE_ENV === 'production'
    ? 'No se pudo completar. Espera un momento e inténtalo de nuevo.'
    : technicalMessage;

  return res.status(statusCode).json({
    ok: false,
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: publicMessage,
      details: process.env.NODE_ENV === 'production' ? {} : { stack: err?.stack },
    },
  });
}
