import { describe, expect, it } from 'vitest';
import {
  canUseHoldingModule,
  normalizeInviteAccessScope,
} from '../src/app/lib/holdingAccess';

describe('holdingAccess', () => {
  it('normaliza alcance de invite', () => {
    expect(normalizeInviteAccessScope('single')).toBe('single');
    expect(normalizeInviteAccessScope('holding')).toBe('holding');
    expect(normalizeInviteAccessScope('group')).toBe('holding');
    expect(normalizeInviteAccessScope('account')).toBe('account');
    expect(normalizeInviteAccessScope('todo')).toBe('account');
    expect(normalizeInviteAccessScope('')).toBe('single');
  });

  it('gate holding: plan multi-empresa (aunque solo haya 1 empresa aún)', () => {
    expect(canUseHoldingModule({ businessCount: 1, maxBusinesses: 2 })).toBe(true);
    expect(canUseHoldingModule({ businessCount: 2, maxBusinesses: 2 })).toBe(true);
    expect(canUseHoldingModule({ businessCount: 3, maxBusinesses: 1 })).toBe(false);
    expect(canUseHoldingModule({ businessCount: 2, maxBusinesses: 2, isWorker: true })).toBe(false);
  });
});
