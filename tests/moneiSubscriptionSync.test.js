import { describe, expect, it } from 'vitest';
import {
  applyBillingExemptOverride,
  shouldApplyMoneiWebhookUpdate,
} from '../services/moneiSubscriptionSync.js';

describe('moneiSubscriptionSync', () => {
  it('ignora downgrade MONEI si la cuenta no tiene suscripción enlazada', () => {
    const account = { subscription: { status: 'subscription_active' } };
    expect(shouldApplyMoneiWebhookUpdate(account, 'sub-123', 'CANCELLED')).toBe(false);
  });

  it('ignora downgrade si el id de webhook no coincide', () => {
    const account = { subscription: { moneiSubscriptionId: 'sub-a', status: 'subscription_active' } };
    expect(shouldApplyMoneiWebhookUpdate(account, 'sub-b', 'CANCELLED')).toBe(false);
  });

  it('billingExempt mantiene activa aunque el estado sea suspendido', () => {
    expect(
      applyBillingExemptOverride('suspended', { billingExempt: true }),
    ).toBe('subscription_active');
  });
});
