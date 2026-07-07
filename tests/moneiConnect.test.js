import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { buildPartnerSignupHash, buildMerchantSignupUrl } from '../services/moneiConnect.js';

describe('moneiConnect signup link', () => {
  it('genera hash HMAC-SHA256(externalId, partnerKey) en hex', () => {
    const key = 'pk_test_partner_secret';
    const mid = 'user-abc-123';
    const expected = crypto.createHmac('sha256', key).update(mid, 'utf8').digest('hex');
    expect(buildPartnerSignupHash(mid, key)).toBe(expected);
  });

  it('incluye promo, mid y h en la URL cuando hay partner key', () => {
    process.env.MONEI_PARTNER_PROMO = 'vertial';
    process.env.MONEI_PARTNER_API_KEY_TEST = 'pk_test_link';
    const url = buildMerchantSignupUrl('uid-99', 'test');
    expect(url).toContain('promo=vertial');
    expect(url).toContain('mid=uid-99');
    expect(url).toContain('h=');
  });
});
