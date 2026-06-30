import { describe, expect, it } from 'vitest';
import {
  getBrandSetupPending,
  isDeliveryBrandActivationComplete,
  isBrandSetupComplete,
} from '../src/app/lib/brandUtils.ts';

const deliveryCtx = { isDelivery: true, retailStoreCount: 0 };

describe('brand setup completeness', () => {
  it('marca pizza con nombre e inferencia no pide tienda ni tipo extra', () => {
    const brand = {
      name: 'pizza',
      isDefault: true,
      deliveryLineKind: 'pizza',
      catalogCategories: ['Pizzas', 'Entrantes', 'Postres', 'Bebidas'],
      salesPointIds: [],
    };
    expect(getBrandSetupPending(brand, deliveryCtx)).toEqual([]);
    expect(isBrandSetupComplete(brand, deliveryCtx)).toBe(true);
  });

  it('infiere pizza por nombre aunque falte deliveryLineKind guardado', () => {
    const brand = {
      name: 'pizza',
      isDefault: true,
      deliveryLineKind: '',
      catalogCategories: [],
      salesPointIds: [],
    };
    expect(getBrandSetupPending(brand, deliveryCtx)).toEqual([]);
    expect(isBrandSetupComplete(brand, deliveryCtx)).toBe(true);
  });

  it('sin tiendas cargadas no bloquea el alta de marca', () => {
    const brands = [
      {
        name: 'Burger',
        isDefault: false,
        active: true,
        deliveryLineKind: 'burger_fastfood',
        catalogCategories: ['Burgers'],
        salesPointIds: [],
      },
    ];
    expect(isDeliveryBrandActivationComplete(brands, deliveryCtx)).toBe(true);
  });

  it('marca General sin nombre sigue incompleta', () => {
    const brand = {
      name: 'General',
      isDefault: true,
      deliveryLineKind: 'pizza',
      catalogCategories: ['Pizzas'],
      salesPointIds: [],
    };
    expect(getBrandSetupPending(brand, deliveryCtx)).toContain('display_name');
  });
});
