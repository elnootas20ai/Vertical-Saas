import { describe, expect, it, beforeEach } from 'vitest';

/**
 * Réplica de la regla de generación: una carga lenta no debe pisar un upsert reciente.
 */
describe('client docs cache generation / upsert', () => {
  let generation = 0;
  let cache = null;

  function bump() {
    generation += 1;
    return generation;
  }

  function invalidate() {
    bump();
    cache = null;
  }

  function upsert(doc) {
    bump();
    const list = Array.isArray(cache) ? cache.filter((d) => d.id !== doc.id) : [];
    list.push(doc);
    cache = list;
  }

  function finishLoad(loadGen, docs) {
    if (loadGen !== generation) {
      return cache || docs;
    }
    cache = docs;
    return cache;
  }

  beforeEach(() => {
    generation = 0;
    cache = null;
  });

  it('upsert mete el cliente nuevo sin reload', () => {
    cache = [{ id: 'a', name: 'old' }];
    upsert({ id: 'b', name: 'nuevo' });
    expect(cache.map((d) => d.name)).toEqual(['old', 'nuevo']);
  });

  it('carga stale no pisa tras upsert', () => {
    const loadGen = generation;
    // simula _find en curso…
    upsert({ id: 'nuevo', name: 'campi-nuevo' });
    const result = finishLoad(loadGen, [{ id: 'a', name: 'old' }]);
    expect(result.some((d) => d.id === 'nuevo')).toBe(true);
    expect(result.some((d) => d.id === 'a' && d.name === 'old')).toBe(false);
  });

  it('invalidate + load limpia y reescribe', () => {
    cache = [{ id: 'a' }];
    const loadGen = generation;
    invalidate();
    const nextGen = generation;
    expect(nextGen).not.toBe(loadGen);
    const result = finishLoad(nextGen, [{ id: 'a' }, { id: 'b' }]);
    expect(result).toHaveLength(2);
  });
});
