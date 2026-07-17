import { describe, expect, it } from 'vitest';
import {
  deliveryOrderIncomeAmount,
  shouldSyncDeliveryOrderIncome,
} from '../src/app/lib/deliveryOrderFinanceRules';

describe('deliveryOrderFinanceRules', () => {
  it('syncs paid orders with amount', () => {
    expect(
      shouldSyncDeliveryOrderIncome({
        status: 'entregado',
        paymentStatus: 'paid',
        paymentCollected: true,
        paidAmount: 37.7,
        totalAmount: 37.7,
        refundAmount: 0,
      }),
    ).toBe(true);
  });

  it('skips pending or cancelled', () => {
    expect(
      shouldSyncDeliveryOrderIncome({
        status: 'en_reparto',
        paymentStatus: 'pending',
        paymentCollected: false,
        paidAmount: 0,
        totalAmount: 20,
        refundAmount: 0,
      }),
    ).toBe(false);
    expect(
      shouldSyncDeliveryOrderIncome({
        status: 'cancelled',
        paymentStatus: 'paid',
        paymentCollected: true,
        paidAmount: 20,
        totalAmount: 20,
        refundAmount: 0,
      }),
    ).toBe(false);
  });

  it('subtracts refunds from income amount', () => {
    expect(
      deliveryOrderIncomeAmount({
        paidAmount: 40,
        totalAmount: 40,
        refundAmount: 10,
      }),
    ).toBe(30);
  });
});
