import jwt from 'jsonwebtoken';

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

// S-01: Opciones base para cookies seguras
// En desarrollo se usa sameSite:'lax' para evitar problemas con IP/cross-port.
// En producción se mantiene 'strict' para máxima seguridad.
export const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/',
};

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, { ...AUTH_COOKIE_OPTS, maxAge: ACCESS_TOKEN_MS });
  res.cookie('refresh_token', refreshToken, { ...AUTH_COOKIE_OPTS, maxAge: REFRESH_TOKEN_MS });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', AUTH_COOKIE_OPTS);
  res.clearCookie('refresh_token', AUTH_COOKIE_OPTS);
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

// S-01: Lee el access token de cookie httpOnly primero, luego del header Authorization
export function requireAuth(req, res, next) {
  let token = req.cookies?.access_token;

  if (!token) {
    const header = req.headers.authorization || '';
    token = header.startsWith('Bearer ') ? header.slice(7) : '';
  }

  if (!token) {
    // Diagnóstico: loguear qué cookies llegan realmente
    console.warn('[requireAuth] Sin token. cookies:', JSON.stringify(req.cookies), '| cookie-header:', req.headers.cookie || '(vacío)');
    return res.status(401).json({ ok: false, error: 'Token de autenticación requerido' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if ((payload?.epoch ?? 0) !== AUTH_EPOCH) {
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

export function requireEmailVerified(req, res, next) {
  if (!req.authUser?.emailVerified) {
    return res.status(403).json({
      ok: false,
      error: 'Debes verificar tu email antes de continuar',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  return next();
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
