import logger from './logger.js';
import { PUBLIC_PAYMENT_UNAVAILABLE, sanitizePaymentErrorForClient } from '../utils/paymentErrorMessages.js';

const MONEI_API_BASE = 'https://api.monei.com/v1';

// ── Credenciales desde .env ──────────────────────────────────────────────────
// TOKEN_API_KEY / TOKEN_API_KEY_TEST = API keys (pk_live_xxx / pk_test_xxx)
//   → van en el header Authorization para llamadas server-side
// TOKEN_API_ID / TOKEN_API_ID_TEST = Account IDs (UUID)
//   → identificadores de cuenta MONEI
const LIVE_API_KEY = process.env.TOKEN_API_KEY || '';
const TEST_API_KEY = process.env.TOKEN_API_KEY_TEST || '';
const LIVE_ACCOUNT_ID = process.env.TOKEN_API_ID || '';
const TEST_ACCOUNT_ID = process.env.TOKEN_API_ID_TEST || '';

const DEFAULT_MODE =
  (process.env.MONEI_MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test';

if (!LIVE_API_KEY && !TEST_API_KEY) {
  logger.warn(
    '[MONEI] No se encontraron API keys (TOKEN_API_KEY / TOKEN_API_KEY_TEST) en .env',
  );
}

logger.info(
  {
    mode: DEFAULT_MODE,
    hasLiveKey: !!LIVE_API_KEY,
    hasTestKey: !!TEST_API_KEY,
    liveKeyPreview: LIVE_API_KEY ? LIVE_API_KEY.slice(0, 12) + '...' : '—',
    testKeyPreview: TEST_API_KEY ? TEST_API_KEY.slice(0, 12) + '...' : '—',
    hasLiveAccountId: !!LIVE_ACCOUNT_ID,
    hasTestAccountId: !!TEST_ACCOUNT_ID,
  },
  `[MONEI] Modo ${DEFAULT_MODE.toUpperCase()} | live_key=${LIVE_API_KEY ? 'OK' : '—'} | test_key=${TEST_API_KEY ? 'OK' : '—'}`,
);

// ── Helpers de modo ─────────────────────────────────────────────────────────

export function getDefaultMode() {
  return DEFAULT_MODE;
}

export function getApiKeyForMode(mode) {
  return mode === 'live' ? LIVE_API_KEY : TEST_API_KEY;
}

export function getPublicKeyForMode(mode) {
  return mode === 'live' ? LIVE_API_KEY : TEST_API_KEY;
}

export function getAccountIdForMode(mode) {
  return mode === 'live' ? LIVE_ACCOUNT_ID : TEST_ACCOUNT_ID;
}

export function getFallbackApiKey(mode) {
  return getApiKeyForMode(mode || DEFAULT_MODE);
}

export function isTestMode(apiKeyOrMode) {
  if (apiKeyOrMode === 'live' || apiKeyOrMode === 'test') return apiKeyOrMode === 'test';
  if (apiKeyOrMode === LIVE_API_KEY && LIVE_API_KEY) return false;
  if (apiKeyOrMode === TEST_API_KEY && TEST_API_KEY) return true;
  if (typeof apiKeyOrMode === 'string') {
    if (apiKeyOrMode.startsWith('pk_test_')) return true;
    if (apiKeyOrMode.startsWith('pk_live_')) return false;
  }
  return DEFAULT_MODE === 'test';
}

export function getMoneiCredentials(mode) {
  const m = mode || DEFAULT_MODE;
  return {
    mode: m,
    apiKey: getApiKeyForMode(m),
    publicKey: getPublicKeyForMode(m),
    accountId: getAccountIdForMode(m),
    hasApiKey: !!getApiKeyForMode(m),
    hasPublicKey: !!getPublicKeyForMode(m),
    hasAccountId: !!getAccountIdForMode(m),
  };
}

/**
 * Resuelve la API key a usar: primero intenta la config dinámica del usuario
 * (guardada en CouchDB settings), y si no existe usa la del .env.
 */
export async function resolveApiKey(req, userId) {
  if (!userId || !req) return getApiKeyForMode(DEFAULT_MODE);
  try {
    const { getActiveGatewayKey } = await import(
      '../controllers/settingsController.js'
    );
    const dynamicKey = await getActiveGatewayKey(req, userId);
    if (dynamicKey) return dynamicKey;
  } catch {
    // fall through to env fallback
  }
  return getApiKeyForMode(DEFAULT_MODE);
}

// ── Petición genérica a MONEI API ───────────────────────────────────────────

async function moneiRequest(method, path, body = null, apiKey = null) {
  const key = apiKey || getApiKeyForMode(DEFAULT_MODE);
  if (!key) {
    logger.error(
      { mode: getDefaultMode() },
      '[MONEI] API key no configurada (TOKEN_API_KEY / pasarela en ajustes)',
    );
    throw new Error(PUBLIC_PAYMENT_UNAVAILABLE);
  }

  const maskedKey =
    key.length > 12
      ? `${key.slice(0, 8)}...${key.slice(-4)} (len=${key.length})`
      : '(key too short)';

  const mode = key === LIVE_API_KEY ? 'LIVE' : key === TEST_API_KEY ? 'TEST' : '??';
  const accountId = mode === 'LIVE' ? LIVE_ACCOUNT_ID : mode === 'TEST' ? TEST_ACCOUNT_ID : '';
  const url = `${MONEI_API_BASE}${path}`;
  const options = {
    method,
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
      'User-Agent': 'Vertial-Backend/1.0',
      ...(accountId ? { 'MONEI-Account-ID': accountId } : {}),
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info(
    { method, url, maskedKey, mode, hasBody: !!body },
    `[MONEI][REQ] → ${method} ${url} | mode=${mode} key=${maskedKey}`,
  );

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  logger.info(
    {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      responseData: data,
    },
    `[MONEI][RES] ← ${response.status} ${response.statusText} | ${method} ${url}`,
  );

  if (!response.ok) {
    const internalMsg =
      data?.message || data?.error || `MONEI API error ${response.status}`;
    logger.error(
      { status: response.status, data, maskedKey, url, mode },
      `[MONEI] ${method} ${path} failed: ${internalMsg}`,
    );
    const error = new Error(sanitizePaymentErrorForClient(internalMsg));
    error.status = response.status;
    error.moneiData = data;
    throw error;
  }

  return data;
}

// ── Suscripciones ───────────────────────────────────────────────────────────

/**
 * Crea una suscripción en MONEI.
 * amount en céntimos (100 = 1 EUR), interval: day|week|month|year
 */
export async function createSubscription({
  amount,
  currency = 'EUR',
  interval = 'month',
  intervalCount = 1,
  trialPeriodDays = 0,
  description = '',
  customerName = '',
  customerEmail = '',
  callbackUrl,
  paymentCallbackUrl,
  metadata = {},
  apiKey = null,
}) {
  return moneiRequest(
    'POST',
    '/subscriptions',
    {
      amount,
      currency,
      interval,
      intervalCount,
      ...(trialPeriodDays > 0 ? { trialPeriodDays } : {}),
      description,
      customer: {
        name: customerName,
        email: customerEmail,
      },
      callbackUrl,
      paymentCallbackUrl,
      metadata,
    },
    apiKey,
  );
}

export async function activateSubscription(
  subscriptionId,
  { completeUrl, cancelUrl, allowedPaymentMethods, apiKey = null },
) {
  return moneiRequest(
    'POST',
    `/subscriptions/${subscriptionId}/activate`,
    {
      completeUrl,
      cancelUrl,
      ...(allowedPaymentMethods ? { allowedPaymentMethods } : {}),
    },
    apiKey,
  );
}

export async function getSubscription(subscriptionId, apiKey = null) {
  return moneiRequest(
    'GET',
    `/subscriptions/${subscriptionId}`,
    null,
    apiKey,
  );
}

export async function cancelSubscription(subscriptionId, apiKey = null) {
  return moneiRequest(
    'POST',
    `/subscriptions/${subscriptionId}/cancel`,
    null,
    apiKey,
  );
}

export async function pauseSubscription(subscriptionId, apiKey = null) {
  return moneiRequest(
    'POST',
    `/subscriptions/${subscriptionId}/pause`,
    null,
    apiKey,
  );
}

export async function resumeSubscription(subscriptionId, apiKey = null) {
  return moneiRequest(
    'POST',
    `/subscriptions/${subscriptionId}/resume`,
    null,
    apiKey,
  );
}

// ── Pagos ───────────────────────────────────────────────────────────────────

export async function getPayment(paymentId, apiKey = null) {
  return moneiRequest('GET', `/payments/${paymentId}`, null, apiKey);
}

export async function listPayments({
  limit = 100,
  offset = 0,
  sort,
  startDate,
  endDate,
  status,
  apiKey = null,
} = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (sort) params.set('sort', sort);
  if (startDate) params.set('startDate', String(startDate));
  if (endDate) params.set('endDate', String(endDate));
  if (status) params.set('status', status);
  const qs = params.toString();
  return moneiRequest(
    'GET',
    `/payments${qs ? `?${qs}` : ''}`,
    null,
    apiKey,
  );
}

export async function listSubscriptions({
  limit = 100,
  offset = 0,
  status,
  apiKey = null,
} = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (status) params.set('status', status);
  const qs = params.toString();
  return moneiRequest(
    'GET',
    `/subscriptions${qs ? `?${qs}` : ''}`,
    null,
    apiKey,
  );
}

export async function createPayment({
  amount,
  currency = 'EUR',
  orderId,
  description,
  customer,
  completeUrl,
  cancelUrl,
  callbackUrl,
  paymentToken,
  metadata = {},
  apiKey = null,
}) {
  return moneiRequest(
    'POST',
    '/payments',
    {
      amount,
      currency,
      orderId,
      description,
      ...(customer ? { customer } : {}),
      ...(completeUrl ? { completeUrl } : {}),
      ...(cancelUrl ? { cancelUrl } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(paymentToken ? { paymentToken } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    },
    apiKey,
  );
}

export async function refundPayment(
  paymentId,
  { amount, reason, apiKey = null } = {},
) {
  return moneiRequest(
    'POST',
    `/payments/${paymentId}/refund`,
    {
      ...(amount ? { amount } : {}),
      ...(reason ? { refundReason: reason } : {}),
    },
    apiKey,
  );
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody, signatureHeader) {
  logger.info(
    {
      hasSignature: !!signatureHeader,
      signaturePreview: signatureHeader
        ? signatureHeader.slice(0, 30) + '...'
        : null,
      rawBodyLen: rawBody?.length ?? 0,
    },
    `[MONEI][WEBHOOK-SIG] signature=${signatureHeader ? 'present' : 'MISSING'}, rawBodyLen=${rawBody?.length ?? 0}`,
  );
  if (!signatureHeader) {
    logger.warn('[MONEI] Webhook recibido sin cabecera MONEI-Signature');
    return true;
  }
  return true;
}
