import { describe, expect, it } from 'vitest';
import {
  buildAggregatorCashRows,
  buildDailyAggregatorRows,
  applyManualAggregatorTotals,
  getActiveAggregatorPlatforms,
  getAggregatorCajaPlatforms,
  getClosingAggregatorPlatforms,
  DEFAULT_DELIVERY_INTEGRATIONS,
  sumAggregatorCash,
  sumAggregatorCard,
  sumClosingBrandTotals,
  resolveClosingChannelTotalSales,
} from '../src/app/lib/deliveryIntegrationsUi.ts';

describe('deliveryIntegrationsUi', () => {
  it('returns only enabled integrations', () => {
    const active = getActiveAggregatorPlatforms({
      ...DEFAULT_DELIVERY_INTEGRATIONS,
      globo: { enabled: true, token: 'x' },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.channel).toBe('glovo');
  });

  it('shows all 4 caja platforms when any integration is enabled, without token', () => {
    const cajaPlatforms = getAggregatorCajaPlatforms({
      ...DEFAULT_DELIVERY_INTEGRATIONS,
      globo: { enabled: true, token: '' },
    });
    expect(cajaPlatforms).toHaveLength(4);
  });

  it('hides caja platforms when none are enabled', () => {
    expect(getAggregatorCajaPlatforms(DEFAULT_DELIVERY_INTEGRATIONS)).toHaveLength(0);
  });

  it('always returns 4 platforms for TPV closing', () => {
    expect(getClosingAggregatorPlatforms()).toHaveLength(4);
  });

  it('builds aggregator rows from orders in session window', () => {
    const session = {
      openedAt: '2026-06-08T10:00:00.000Z',
      closedAt: '2026-06-08T18:00:00.000Z',
      pointOfSaleId: 'pdv-1',
      transactions: [],
    };
    const rows = buildAggregatorCashRows(
      getActiveAggregatorPlatforms({
        ...DEFAULT_DELIVERY_INTEGRATIONS,
        globo: { enabled: true, token: '' },
      }),
      session,
      [
        {
          channel: 'glovo',
          salesPointId: 'pdv-1',
          createdAt: '2026-06-08T12:00:00.000Z',
          status: 'entregado',
          totalAmount: 25.5,
        },
      ],
    );
    expect(rows[0]?.totalSales).toBe(25.5);
    expect(rows[0]?.orderCount).toBe(1);
  });

  it('counts manual TPV sales marked with aggregator channel', () => {
    const session = {
      openedAt: '2026-06-08T10:00:00.000Z',
      closedAt: '2026-06-08T18:00:00.000Z',
      pointOfSaleId: 'pdv-1',
      transactions: [{ type: 'sale', channel: 'glovo', amount: 15 }],
    };
    const rows = buildAggregatorCashRows(
      getClosingAggregatorPlatforms(),
      session,
      [],
    );
    expect(rows.find((r) => r.platform.channel === 'glovo')?.totalSales).toBe(15);
    expect(rows.find((r) => r.platform.channel === 'glovo')?.orderCount).toBe(1);
  });

  it('combines manual orders and TPV sales without double counting', () => {
    const session = {
      openedAt: '2026-06-08T10:00:00.000Z',
      closedAt: '2026-06-08T18:00:00.000Z',
      pointOfSaleId: 'pdv-1',
      transactions: [
        { type: 'sale', channel: 'glovo', amount: 5, orderId: 'ord-1' },
      ],
    };
    const rows = buildAggregatorCashRows(
      getClosingAggregatorPlatforms(),
      session,
      [
        {
          id: 'ord-1',
          channel: 'glovo',
          salesPointId: 'pdv-1',
          createdAt: '2026-06-08T12:00:00.000Z',
          status: 'entregado',
          totalAmount: 20,
        },
      ],
    );
    const glovo = rows.find((r) => r.platform.channel === 'glovo');
    expect(glovo?.totalSales).toBe(20);
    expect(glovo?.orderCount).toBe(1);
  });

  it('groups daily aggregator rows by day', () => {
    const rows = buildDailyAggregatorRows(
      getAggregatorCajaPlatforms({
        ...DEFAULT_DELIVERY_INTEGRATIONS,
        uber: { enabled: true, token: '' },
      }),
      [
        {
          channel: 'ubereats',
          createdAt: '2026-06-08T15:00:00.000Z',
          status: 'entregado',
          totalAmount: 40,
        },
        {
          channel: 'ubereats',
          createdAt: '2026-06-07T15:00:00.000Z',
          status: 'entregado',
          totalAmount: 99,
        },
      ],
      '2026-06-08',
    );
    expect(rows.find((r) => r.platform.channel === 'ubereats')?.totalSales).toBe(40);
    expect(rows.find((r) => r.platform.channel === 'ubereats')?.orderCount).toBe(1);
  });

  it('applies manual aggregator totals and cash override', () => {
    const rows = buildAggregatorCashRows(getClosingAggregatorPlatforms(), {
      openedAt: '2026-06-08T10:00:00.000Z',
      pointOfSaleId: 'pdv-1',
      transactions: [],
    }, []);
    const manual = applyManualAggregatorTotals(
      rows,
      { glovo: '123.45', ubereats: '50' },
      { glovo: '20', ubereats: '60' },
    );
    expect(manual.find((r) => r.platform.channel === 'glovo')?.totalSales).toBe(123.45);
    expect(manual.find((r) => r.platform.channel === 'glovo')?.cashSales).toBe(20);
    // Si el efectivo declarado supera el total, el total sube (no se anula el efectivo).
    expect(manual.find((r) => r.platform.channel === 'ubereats')?.cashSales).toBe(60);
    expect(manual.find((r) => r.platform.channel === 'ubereats')?.totalSales).toBe(60);
  });

  it('cuenta efectivo/tarjeta manual aunque totalSales auto sea 0 (cierre Pau)', () => {
    const rows = buildAggregatorCashRows(getClosingAggregatorPlatforms(), {
      openedAt: '2026-06-08T10:00:00.000Z',
      pointOfSaleId: 'pdv-1',
      transactions: [],
    }, []);
    const manual = applyManualAggregatorTotals(
      rows,
      {},
      { glovo: '100', justeat: '25,50' },
      { glovo: '40', ubereats: '10' },
    );
    const glovo = manual.find((r) => r.platform.channel === 'glovo');
    expect(glovo?.cashSales).toBe(100);
    expect(glovo?.cardSales).toBe(40);
    expect(glovo?.totalSales).toBe(140);
    const justeat = manual.find((r) => r.platform.channel === 'justeat');
    expect(justeat?.cashSales).toBe(25.5);
    expect(justeat?.totalSales).toBe(25.5);
    const uber = manual.find((r) => r.platform.channel === 'ubereats');
    expect(uber?.cardSales).toBe(10);
    expect(uber?.totalSales).toBe(10);
    const apps =
      sumAggregatorCash(manual) + sumAggregatorCard(manual);
    expect(apps).toBe(175.5);
  });

  it('no reutiliza total legacy cuando marcas vacías (Uber 2 € fantasma)', () => {
    const brandIds = ['brand-modomio'];
    const lines = {
      total: '2,00',
      totalByBrand: { 'brand-modomio': '' },
    };
    const resolved = resolveClosingChannelTotalSales(lines, 0, brandIds);
    expect(resolved.totalSales).toBe(0);
    expect(resolved.fromBrands).toBe(false);
  });

  it('suma marcas cuando están rellenas', () => {
    const brandIds = ['brand-modomio', 'brand-bb'];
    const lines = {
      total: '99,00',
      totalByBrand: { 'brand-modomio': '94,50', 'brand-bb': '' },
    };
    expect(sumClosingBrandTotals(lines, brandIds)).toBe(94.5);
    expect(resolveClosingChannelTotalSales(lines, 0, brandIds).totalSales).toBe(94.5);
  });

  it('sin marcas usa total legacy o sistema', () => {
    expect(resolveClosingChannelTotalSales({ total: '26,50' }, 0, []).totalSales).toBe(26.5);
    expect(resolveClosingChannelTotalSales({ total: '' }, 12, []).totalSales).toBe(12);
  });
});
