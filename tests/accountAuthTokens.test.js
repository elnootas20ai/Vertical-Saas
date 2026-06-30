import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_AUTH_TOKEN_FIELDS,
  accountMatchesAuthToken,
  hashAuthToken,
} from '../services/accountAuthTokens.js';

describe('accountAuthTokens', () => {
  const raw = 'abc123secret';
  const hash = hashAuthToken(raw);
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it('hashAuthToken es determinista', () => {
    expect(hashAuthToken(raw)).toBe(hash);
    expect(hashAuthToken('other')).not.toBe(hash);
  });

  it('accountMatchesAuthToken acepta token válido no caducado', () => {
    const account = {
      emailVerificationTokenHash: hash,
      emailVerificationExpiry: future,
    };
    expect(accountMatchesAuthToken(account, raw, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification)).toBe(true);
  });

  it('accountMatchesAuthToken rechaza token caducado', () => {
    const account = {
      emailVerificationTokenHash: hash,
      emailVerificationExpiry: past,
    };
    expect(accountMatchesAuthToken(account, raw, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification)).toBe(false);
  });

  it('accountMatchesAuthToken rechaza hash incorrecto', () => {
    const account = {
      emailVerificationTokenHash: hashAuthToken('wrong'),
      emailVerificationExpiry: future,
    };
    expect(accountMatchesAuthToken(account, raw, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification)).toBe(false);
  });

  it('accountMatchesAuthToken rechaza cuentas borradas', () => {
    const account = {
      deletedAt: new Date().toISOString(),
      passwordResetTokenHash: hash,
      passwordResetExpiry: future,
    };
    expect(accountMatchesAuthToken(account, raw, ACCOUNT_AUTH_TOKEN_FIELDS.passwordReset)).toBe(false);
  });
});
