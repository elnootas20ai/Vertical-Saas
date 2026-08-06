import { describe, expect, it } from 'vitest';
import {
  allocateSharedUnitsByPresence,
  assignBrandToSheetExclusive,
  closingSlotsFromBillingSheets,
  coalesceTacoIntoBurgerSheets,
  enforceExclusiveBrandAssignment,
  isBrandBillingUnlocked,
  predominantBrandIdForSheet,
  resolveBillingSheetsForClosing,
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

  it('la 3ª marca tacos va con la hoja Black Burger (misma pestaña Excel)', () => {
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
    expect(sheets).toHaveLength(2);
    expect(sheets[0].unitColumns.map((c) => c.key)).toEqual(['pizza']);
    expect(sheets[1].brandIds).toEqual(['b1', 't1']);
    expect(sheets[1].unitColumns.map((c) => c.key)).toEqual(['burger', 'taco']);
  });

  it('coalesce une hoja TACOS suelta en la hoja burger', () => {
    const brands = [
      {
        _id: 'b1', id: 'b1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Black Burger', description: '', logo: '', website: '', deliveryLineKind: 'burger_fastfood',
        active: true, createdAt: '', updatedAt: '',
      },
      {
        _id: 't1', id: 't1', type: 'brand', business_id: 'b', user_id: 'u',
        name: 'Tacos', description: '', logo: '', website: '', deliveryLineKind: 'tacos_mexican',
        active: true, createdAt: '', updatedAt: '',
      },
    ];
    const sheets = [
      {
        id: 'bb', label: 'BLACK BURGER', brandIds: ['b1'],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
      {
        id: 'tc', label: 'TACOS', brandIds: ['t1'],
        unitColumns: [{ key: 'taco', header: 'TOTAL TACOS' }],
      },
    ];
    const merged = coalesceTacoIntoBurgerSheets(sheets, brands);
    expect(merged).toHaveLength(1);
    expect(merged[0].brandIds).toEqual(['b1', 't1']);
    expect(merged[0].unitColumns.map((c) => c.key)).toEqual(['burger', 'taco']);
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

describe('closingSlotsFromBillingSheets / 2ª caja', () => {
  const pauBrands = [
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

  it('3 marcas con tacos en Black Burger → 2 slots; nombre = marca que manda', () => {
    const sheets = resolveBillingSheetsForClosing(null, pauBrands);
    const slots = closingSlotsFromBillingSheets(sheets, pauBrands);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.name)).toEqual(['Modomio', 'Black Burger']);
    expect(slots[1].brandId).toBe('b1');
    expect(slots[1].memberBrandIds).toEqual(['b1', 't1']);
    expect(predominantBrandIdForSheet(sheets[1], pauBrands)).toBe('b1');
  });

  it('1 marca → 1 slot', () => {
    const one = [pauBrands[0]];
    const sheets = resolveBillingSheetsForClosing(null, one);
    const slots = closingSlotsFromBillingSheets(sheets, one);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('Modomio');
    expect(slots[0].memberBrandIds).toEqual(['m1']);
  });

  it('resuelve nombre aunque la hoja use brand-uuid y el catálogo el uuid bare', () => {
    const brands = [
      {
        _id: '96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
        id: '96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
        type: 'brand',
        business_id: 'b',
        user_id: 'u',
        name: 'Black Burger',
        description: '',
        logo: '',
        website: '',
        deliveryLineKind: 'burger_fastfood',
        active: true,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const sheets = [
      {
        id: 'sheet-1',
        label: 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
        brandIds: ['brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec'],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const slots = closingSlotsFromBillingSheets(sheets, brands);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('Black Burger');
  });

  it('nunca deja el uuid crudo como nombre de slot', () => {
    const sheets = [
      {
        id: 'sheet-orphan',
        label: 'brand-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        brandIds: ['brand-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
    ];
    const slots = closingSlotsFromBillingSheets(sheets, []);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('Marca');
  });
});
