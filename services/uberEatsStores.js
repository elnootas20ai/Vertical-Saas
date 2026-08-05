import logger from './logger.js';
import {
  getUberEatsApiBase,
  getUberEatsClientId,
  getUberEatsClientSecret,
  getUberEatsTokenUrl,
} from './uberEatsOAuth.js';

/**
 * Token de aplicación (client_credentials) para pedidos/menú tras provisionar tienda.
 * Distinto del token de usuario (authorization_code + eats.pos_provisioning).
 */
export async function getUberEatsAppAccessToken(scopes = 'eats.order eats.store') {
  const clientId = getUberEatsClientId();
  const clientSecret = getUberEatsClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Uber Eats no configurado (CLIENT_ID / CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: String(scopes || 'eats.order eats.store'),
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
  if (!response.ok || !data.access_token) {
    const msg = data.error_description || data.error || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg }, 'Uber app token failed');
    throw new Error(`Uber app token: ${msg}`);
  }
  return {
    accessToken: String(data.access_token),
    expiresIn: Number(data.expires_in || 0),
    scope: String(data.scope || scopes),
  };
}

/** Lista tiendas del merchant (token de usuario OAuth). */
export async function listUberEatsStores(userAccessToken) {
  if (!userAccessToken) throw new Error('Falta access token de usuario Uber');
  const url = `${getUberEatsApiBase()}/v1/eats/stores?limit=50`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const msg = data.message || data.error || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg }, 'Uber list stores failed');
    throw new Error(`Uber stores: ${msg}`);
  }
  const stores = Array.isArray(data.stores) ? data.stores : [];
  return stores.map((s) => ({
    storeId: String(s.store_id || s.id || ''),
    name: String(s.name || s.store_name || 'Tienda'),
    address: String(s.location?.address || s.address || ''),
    city: String(s.location?.city || ''),
    integrationEnabled: Boolean(s.pos_data?.integration_enabled ?? s.pos_data?.pos_integration_enabled),
  })).filter((s) => s.storeId);
}

/**
 * Activa Vertial como order manager en la tienda (token usuario eats.pos_provisioning).
 */
export async function provisionUberEatsStore({
  userAccessToken,
  storeId,
  partnerStoreId,
  businessId,
}) {
  if (!userAccessToken) throw new Error('Falta access token de usuario Uber');
  if (!storeId) throw new Error('Falta storeId');
  const url = `${getUberEatsApiBase()}/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`;
  const payload = {
    is_order_manager: true,
    integrator_store_id: String(partnerStoreId || businessId || storeId),
    store_configuration_data: JSON.stringify({
      vertialBusinessId: String(businessId || ''),
      partner: 'vertial',
    }),
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  // Uber a veces responde 200 vacío / 204
  if (!response.ok && response.status !== 204) {
    const msg = data.message || data.error || text || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg, storeId }, 'Uber provision store failed');
    throw new Error(`Uber provision: ${msg}`);
  }
  return { ok: true, storeId };
}
