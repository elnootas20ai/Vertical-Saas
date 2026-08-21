/**
 * B-09 / I-06: Rate limiting granular por plan + protección contra abuso interno.
 *
 * Capas de protección:
 *
 *   1. Auth (por IP):
 *      Login          → 40 intentos fallidos / 15 min (LOGIN_RATE_LIMIT_MAX)
 *      Registro empresa → 5 cuentas / 1 h
 *      Registro trabajador (QR) → 40 / 1 h (WORKER_REGISTER_RATE_LIMIT_MAX)
 *      Preview join QR → 80 / 1 h (WORKER_JOIN_PREVIEW_RATE_LIMIT_MAX)
 *      Recuperación   → 20 solicitudes / 1 h por email+IP (RECOVER_RATE_LIMIT_MAX)
 *
 *   2. Burst por usuario autenticado (I-06):
 *      Por defecto → 150 req / 10 s (ajustable: BURST_LIMIT_MAX)
 *      El dashboard dispara 40–80 peticiones al cargar; 30/10s bloqueaba uso normal.
 *
 *   3. Cuota por plan (por usuario autenticado o IP si no hay auth):
 *      Trial / Basic  → 400 req / min (PLAN_TRIAL_MAX_PER_MIN)
 *      Pro / Business → 1 000 req / min
 *      Enterprise     → 2 000 req / min
 *
 *   4. Operaciones costosas — sensitiveOpLimiter (I-06):
 *      10 req / min por usuario, independiente del plan.
 *      Aplicar en: AI calls, generación de PDF, exportaciones bulk, replicación.
 *      Uso: app.use('/api/calls/...', requireAuth, sensitiveOpLimiter, callsRouter)
 *
 *   5. Tracker de abuso (I-06):
 *      Registra cuántas veces un usuario/IP dispara un rate limit.
 *      Log de warning tras 5 violaciones, error tras 20. Sin bloqueo automático
 *      (el bloqueo duro debe hacerse en el balanceador/firewall externo).
 */

import rateLimit from 'express-rate-limit';
import logger    from './logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';
}

function getUserKey(req) {
  const userId = req.authUser?.user_id;
  return userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
}

function getPlanTier(req) {
  const plan = String(req.authUser?.subscription?.planName || '').toLowerCase();
  if (plan === 'enterprise') return 'enterprise';
  if (['pro', 'business', 'profesional'].includes(plan)) return 'pro';
  return 'trial'; // Basic, trial_active, desconocido → trial
}

/** En local el dashboard dispara 80+ peticiones al montar; no aplicar límites SaaS. */
function skipRateLimitInDev() {
  return process.env.NODE_ENV !== 'production' || process.env.DISABLE_RATE_LIMIT === 'true';
}

// ─── I-06: Abuse tracker ──────────────────────────────────────────────────────

/**
 * Mapa en memoria: clave → { violations, firstAt, lastAt, lastUrl }
 * Se limpia automáticamente cada 30 minutos para evitar crecimiento ilimitado.
 */
const _abuseMap = new Map();

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, entry] of _abuseMap) {
    if (entry.lastAt < cutoff) _abuseMap.delete(key);
  }
}, 30 * 60 * 1000);

function trackViolation(req) {
  const key  = getUserKey(req);
  const now  = Date.now();
  const prev = _abuseMap.get(key) ?? { violations: 0, firstAt: now, lastAt: now, lastUrl: '' };

  prev.violations++;
  prev.lastAt  = now;
  prev.lastUrl = req.originalUrl;
  _abuseMap.set(key, prev);

  const v = prev.violations;
  if (v === 5 || v % 20 === 0) {
    const level = v >= 20 ? 'error' : 'warn';
    logger[level](
      {
        tag:        'ABUSE',
        key,
        violations: v,
        url:        req.originalUrl,
        method:     req.method,
        ip:         getClientIp(req),
        userId:     req.authUser?.user_id,
      },
      `Posible abuso de API detectado: ${v} violaciones de rate limit`,
    );
  }
}

/** Devuelve las entradas de abuso activas (para el endpoint /health o administración). */
export function getAbuseStats() {
  return Array.from(_abuseMap.entries()).map(([key, entry]) => ({ key, ...entry }));
}

