import { describe, expect, it } from 'vitest';
import { buildUberMenuFromCatalogItems } from '../services/uberEatsMenu.js';
import {
  parseUberWebhookEvent,
  verifyUberWebhookSignature,
} from '../services/uberEatsWebhook.js';
import crypto from 'node:crypto';

describe('uberEatsMenu', () => {
  it('builds menu configuration from catalog items', () => {
    const menu = buildUberMenuFromCatalogItems([
      {
        id: 'p1',
        sku: 'BURGER-1',
        name: 'Burger',
        category: 'Comidas',
        unitPrice: 10.5,
        active: true,
        available: true,
        taxRate: 10,
        salesChannels: [{ channelId: 'ubereats', channelName: 'Uber Eats', customPrice: 12 }],
      },
      {
        id: 'p2',
        sku: 'HIDDEN',
        name: 'Hidden',
        category: 'Comidas',
        unitPrice: 5,
        active: true,
        salesChannels: [{ channelId: 'glovo', channelName: 'Glovo' }],
      },
    ], { storeName: 'Test Store' });

    expect(menu.items).toHaveLength(1);
    expect(menu.items[0].id).toBe('BURGER-1');
    expect(menu.items[0].price_info.price).toBe(1200);
    expect(menu.categories).toHaveLength(1);
    expect(menu.menus[0].title.translations.es_es).toBe('Test Store');
  });

  it('includes unchannelled active items', () => {
    const menu = buildUberMenuFromCatalogItems([
      { id: 'x', sku: 'X1', name: 'Solo', category: 'general', unitPrice: 3, active: true },
    ]);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0].price_info.price).toBe(300);
  });
});

describe('parseUberWebhookEvent', () => {
  it('parses order notification meta', () => {
    const ev = parseUberWebhookEvent({
      event_type: 'orders.notification',
      event_id: 'ev-1',
      meta: { resource_id: 'ord-9', user_id: 'store-1' },
      resource_href: 'https://api.uber.com/v1/eats/orders/ord-9',
    });
    expect(ev.eventType).toBe('orders.notification');
    expect(ev.orderId).toBe('ord-9');
    expect(ev.storeId).toBe('store-1');
    expect(ev.resourceHref).toContain('ord-9');
  });

  it('validates the webhook signature against the raw body', () => {
    const previous = process.env.UBER_EATS_CLIENT_SECRET;
    process.env.UBER_EATS_CLIENT_SECRET = 'webhook-test-secret';
    const rawBody = JSON.stringify({ event_type: 'store.status.changed', event_id: 'ev-2' });
    const signature = crypto
      .createHmac('sha256', process.env.UBER_EATS_CLIENT_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex');
    expect(verifyUberWebhookSignature(rawBody, signature)).toBe(true);
    expect(verifyUberWebhookSignature(rawBody, 'invalid')).toBe(false);
    if (previous === undefined) delete process.env.UBER_EATS_CLIENT_SECRET;
    else process.env.UBER_EATS_CLIENT_SECRET = previous;
  });
});
