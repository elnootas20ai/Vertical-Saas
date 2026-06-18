import { describe, expect, it } from 'vitest';
import { shouldSkipEmptyStoreApply } from '../src/app/lib/retailScopeApply.ts';

describe('retailScopeCache — regresión sidebar PDV', () => {
  it('shouldSkipEmptyStoreApply conserva tiendas visibles ante fetch vacío', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 0,
        incomingPdvCount: 0,
        force: false,
      }),
    ).toBe(true);
  });

  it('shouldSkipEmptyStoreApply aplica vacío cuando force=true (alta/baja real)', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 0,
        incomingPdvCount: 0,
        force: true,
      }),
    ).toBe(false);
  });

  it('shouldSkipEmptyStoreApply aplica datos nuevos aunque ya hubiera tiendas', () => {
    expect(
      shouldSkipEmptyStoreApply({
        hasDisplayedStores: true,
        incomingRetailCount: 2,
        incomingPdvCount: 1,
        force: false,
      }),
    ).toBe(false);
  });
});

describe('sanitizeRetailScopeSnapshot', () => {
  it('descarta tiendas de otra empresa aunque vengan en caché', async () => {
    const { sanitizeRetailScopeSnapshot } = await import('../src/app/lib/retailScopeSanitize.ts');
    const mine = { _id: 'wc-mine', name: 'Modomio', centerType: 'punto_de_venta', businessId: 'biz-a' };
    const other = { _id: 'wc-other', name: 'Otra', centerType: 'punto_de_venta', businessId: 'biz-b' };
    const pdvMine = { _id: 'pdv-1', workCenterId: 'wc-mine', active: true };
    const pdvOther = { _id: 'pdv-2', workCenterId: 'wc-other', active: true };

    const result = sanitizeRetailScopeSnapshot('biz-a', {
      retailWorkCenters: [mine, other],
      allPointsOfSale: [pdvMine, pdvOther],
    });
    expect(result.retailWorkCenters).toHaveLength(1);
    expect(result.retailWorkCenters[0]._id).toBe('wc-mine');
    expect(result.allPointsOfSale).toHaveLength(1);
    expect(result.allPointsOfSale[0]._id).toBe('pdv-1');
  });

  it('con 2+ empresas no incluye legacy sin businessId', async () => {
    const { sanitizeRetailScopeSnapshot } = await import('../src/app/lib/retailScopeSanitize.ts');
    const mine = { _id: 'wc-mine', name: 'Modomio', centerType: 'punto_de_venta', businessId: 'biz-a' };
    const legacy = { _id: 'wc-leg', name: 'Legacy', centerType: 'punto_de_venta' };
    const pdvMine = { _id: 'pdv-1', workCenterId: 'wc-mine', active: true };

    const result = sanitizeRetailScopeSnapshot(
      'biz-a',
      { retailWorkCenters: [mine, legacy], allPointsOfSale: [pdvMine] },
      { accountBusinessCount: 2 },
    );
    expect(result.retailWorkCenters.map((wc) => wc._id)).toEqual(['wc-mine']);
  });
});
