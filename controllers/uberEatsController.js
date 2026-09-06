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
  getUberEatsPosData,
  patchUberEatsPosData,
  listUberDeliveryStores,
  getUberDeliveryStore,
} from '../services/uberEatsStores.js';
import {
  getUberEatsAppAccessToken,
  getUberStoreStatus,
  setUberStoreStatus,
} from '../services/uberEatsApi.js';
import { pushUberMenuFromCatalog } from '../services/uberEatsMenu.js';
import { assertBusinessTeamAccess } from '../services/businessAccess.js';
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

/** Impide leer/escribir integraciones Uber de otra empresa. */
async function requireUberBusinessAccess(req, res, businessId) {
  if (!requireUberOperator(req, res)) return null;
  const access = await assertBusinessTeamAccess(req, businessId);
  if (!access.ok) {
    res.status(access.status || 403).json({ ok: false, error: access.error || 'No autorizado' });
    return null;
  }
  return access;
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

/** Limpia por completo OAuth/tokens Uber de ESTA empresa (Vertial manda, no el navegador). */
async function wipeUberIntegration(req, businessId, current) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const prevIntegrations = current?.integrations || {};
  const nextIntegrations = {
    ...prevIntegrations,
    uber: {
      enabled: false,
      token: '',
      oauth: false,
      accessToken: '',
      refreshToken: '',
      tokenType: '',
      scope: '',
      expiresAt: '',
      connectedAt: '',
      storeId: '',
      storeName: '',
      provisionedAt: '',
      menuPushedAt: '',
      menuItemCount: 0,
      lastStoreStatus: '',
      lastStoreStatusAt: '',
      env: String(prevIntegrations.uber?.env || getUberEatsPublicConfig().env || 'sandbox'),
      disconnectedAt: new Date().toISOString(),
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
    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;
    if (!isUberEatsConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Uber Eats no configurado en el servidor (UBER_EATS_CLIENT_ID / SECRET).',
      });
    }

    // Antes de Conectar: Vertial borra cualquier OAuth viejo de ESTA empresa.
    const { current } = await loadUberIntegration(req, businessId);
    if (current?.integrations?.uber?.oauth || current?.integrations?.uber?.accessToken) {
      await wipeUberIntegration(req, businessId, current);
      logger.info({ businessId }, 'Uber OAuth limpiado al iniciar Conectar');
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
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

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
      {
        businessId,
        scope: tokens.scope,
        stores: stores.length,
        env: getUberEatsPublicConfig().env,
      },
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
    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

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
    const businessId = String(req.body?.businessId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const storeName = String(req.body?.storeName || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!storeId) {
      return badRequest(res, 'Falta el Store ID de Uber. Cópialo del panel Uber (tienda TEST).');
    }
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    if (!token) {
      return res.status(400).json({
        ok: false,
        error: 'Primero conecta Uber (paso 1). Luego pega el Store ID o elige una tienda.',
      });
    }

    try {
      await provisionUberEatsStore({
        userAccessToken: token,
        storeId,
        partnerStoreId: businessId,
        businessId,
      });
    } catch (provErr) {
      const msg = errorMsg(provErr);
      logger.warn({ businessId, storeId, msg }, 'Uber provision store failed');
      return res.status(400).json({
        ok: false,
        error: msg.includes('404') || /not found/i.test(msg)
          ? 'Store ID no encontrado en Uber. Revisa que sea de la cuenta TEST correcta.'
          : `No se pudo vincular la tienda: ${msg}`,
      });
    }

    const integrations = await saveUberPatch(req, businessId, current, {
      enabled: true,
      storeId,
      storeName: storeName || uber.storeName || storeId,
      provisionedAt: new Date().toISOString(),
      oauth: true,
    });

    logger.info({ businessId, storeId }, 'Uber tienda provisionada como order manager');

    return res.json({
      ok: true,
      integrations,
      storeId,
      storeName: storeName || storeId,
      provisioned: true,
    });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber select store failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/pos-data?businessId=&storeId= */
export async function getUberPosDataForBusiness(req, res) {
  try {
    const businessId = String(req.query.businessId || '').trim();
    const storeId = String(req.query.storeId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    const sid = storeId || String(uber.storeId || '').trim();
    if (!token) return badRequest(res, 'Conecta Uber OAuth antes');
    if (!sid) return badRequest(res, 'Falta storeId (elige tienda)');

    const posData = await getUberEatsPosData(token, sid);
    return res.json({ ok: true, storeId: sid, posData });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** PATCH /api/uber-eats/pos-data { businessId, storeId?, patch } */
export async function patchUberPosDataForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const patch = req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : {};
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    const sid = storeId || String(uber.storeId || '').trim();
    if (!token) return badRequest(res, 'Conecta Uber OAuth antes');
    if (!sid) return badRequest(res, 'Falta storeId');

    await patchUberEatsPosData(token, sid, patch);
    const integrations = await saveUberPatch(req, businessId, current, {
      storeId: sid,
      posDataPatchedAt: new Date().toISOString(),
    });
    return res.json({ ok: true, storeId: sid, integrations });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/delivery-stores?businessId= */
export async function listUberDeliveryStoresForBusiness(req, res) {
  try {
    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;
    const { accessToken } = await getUberEatsAppAccessToken();
    const data = await listUberDeliveryStores(accessToken);
    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/delivery-store?businessId=&storeId= */
export async function getUberDeliveryStoreForBusiness(req, res) {
  try {
    const businessId = String(req.query.businessId || '').trim();
    const storeId = String(req.query.storeId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;
    const { uber } = await loadUberIntegration(req, businessId);
    const sid = storeId || String(uber.storeId || '').trim();
    if (!sid) return badRequest(res, 'Falta storeId');
    const { accessToken } = await getUberEatsAppAccessToken();
    const data = await getUberDeliveryStore(accessToken, sid);
    return res.json({ ok: true, storeId: sid, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/store-status?businessId=&storeId= */
export async function getUberStoreStatusForBusiness(req, res) {
  try {
    const businessId = String(req.query.businessId || '').trim();
    const storeId = String(req.query.storeId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;
    const { uber } = await loadUberIntegration(req, businessId);
    const sid = storeId || String(uber.storeId || '').trim();
    if (!sid) return badRequest(res, 'Falta storeId');
    const { accessToken } = await getUberEatsAppAccessToken();
    const status = await getUberStoreStatus(accessToken, sid);
    return res.json({ ok: true, storeId: sid, status });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/store-status { businessId, storeId?, status, reason?, pausedUntil? } */
export async function setUberStoreStatusForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const status = String(req.body?.status || 'ONLINE').trim();
    const reason = String(req.body?.reason || 'Updated by Vertial').trim();
    const pausedUntil = String(req.body?.pausedUntil || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = storeId || String(uber.storeId || '').trim();
    if (!sid) return badRequest(res, 'Falta storeId (elige tienda Uber)');

    const { accessToken } = await getUberEatsAppAccessToken();
    const result = await setUberStoreStatus(accessToken, sid, { status, reason, pausedUntil });
    const integrations = await saveUberPatch(req, businessId, current, {
      storeId: sid,
      lastStoreStatus: result.status,
      lastStoreStatusAt: new Date().toISOString(),
    });
    return res.json({ ok: true, ...result, storeId: sid, integrations });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber set store status failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/menu/push { businessId, storeId? } */
export async function pushUberMenuForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = storeId || String(uber.storeId || '').trim();
    if (!sid) return badRequest(res, 'Falta storeId (elige tienda Uber)');

    const result = await pushUberMenuFromCatalog(req, {
      businessId,
      storeId: sid,
      storeName: String(uber.storeName || ''),
    });
    const integrations = await saveUberPatch(req, businessId, current, {
      storeId: sid,
      menuPushedAt: new Date().toISOString(),
      menuItemCount: result.itemCount,
    });
    return res.json({ ok: true, ...result, integrations });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber menu push failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/disconnect { businessId } — limpia OAuth/tokens de ESTA empresa. */
export async function disconnectUberEatsForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;

    const { current } = await loadUberIntegration(req, businessId);
    const integrations = await wipeUberIntegration(req, businessId, current);
    logger.info({ businessId }, 'Uber Eats desconectado de la empresa');
    return res.json({ ok: true, integrations, disconnected: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** GET /api/uber-eats/cert-status?businessId= — checklist GTS */
export async function getUberCertStatus(req, res) {
  try {
    const businessId = String(req.query.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessAccess(req, res, businessId))) return;
    const { uber } = await loadUberIntegration(req, businessId);
    const pub = getUberEatsPublicConfig();
    return res.json({
      ok: true,
      configured: pub.configured,
      env: pub.env,
      oauthConnected: Boolean(uber.oauth || uber.accessToken),
      storeId: String(uber.storeId || ''),
      storeName: String(uber.storeName || ''),
      provisionedAt: String(uber.provisionedAt || ''),
      menuPushedAt: String(uber.menuPushedAt || ''),
      menuItemCount: Number(uber.menuItemCount || 0),
      lastStoreStatus: String(uber.lastStoreStatus || ''),
      primaryWebhookUrl: 'https://vertialapp.com/api/delivery-webhooks/ubereats',
      checklistImplemented: [
        'GET /v1/eats/stores',
        'GET /v1/delivery/stores',
        'GET /v1/delivery/store/{id}',
        'GET/POST/PATCH /v1/eats/stores/{id}/pos_data',
        'webhooks store.provisioned / store.deprovisioned',
        'PUT /v2/eats/stores/{id}/menus',
        'webhook store.menu_refresh_request',
        'POST menu item update / OOS',
        'POST/GET store status',
        'webhook store.status.changed',
        'GET order v2/v1 + delivery',
        'webhook orders.notification (+ auto-accept)',
        'accept / deny / cancel / ready',
        'webhook ACK HTTP 200 empty',
      ],
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}
