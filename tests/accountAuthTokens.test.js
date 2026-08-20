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

  it('accountMatchesAuthToken acepta token anterior tras reenvío', () => {
    const oldRaw = 'old-link-token';
    const newRaw = 'new-link-token';
    const account = {
      emailVerificationTokenHash: hashAuthToken(newRaw),
      emailVerificationPrevHashes: [hashAuthToken(oldRaw)],
      emailVerificationExpiry: future,
    };
    expect(accountMatchesAuthToken(account, oldRaw, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification)).toBe(true);
    expect(accountMatchesAuthToken(account, newRaw, ACCOUNT_AUTH_TOKEN_FIELDS.emailVerification)).toBe(true);
  });

  it('buildEmailVerificationTokenUpdate conserva hashes previos', async () => {
    const { buildEmailVerificationTokenUpdate } = await import('../services/accountAuthTokens.js');
    const oldHash = hashAuthToken('old');
    const update = buildEmailVerificationTokenUpdate(
      { emailVerificationTokenHash: oldHash, emailVerificationPrevHashes: [] },
      'new',
      future,
      future,
    );
    expect(update.emailVerificationTokenHash).toBe(hashAuthToken('new'));
    expect(update.emailVerificationPrevHashes).toContain(oldHash);
  });
});
