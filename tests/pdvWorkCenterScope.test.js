import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }
});

describe('filterPointsOfSaleForWorkCenters — no perder PDV de la empresa', () => {
  it('conserva PDV de la empresa aunque el workCenterId esté roto o vacío', async () => {
    const { filterPointsOfSaleForWorkCenters } = await import('../src/app/lib/deliverySetup.ts');
    const retail = [{ _id: 'wc-badalona', name: 'badalona', centerType: 'punto_de_venta' }];
    const pdvs = [
      { _id: 'pdv-badalona', name: 'badalona', workCenterId: 'wc-badalona', businessId: 'biz-modo' },
      { _id: 'pdv-prueba', name: 'prueba', workCenterId: 'wc-fantasma', businessId: 'biz-modo' },
      { _id: 'pdv-modomio', name: 'modomio', workCenterId: '', businessId: 'biz-modo' },
      { _id: 'pdv-otra', name: 'otra', workCenterId: 'wc-x', businessId: 'biz-otra' },
    ];
    const out = filterPointsOfSaleForWorkCenters(pdvs, retail, { businessId: 'biz-modo' });
    expect(out.map((p) => p._id).sort()).toEqual(['pdv-badalona', 'pdv-modomio', 'pdv-prueba']);
  });

  it('sin businessId solo deja los enlazados a WC del scope', async () => {
    const { filterPointsOfSaleForWorkCenters } = await import('../src/app/lib/deliverySetup.ts');
    const retail = [{ _id: 'wc-badalona', name: 'badalona', centerType: 'punto_de_venta' }];
    const pdvs = [
      { _id: 'pdv-badalona', name: 'badalona', workCenterId: 'wc-badalona', businessId: 'biz-modo' },
      { _id: 'pdv-prueba', name: 'prueba', workCenterId: 'wc-fantasma', businessId: 'biz-modo' },
    ];
    const out = filterPointsOfSaleForWorkCenters(pdvs, retail);
    expect(out.map((p) => p._id)).toEqual(['pdv-badalona']);
  });

  it('sin tiendas en scope: usa PDV legacy sin businessId (no deja el TPV vacío)', async () => {
    const { filterPointsOfSaleForWorkCenters } = await import('../src/app/lib/deliverySetup.ts');
    const pdvs = [
      { _id: 'pdv-legacy', name: 'Badalona', workCenterId: 'wc-x', businessId: '' },
      { _id: 'pdv-otra', name: 'Otra', workCenterId: 'wc-y', businessId: 'biz-otra' },
    ];
    const out = filterPointsOfSaleForWorkCenters(pdvs, [], { businessId: 'biz-modo' });
    expect(out.map((p) => p._id)).toEqual(['pdv-legacy']);
  });

  it('multi-empresa: no cuela PDV huérfanos ni de otra empresa (bodegeta)', async () => {
    const { filterPointsOfSaleForWorkCenters } = await import('../src/app/lib/deliverySetup.ts');
    const retail = [{ _id: 'wc-badalona', name: 'badalona', centerType: 'punto_de_venta' }];
    const pdvs = [
      { _id: 'pdv-badalona', name: 'badalona', workCenterId: 'wc-badalona', businessId: 'biz-delivery' },
      { _id: 'pdv-bodegeta', name: 'bodegeta', workCenterId: '', businessId: 'biz-bodegeta' },
      { _id: 'pdv-huerfano', name: 'fantasma', workCenterId: '', businessId: '' },
      {
        _id: 'pdv-bode-wc',
        name: 'bodegeta local',
        workCenterId: 'wc-badalona',
        businessId: 'biz-bodegeta',
      },
    ];
    const out = filterPointsOfSaleForWorkCenters(pdvs, retail, {
      businessId: 'biz-delivery',
      accountBusinessCount: 2,
    });
    expect(out.map((p) => p._id)).toEqual(['pdv-badalona']);
  });
});
