import { describe, expect, it } from 'vitest';
import {
  companyGeneratedMonth,
  companyGeneratedPrevMonthComparable,
  companyMomPct,
  deliveryChannelShares,
  portfolioVerticalKind,
  sumCompanyGenerated,
} from '../src/app/components/saas/portfolio/portfolioCompanyPulse.ts';

function row(partial) {
  return {
    isDelivery: false,
    isRestaurant: false,
    brands: [],
    metrics: {
      revenueMonth: 0,
      revenueToday: 0,
      revenuePrevMonth: 0,
      revenuePrevMonthMtd: 0,
      revenueByChannel: {},
    },
    finance: { incomeMonth: 0, incomePrevMonth: 0, incomePrevMonthMtd: 0 },
    billing: null,
    ...partial,
  };
}

describe('portfolioCompanyPulse', () => {
  it('elige métrica por vertical', () => {
    const delivery = row({
      isDelivery: true,
      metrics: {
        revenueMonth: 1200,
        revenueToday: 0,
        revenuePrevMonth: 0,
        revenuePrevMonthMtd: 0,
        revenueByChannel: {},
      },
      finance: { incomeMonth: 999, incomePrevMonth: 0, incomePrevMonthMtd: 0 },
    });
    const financeOnly = row({
      finance: { incomeMonth: 500, incomePrevMonth: 0, incomePrevMonthMtd: 0 },
    });
    expect(portfolioVerticalKind(delivery)).toBe('delivery');
    expect(companyGeneratedMonth(delivery)).toBe(1200);
    expect(companyGeneratedMonth(financeOnly)).toBe(500);
  });

  it('MoM usa MTD comparable, no el mes anterior entero', () => {
    const delivery = row({
      isDelivery: true,
      metrics: {
        revenueMonth: 100,
        revenueToday: 0,
        revenuePrevMonth: 10000,
        revenuePrevMonthMtd: 80,
        revenueByChannel: {},
      },
    });
    expect(companyGeneratedPrevMonthComparable(delivery)).toBe(80);
    expect(companyMomPct(delivery)).toBe(25);
  });

  it('ordena canales e integra shares', () => {
    const delivery = row({
      isDelivery: true,
      metrics: {
        revenueMonth: 100,
        revenueToday: 0,
        revenuePrevMonth: 0,
        revenuePrevMonthMtd: 0,
        revenueByChannel: { Glovo: 60, TPV: 40 },
      },
    });
    const shares = deliveryChannelShares(delivery);
    expect(shares[0].label).toBe('Glovo');
    expect(shares[0].percent).toBe(60);
  });

  it('suma generado del grupo', () => {
    const sum = sumCompanyGenerated([
      row({
        isDelivery: true,
        metrics: {
          revenueMonth: 100,
          revenueToday: 10,
          revenuePrevMonth: 0,
          revenuePrevMonthMtd: 0,
          revenueByChannel: {},
        },
        finance: { incomeMonth: 80, incomePrevMonth: 0, incomePrevMonthMtd: 0 },
      }),
      row({
        finance: { incomeMonth: 50, incomePrevMonth: 0, incomePrevMonthMtd: 0 },
      }),
    ]);
    expect(sum.month).toBe(150);
    expect(sum.today).toBe(10);
    expect(sum.opsMonth).toBe(100);
    expect(sum.financeMonth).toBe(130);
  });
});
