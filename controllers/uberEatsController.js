import {
  getWebDbName,
  ensureDatabase,
  getWebConfigByBusinessId,
  getDeliveryDbName,
  findBusinessById,
  listScopedPointsOfSaleForBusiness,
  listDeliveryOrdersByUser,
  buildWebConfigDocument,
  putDocument,
  sanitizeDeliveryOrder,
  sanitizeDeliveryIntegrations,
} from '../services/couchdb.js';
import {
  buildUberAuthorizeUrl,
  createUberOAuthState,
  exchangeUberAuthorizationCode,
  assertUberEatsSandbox,
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
  acceptUberOrder,
  cancelUberOrder,
  denyUberOrder,
  getUberEatsAppAccessToken,
  getUberStoreStatus,
  markUberOrderReady,
  setUberStoreStatus,
} from '../services/uberEatsApi.js';
import { pushUberMenuFromCatalog, setUberMenuItemSuspension } from '../services/uberEatsMenu.js';
import {
  assertBusinessTeamAccess,
  assertBusinessTeamManage,
  canManageBusinessTeam,
} from '../services/businessAccess.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import { broadcastToBusiness, broadcastToUser } from '../services/sseService.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function errorMsg(error) {
  return error?.message || String(error || 'Error');
}

function integrationEnabledFromPosData(posData) {
  return Boolean(
    posData?.integration_enabled
    ?? posData?.pos_integration_enabled
    ?? false
  );
}

function certCheck(key, label, ok, detail = '', at = '') {
  return {
    key,
    label,
    status: ok ? 'ok' : 'pending',
    detail: String(detail || ''),
    at: String(at || ''),
  };
}

function boundUberStoreId(uber, requestedStoreId = '') {
  const bound = String(uber?.storeId || '').trim();
  const requested = String(requestedStoreId || '').trim();
  if (!bound) throw new Error('Falta una tienda Uber vinculada');
  if (requested && requested !== bound) {
    throw new Error('El Store ID no pertenece a la integración Uber de esta empresa');
  }
  return bound;
}

/** Un solo PDV activo de la empresa → ese es el de Uber. Sin preferencias por nombre. */
function soleActivePdv(pdvs) {
  const active = (Array.isArray(pdvs) ? pdvs : []).filter((pdv) => pdv && pdv.active !== false);
  return active.length === 1 ? active[0] : null;
}

async function loadBusinessActivePdvs(req, businessId) {
  const business = await findBusinessById(req, businessId).catch(() => null);
  const dataUserId = String(
    business?.owner_user_id
    || business?.user_id
    || businessId,
  ).trim();
  const pdvs = (
    await listScopedPointsOfSaleForBusiness(req, dataUserId, businessId).catch(() => [])
  ).filter((pdv) => pdv && pdv.active !== false);
  return { business, dataUserId, pdvs, solePdv: soleActivePdv(pdvs) };
}

/**
 * PDV de la integración: el ya guardado (si sigue activo) o el único PDV de la empresa.
 * Nunca elige por nombre (Tiana / Uber Test / etc.).
 */
function resolveUberSalesPointId(uber, pdvs, solePdv) {
  const saved = String(uber?.salesPointId || '').trim();
  if (saved && pdvs.some((pdv) => String(pdv._id || '') === saved)) return saved;
  return String(solePdv?._id || '').trim();
}

