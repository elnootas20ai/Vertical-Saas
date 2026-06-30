// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  mergeTpvPickerOrder,
  readTpvCategoryOrder,
  readTpvSectionOrder,
  reorderTpvPickerIds,
  tpvPickerOrderStorageKey,
  writeTpvCategoryOrder,
  writeTpvSectionOrder,
} from '../src/app/lib/tpvPickerOrder.ts';

describe('tpvPickerOrder', () => {
  it('merge conserva orden y añade ids nuevos al final', () => {
    expect(mergeTpvPickerOrder(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('reorder mueve ids', () => {
    expect(reorderTpvPickerIds(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('persiste orden de secciones y categorías por negocio', () => {
    const key = tpvPickerOrderStorageKey('user-1', 'biz-1');
    writeTpvSectionOrder(key, ['brand:pizza', 'all']);
    writeTpvCategoryOrder(key, 'brand:pizza', ['Pizzas', 'Bebidas']);
    expect(readTpvSectionOrder(key, ['all', 'brand:pizza', 'brand:burger'])).toEqual([
      'brand:pizza',
      'all',
      'brand:burger',
    ]);
    expect(readTpvCategoryOrder(key, 'brand:pizza', ['Bebidas', 'Pizzas', 'Combos'])).toEqual([
      'Pizzas',
      'Bebidas',
      'Combos',
    ]);
  });
});
