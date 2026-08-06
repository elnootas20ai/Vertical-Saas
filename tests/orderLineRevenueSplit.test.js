import { describe, expect, it } from 'vitest';
import {
  accumulateDeliveredOrderLines,
  attributeOrderRevenueByBrand,
  attributeOrderUnitsByBrand,
} from '../shared/delivery/orderLineRevenueSplit.js';

describe('attributeOrderRevenueByBrand', () => {
  it('pedido mono-marca: bebidas/postres van a esa marca', () => {
    const r = attributeOrderRevenueByBrand({
      items: [
        { brandIds: ['modo'], quantity: 2, total: 20 },
        { category: 'Bebidas', quantity: 1, total: 2 },
        { category: 'Postres', quantity: 1, total: 3 },
      ],
    });
    expect(r.presentBrandIds).toEqual(['modo']);
    expect(r.byBrand.modo).toBe(25);
    expect(r.unbranded).toBe(0);
    expect(Object.keys(r.byCategory)).toHaveLength(0);
  });

  it('monoBrandTakesAll=false: compartidos quedan sin marca', () => {
    const r = attributeOrderRevenueByBrand(
      {
        items: [
          { brandIds: ['modo'], quantity: 1, total: 10 },
          { category: 'Bebidas', quantity: 1, total: 2 },
        ],
      },
      { monoBrandTakesAll: false },
    );
    expect(r.byBrand.modo).toBe(10);
    expect(r.unbranded).toBe(2);
  });

  it('pedido cruzado majority: compartidos enteros a la marca con más uds', () => {
    const r = attributeOrderRevenueByBrand(
      {
        items: [
          { brandIds: ['modo'], quantity: 2, total: 20 },
          { brandIds: ['bb'], quantity: 1, total: 10 },
          { category: 'Bebidas', quantity: 1, total: 2.5 },
        ],
      },
      { sharedSplitMode: 'majority' },
    );
    expect(r.byBrand.modo).toBe(22.5); // 20 + 2.5 enteros
    expect(r.byBrand.bb).toBe(10);
    expect(r.unbranded).toBe(0);
  });

  it('empate de uds: gana la que más € factura en el pedido', () => {
    const r = attributeOrderRevenueByBrand(
      {
        items: [
          { brandIds: ['modo'], quantity: 2, total: 30 },
          { brandIds: ['bb'], quantity: 2, total: 18 },
          { category: 'Bebidas', quantity: 1, total: 2.5 },
        ],
      },
      { sharedSplitMode: 'majority' },
    );
    expect(r.byBrand.modo).toBe(32.5);
    expect(r.byBrand.bb).toBe(18);
  });

  it('equal: compartidos a medias entre las marcas del ticket', () => {
    const r = attributeOrderRevenueByBrand(
      {
        items: [
          { brandIds: ['a'], quantity: 5, total: 50 },
          { brandIds: ['b'], quantity: 4, total: 40 },
          { category: 'Bebidas', quantity: 1, total: 2.5 },
        ],
      },
      { sharedSplitMode: 'equal' },
    );
    expect(r.byBrand.a).toBe(51.25); // 50 + 1.25
    expect(r.byBrand.b).toBe(41.25); // 40 + 1.25
    expect(r.unbranded).toBe(0);
  });

  it('legacy by_units se comporta como equal', () => {
    const order = {
      items: [
        { brandIds: ['a'], quantity: 5, total: 50 },
        { brandIds: ['b'], quantity: 4, total: 40 },
        { category: 'Bebidas', quantity: 1, total: 2.5 },
      ],
    };
    const byUnits = attributeOrderRevenueByBrand(order, { sharedSplitMode: 'by_units' });
    expect(byUnits.byBrand.a).toBe(51.25);
    expect(byUnits.byBrand.b).toBe(41.25);
  });

  it('sin marcas en líneas: va a categoría', () => {
    const r = attributeOrderRevenueByBrand({
      items: [{ category: 'Bebidas', quantity: 2, total: 5 }],
    });
    expect(r.unbranded).toBe(5);
    expect(r.byCategory.bebidas).toBe(5);
  });

  it('sin marcas en líneas pero brandIds del pedido → a esa marca', () => {
    const r = attributeOrderRevenueByBrand({
      brandIds: ['modo'],
      items: [{ category: 'Bebidas', quantity: 2, total: 5 }],
    });
    expect(r.unbranded).toBe(0);
    expect(r.byBrand.modo).toBe(5);
  });
});

describe('attributeOrderUnitsByBrand', () => {
  it('majority: 2+1 + 2 compartidos → todo lo compartido a A', () => {
    expect(
      attributeOrderUnitsByBrand(
        {
          items: [
            { brandIds: ['a'], quantity: 2 },
            { brandIds: ['b'], quantity: 1 },
            { category: 'Bebidas', quantity: 1 },
            { category: 'Postres', quantity: 1 },
          ],
        },
        { sharedSplitMode: 'majority' },
      ),
    ).toEqual({ a: 4, b: 1 });
  });

  it('equal: 2+1 + 2 compartidos → 1 ud compartida a cada marca', () => {
    expect(
      attributeOrderUnitsByBrand(
        {
          items: [
            { brandIds: ['a'], quantity: 2 },
            { brandIds: ['b'], quantity: 1 },
            { category: 'Bebidas', quantity: 1 },
            { category: 'Postres', quantity: 1 },
          ],
        },
        { sharedSplitMode: 'equal' },
      ),
    ).toEqual({ a: 3, b: 2 });
  });
});

describe('accumulateDeliveredOrderLines', () => {
  it('acumula en mapas de marca (compartidos incluidos)', () => {
    const byBrand = {};
    const byCat = {};
    accumulateDeliveredOrderLines(
      {
        items: [
          { brandIds: ['modo'], total: 10, quantity: 1 },
          { category: 'Bebidas', total: 2, quantity: 1 },
        ],
      },
      byBrand,
      byCat,
    );
    expect(byBrand.modo).toBe(12);
    expect(Object.keys(byCat)).toHaveLength(0);
  });
});
