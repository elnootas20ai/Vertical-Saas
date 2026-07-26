import { describe, expect, it } from 'vitest';
import { resolveTpvClientSearchUserId } from '../src/app/lib/tpvClientSearchUserId.ts';

describe('resolveTpvClientSearchUserId', () => {
  it('trabajador: invitedBy (titular) gana siempre', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: 'device-empty',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('CEO: owner de la empresa activa', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: 'owner-pau',
        authUser: { user_id: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('CEO: owner gana frente a scope raro del device', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau', members: [] },
        scopeDataUserId: 'device-auth-1',
        authUser: { user_id: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('sin owner: usa scope de caja/tablet', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: '', members: [] },
        scopeDataUserId: 'owner-pau',
        authUser: { user_id: 'device-auth-1' },
      }),
    ).toBe('owner-pau');
  });

  it('sin owner ni scope: invitedBy cuando el candidato sería el trabajador', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: '', members: [] },
        scopeDataUserId: '',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });
});
