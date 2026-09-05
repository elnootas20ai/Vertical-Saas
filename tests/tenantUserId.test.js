import { describe, expect, it } from 'vitest';
import { resolveBusinessDataUserId } from '../src/app/lib/tenantUserId';

describe('resolveBusinessDataUserId', () => {
  const business = {
    business_id: 'biz-1',
    owner_user_id: 'owner-1',
    members: [{ user_id: 'member-1', role: 'Encargado' }],
  };

  it('miembro usa el titular', () => {
    expect(
      resolveBusinessDataUserId({ user_id: 'member-1', email: 'e@x.com' }, business),
    ).toBe('owner-1');
  });

  it('titular usa su id', () => {
    expect(
      resolveBusinessDataUserId({ user_id: 'owner-1', email: 'ceo@x.com' }, business),
    ).toBe('owner-1');
  });

  it('superadmin Vertial usa el titular de la empresa abierta', () => {
    expect(
      resolveBusinessDataUserId(
        { user_id: 'admin-uid', email: 'uriel@admin.com' },
        business,
      ),
    ).toBe('owner-1');
  });

  it('usuario ajeno no miembro sigue en su id', () => {
    expect(
      resolveBusinessDataUserId({ user_id: 'stranger', email: 'a@b.com' }, business),
    ).toBe('stranger');
  });
});
