import logger from './logger.js';
import {
  getUberEatsApiBase,
  getUberEatsClientId,
  getUberEatsClientSecret,
  getUberEatsTokenUrl,
} from './uberEatsOAuth.js';

/** Scopes app (client_credentials) concedidos en el caso GTS. */
export const UBER_EATS_APP_SCOPES = [
  'eats.order',
  'eats.store',
  'eats.store.status.write',
  'eats.store.orders.read',
  'eats.store.orders.cancel',
  'eats.store.orders.restaurantdelivery.status',
  'eats.report',
].join(' ');

let cachedAppToken = null;

function apiBase() {
  return getUberEatsApiBase();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { raw: text } : {};
  }
  return { data, text };
}

/**
 * Token de aplicación (client_credentials) — menú, pedidos, status.
 * Distinto del token de usuario (authorization_code + eats.pos_provisioning).
 */
export async function getUberEatsAppAccessToken(scopes = UBER_EATS_APP_SCOPES) {
  const scopeKey = String(scopes || UBER_EATS_APP_SCOPES);
  const now = Date.now();
  if (
    cachedAppToken
    && cachedAppToken.scopeKey === scopeKey
    && cachedAppToken.expiresAtMs > now + 60_000
  ) {
    return {
      accessToken: cachedAppToken.accessToken,
      expiresIn: Math.floor((cachedAppToken.expiresAtMs - now) / 1000),
      scope: cachedAppToken.scope,
    };
  }

  const clientId = getUberEatsClientId();
  const clientSecret = getUberEatsClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Uber Eats no configurado (CLIENT_ID / CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: scopeKey,
  });
  const response = await fetch(getUberEatsTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  const { data, text } = await parseJsonResponse(response);
  if (!response.ok || !data.access_token) {
    const msg = data.error_description || data.error || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg }, 'Uber app token failed');
    throw new Error(`Uber app token: ${msg}`);
  }
  const expiresIn = Number(data.expires_in || 0);
  cachedAppToken = {
    accessToken: String(data.access_token),
    expiresAtMs: now + Math.max(expiresIn, 60) * 1000,
    scope: String(data.scope || scopeKey),
    scopeKey,
  };
  return {
    accessToken: cachedAppToken.accessToken,
    expiresIn,
    scope: cachedAppToken.scope,
  };
}

/** @internal test helper */
export function clearUberEatsAppTokenCache() {
  cachedAppToken = null;
}

async function uberFetch({
  method = 'GET',
  path,
  accessToken,
  body,
  okStatuses = [200, 204],
  label = 'Uber API',
}) {
  if (!accessToken) throw new Error(`Sin accessToken (${label})`);
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(url, { method, headers, body: payload });
  const { data, text } = await parseJsonResponse(response);
  if (!okStatuses.includes(response.status) && !response.ok) {
    const msg = data.message || data.error || data.error_description || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg, path, method }, `${label} failed`);
    throw new Error(`${label}: ${msg}`);
  }
  return { status: response.status, data, text };
}

// ─── Stores / Onboarding ─────────────────────────────────────────────────────

/** Lista tiendas del merchant (token usuario OAuth). */
export async function listUberEatsStores(userAccessToken) {
  if (!userAccessToken) throw new Error('Falta access token de usuario Uber');
  const { data } = await uberFetch({
    method: 'GET',
    path: '/v1/eats/stores?limit=50',
    accessToken: userAccessToken,
    label: 'Uber list stores',
  });
  const stores = Array.isArray(data.stores) ? data.stores : [];
  return stores.map((s) => ({
    storeId: String(s.store_id || s.id || ''),
    name: String(s.name || s.store_name || 'Tienda'),
    address: String(s.location?.address || s.address || ''),
    city: String(s.location?.city || ''),
    integrationEnabled: Boolean(s.pos_data?.integration_enabled ?? s.pos_data?.pos_integration_enabled),
  })).filter((s) => s.storeId);
}

/** GET /v1/delivery/stores (variante Delivery API del checklist GTS). */
export async function listUberDeliveryStores(accessToken) {
  const { data } = await uberFetch({
    method: 'GET',
    path: '/v1/delivery/stores',
    accessToken,
    label: 'Uber delivery stores',
  });
  return data;
}

/** GET /v1/delivery/store/{id} */
export async function getUberDeliveryStore(accessToken, storeId) {
  if (!storeId) throw new Error('Falta storeId');
  const { data } = await uberFetch({
    method: 'GET',
    path: `/v1/delivery/store/${encodeURIComponent(storeId)}`,
    accessToken,
    label: 'Uber delivery store',
  });
  return data;
}

