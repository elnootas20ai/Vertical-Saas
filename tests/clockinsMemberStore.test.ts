import { describe, expect, it } from 'vitest';
import { memberMatchesStoreFilter, salesPointRefsMatch } from '../src/app/lib/clockinsMemberStore';

describe('clockinsMemberStore', () => {
  it('empareja PDV y centro wc:', () => {
    expect(salesPointRefsMatch('wc:store-a', 'store-a')).toBe(true);
    expect(salesPointRefsMatch('pdv-1', 'pdv-1')).toBe(true);
  });

  it('filtra por tienda asignada al trabajador', () => {
    const team = [{ user_id: 'ana', employment: { salesPointId: 'wc:store-a' } }];
    expect(memberMatchesStoreFilter('ana', 'store-a', team)).toBe(true);
    expect(memberMatchesStoreFilter('ana', 'store-b', team)).toBe(false);
  });
});
