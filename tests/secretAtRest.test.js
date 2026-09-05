import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  sealImapPassword,
  revealImapPassword,
  hasImapPasswordStored,
} from '../services/secretAtRest.js';

describe('secretAtRest IMAP', () => {
  const prevSecrets = process.env.SECRETS_ENCRYPTION_KEY;
  const prevJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = 'test-secrets-key-for-imap-encryption-32b';
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (prevSecrets === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = prevSecrets;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('cifra y descifra round-trip', () => {
    const enc = encryptSecret('app-pass-real');
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(enc).not.toContain('app-pass-real');
    expect(decryptSecret(enc)).toBe('app-pass-real');
  });

  it('seal/reveal y legado en claro', () => {
    expect(revealImapPassword('plain-legacy')).toBe('plain-legacy');
    const sealed = sealImapPassword('nueva-pass');
    expect(isEncryptedSecret(sealed)).toBe(true);
    expect(revealImapPassword(sealed)).toBe('nueva-pass');
    expect(sealImapPassword(sealed)).toBe(sealed);
    expect(hasImapPasswordStored(sealed)).toBe(true);
    expect(hasImapPasswordStored('••••••••')).toBe(false);
  });
});
