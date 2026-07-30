import { describe, expect, it } from 'vitest';
import {
  allocateSharedUnitsByPresence,
  assignBrandToSheetExclusive,
  enforceExclusiveBrandAssignment,
  isBrandBillingUnlocked,
  resolveBrandFoodUnitKey,
  sheetMoneyShares,
  suggestBillingSheetsFromBrands,
  unitColumnsForBrand,
  unitColumnsForDeliveryLineKind,
} from '../src/app/lib/brandBillingConfig.ts';

describe('unitColumnsForDeliveryLineKind', () => {
  it('mapea pizza / burger / tacos', () => {
    expect(unitColumnsForDeliveryLineKind('pizza')).toEqual([{ key: 'pizza', header: 'TOTAL PIZZA' }]);
    expect(unitColumnsForDeliveryLineKind('burger_fastfood')[0].key).toBe('burger');
    expect(unitColumnsForDeliveryLineKind('tacos_mexican')[0].key).toBe('taco');
    expect(unitColumnsForDeliveryLineKind('other')).toEqual([]);
  });
});

describe('resolveBrandFoodUnitKey / unitColumnsForBrand', () => {
  it('conecta marca → pizza por kind, categorías o nombre', () => {
    expect(resolveBrandFoodUnitKey({
      name: 'X', deliveryLineKind: 'pizza', catalogCategories: [],
    })).toBe('pizza');
    expect(resolveBrandFoodUnitKey({
      name: 'Linea', catalogCategories: ['Pizzas', 'Bebidas'],
    })).toBe('pizza');
    expect(resolveBrandFoodUnitKey({
      name: 'modomio', catalogCategories: [],
    })).toBe('pizza');
    expect(unitColumnsForBrand({ name: 'modomio', catalogCategories: [] })[0].header).toBe('TOTAL PIZZA');
    expect(unitColumnsForBrand({
      name: 'Burger', deliveryLineKind: 'burger_fastfood', catalogCategories: ['Burgers'],
    })[0].key).toBe('burger');
  });
});

describe('sheetMoneyShares', () => {
  it('reparte 1 hoja por familia (taco no va con burger)', () => {
    const sheets = [
      { id: 'a', label: 'A', brandIds: [], unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }] },
      { id: 'b', label: 'B', brandIds: [], unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }] },
      { id: 'c', label: 'C', brandIds: [], unitColumns: [{ key: 'taco', header: 'TOTAL TACOS' }] },
    ];
    expect(sheetMoneyShares({ pizza: 7, burger: 2, taco: 1 }, sheets)).toEqual({
      a: 0.7,
      b: 0.2,
      c: 0.1,
    });
  });
});

describe('allocateSharedUnitsByPresence', () => {
  it('majority: 2 + 1 + 2 compartidos → todo a moda', () => {
    expect(allocateSharedUnitsByPresence({ moda: 2, bb: 1 }, 2, 'majority')).toEqual({
      moda: 4,
      bb: 1,
    });
  });

  it('empate uds: gana la de más €', () => {
    expect(
      allocateSharedUnitsByPresence({ moda: 2, bb: 2 }, 2, 'majority', { moda: 30, bb: 18 }),
    ).toEqual({
      moda: 4,
      bb: 2,
    });
  });

  it('equal: 2 compartidos → 1 a cada marca', () => {
    expect(allocateSharedUnitsByPresence({ moda: 2, bb: 1 }, 2, 'equal')).toEqual({
      moda: 3,
      bb: 2,
    });
  });
});

describe('suggestBillingSheetsFromBrands / unlock', () => {
  it('se activa con 2 marcas activas aunque una sea la principal (isDefault)', () => {
    const brands = [
      {
        _id: 'm1', id: 'm1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Modomio', description: '', logo: '', website: '', deliveryLineKind: 'pizza',
        isDefault: true, active: true, createdAt: '', updatedAt: '',
      },
      {
        _id: 'b1', id: 'b1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Black Burger', description: '', logo: '', website: '', deliveryLineKind: 'burger_fastfood',
        active: true, createdAt: '', updatedAt: '',
      },
    ];
    expect(isBrandBillingUnlocked(brands)).toBe(true);
    const sheets = suggestBillingSheetsFromBrands(brands);
    expect(sheets).toHaveLength(2);
    expect(sheets[0].label).toContain('MODOMIO');
    expect(sheets[0].unitColumns[0].key).toBe('pizza');
    expect(sheets[1].unitColumns[0].key).toBe('burger');
  });

  it('la 3ª marca tacos sale como hoja propia', () => {
    const brands = [
      {
        _id: 'm1', id: 'm1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Modomio', description: '', logo: '', website: '', deliveryLineKind: 'pizza',
        active: true, createdAt: '', updatedAt: '',
      },
      {
        _id: 'b1', id: 'b1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Black Burger', description: '', logo: '', website: '', deliveryLineKind: 'burger_fastfood',
        active: true, createdAt: '', updatedAt: '',
      },
      {
        _id: 't1', id: 't1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Tacos Uriel', description: '', logo: '', website: '', deliveryLineKind: 'tacos_mexican',
        active: true, createdAt: '', updatedAt: '',
      },
    ];
    const sheets = suggestBillingSheetsFromBrands(brands);
    expect(sheets).toHaveLength(3);
    expect(sheets.map((s) => s.unitColumns[0]?.key)).toEqual(['pizza', 'burger', 'taco']);
    expect(sheets[2].label).toContain('TACOS');
  });

  it('no se activa con una sola marca', () => {
    const brands = [
      {
        _id: 'm1', id: 'm1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Modomio', description: '', logo: '', website: '', deliveryLineKind: 'pizza',
        isDefault: true, active: true, createdAt: '', updatedAt: '',
      },
    ];
    expect(isBrandBillingUnlocked(brands)).toBe(false);
  });
});

describe('enforceExclusiveBrandAssignment', () => {
  it('una marca no puede estar en dos hojas', () => {
    const brands = [
      {
        _id: 'm1', id: 'm1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'modomio', description: '', logo: '', website: '', deliveryLineKind: 'pizza',
        active: true, createdAt: '', updatedAt: '',
      },
      {
        _id: 'b1', id: 'b1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Burger', description: '', logo: '', website: '', deliveryLineKind: 'burger_fastfood',
        active: true, createdAt: '', updatedAt: '',
      },
    ];
    const dirty = [
      { id: 's1', label: 'MODOMIO', brandIds: ['m1', 'b1'], unitColumns: [] },
      { id: 's2', label: 'BURGER', brandIds: ['m1', 'b1'], unitColumns: [] },
    ];
    const clean = enforceExclusiveBrandAssignment(dirty, brands);
    expect(clean[0].brandIds).toEqual(['m1', 'b1']);
    expect(clean[1].brandIds).toEqual([]);

    const moved = assignBrandToSheetExclusive(clean, 's2', 'b1', brands);
    expect(moved[0].brandIds).toEqual(['m1']);
    expect(moved[1].brandIds).toEqual(['b1']);
  });
});
