import jwt from 'jsonwebtoken';
import { findAccountByUserId } from '../services/couchdb.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}_refresh`;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
const AUTH_EPOCH = Number.parseInt(String(process.env.AUTH_EPOCH || '0'), 10) || 0;

// Convierte strings tipo "15m", "8h", "7d", "30d" a milisegundos
function parseDurationMs(duration) {
  const match = String(duration).match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 15 * 60 * 1000; // fallback 15m
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

const ACCESS_TOKEN_MS = parseDurationMs(JWT_EXPIRES_IN);
const REFRESH_TOKEN_MS = parseDurationMs(JWT_REFRESH_EXPIRES_IN);

/** Dominio compartido apex + www en producción (p. ej. `.vertialapp.com`). */
function resolveAuthCookieDomain() {
  const explicit = String(process.env.COOKIE_DOMAIN || '').trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== 'production') return undefined;
  try {
    const raw = String(process.env.APP_URL || '').trim();
    if (!raw) return undefined;
    const host = new URL(raw).hostname.replace(/^www\./i, '');
    if (!host || host === 'localhost' || host.endsWith('.local')) return undefined;
    return host.startsWith('.') ? host : `.${host}`;
  } catch {
    return undefined;
  }
}

const AUTH_COOKIE_DOMAIN = resolveAuthCookieDomain();

// En producción las cookies deben poder enviarse desde la app Capacitor
// (origen capacitor://localhost → API en vertialapp.com = cross-site).
// SameSite=strict bloqueaba el refresh en tablet y expulsaba la sesión en minutos.
export const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
};

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, { ...AUTH_COOKIE_OPTS, maxAge: ACCESS_TOKEN_MS });
  res.cookie('refresh_token', refreshToken, { ...AUTH_COOKIE_OPTS, maxAge: REFRESH_TOKEN_MS });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', AUTH_COOKIE_OPTS);
  res.clearCookie('refresh_token', AUTH_COOKIE_OPTS);
  if (AUTH_COOKIE_DOMAIN) {
    res.clearCookie('access_token', { ...AUTH_COOKIE_OPTS, domain: AUTH_COOKIE_DOMAIN });
    res.clearCookie('refresh_token', { ...AUTH_COOKIE_OPTS, domain: AUTH_COOKIE_DOMAIN });
  }
}

export function signAccessToken(payload) {
  return jwt.sign({ ...payload, epoch: AUTH_EPOCH }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(payload) {
  return jwt.sign({ ...payload, epoch: AUTH_EPOCH }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

function readAccessTokenFromRequest(req) {
  // Preferir Bearer: en tablet/Capacitor una cookie vieja no debe pisar el JWT
  // válido guardado en el dispositivo (si no, 401 → logout en minutos).
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  return String(req.cookies?.access_token || '').trim();
}

function verifyAccessTokenPayload(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if ((payload?.epoch ?? 0) !== AUTH_EPOCH) {
    return null;
  }
  return payload;
}

/** JWT opcional: no falla si no hay token (p. ej. activar TPV tablet con sesión ya abierta). */
export function optionalAuth(req, res, next) {
  const token = readAccessTokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = verifyAccessTokenPayload(token);
    if (payload) req.authUser = payload;
  } catch {
    // Token caducado o inválido: seguir como anónimo (tablet sin sesión previa).
  }
  return next();
}

// S-01: Lee el access token de cookie httpOnly primero, luego del header Authorization
export function requireAuth(req, res, next) {
  const token = readAccessTokenFromRequest(req);

  if (!token) {
    // Diagnóstico: loguear qué cookies llegan realmente
    console.warn('[requireAuth] Sin token. cookies:', JSON.stringify(req.cookies), '| cookie-header:', req.headers.cookie || '(vacío)');
    return res.status(401).json({ ok: false, error: 'Token de autenticación requerido' });
  }

  try {
    const payload = verifyAccessTokenPayload(token);
    if (!payload) {
      clearAuthCookies(res);
      return res.status(401).json({ ok: false, error: 'Sesión inválida. Vuelve a iniciar sesión.' });
    }
    req.authUser = payload;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

export async function requireEmailVerified(req, res, next) {
  if (req.authUser?.emailVerified) {
    return next();
  }

  // JWT puede quedar viejo tras verificar en otro dispositivo; mirar BD.
  const userId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
  if (userId) {
    try {
      const account = await findAccountByUserId(req, userId);
      if (account?.emailVerified && !account.deletedAt) {
        req.authUser = { ...req.authUser, emailVerified: true };
        return next();
      }
    } catch (err) {
      console.warn('[requireEmailVerified] no se pudo leer cuenta:', err?.message || err);
    }
  }

  return res.status(403).json({
    ok: false,
    error: 'Debes verificar tu email antes de continuar',
    code: 'EMAIL_NOT_VERIFIED',
  });
}

/** Autenticación JWT + email verificado (panel y APIs de datos). */
export function requireAuthAndEmailVerified(req, res, next) {
  requireAuth(req, res, () => requireEmailVerified(req, res, next));
}

/** Propio perfil: basta JWT (ficha trabajador antes de verificar email). Otros perfiles: email verificado. */
export function requireAuthForProfileUpdate(req, res, next) {
  requireAuth(req, res, () => {
    const targetUserId = String(req.params.userId || '').trim();
    const authUserId = String(req.authUser?.userId || req.authUser?.user_id || '').trim();
    if (targetUserId && authUserId && targetUserId === authUserId) {
      return next();
    }
    return requireEmailVerified(req, res, next);
  });
}

// S-07: Middleware para requerir el sessionId del JWT (útil para invalidación de sesión)
export function extractSessionId(req, _res, next) {
  try {
    const token = req.cookies?.refresh_token || '';
    if (token) {
      const decoded = jwt.decode(token);
      req.sessionId = decoded?.sessionId || null;
    }
  } catch {
    // Ignorar — el sessionId es opcional en la mayoría de rutas
  }
  return next();
}
