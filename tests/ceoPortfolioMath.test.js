import { describe, expect, it } from 'vitest';
import {
  aggregateGroupChannels,
  buildCompanyGlances,
  buildOpsChips,
  pctOf,
} from '../src/app/components/saas/portfolio/ceo/ceoPortfolioMath.ts';

function row(partial) {
  return {
    businessId: 'b1',
    business: { name: 'Demo', businessType: 'delivery' },
    isDelivery: true,
    isRestaurant: false,
    brands: [],
    metrics: {
      revenueMonth: 1000,
      revenueToday: 100,
      revenuePrevMonth: 800,
      revenuePrevMonthMtd: 800,
      revenueByChannel: { Glovo: 600, TPV: 400 },
      activeOrders: 3,
      openCashRegisters: 1,
      cancelledMonth: 0,
      pizzasToday: 0,
      burgersToday: 0,
      tacosToday: 0,
      kebabsToday: 0,
      avgTicketMonth: 12,
    },
    finance: {
      incomeMonth: 900,
      incomePrevMonth: 700,
      incomePrevMonthMtd: 700,
      expensesMonth: 400,
      profitMonth: 500,
      ebitdaMonth: 450,
      ebitdaMarginMonth: 50,
      pendingAmount: 0,
    },
    team: {
      clockedInNow: 2,
      pendingVacationRequests: 0,
      payslipsThisMonth: 0,
      scheduleAlertsCount: 0,
      noShiftToday: 0,
    },
    clients: { totalClients: 10, newClientsMonth: 1 },
    ...partial,
  };
}

describe('ceoPortfolioMath', () => {
  it('calcula % de parte', () => {
    expect(pctOf(25, 100)).toBe(25);
    expect(pctOf(0, 0)).toBeNull();
  });

  it('agrega canales del grupo', () => {
    const channels = aggregateGroupChannels([
      row({}),
      row({
        businessId: 'b2',
        metrics: {
          ...row({}).metrics,
          revenueByChannel: { Glovo: 100, Uber: 50 },
        },
      }),
    ]);
    const glovo = channels.find((c) => c.label === 'Glovo');
    expect(glovo?.amount).toBe(700);
  });

  it('arma glances con share', () => {
    const glances = buildCompanyGlances([row({})], 1000);
    expect(glances[0].shareOfGroup).toBe(100);
    expect(glances[0].mom).not.toBeNull();
  });

  it('ops chips tone', () => {
    const chips = buildOpsChips([
      row({ metrics: { ...row({}).metrics, activeOrders: 20, cancelledMonth: 12 } }),
    ]);
    expect(chips[0].tone).toBe('bad');
  });
});
