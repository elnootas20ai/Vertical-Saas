import { describe, expect, it } from 'vitest';
import { resolveTpvClientSearchUserId } from '../src/app/lib/tpvClientSearchUserId.ts';

describe('resolveTpvClientSearchUserId', () => {
  it('usa scope de caja/tablet cuando coincide con el owner', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: 'owner-pau',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('trabajador tablet: scope (titular) gana aunque el selector traiga otro owner', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'otro-owner' },
        scopeDataUserId: 'owner-pau',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('CEO sin scope: usa owner de la empresa activa', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: 'owner-pau' },
        scopeDataUserId: '',
        authUser: { user_id: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });

  it('si no hay owner, usa invitedBy cuando el candidato es el trabajador', () => {
    expect(
      resolveTpvClientSearchUserId({
        currentBusiness: { owner_user_id: '', members: [] },
        scopeDataUserId: '',
        authUser: { user_id: 'worker-1', invitedBy: 'owner-pau' },
      }),
    ).toBe('owner-pau');
  });
});
