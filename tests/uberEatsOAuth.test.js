import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assertUberEatsSandbox,
  buildUberAuthorizeUrl,
  createUberOAuthState,
  getUberEatsPublicConfig,
  isUberEatsConfigured,
  verifyUberOAuthState,
} from '../services/uberEatsOAuth.js';

describe('uberEatsOAuth', () => {
  const prev = {};

  beforeEach(() => {
    for (const key of [
      'UBER_EATS_CLIENT_ID',
      'UBER_EATS_CLIENT_SECRET',
      'UBER_EATS_ENV',
      'UBER_EATS_REDIRECT_URI',
      'UBER_EATS_SCOPES',
      'APP_URL',
    ]) {
      prev[key] = process.env[key];
    }
    process.env.UBER_EATS_CLIENT_ID = 'test-client-id';
    process.env.UBER_EATS_CLIENT_SECRET = 'test-client-secret';
    process.env.UBER_EATS_ENV = 'sandbox';
    process.env.UBER_EATS_REDIRECT_URI = 'https://vertialapp.com/saas/vertical/delivery/integraciones';
    process.env.UBER_EATS_SCOPES = 'eats.pos_provisioning';
    delete process.env.APP_URL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reports configured when client credentials exist', () => {
    expect(isUberEatsConfigured()).toBe(true);
    const cfg = getUberEatsPublicConfig();
    expect(cfg.configured).toBe(true);
    expect(cfg.env).toBe('sandbox');
    expect(cfg.redirectUri).toContain('/saas/vertical/delivery/integraciones');
    expect(cfg.redirectUri).toContain('vertialapp.com');
  });

  it('defaults redirect to vertialapp.com when unset (sin túnel)', () => {
    delete process.env.UBER_EATS_REDIRECT_URI;
    const cfg = getUberEatsPublicConfig();
    expect(cfg.redirectUri).toBe('https://vertialapp.com/saas/vertical/delivery/integraciones');
  });

  it('builds authorize url with client id and state', () => {
    const state = createUberOAuthState({ businessId: 'biz-1', userId: 'u-1' });
    const url = buildUberAuthorizeUrl(state);
    expect(url).toContain('sandbox-login.uber.com');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('eats.pos_provisioning');
    expect(url).toContain(encodeURIComponent(state));
  });

  it('requests only eats.pos_provisioning by default (user OAuth)', () => {
    delete process.env.UBER_EATS_SCOPES;
    const state = createUberOAuthState({ businessId: 'biz-1', userId: 'u-1' });
    const url = buildUberAuthorizeUrl(state);
    expect(url).toContain('eats.pos_provisioning');
    expect(url).not.toContain('eats.store');
    expect(url).not.toContain('eats.order');
  });

  it('strips client_credentials scopes from user OAuth (avoid invalid_scope)', () => {
    process.env.UBER_EATS_SCOPES = 'eats.pos_provisioning eats.store eats.order offline_access';
    const state = createUberOAuthState({ businessId: 'biz-1', userId: 'u-1' });
    const url = buildUberAuthorizeUrl(state);
    expect(url).toContain('eats.pos_provisioning');
    expect(url).toContain('offline_access');
    expect(url).not.toContain('eats.store');
    expect(url).not.toContain('eats.order');
  });

  it('can force Uber login when changing the merchant account', () => {
    const state = createUberOAuthState({ businessId: 'biz-1', userId: 'u-1' });
    const url = buildUberAuthorizeUrl(state, { promptLogin: true });
    expect(url).toContain('prompt=login');
  });

  it('blocks certification helpers outside sandbox', () => {
    process.env.UBER_EATS_ENV = 'production';
    expect(() => assertUberEatsSandbox()).toThrow(/sandbox/i);
  });

  it('roundtrips oauth state', () => {
    const state = createUberOAuthState({ businessId: 'biz-9', userId: 'u-9' });
    const payload = verifyUberOAuthState(state);
    expect(payload.businessId).toBe('biz-9');
    expect(payload.userId).toBe('u-9');
  });
});
