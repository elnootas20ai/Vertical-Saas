import { describe, expect, it } from 'vitest';

// Smoke: vacation gate helpers live on server; unit-test accrual already covered.
// Here we only assert finance service helpers via dynamic import of shared rules.

import {
  shouldSyncDeliveryOrderIncome,
  deliveryOrderIncomeAmount,
} from '../src/app/lib/deliveryOrderFinanceRules.ts';

describe('delivery finance rules (server mirror)', () => {
  it('syncs paid orders and amount neto', () => {
    expect(shouldSyncDeliveryOrderIncome({
      status: 'cocina',
      paymentStatus: 'paid',
      paymentCollected: true,
      paidAmount: 100,
      totalAmount: 100,
      refundAmount: 0,
    })).toBe(true);
    expect(deliveryOrderIncomeAmount({ paidAmount: 100, totalAmount: 100, refundAmount: 10 })).toBe(90);
  });

  it('rejects refunded / cancelled', () => {
    expect(shouldSyncDeliveryOrderIncome({
      status: 'devuelto',
      paymentStatus: 'refunded',
      paymentCollected: false,
      paidAmount: 100,
      totalAmount: 100,
      refundAmount: 100,
    })).toBe(false);
  });
});
