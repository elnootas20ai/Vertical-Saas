import { describe, expect, it } from 'vitest';
import {
  buildKey,
  get,
  getDbGeneration,
  invalidateDb,
  set,
  TTL_PRESETS,
} from '../services/cache.js';

describe('cache — generación por BD (anti lista obsoleta)', () => {
  it('invalidateDb incrementa generación', () => {
    const db = `test_accounts_${Date.now()}`;
    const before = getDbGeneration(db);
    invalidateDb(db);
    expect(getDbGeneration(db)).toBe(before + 1);
  });

  it('simula fetch obsoleto: no debe re-cachear si hubo escrituras durante la lectura', () => {
    const db = `test_docs_${Date.now()}`;
    const key = buildKey('db', db, 'all_docs_svc');
    const genAtStart = getDbGeneration(db);

    invalidateDb(db);
    const genAfterWrite = getDbGeneration(db);

    const staleDocs = [{ _id: 'account:old', type: 'account' }];
    if (getDbGeneration(db) === genAtStart) {
      set(key, staleDocs, TTL_PRESETS.DOCS_LIST);
    }

    expect(get(key)).toBeUndefined();

    if (getDbGeneration(db) === genAfterWrite) {
      set(key, [{ _id: 'account:new', type: 'account' }], TTL_PRESETS.DOCS_LIST);
    }

    expect(get(key)).toEqual([{ _id: 'account:new', type: 'account' }]);
  });
});
