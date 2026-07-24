// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeCatalogItemForTpv } from '../services/couchdb.js';
import { filterCatalogItemsForBusinessScope } from '../src/app/lib/catalogBusinessScope.ts';

describe('sanitizeCatalogItemForTpv', () => {
  it('conserva business_id para filtrar por empresa en cuentas multi-negocio', () => {
    const doc = {
      _id: 'cat-1',
      user_id: 'owner-1',
      name: 'Pizza Margarita',
      category: 'pizzas',
      unitPrice: 9.5,
      business_id: 'biz-a',
      brandIds: [],
      active: true,
      itemType: 'product',
    };
    const sanitized = sanitizeCatalogItemForTpv(doc);
    expect(sanitized.business_id).toBe('biz-a');

    const scoped = filterCatalogItemsForBusinessScope([sanitized], 'biz-a', [], {
      accountBusinessCount: 2,
    });
    expect(scoped).toHaveLength(1);

    const otherBiz = filterCatalogItemsForBusinessScope([sanitized], 'biz-b', [], {
      accountBusinessCount: 2,
    });
    expect(otherBiz).toHaveLength(0);
  });

  it('conserva comboSlotAllowlists para menús (lado/bebida) en TPV', () => {
    const doc = {
      _id: 'combo-1',
      user_id: 'owner-1',
      name: 'Individual',
      category: 'Combos',
      unitPrice: 12,
      business_id: 'biz-a',
      itemType: 'combo',
      customFields: {
        comboStructureConfirmed: true,
        comboStructure: [
          { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
          { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
          { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
        ],
        comboSlotAllowlists: { side: ['cat-a', 'cat-b'] },
        comboSlotSurcharges: { side: { 'cat-a': 1.5, 'cat-b': 1 } },
      },
    };
    const sanitized = sanitizeCatalogItemForTpv(doc);
    expect(sanitized.customFields.comboSlotAllowlists).toEqual({ side: ['cat-a', 'cat-b'] });
    expect(sanitized.customFields.comboSlotSurcharges).toEqual({
      side: { 'cat-a': 1.5, 'cat-b': 1 },
    });
    expect(sanitized.customFields.comboStructureConfirmed).toBe(true);
  });

  it('conserva buildYourOwn y tope 3/5 para pizzas al gusto', () => {
    const doc = {
      _id: 'byo-1',
      user_id: 'owner-1',
      name: 'Mitad y mitad',
      category: 'Premium',
      unitPrice: 15,
      business_id: 'biz-a',
      itemType: 'product',
      customFields: {
        buildYourOwn: true,
        buildYourOwnMaxIngredients: 3,
        halfHalf: true,
      },
    };
    const sanitized = sanitizeCatalogItemForTpv(doc);
    expect(sanitized.customFields.buildYourOwn).toBe(true);
    expect(sanitized.customFields.buildYourOwnMaxIngredients).toBe(3);
    // halfHalf también se conserva si venía; el front prioriza buildYourOwn
    expect(sanitized.customFields.halfHalf).toBe(true);

    const modomio = sanitizeCatalogItemForTpv({
      ...doc,
      _id: 'byo-5',
      name: 'Modomio',
      customFields: { buildYourOwn: true, buildYourOwnMaxIngredients: 5 },
    });
    expect(modomio.customFields.buildYourOwnMaxIngredients).toBe(5);
  });
});
