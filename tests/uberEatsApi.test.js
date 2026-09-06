import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptUberOrder,
  clearUberEatsAppTokenCache,
  fetchUberOrderDetails,
  getUberEatsAppAccessToken,
  provisionUberEatsStore,
} from '../services/uberEatsApi.js';
import { syncUberOrderLifecycle } from '../services/uberEatsOrderSync.js';

describe('Uber Eats sandbox API contract', () => {
  const previous = {};

  beforeEach(() => {
    for (const key of ['UBER_EATS_CLIENT_ID', 'UBER_EATS_CLIENT_SECRET', 'UBER_EATS_ENV']) {
      previous[key] = process.env[key];
    }
    process.env.UBER_EATS_CLIENT_ID = 'test-client';
    process.env.UBER_EATS_CLIENT_SECRET = 'test-secret';
    process.env.UBER_EATS_ENV = 'sandbox';
    clearUberEatsAppTokenCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearUberEatsAppTokenCache();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('does not request user-only pos provisioning in client_credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'app-token',
      expires_in: 3600,
      scope: 'eats.order eats.store',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await getUberEatsAppAccessToken();

    const body = String(fetchMock.mock.calls[0][1]?.body || '');
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox-login.uber.com/oauth/v2/token');
    expect(body).toContain('grant_type=client_credentials');
    expect(body).not.toContain('eats.pos_provisioning');
  });

  it('provisions pos_data with the user OAuth token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    await provisionUberEatsStore({
      userAccessToken: 'user-token',
      storeId: 'store-test',
      businessId: 'business-test',
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      'https://test-api.uber.com/v1/eats/stores/store-test/pos_data',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(requestUrl.searchParams.get('is_order_manager')).toBe('true');
    expect(requestUrl.searchParams.get('integrator_store_id')).toBe('business-test');
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
  });

  it('never sends the Uber bearer token to a webhook-controlled host', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'order-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await fetchUberOrderDetails({
      accessToken: 'secret-token',
      resourceHref: 'https://attacker.invalid/steal',
      orderId: 'order-test',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test-api.uber.com/v2/eats/order/order-test',
    );
  });

  it('sends pickup_time as a Unix timestamp when accepting', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    await acceptUberOrder('app-token', 'order-test', {
      pickupTime: 1788714000,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      pickup_time: 1788714000,
    });
  });

  it('marks an accepted Uber order ready when it leaves Montaje', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'app-token',
        expires_in: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await syncUberOrderLifecycle({
      order: {
        channel: 'ubereats',
        externalOrderId: 'order-test',
        orderNumber: 'PED-TEST',
        status: 'en_reparto',
        uberAcceptedAt: '2026-09-06T10:00:00.000Z',
      },
      previousStatus: 'cocina',
      action: 'status',
    });

    expect(result).toMatchObject({ ok: true, actions: ['ready'] });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://test-api.uber.com/v1/delivery/order/order-test/ready',
    );
  });
});
