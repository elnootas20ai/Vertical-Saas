import crypto from 'node:crypto';
import logger from './logger.js';
import { verifyWebhookSignature, getApiKeyForMode, getDefaultMode } from './monei.js';

const PARTNER_PROMO = String(process.env.MONEI_PARTNER_PROMO || 'vertial').trim();
const SIGNUP_BASE = String(
  process.env.MONEI_PARTNER_SIGNUP_URL || 'https://dashboard.monei.com/signup',
).replace(/\/$/, '');

function readPartnerKey(mode) {
  const m = mode === 'live' ? 'live' : 'test';
  if (m === 'live') {
    return String(
      process.env.MONEI_PARTNER_API_KEY ||
        process.env.TOKEN_API_KEY ||
        process.env.MONEI_API_KEY ||
        '',
    ).trim();
  }
  return String(
    process.env.MONEI_PARTNER_API_KEY_TEST ||
      process.env.TOKEN_API_KEY_TEST ||
      process.env.MONEI_API_KEY_TEST ||
      '',
  ).trim();
}

export function getPartnerPromoCode() {
  return PARTNER_PROMO;
}

/**
 * HMAC-SHA256(externalId, partnerApiKey) en hex — MONEI Connect registration link.
 * @see https://docs.monei.com/monei-connect/
 */
export function buildPartnerSignupHash(externalId, partnerApiKey) {
  return crypto.createHmac('sha256', partnerApiKey).update(String(externalId), 'utf8').digest('hex');
}

/**
 * URL de alta MONEI para un usuario Vertial (promo=vertial + mid + firma).
 */
export function buildMerchantSignupUrl(userId, mode = null) {
  const m = mode || getDefaultMode();
  const partnerKey = readPartnerKey(m);
  const externalId = String(userId || '').trim();
  if (!externalId || !PARTNER_PROMO) {
    throw new Error('No se pudo generar enlace MONEI Connect');
  }

  const params = new URLSearchParams({ promo: PARTNER_PROMO });
  if (partnerKey) {
    params.set('mid', externalId);
    params.set('h', buildPartnerSignupHash(externalId, partnerKey));
  } else {
    logger.warn(
      { userId: externalId },
      '[MONEI-Connect] Sin Partner API key — enlace solo con promo (sin mid/h)',
    );
  }

  return `${SIGNUP_BASE}?${params.toString()}`;
}

export function verifyPartnerWebhookSignature(rawBody, signatureHeader, livemode) {
  const mode = livemode === true ? 'live' : livemode === false ? 'test' : getDefaultMode();
  const key = readPartnerKey(mode);
  return verifyWebhookSignature(rawBody, signatureHeader, key);
}

export function mapAccountEventToConnectStatus(eventType, accountStatus = '') {
  const t = String(eventType || '').toLowerCase();
  const s = String(accountStatus || '').toUpperCase();
  if (t.includes('rejected')) return 'rejected';
  if (t.includes('blocked') || t.includes('suspended')) return 'suspended';
  if (t.includes('activated') || s === 'ACTIVE') return 'active';
  if (t.includes('approved') || s === 'APPROVED') return 'approved';
  if (t.includes('pending') || s === 'PENDING_CONTRACT' || s === 'PENDING_APPROVAL') return 'pending';
  return 'pending';
}
