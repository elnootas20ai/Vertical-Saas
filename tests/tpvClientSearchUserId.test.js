import { describe, expect, it } from 'vitest';
import { resolveTpvClientSearchUserId } from '../src/app/lib/tpvClientSearchUserId.ts';

describe('resolveTpvClientSearchUserId', () => {
  it('prioriza owner_user_id de la empresa activa', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: 'worker-1',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('si no hay owner, usa invitedBy cuando el candidato es el trabajador', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: '', members: [] },
        scopeDataUserId: 'worker-1',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('titular usa su propio id', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: 'owner-pau',
        authUser: { user_id: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });
});
