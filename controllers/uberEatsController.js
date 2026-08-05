import {
  getWebDbName,
  ensureDatabase,
  getWebConfigByBusinessId,
  buildWebConfigDocument,
  putDocument,
  sanitizeDeliveryIntegrations,
} from '../services/couchdb.js';
import {
  buildUberAuthorizeUrl,
  createUberOAuthState,
  exchangeUberAuthorizationCode,
  getUberEatsPublicConfig,
  isUberEatsConfigured,
  verifyUberOAuthState,
} from '../services/uberEatsOAuth.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function errorMsg(error) {
  return error?.message || String(error || 'Error');
}

function authEmail(req) {
  return String(req.authUser?.email || req.user?.email || '').trim();
}

function authUserId(req) {
  return String(req.authUser?.userId || req.authUser?.user_id || req.user?.user_id || req.user?.id || '').trim();
}

function requireLocalAdmin(req, res) {
  if (!isVertialSuperAdminEmail(authEmail(req))) {
    res.status(403).json({
      ok: false,
      error: 'Uber OAuth solo disponible para uriel@admin.com (cuenta interna).',
    });
    return false;
  }
  return true;
}

export async function getUberEatsOAuthConfig(req, res) {
  try {
    if (!requireLocalAdmin(req, res)) return;
    return res.json({ ok: true, ...getUberEatsPublicConfig() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/oauth/start?businessId= */
export async function startUberEatsOAuth(req, res) {
  try {
    if (!requireLocalAdmin(req, res)) return;

    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!isUberEatsConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Uber Eats no configurado. Añade UBER_EATS_CLIENT_ID y UBER_EATS_CLIENT_SECRET al .env local.',
      });
    }

    const userId = authUserId(req);
    const state = createUberOAuthState({ businessId, userId });
    const authorizeUrl = buildUberAuthorizeUrl(state);
    const pub = getUberEatsPublicConfig();

    return res.json({
      ok: true,
      authorizeUrl,
      redirectUri: pub.redirectUri,
      env: pub.env,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/oauth/callback { code, state } */
export async function completeUberEatsOAuth(req, res) {
  try {
    if (!requireLocalAdmin(req, res)) return;

    const code = String(req.body?.code || '').trim();
    const state = String(req.body?.state || '').trim();
    if (!code) return badRequest(res, 'Falta code de Uber');
    if (!state) return badRequest(res, 'Falta state OAuth');

    let payload;
    try {
      payload = verifyUberOAuthState(state);
    } catch {
      return badRequest(res, 'State OAuth inválido o caducado. Vuelve a pulsar Conectar.');
    }

    const businessId = String(payload.businessId || '').trim();
    const userId = authUserId(req);
    if (payload.userId && userId && payload.userId !== userId) {
      return res.status(403).json({ ok: false, error: 'El inicio de OAuth fue de otra sesión' });
    }

    const tokens = await exchangeUberAuthorizationCode(code);

    const db = getWebDbName();
    await ensureDatabase(req, db);
    const current = await getWebConfigByBusinessId(req, businessId);
    const prevIntegrations = current?.integrations || {};
    const prevUber = prevIntegrations.uber || {};

    // Importante: NO pisar `token` (secreto de webhook delivery / caja).
    const nextIntegrations = {
      ...prevIntegrations,
      uber: {
        ...prevUber,
        enabled: true,
        token: String(prevUber.token || ''),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || prevUber.refreshToken || '',
        tokenType: tokens.tokenType || 'Bearer',
        scope: tokens.scope || '',
        expiresAt: tokens.expiresAt || '',
        connectedAt: new Date().toISOString(),
        oauth: true,
        env: getUberEatsPublicConfig().env,
      },
    };

    const doc = buildWebConfigDocument(businessId, { integrations: nextIntegrations }, current);
    const saved = await putDocument(req, db, doc._id, doc);

    logger.info(
      { businessId, scope: tokens.scope, env: getUberEatsPublicConfig().env },
      'Uber Eats OAuth conectado (admin local)',
    );

    return res.json({
      ok: true,
      integrations: sanitizeDeliveryIntegrations({ ...doc, _rev: saved.rev }),
      connected: true,
      expiresAt: tokens.expiresAt || '',
      scope: tokens.scope || '',
    });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber Eats OAuth callback failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}
