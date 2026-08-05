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
import {
  listUberEatsStores,
  provisionUberEatsStore,
} from '../services/uberEatsStores.js';
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

/** Dueño / admin interno. La UI ya va detrás de RequireBusinessOwner. */
function requireUberOperator(req, res) {
  if (!authUserId(req) && !authEmail(req)) {
    res.status(401).json({ ok: false, error: 'No autenticado' });
    return false;
  }
  return true;
}

async function loadUberIntegration(req, businessId) {
  const current = await getWebConfigByBusinessId(req, businessId);
  return {
    current,
    uber: current?.integrations?.uber || {},
  };
}

async function saveUberPatch(req, businessId, current, uberPatch) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const prevIntegrations = current?.integrations || {};
  const prevUber = prevIntegrations.uber || {};
  const nextIntegrations = {
    ...prevIntegrations,
    uber: {
      ...prevUber,
      ...uberPatch,
      token: String(uberPatch.token !== undefined ? uberPatch.token : prevUber.token || ''),
    },
  };
  const doc = buildWebConfigDocument(businessId, { integrations: nextIntegrations }, current);
  const saved = await putDocument(req, db, doc._id, doc);
  return sanitizeDeliveryIntegrations({ ...doc, _rev: saved.rev });
}

export async function getUberEatsOAuthConfig(req, res) {
  try {
    if (!requireUberOperator(req, res)) return;
    return res.json({
      ok: true,
      ...getUberEatsPublicConfig(),
      isSuperAdmin: isVertialSuperAdminEmail(authEmail(req)),
      primaryWebhookUrl: 'https://vertialapp.com/api/delivery-webhooks/ubereats',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/oauth/start?businessId= */
export async function startUberEatsOAuth(req, res) {
  try {
    if (!requireUberOperator(req, res)) return;

    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!isUberEatsConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Uber Eats no configurado en el servidor (UBER_EATS_CLIENT_ID / SECRET).',
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
    if (!requireUberOperator(req, res)) return;

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
    const { current } = await loadUberIntegration(req, businessId);

    const integrations = await saveUberPatch(req, businessId, current, {
      enabled: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || '',
      tokenType: tokens.tokenType || 'Bearer',
      scope: tokens.scope || '',
      expiresAt: tokens.expiresAt || '',
      connectedAt: new Date().toISOString(),
      oauth: true,
      env: getUberEatsPublicConfig().env,
    });

    let stores = [];
    try {
      stores = await listUberEatsStores(tokens.accessToken);
    } catch (err) {
      logger.warn({ err: errorMsg(err), businessId }, 'Uber OAuth OK pero list stores falló');
    }

    logger.info(
      { businessId, scope: tokens.scope, stores: stores.length, env: getUberEatsPublicConfig().env },
      'Uber Eats OAuth conectado',
    );

    return res.json({
      ok: true,
      integrations,
      connected: true,
      expiresAt: tokens.expiresAt || '',
      scope: tokens.scope || '',
      stores,
    });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber Eats OAuth callback failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/stores?businessId= */
export async function listUberStoresForBusiness(req, res) {
  try {
    if (!requireUberOperator(req, res)) return;
    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');

    const { uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Conecta Uber OAuth antes de listar tiendas' });
    }

    const stores = await listUberEatsStores(token);
    return res.json({
      ok: true,
      stores,
      selectedStoreId: String(uber.storeId || ''),
      selectedStoreName: String(uber.storeName || ''),
      provisionedAt: String(uber.provisionedAt || ''),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/stores/select { businessId, storeId, storeName? } */
export async function selectUberStoreForBusiness(req, res) {
  try {
    if (!requireUberOperator(req, res)) return;
    const businessId = String(req.body?.businessId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const storeName = String(req.body?.storeName || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!storeId) return badRequest(res, 'Falta storeId');

    const { current, uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Conecta Uber OAuth antes de vincular la tienda' });
    }

    await provisionUberEatsStore({
      userAccessToken: token,
      storeId,
      partnerStoreId: businessId,
      businessId,
    });

    const integrations = await saveUberPatch(req, businessId, current, {
      enabled: true,
      storeId,
      storeName: storeName || uber.storeName || '',
      provisionedAt: new Date().toISOString(),
      oauth: true,
    });

    logger.info({ businessId, storeId }, 'Uber tienda provisionada como order manager');

    return res.json({
      ok: true,
      integrations,
      storeId,
      storeName: storeName || '',
      provisioned: true,
    });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber select store failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}