// ─── Auth limiters (por IP / email) ───────────────────────────────────────────

function loginKeyGenerator(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const ip = getClientIp(req);
  return email ? `login:${ip}:${email}` : `login-ip:${ip}`;
}

/** Intentos de contraseña: por email+IP; los logins correctos no consumen cupo. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(20, parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '40', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginKeyGenerator,
  message: {
    ok: false,
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Demasiados intentos con contraseña. Usa «Entrar con código por email» o espera unos minutos.',
  },
});

/** Google/Apple: cupo aparte para no quemar el contador de contraseña. */
export const oauthLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
  message: {
    ok: false,
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Demasiados intentos de acceso. Espera unos minutos e inténtalo de nuevo.',
  },
});

/** Refresh / logout: no compartir cupo con login (el dashboard renueva token a menudo). */
export const authSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipRateLimitInDev,
});

/** TPV tablet / team login: cupo separado del login de empresa. */
export const teamLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const code = String(req.body?.companyCode || '').trim().toUpperCase();
    const user = String(req.body?.username || '').trim().toLowerCase();
    return code && user ? `team:${ip}:${code}:${user}` : `team-ip:${ip}`;
  },
  message: {
    ok: false,
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Demasiados intentos. Espera unos minutos o pide a tu gerente un código por email.',
  },
});

export const tpvTabletAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
});

/** Código de acceso por email (alternativa cuando falla contraseña o hay bloqueo). */
export const loginCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginKeyGenerator,
  message: {
    ok: false,
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Demasiadas solicitudes de código. Inténtalo en unos minutos.',
  },
});

/** @deprecated Usar loginLimiter; mantiene compatibilidad si algún router lo importa. */
export const authLimiter = loginLimiter;

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipRateLimitInDev,
  message: { ok: false, success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiados registros desde esta IP. Inténtalo en una hora.' } },
});

/**
 * Alta de trabajador (accountType=user) — cupo alto para onboarding por QR en Wi‑Fi de tienda (~20 personas).
 * No aplica a altas de empresa (siguen en registerLimiter: 5/h).
 */
export const workerInviteRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(25, parseInt(process.env.WORKER_REGISTER_RATE_LIMIT_MAX || '40', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipRateLimitInDev,
  message: {
    ok: false,
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas altas de trabajador desde esta red. Espera unos minutos e inténtalo de nuevo.',
    },
  },
});

/** Elige cupo de registro: trabajador (QR) vs empresa. */
export function registerLimiterForAccountType(req, res, next) {
  if (String(req.body?.accountType || '').trim() === 'user') {
    return workerInviteRegisterLimiter(req, res, next);
  }
  return registerLimiter(req, res, next);
}

/**
 * Preview del QR/enlace de unión — no compartir cupo con recuperación de contraseña.
 * ~80/h/IP: 20 móviles escaneando + reintentos en la misma Wi‑Fi.
 */
export const workerJoinPreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(40, parseInt(process.env.WORKER_JOIN_PREVIEW_RATE_LIMIT_MAX || '80', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipRateLimitInDev,
  message: {
    ok: false,
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas lecturas del enlace. Espera un momento e inténtalo de nuevo.',
    },
  },
});

export const recoverLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(10, parseInt(process.env.RECOVER_RATE_LIMIT_MAX || '20', 10)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = getClientIp(req);
    return email ? `recover:${ip}:${email}` : `recover-ip:${ip}`;
  },
  skip: skipRateLimitInDev,
  message: {
    ok: false,
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes de recuperación. Inténtalo en unos minutos.',
    },
  },
});

/** Verificación de email y reenvío (no compartir cupo con recuperación de contraseña). */
export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: {
    ok: false,
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes de verificación de email. Inténtalo en una hora.',
    },
  },
});

// ─── I-06: Burst limiter (todos los usuarios autenticados) ────────────────────

/**
 * Limiter de ráfaga corto por usuario/IP autenticado.
 * Montar ANTES de planAwareLimiter:
 *   app.use('/api/...', requireAuth, burstLimiter, planAwareLimiter, router)
 */
