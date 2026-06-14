import { describe, expect, it } from 'vitest';
import {
  AccountEmailConflictError,
  assertAccountEmailUnique,
  findDuplicateEmailAccounts,
  pickPrimaryAccountByEmail,
} from '../services/accountEmailRules.js';

const base = (overrides = {}) => ({
  type: 'account',
  user_id: 'user-a',
  email: 'test@example.com',
  status: 'active',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '',
  ...overrides,
});

describe('accountEmailRules', () => {
  it('detecta cuentas duplicadas por email', () => {
    const docs = [
      base({ user_id: 'a', email: 'dup@test.com' }),
      base({ user_id: 'b', email: 'dup@test.com' }),
      base({ user_id: 'c', email: 'other@test.com' }),
    ];
    expect(findDuplicateEmailAccounts(docs, 'dup@test.com')).toHaveLength(2);
    expect(findDuplicateEmailAccounts(docs, 'dup@test.com', 'a')).toHaveLength(1);
  });

  it('elige cuenta activa y verificada como canónica', () => {
    const chosen = pickPrimaryAccountByEmail([
      base({ user_id: 'old', status: 'inactive', emailVerified: false, createdAt: '2025-01-01T00:00:00.000Z' }),
      base({ user_id: 'new', status: 'active', emailVerified: true, lastLoginAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(chosen?.user_id).toBe('new');
  });

  it('impide guardar email ya usado por otra cuenta', () => {
    const docs = [base({ user_id: 'existing', email: 'taken@test.com' })];
    expect(() => assertAccountEmailUnique(docs, 'taken@test.com', 'new-user')).toThrow(AccountEmailConflictError);
    expect(() => assertAccountEmailUnique(docs, 'taken@test.com', 'existing')).not.toThrow();
  });
});
