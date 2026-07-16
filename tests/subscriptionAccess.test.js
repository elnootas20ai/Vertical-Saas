import { describe, expect, it } from 'vitest';
import {
  appendSubscriptionHistory,
  buildTransferPaymentConcept,
  isBlockingSubscriptionStatus,
  shouldBlockSubscriptionAccess,
} from '../shared/billing/subscriptionAccess.js';
import { isSubscriptionApiAllowlisted } from '../middleware/requireActiveSubscription.js';

describe('subscriptionAccess', () => {
  it('bloquea pending_payment y payment_sent', () => {
    expect(isBlockingSubscriptionStatus('pending_payment')).toBe(true);
    expect(isBlockingSubscriptionStatus('payment_sent')).toBe(true);
    expect(isBlockingSubscriptionStatus('subscription_active')).toBe(false);
    expect(shouldBlockSubscriptionAccess({ status: 'pending_payment' })).toBe(true);
    expect(shouldBlockSubscriptionAccess({ status: 'pending_payment', billingExempt: true })).toBe(
      false,
    );
  });

  it('genera concepto VERTIAL-XXXXXX', () => {
    expect(buildTransferPaymentConcept('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'VERTIAL-A1B2C3',
    );
  });

  it('appendSubscriptionHistory limita historial', () => {
    const next = appendSubscriptionHistory(
      { status: 'pending_payment', licenseHistory: [] },
      { action: 'payment_sent', by: 'user-1' },
    );
    expect(next.licenseHistory).toHaveLength(1);
    expect(next.licenseHistory[0].action).toBe('payment_sent');
  });
});

describe('requireActiveSubscription allowlist', () => {
  it('permite rutas de pago y setup', () => {
    expect(
      isSubscriptionApiAllowlisted({ originalUrl: '/api/subscriptions/notify-transfer-payment' }),
    ).toBe(true);
    expect(isSubscriptionApiAllowlisted({ originalUrl: '/api/businesses' })).toBe(true);
    expect(isSubscriptionApiAllowlisted({ originalUrl: '/api/vehicles' })).toBe(false);
    expect(isSubscriptionApiAllowlisted({ originalUrl: '/api/crm/clients' })).toBe(false);
  });
});