const BURST_WINDOW_MS = Number(process.env.BURST_LIMIT_WINDOW_MS || 10_000);
const BURST_MAX = Number(process.env.BURST_LIMIT_MAX || 150);

export const burstLimiter = rateLimit({
  windowMs: BURST_WINDOW_MS,
  max: BURST_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInDev,
  keyGenerator: getUserKey,
  handler(req, res, next, options) {
    trackViolation(req);
    res.status(options.statusCode).json({
      ok: false,
      success: false,
      error: {
        code:    'BURST_LIMIT_EXCEEDED',
        message: 'Demasiadas peticiones en muy poco tiempo. Reduce la frecuencia de solicitudes.',
        retryAfterMs: options.windowMs,
      },
    });
  },
});

// ─── Plan limiters (por usuario o IP) ────────────────────────────────────────
// Trial: 400/min soporta navegar 4–5 pantallas/min + polling sin 429.
const TRIAL_MAX_PER_MIN = Number(process.env.PLAN_TRIAL_MAX_PER_MIN || 400);
const PRO_MAX_PER_MIN = Number(process.env.PLAN_PRO_MAX_PER_MIN || 1000);
const ENTERPRISE_MAX_PER_MIN = Number(process.env.PLAN_ENTERPRISE_MAX_PER_MIN || 2000);

const _trialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: TRIAL_MAX_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInDev,
  keyGenerator: getUserKey,
  handler(req, res, next, options) {
    trackViolation(req);
    res.status(options.statusCode).json({
      ok: false, success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: `Límite del plan Trial alcanzado: ${TRIAL_MAX_PER_MIN} peticiones/min.` },
    });
  },
});

const _proLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: PRO_MAX_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInDev,
  keyGenerator: getUserKey,
  handler(req, res, next, options) {
    trackViolation(req);
    res.status(options.statusCode).json({
      ok: false, success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite del plan Pro alcanzado: 1 000 peticiones/min.' },
    });
  },
});

const _enterpriseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ENTERPRISE_MAX_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInDev,
  keyGenerator: getUserKey,
  handler(req, res, next, options) {
    trackViolation(req);
    res.status(options.statusCode).json({
      ok: false, success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite del plan Enterprise alcanzado: 2 000 peticiones/min.' },
    });
  },
});

// API pública v1 (legacy, por IP) — no compartir con rutas autenticadas SaaS
const PUBLIC_API_MAX_PER_MIN = Number(process.env.PUBLIC_API_MAX_PER_MIN || 200);
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: PUBLIC_API_MAX_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { ok: false, success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones. Inténtalo en un momento.' } },
});

/** Solicitud pública de afiliado: máximo 3 intentos / 15 min por IP. */
export const affiliateRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: {
    ok: false,
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Has enviado demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
    },
  },
});

/**
 * Middleware dinámico que selecciona el limiter correcto según el plan del usuario.
 * Requiere que requireAuth haya corrido antes (req.authUser disponible).
 */
export function planAwareLimiter(req, res, next) {
  const tier = getPlanTier(req);
  switch (tier) {
    case 'enterprise': return _enterpriseLimiter(req, res, next);
    case 'pro':        return _proLimiter(req, res, next);
    default:           return _trialLimiter(req, res, next);
  }
}

// ─── I-06: Sensitive operations limiter ───────────────────────────────────────

/**
 * Limiter para operaciones costosas (IA, generación de PDF, exportaciones bulk,
 * replicación CouchDB): 10 operaciones / minuto por usuario autenticado.
 *
 * Uso:
 *   app.post('/api/calls/process/:id', requireAuth, sensitiveOpLimiter, handler)
 *   app.get('/api/backup/export/:db',  requireAuth, sensitiveOpLimiter, handler)
 */
export const sensitiveOpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  handler(req, res, next, options) {
    trackViolation(req);
    res.status(options.statusCode).json({
      ok: false,
      success: false,
      error: {
        code:    'SENSITIVE_OP_LIMIT_EXCEEDED',
        message: 'Límite de operaciones costosas alcanzado: 10 por minuto. Vuelve a intentarlo en breve.',
        retryAfterMs: options.windowMs,
      },
    });
  },
});
