import { describe, expect, it } from 'vitest';
import {
  isStockInventoryItem,
  isSupplierOrderStockItem,
} from '../src/app/lib/stockInventoryScope.ts';

describe('isSupplierOrderStockItem', () => {
  it('incluye almacén real (module stock / ingredient)', () => {
    expect(
      isSupplierOrderStockItem({
        _id: 's1',
        name: 'Harina',
        module: 'stock',
        isStockItem: true,
        stockCategory: 'ingredient',
        active: true,
      } as never),
    ).toBe(true);
  });

  it('incluye bebida de almacén', () => {
    expect(
      isSupplierOrderStockItem({
        _id: 'b1',
        name: 'Cola',
        module: 'stock',
        isStockItem: true,
        stockCategory: 'beverage',
        active: true,
      } as never),
    ).toBe(true);
  });

  it('excluye plato de carta aunque isStockItem=true', () => {
    const dish = {
      _id: 'c1',
      name: 'Pizza Margarita',
      module: 'catalog',
      isStockItem: true,
      stockCategory: 'finished_product',
      category: 'Pizzas',
      unitPrice: 12,
      active: true,
    };
    expect(isStockInventoryItem(dish as never)).toBe(true);
    expect(isSupplierOrderStockItem(dish as never)).toBe(false);
  });

  it('excluye hamburguesa de carta con control de stock', () => {
    expect(
      isSupplierOrderStockItem({
        _id: 'h1',
        name: 'Burger',
        module: 'catalog',
        isStockItem: true,
        stockCategory: 'finished_product',
        category: 'Hamburguesas',
        unitPrice: 10,
        active: true,
      } as never),
    ).toBe(false);
  });
});