/** GET /v1/eats/stores/{id}/pos_data */
export async function getUberEatsPosData(userAccessToken, storeId) {
  if (!storeId) throw new Error('Falta storeId');
  const { data } = await uberFetch({
    method: 'GET',
    path: `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
    accessToken: userAccessToken,
    label: 'Uber get pos_data',
  });
  return data;
}

/**
 * Activa Vertial como order manager (token usuario eats.pos_provisioning).
 * POST /v1/eats/stores/{id}/pos_data
 */
export async function provisionUberEatsStore({
  userAccessToken,
  storeId,
  partnerStoreId,
  businessId,
}) {
  if (!userAccessToken) throw new Error('Falta access token de usuario Uber');
  if (!storeId) throw new Error('Falta storeId');
  const payload = {
    is_order_manager: true,
    integrator_store_id: String(partnerStoreId || businessId || storeId),
    store_configuration_data: JSON.stringify({
      vertialBusinessId: String(businessId || ''),
      partner: 'vertial',
    }),
  };
  await uberFetch({
    method: 'POST',
    path: `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
    accessToken: userAccessToken,
    body: payload,
    okStatuses: [200, 204],
    label: 'Uber provision store',
  });
  return { ok: true, storeId };
}

/** PATCH /v1/eats/stores/{id}/pos_data */
export async function patchUberEatsPosData(userAccessToken, storeId, patch = {}) {
  if (!storeId) throw new Error('Falta storeId');
  await uberFetch({
    method: 'PATCH',
    path: `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
    accessToken: userAccessToken,
    body: patch,
    okStatuses: [200, 204],
    label: 'Uber patch pos_data',
  });
  return { ok: true, storeId };
}

// ─── Store status ────────────────────────────────────────────────────────────

/**
 * Online / paused. Preferimos Eats Marketplace oficial;
 * también exponemos Delivery API del checklist GTS.
 */
export async function setUberStoreStatus(accessToken, storeId, {
  status = 'ONLINE',
  pausedUntil = '',
  reason = 'Updated by Vertial',
} = {}) {
  if (!storeId) throw new Error('Falta storeId');
  const body = {
    status: String(status || 'ONLINE').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'PAUSED',
    reason: String(reason || 'Updated by Vertial'),
  };
  if (body.status === 'PAUSED' && pausedUntil) {
    body.paused_until = String(pausedUntil);
  }

  try {
    await uberFetch({
      method: 'POST',
      path: `/v1/eats/store/${encodeURIComponent(storeId)}/status`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber set store status (eats)',
    });
    return { ok: true, api: 'eats', status: body.status };
  } catch (eatsErr) {
    await uberFetch({
      method: 'POST',
      path: `/v1/delivery/store/${encodeURIComponent(storeId)}/update-store-status`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber set store status (delivery)',
    });
    return { ok: true, api: 'delivery', status: body.status, fallbackFrom: eatsErr.message };
  }
}

export async function getUberStoreStatus(accessToken, storeId) {
  if (!storeId) throw new Error('Falta storeId');
  try {
    const { data } = await uberFetch({
      method: 'GET',
      path: `/v1/eats/store/${encodeURIComponent(storeId)}/status`,
      accessToken,
      label: 'Uber get store status (eats)',
    });
    return { api: 'eats', ...data };
  } catch (eatsErr) {
    const { data } = await uberFetch({
      method: 'GET',
      path: `/v1/delivery/store/${encodeURIComponent(storeId)}/status`,
      accessToken,
      label: 'Uber get store status (delivery)',
    });
    return { api: 'delivery', fallbackFrom: eatsErr.message, ...data };
  }
}

// ─── Menu ────────────────────────────────────────────────────────────────────

/** PUT /v2/eats/stores/{id}/menus */
export async function uploadUberEatsMenu(accessToken, storeId, menuConfiguration) {
  if (!storeId) throw new Error('Falta storeId');
  if (!menuConfiguration || typeof menuConfiguration !== 'object') {
    throw new Error('Falta menuConfiguration');
  }
  await uberFetch({
    method: 'PUT',
    path: `/v2/eats/stores/${encodeURIComponent(storeId)}/menus`,
    accessToken,
    body: menuConfiguration,
    okStatuses: [200, 204],
    label: 'Uber upload menu',
  });
  return { ok: true, storeId };
}

/** POST /v2/eats/stores/{id}/menus/items/{itemId} — update / OOS */
export async function updateUberEatsMenuItem(accessToken, storeId, itemId, patch) {
  if (!storeId || !itemId) throw new Error('Falta storeId o itemId');
  await uberFetch({
    method: 'POST',
    path: `/v2/eats/stores/${encodeURIComponent(storeId)}/menus/items/${encodeURIComponent(itemId)}`,
    accessToken,
    body: patch || {},
    okStatuses: [200, 204],
    label: 'Uber update menu item',
  });
  return { ok: true, storeId, itemId };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function fetchUberOrderDetails({ accessToken, resourceHref, orderId }) {
  if (!accessToken) throw new Error('Sin accessToken Uber');
  const candidates = [];
  if (resourceHref) candidates.push(resourceHref);
  if (orderId) {
    candidates.push(`${apiBase()}/v2/eats/order/${encodeURIComponent(orderId)}`);
    candidates.push(`${apiBase()}/v1/eats/orders/${encodeURIComponent(orderId)}`);
    candidates.push(`${apiBase()}/v1/delivery/order/${encodeURIComponent(orderId)}`);
  }
  if (!candidates.length) throw new Error('Sin resource_href / order_id');

  let lastErr;
  for (const url of candidates) {
    try {
      const { data } = await uberFetch({
        method: 'GET',
        path: url,
        accessToken,
        label: 'Uber get order',
      });
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Uber get order failed');
}

/** POST /v1/eats/orders/{id}/accept_pos_order (+ fallback Delivery API). */
export async function acceptUberOrder(accessToken, orderId, {
  reason = 'Accepted by Vertial',
  externalReferenceId = '',
  pickupTime,
} = {}) {
  if (!orderId) throw new Error('Falta orderId');
  const body = {
    reason: String(reason || 'Accepted by Vertial'),
    fields_relayed: {
      order_special_instructions: true,
      item_special_instructions: true,
      promotions: true,
    },
  };
  if (externalReferenceId) body.external_reference_id = String(externalReferenceId);
  if (pickupTime) body.pickup_time = Number(pickupTime);

  try {
    await uberFetch({
      method: 'POST',
      path: `/v1/eats/orders/${encodeURIComponent(orderId)}/accept_pos_order`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber accept order (eats)',
    });
    return { ok: true, api: 'eats' };
  } catch (eatsErr) {
    await uberFetch({
      method: 'POST',
      path: `/v1/delivery/order/${encodeURIComponent(orderId)}/accept`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber accept order (delivery)',
    });
    return { ok: true, api: 'delivery', fallbackFrom: eatsErr.message };
  }
}

export async function denyUberOrder(accessToken, orderId, {
  explanation = 'Denied by Vertial',
  code = 'POS_NOT_READY',
} = {}) {
  if (!orderId) throw new Error('Falta orderId');
  const body = {
    reason: {
      explanation: String(explanation || 'Denied by Vertial'),
      code: String(code || 'POS_NOT_READY'),
    },
  };
  try {
    await uberFetch({
      method: 'POST',
      path: `/v1/eats/orders/${encodeURIComponent(orderId)}/deny_pos_order`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber deny order (eats)',
    });
    return { ok: true, api: 'eats' };
  } catch (eatsErr) {
    await uberFetch({
      method: 'POST',
      path: `/v1/delivery/order/${encodeURIComponent(orderId)}/deny`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber deny order (delivery)',
    });
    return { ok: true, api: 'delivery', fallbackFrom: eatsErr.message };
  }
}

export async function cancelUberOrder(accessToken, orderId, {
  reason = 'RESTAURANT_TOO_BUSY',
  details = '',
} = {}) {
  if (!orderId) throw new Error('Falta orderId');
  const body = { reason: String(reason || 'RESTAURANT_TOO_BUSY') };
  if (details) body.details = String(details);
  try {
    await uberFetch({
      method: 'POST',
      path: `/v1/eats/orders/${encodeURIComponent(orderId)}/cancel`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber cancel order (eats)',
    });
    return { ok: true, api: 'eats' };
  } catch (eatsErr) {
    await uberFetch({
      method: 'POST',
      path: `/v1/delivery/order/${encodeURIComponent(orderId)}/cancel`,
      accessToken,
      body,
      okStatuses: [200, 204],
      label: 'Uber cancel order (delivery)',
    });
    return { ok: true, api: 'delivery', fallbackFrom: eatsErr.message };
  }
}

/** POST /v1/delivery/order/{id}/ready */
export async function markUberOrderReady(accessToken, orderId) {
  if (!orderId) throw new Error('Falta orderId');
  await uberFetch({
    method: 'POST',
    path: `/v1/delivery/order/${encodeURIComponent(orderId)}/ready`,
    accessToken,
    body: {},
    okStatuses: [200, 204],
    label: 'Uber mark order ready',
  });
  return { ok: true };
}
