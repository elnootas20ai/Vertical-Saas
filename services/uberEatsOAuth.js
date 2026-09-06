import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import logger from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';

/** Ruta real de Integraciones delivery en el SaaS. */
export const UBER_EATS_REDIRECT_PATH = '/saas/vertical/delivery/integraciones';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

/** sandbox | production */
export function getUberEatsEnv() {
  const raw = env('UBER_EATS_ENV', 'sandbox').toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'sandbox';
}

export function isUberEatsSandbox() {
  return getUberEatsEnv() === 'sandbox';
}

/** Certificación: nunca permitir que una prueba termine en los dominios live. */
export function assertUberEatsSandbox() {
  if (!isUberEatsSandbox()) {
    throw new Error('Prueba Uber bloqueada: el servidor no está en entorno sandbox');
  }
  return true;
}

export function getUberEatsClientId() {
  return env('UBER_EATS_CLIENT_ID');
}

export function getUberEatsClientSecret() {
  return env('UBER_EATS_CLIENT_SECRET');
}

/** Scopes solo válidos en authorization_code (login del restaurante). */
const UBER_USER_OAUTH_SCOPES = new Set(['eats.pos_provisioning', 'offline_access']);

/**
 * Scopes del OAuth de usuario (authorization_code).
 * Uber rechaza invalid_scope si mezclas grant types: eats.store / eats.order
 * van solo en client_credentials (ver getUberEatsAppAccessToken).
 */
export function getUberEatsScopes() {
  const raw = env('UBER_EATS_SCOPES', 'eats.pos_provisioning');
  const parts = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => UBER_USER_OAUTH_SCOPES.has(s));
  if (!parts.includes('eats.pos_provisioning')) {
    parts.unshift('eats.pos_provisioning');
  }
  return parts.join(' ');
}

/**
 * Por defecto: HTTPS de Vertial (prod) — así OAuth funciona sin túnel.
 * El controller limita OAuth a uriel@admin.com (no al cliente vivo).
 * Override: UBER_EATS_REDIRECT_URI (p. ej. localhost solo si lo pides a propósito).
 */
export function getUberEatsRedirectUri() {
  const explicit = env('UBER_EATS_REDIRECT_URI');
  if (explicit) return explicit;
  const appUrl = env('APP_URL', 'https://vertialapp.com').replace(/\/$/, '');
  return `${appUrl}${UBER_EATS_REDIRECT_PATH}`;
}

export function getUberEatsAuthorizeBase() {
  return getUberEatsEnv() === 'production'
    ? 'https://login.uber.com/oauth/v2/authorize'
    : 'https://sandbox-login.uber.com/oauth/v2/authorize';
}

export function getUberEatsTokenUrl() {
  return getUberEatsEnv() === 'production'
    ? 'https://login.uber.com/oauth/v2/token'
    : 'https://sandbox-login.uber.com/oauth/v2/token';
}

export function getUberEatsApiBase() {
  return getUberEatsEnv() === 'production'
    ? 'https://api.uber.com'
    : 'https://test-api.uber.com';
}

export function isUberEatsConfigured() {
  return Boolean(getUberEatsClientId() && getUberEatsClientSecret());
}

export function getUberEatsPublicConfig() {
  return {
    configured: isUberEatsConfigured(),
    env: getUberEatsEnv(),
    sandbox: isUberEatsSandbox(),
    redirectUri: getUberEatsRedirectUri(),
    scopes: getUberEatsScopes(),
    clientIdPreview: getUberEatsClientId()
      ? `${getUberEatsClientId().slice(0, 6)}…`
      : '',
  };
}

export function createUberOAuthState({ businessId, userId }) {
  return jwt.sign(
    {
      purpose: 'uber_eats_oauth',
      businessId: String(businessId || ''),
      userId: String(userId || ''),
      nonce: crypto.randomBytes(8).toString('hex'),
    },
    JWT_SECRET,
    { expiresIn: '20m' },
  );
}

export function verifyUberOAuthState(state) {
  const payload = jwt.verify(String(state || ''), JWT_SECRET);
  if (payload?.purpose !== 'uber_eats_oauth') {
    throw new Error('Estado OAuth inválido');
  }
  if (!payload.businessId) {
    throw new Error('Estado OAuth sin negocio');
  }
  return payload;
}

export function buildUberAuthorizeUrl(state) {
  if (!isUberEatsConfigured()) {
    throw new Error('Uber Eats no configurado (UBER_EATS_CLIENT_ID / UBER_EATS_CLIENT_SECRET)');
  }
  const params = new URLSearchParams({
    client_id: getUberEatsClientId(),
    redirect_uri: getUberEatsRedirectUri(),
    response_type: 'code',
    scope: getUberEatsScopes(),
    state: String(state || ''),
  });
  return `${getUberEatsAuthorizeBase()}?${params.toString()}`;
}

/**
 * Intercambia authorization_code por access_token (sandbox/prod).
 */
export async function exchangeUberAuthorizationCode(code) {
  if (!isUberEatsConfigured()) {
    throw new Error('Uber Eats no configurado (UBER_EATS_CLIENT_ID / UBER_EATS_CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    client_id: getUberEatsClientId(),
    client_secret: getUberEatsClientSecret(),
    grant_type: 'authorization_code',
    redirect_uri: getUberEatsRedirectUri(),
    code: String(code || ''),
  });

  const response = await fetch(getUberEatsTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const msg = data.error_description || data.error || data.message || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg }, 'Uber Eats token exchange failed');
    throw new Error(`Uber token: ${msg}`);
  }

  const accessToken = String(data.access_token || '');
  if (!accessToken) {
    throw new Error('Uber no devolvió access_token');
  }

  const expiresIn = Number(data.expires_in || 0);
  const expiresAt = expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : '';

  return {
    accessToken,
    refreshToken: String(data.refresh_token || ''),
    tokenType: String(data.token_type || 'Bearer'),
    scope: String(data.scope || ''),
    expiresIn,
    expiresAt,
  };
}