/** Nombre en Vertial = PDV (o empresa), no el merchant name que devuelve Uber. */
function resolveUberDisplayStoreName({ solePdv, business, requestedName, storeId }) {
  return String(
    solePdv?.name
    || business?.name
    || requestedName
    || storeId
    || '',
  ).trim();
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

async function requireUberBusinessManager(req, res, businessId) {
  if (!requireUberOperator(req, res)) return null;
  const access = await assertBusinessTeamManage(req, businessId);
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
      salesPointId: '',
      provisionedAt: '',
      menuPushedAt: '',
      menuItemCount: 0,
      lastStoreStatus: '',
      lastStoreStatusAt: '',
      posIntegrationEnabled: false,
      posDataCheckedAt: '',
      lastWebhookAt: '',
      lastWebhookType: '',
      lastOrderAt: '',
      lastOrderAcceptedAt: '',
      lastOrderReadyAt: '',
      lastOrderDeniedAt: '',
      lastOrderCancelledAt: '',
      lastOrderStatus: '',
      lastMenuItemUpdatedAt: '',
      lastMenuItemSuspendedAt: '',
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
    if (!(await requireUberBusinessManager(req, res, businessId))) return;
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
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const tokens = await exchangeUberAuthorizationCode(code);
    const { current, uber } = await loadUberIntegration(req, businessId);

    let integrations = await saveUberPatch(req, businessId, current, {
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

    // 1 cuenta Vertial + 1 PDV + 1 tienda Uber → enlazar solo, sin elegir.
    const { business, pdvs, solePdv } = await loadBusinessActivePdvs(req, businessId);
    const salesPointId = resolveUberSalesPointId(uber, pdvs, solePdv);
    if (stores.length === 1 && salesPointId) {
      const only = stores[0];
      const storeId = String(only.storeId || '').trim();
      const storeName = resolveUberDisplayStoreName({
        solePdv,
        business,
        requestedName: only.name,
        storeId,
      });
      let provisionError = '';
      let posIntegrationEnabled = Boolean(only.integrationEnabled);
      try {
        await provisionUberEatsStore({
          userAccessToken: tokens.accessToken,
          storeId,
          partnerStoreId: businessId,
          businessId,
        });
      } catch (provErr) {
        provisionError = errorMsg(provErr);
      }
      try {
        const { accessToken: appAccessToken } = await getUberEatsAppAccessToken();
        const posData = await getUberEatsPosData(appAccessToken, storeId);
        posIntegrationEnabled = integrationEnabledFromPosData(posData);
      } catch {
        /* keep previous */
      }
      const now = new Date().toISOString();
      const fresh = await getWebConfigByBusinessId(req, businessId);
      integrations = await saveUberPatch(req, businessId, fresh, {
        storeId,
        storeName,
        salesPointId,
        posIntegrationEnabled,
        posDataCheckedAt: now,
        provisionedAt: posIntegrationEnabled ? now : '',
        lastProvisionError: provisionError || '',
      });
    } else if (salesPointId && !String(uber.salesPointId || '').trim()) {
      const fresh = await getWebConfigByBusinessId(req, businessId);
      integrations = await saveUberPatch(req, businessId, fresh, { salesPointId });
    }

    logger.info(
      {
        businessId,
        scope: tokens.scope,
        stores: stores.length,
        autoLinked: Boolean(integrations?.uber?.storeId),
        salesPointId: integrations?.uber?.salesPointId || salesPointId || null,
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
      autoLinked: Boolean(integrations?.uber?.storeId),
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
    const requestedName = String(req.body?.storeName || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!storeId) {
      return badRequest(res, 'Falta el Store ID de Uber. Cópialo del panel Uber (tienda TEST).');
    }
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    if (!token) {
      return res.status(400).json({
        ok: false,
        error: 'Primero conecta Uber (paso 1). Luego pega el Store ID o elige una tienda.',
      });
    }

    let provisionError = '';
    let posIntegrationEnabled = false;
    try {
      await provisionUberEatsStore({
        userAccessToken: token,
        storeId,
        partnerStoreId: businessId,
        businessId,
      });
    } catch (provErr) {
      provisionError = errorMsg(provErr);
      logger.warn({ businessId, storeId, msg: provisionError }, 'Uber provision store failed');
      if (provisionError.includes('404') || /not found/i.test(provisionError)) {
        return res.status(400).json({
          ok: false,
          error: 'Store ID no encontrado en Uber. Revisa que sea de la cuenta TEST correcta.',
        });
      }
    }

    try {
      const { accessToken: appAccessToken } = await getUberEatsAppAccessToken();
      const posData = await getUberEatsPosData(appAccessToken, storeId);
      posIntegrationEnabled = integrationEnabledFromPosData(posData);
    } catch (posErr) {
      if (!provisionError) provisionError = errorMsg(posErr);
      logger.warn({ businessId, storeId, msg: errorMsg(posErr) }, 'Uber get pos_data after select failed');
    }

    const { business, pdvs, solePdv } = await loadBusinessActivePdvs(req, businessId);
    const salesPointId = resolveUberSalesPointId(uber, pdvs, solePdv);
    if (!salesPointId) {
      return res.status(400).json({
        ok: false,
        error: pdvs.length === 0
          ? 'Esta empresa no tiene PDV. Crea un punto de venta y vuelve a conectar Uber.'
          : 'Hay varios PDV en esta empresa: elige cuál recibirá los pedidos Uber.',
        needsPdvChoice: pdvs.length > 1,
      });
    }
    const storeName = resolveUberDisplayStoreName({
      solePdv: pdvs.find((p) => String(p._id) === salesPointId) || solePdv,
      business,
      requestedName,
      storeId,
    });
    const now = new Date().toISOString();
    const integrations = await saveUberPatch(req, businessId, current, {
      enabled: true,
      storeId,
      storeName,
      provisionedAt: posIntegrationEnabled ? now : String(uber.provisionedAt || ''),
      posIntegrationEnabled,
      posDataCheckedAt: now,
      salesPointId,
      oauth: true,
      lastProvisionError: provisionError || '',
    });

    logger.info(
      { businessId, storeId, salesPointId, posIntegrationEnabled, provisionError: provisionError || null },
      'Uber tienda seleccionada',
    );

    return res.json({
      ok: true,
      integrations,
      storeId,
      storeName,
      salesPointId,
      provisioned: posIntegrationEnabled,
      needsReconnect: Boolean(provisionError && /scope|not allowed|user_not_allowed/i.test(provisionError)),
      warning: provisionError
        ? ( /scope|not allowed|user_not_allowed/i.test(provisionError)
          ? 'Tienda guardada. Activa POS con Encender (provisioning). Si falla, reconecta Uber.'
          : `Tienda guardada, pero Uber respondió: ${provisionError}`)
        : undefined,
    });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber select store failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/pos-data/activate { businessId } */
export async function activateUberPosForBusiness(req, res) {
  try {
    assertUberEatsSandbox();
    const businessId = String(req.body?.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const token = String(uber.accessToken || '').trim();
    const storeId = String(uber.storeId || '').trim();
    if (!token) return badRequest(res, 'Reconecta Uber OAuth antes de activar el POS');
    if (!storeId) return badRequest(res, 'Falta una tienda Uber vinculada');

    await provisionUberEatsStore({
      userAccessToken: token,
      storeId,
      partnerStoreId: businessId,
      businessId,
    });
    const { accessToken: appAccessToken } = await getUberEatsAppAccessToken();
    const posData = await getUberEatsPosData(appAccessToken, storeId);
    const posIntegrationEnabled = integrationEnabledFromPosData(posData);
    const now = new Date().toISOString();
    const { pdvs, solePdv } = await loadBusinessActivePdvs(req, businessId);
    const salesPointId = resolveUberSalesPointId(uber, pdvs, solePdv);
    const integrations = await saveUberPatch(req, businessId, current, {
      posIntegrationEnabled,
      posDataCheckedAt: now,
      salesPointId,
      ...(posIntegrationEnabled ? { provisionedAt: now } : {}),
    });
    if (!posIntegrationEnabled) {
      return res.status(409).json({
        ok: false,
        error: 'Uber todavía devuelve integration_enabled=false',
        storeId,
        posData,
        integrations,
      });
    }
    return res.json({ ok: true, storeId, posData, integrations });
  } catch (error) {
    logger.warn({ error: errorMsg(error) }, 'Uber activate POS failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/store/pdv { businessId, salesPointId } */
export async function selectUberSalesPointForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    const salesPointId = String(req.body?.salesPointId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!salesPointId) return badRequest(res, 'Falta salesPointId');
    const access = await requireUberBusinessManager(req, res, businessId);
    if (!access) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const dataUserId = String(
      access.business?.owner_user_id
      || access.business?.user_id
      || businessId,
    ).trim();
    const pdvs = await listScopedPointsOfSaleForBusiness(req, dataUserId, businessId);
    const selected = pdvs.find(
      (pdv) => pdv.active !== false && String(pdv._id || '') === salesPointId,
    );
    if (!selected) {
      return res.status(403).json({
        ok: false,
        error: 'El PDV no pertenece a esta empresa o está inactivo',
      });
    }
    const patch = {
      salesPointId,
      ...(uber.storeId
        ? {
          storeName: resolveUberDisplayStoreName({
            solePdv: selected,
            business: access.business,
            requestedName: uber.storeName,
            storeId: uber.storeId,
          }),
        }
        : {}),
    };
    const integrations = await saveUberPatch(req, businessId, current, patch);
    return res.json({
      ok: true,
      storeId: uber.storeId || '',
      salesPointId,
      salesPointName: String(selected.name || ''),
      integrations,
    });
  } catch (error) {
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

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = boundUberStoreId(uber, storeId);

    const { accessToken } = await getUberEatsAppAccessToken();
    const posData = await getUberEatsPosData(accessToken, sid);
    const integrations = await saveUberPatch(req, businessId, current, {
      posIntegrationEnabled: integrationEnabledFromPosData(posData),
      posDataCheckedAt: new Date().toISOString(),
    });
    return res.json({ ok: true, storeId: sid, posData, integrations });
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
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = boundUberStoreId(uber, storeId);

    const { accessToken } = await getUberEatsAppAccessToken();
    await patchUberEatsPosData(accessToken, sid, patch);
    const posData = await getUberEatsPosData(accessToken, sid);
    const integrations = await saveUberPatch(req, businessId, current, {
      storeId: sid,
      posDataPatchedAt: new Date().toISOString(),
      posIntegrationEnabled: integrationEnabledFromPosData(posData),
      posDataCheckedAt: new Date().toISOString(),
    });
    return res.json({ ok: true, storeId: sid, posData, integrations });
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
    const sid = boundUberStoreId(uber, storeId);
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
    const sid = boundUberStoreId(uber, storeId);
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
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = boundUberStoreId(uber, storeId);
    if (String(status || '').toUpperCase() === 'ONLINE' && !uber.salesPointId) {
      return badRequest(res, 'Selecciona el PDV que recibirá los pedidos antes de poner Uber ONLINE');
    }

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
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const sid = boundUberStoreId(uber, storeId);

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

/** POST /api/uber-eats/menu/item { businessId, itemId, suspended } */
export async function updateUberMenuItemForBusiness(req, res) {
  try {
    assertUberEatsSandbox();
    const businessId = String(req.body?.businessId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const suspended = Boolean(req.body?.suspended);
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!itemId) return badRequest(res, 'Falta itemId');
    if (!(await requireUberBusinessManager(req, res, businessId))) return;

    const { current, uber } = await loadUberIntegration(req, businessId);
    const storeId = String(uber.storeId || '').trim();
    if (!storeId) return badRequest(res, 'Falta una tienda Uber vinculada');

    await setUberMenuItemSuspension(storeId, itemId, suspended);
    const now = new Date().toISOString();
    const integrations = await saveUberPatch(req, businessId, current, {
      lastMenuItemUpdatedAt: now,
      ...(suspended ? { lastMenuItemSuspendedAt: now } : {}),
    });
    return res.json({ ok: true, storeId, itemId, suspended, integrations });
  } catch (error) {
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/order/action { businessId, orderDocId, action } */
export async function actUberOrderForBusiness(req, res) {
  try {
    assertUberEatsSandbox();
    const businessId = String(req.body?.businessId || '').trim();
    const orderDocId = String(req.body?.orderDocId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const allowed = ['accept', 'deny', 'cancel', 'ready'];
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!orderDocId) return badRequest(res, 'Falta orderDocId');
    if (!allowed.includes(action)) return badRequest(res, 'Acción Uber no válida');
    const access = await requireUberBusinessAccess(req, res, businessId);
    if (!access) return;

    const business = access.business;
    const dataUserId = String(
      business?.owner_user_id
      || business?.user_id
      || businessId,
    ).trim();
    const orders = await listDeliveryOrdersByUser(req, dataUserId, { maxDocs: 500 });
    const order = orders.find(
      (candidate) => candidate._id === orderDocId
        && !candidate.deletedAt
        && String(candidate.business_id || candidate.businessId || '') === businessId,
    );
    if (!order) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    if (!canManageBusinessTeam(business, access.userId)) {
      const member = (business?.members || []).find(
        (entry) => String(entry?.user_id || '') === String(access.userId || ''),
      );
      const assignedRef = String(
        req.authUser?.employment?.salesPointId
        || req.user?.employment?.salesPointId
        || member?.salesPointId
        || member?.employment?.salesPointId
        || '',
      ).replace(/^wc:/, '').trim();
      const pdvs = await listScopedPointsOfSaleForBusiness(req, dataUserId, businessId);
      const orderPdv = pdvs.find(
        (pdv) => String(pdv._id || '') === String(order.salesPointId || ''),
      );
      const allowedRefs = new Set([
        String(order.salesPointId || '').trim(),
        String(orderPdv?.workCenterId || '').replace(/^wc:/, '').trim(),
      ].filter(Boolean));
      if (!assignedRef || !allowedRefs.has(assignedRef)) {
        return res.status(403).json({
          ok: false,
          error: 'No tienes permiso para actuar sobre pedidos de este PDV',
        });
      }
    }
    if (String(order.channel || '').toLowerCase() !== 'ubereats') {
      return badRequest(res, 'El pedido no pertenece a Uber Eats');
    }
    const externalOrderId = String(order.externalOrderId || '').trim();
    if (!externalOrderId) return badRequest(res, 'El pedido no tiene order ID de Uber');

    const { accessToken } = await getUberEatsAppAccessToken();
    const now = new Date().toISOString();
    const patch = {};
    if (action === 'accept') {
      const requestedPrepMinutes = Number(req.body?.prepMinutes);
      const prepMinutes = Number.isFinite(requestedPrepMinutes)
        ? Math.min(180, Math.max(5, Math.round(requestedPrepMinutes)))
        : 20;
      const pickupTime = Math.floor(Date.now() / 1000) + (prepMinutes * 60);
      await acceptUberOrder(accessToken, externalOrderId, {
        externalReferenceId: order.orderNumber || order._id,
        pickupTime,
      });
      patch.uberAcceptedAt = now;
      patch.uberPickupTime = pickupTime;
      patch.uberPrepMinutes = prepMinutes;
      patch.estimatedDeliveryMinutes = prepMinutes;
      patch.estimatedArrivalAt = new Date(pickupTime * 1000).toISOString();
      patch.status = 'cocina';
    } else if (action === 'deny') {
      await denyUberOrder(accessToken, externalOrderId, {
        explanation: String(req.body?.reason || 'Denied in Vertial sandbox'),
      });
      patch.uberDeniedAt = now;
      patch.status = 'cancelled';
      patch.cancelledAt = now;
      patch.cancelReason = String(req.body?.reason || 'Denegado en Uber Eats');
    } else if (action === 'cancel') {
      await cancelUberOrder(accessToken, externalOrderId, {
        details: String(req.body?.reason || 'Cancelled in Vertial sandbox'),
      });
      patch.uberCancelledAt = now;
      patch.status = 'cancelled';
      patch.cancelledAt = now;
      patch.cancelReason = String(req.body?.reason || 'Cancelado en Uber Eats');
    } else {
      await markUberOrderReady(accessToken, externalOrderId);
      patch.uberReadyAt = now;
    }

    const doc = {
      ...order,
      ...patch,
      stageHistory: [
        ...(Array.isArray(order.stageHistory) ? order.stageHistory : []),
        {
          status: String(patch.status || order.status || 'nuevo'),
          date: now,
          user: authEmail(req) || authUserId(req) || 'Vertial',
          notes: `Uber sandbox: ${action}`,
        },
      ],
      updatedAt: now,
    };
    const saved = await putDocument(req, getDeliveryDbName(), doc._id, doc);
    const sanitized = sanitizeDeliveryOrder({ ...doc, _rev: saved.rev });

    const { current } = await loadUberIntegration(req, businessId);
    const evidenceField = {
      accept: 'lastOrderAcceptedAt',
      deny: 'lastOrderDeniedAt',
      cancel: 'lastOrderCancelledAt',
      ready: 'lastOrderReadyAt',
    }[action];
    await saveUberPatch(req, businessId, current, {
      [evidenceField]: now,
      lastOrderAt: now,
      lastOrderStatus: action,
    });

    broadcastToUser(dataUserId, 'delivery_order_updated', sanitized);
    broadcastToBusiness(businessId, 'delivery:order_updated', {
      order: sanitized,
      userId: businessId,
    });
    return res.json({ ok: true, action, order: sanitized });
  } catch (error) {
    logger.error({ error: errorMsg(error) }, 'Uber sandbox order action failed');
    return res.status(500).json({ ok: false, error: errorMsg(error) });
  }
}

/** POST /api/uber-eats/disconnect { businessId } — limpia OAuth/tokens de ESTA empresa. */
export async function disconnectUberEatsForBusiness(req, res) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    if (!businessId) return badRequest(res, 'Falta businessId');
    // Dueño o gestor; si falla el rol, al menos el dueño de la sesión con acceso al negocio puede cortar la integración.
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
    let posData = null;
    let liveStoreStatus = null;
    let liveError = '';
    if (pub.sandbox && pub.configured && uber.storeId) {
      const errors = [];
      try {
        const { accessToken } = await getUberEatsAppAccessToken();
        posData = await getUberEatsPosData(accessToken, uber.storeId);
      } catch (error) {
        errors.push(`pos_data: ${errorMsg(error)}`);
      }
      try {
        const { accessToken } = await getUberEatsAppAccessToken();
        liveStoreStatus = await getUberStoreStatus(accessToken, uber.storeId);
      } catch (error) {
        errors.push(`store status: ${errorMsg(error)}`);
      }
      liveError = errors.join(' · ');
    }
    const posEnabled = posData ? integrationEnabledFromPosData(posData) : false;
    const storeStatus = String(
      liveStoreStatus?.status
      || liveStoreStatus?.online_status
      || '',
    ).toUpperCase();
    let uberOrders = [];
    try {
      const business = await findBusinessById(req, businessId).catch(() => null);
      const dataUserId = String(
        business?.owner_user_id
        || business?.user_id
        || businessId,
      ).trim();
      const orders = await listDeliveryOrdersByUser(req, dataUserId, { maxDocs: 500 });
      uberOrders = orders.filter(
        (order) => String(order.channel || '').toLowerCase() === 'ubereats'
          && String(order.business_id || order.businessId || '') === businessId,
      );
    } catch {
      uberOrders = [];
    }
    const acceptedEvidence = uberOrders.find((order) => order.uberAcceptedAt)?.uberAcceptedAt || '';
    const deniedEvidence = uberOrders.find((order) => order.uberDeniedAt)?.uberDeniedAt || '';
    const cancelledEvidence = uberOrders.find((order) => order.uberCancelledAt)?.uberCancelledAt || '';
    const readyEvidence = uberOrders.find((order) => order.uberReadyAt)?.uberReadyAt || '';
    const checks = [
      certCheck('sandbox', 'Entorno sandbox', pub.sandbox, pub.env),
      certCheck('oauth', 'OAuth conectado', Boolean(uber.oauth || uber.accessToken), uber.scope, uber.connectedAt),
      certCheck('store', 'Tienda vinculada', Boolean(uber.storeId), uber.storeName || uber.storeId),
      certCheck('sales_point', 'Store asociada a un PDV', Boolean(uber.salesPointId), uber.salesPointId),
      certCheck('pos_data', 'Integración POS activa', posEnabled, liveError || (posEnabled ? 'integration_enabled=true' : 'integration_enabled=false'), uber.posDataCheckedAt || uber.provisionedAt),
      certCheck('menu', 'Menú subido', Boolean(uber.menuPushedAt), `${Number(uber.menuItemCount || 0)} productos`, uber.menuPushedAt),
      certCheck('item_update', 'Producto actualizado', Boolean(uber.lastMenuItemUpdatedAt), '', uber.lastMenuItemUpdatedAt),
      certCheck('out_of_stock', 'Producto sin stock', Boolean(uber.lastMenuItemSuspendedAt), '', uber.lastMenuItemSuspendedAt),
      certCheck('store_status', 'Estado de tienda comprobado', Boolean(storeStatus), storeStatus, uber.lastStoreStatusAt),
      certCheck('webhook', 'Webhook recibido', Boolean(uber.lastWebhookAt), uber.lastWebhookType, uber.lastWebhookAt),
      certCheck('order_received', 'Pedido recibido', Boolean(uber.lastOrderAt), uber.lastOrderStatus, uber.lastOrderAt),
      certCheck('order_accepted', 'Pedido aceptado', Boolean(uber.lastOrderAcceptedAt || acceptedEvidence), '', uber.lastOrderAcceptedAt || acceptedEvidence),
      certCheck('order_denied', 'Pedido denegado', Boolean(uber.lastOrderDeniedAt || deniedEvidence), '', uber.lastOrderDeniedAt || deniedEvidence),
      certCheck('order_cancelled', 'Pedido cancelado', Boolean(uber.lastOrderCancelledAt || cancelledEvidence), '', uber.lastOrderCancelledAt || cancelledEvidence),
      certCheck('order_ready', 'Pedido listo', Boolean(uber.lastOrderReadyAt || readyEvidence), '', uber.lastOrderReadyAt || readyEvidence),
    ];
    const completed = checks.filter((check) => check.status === 'ok').length;
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
      posIntegrationEnabled: posEnabled,
      liveStoreStatus: storeStatus,
      liveError,
      checks,
      progress: {
        completed,
        total: checks.length,
        percent: Math.round((completed / checks.length) * 100),
      },
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
