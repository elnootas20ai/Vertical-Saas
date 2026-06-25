import { describe, expect, it } from 'vitest';
import { sanitizeStoreIngredients } from '../services/couchdb.js';

describe('sanitizeStoreIngredients', () => {
  it('keeps same ingredient name on different brands', () => {
    const raw = [
      { id: '1', name: 'Tomate', role: 'extra', brandIds: ['mod'] },
      { id: '2', name: 'Tomate', role: 'extra', brandIds: ['bb'] },
      { id: '3', name: 'Bacon', role: 'extra', brandIds: ['bb'] },
    ];
    const out = sanitizeStoreIngredients(raw);
    expect(out).toHaveLength(3);
    expect(out.filter((i) => i.name === 'Tomate')).toHaveLength(2);
  });

  it('dedupes same name on same brand', () => {
    const raw = [
      { id: '1', name: 'Bacon', role: 'extra', brandIds: ['bb'] },
      { id: '2', name: 'Bacon', role: 'extra', brandIds: ['bb'] },
    ];
    expect(sanitizeStoreIngredients(raw)).toHaveLength(1);
  });
});
