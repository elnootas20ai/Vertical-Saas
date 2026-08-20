import crypto from 'node:crypto';

/** Campos CouchDB por tipo de token de cuenta (un solo lugar para evitar divergencias). */
export const ACCOUNT_AUTH_TOKEN_FIELDS = {
  emailVerification: {
    hash: 'emailVerificationTokenHash',
    /** Hashes de reenvíos anteriores: el enlace viejo sigue valiendo hasta caducar. */
    prevHashes: 'emailVerificationPrevHashes',
    expiry: 'emailVerificationExpiry',
  },
  passwordReset: {
    hash: 'passwordResetTokenHash',
    expiry: 'passwordResetExpiry',
  },
  teamInvite: {
    hash: 'inviteTokenHash',
    expiry: 'inviteExpiresAt',
  },
  loginOtp: {
    hash: 'loginOtpHash',
    expiry: 'loginOtpExpiry',
  },
};

/** Cuántos enlaces de verificación anteriores se aceptan tras un reenvío. */
export const EMAIL_VERIFICATION_PREV_HASH_LIMIT = 5;

export function hashAuthToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

/**
 * Comprueba token + caducidad sobre un documento de cuenta (función pura, testeable).
 * @param {object|null|undefined} account
 * @param {string} rawToken
 * @param {{ hash: string, expiry: string, prevHashes?: string }} fields
 * @param {Date} [now]
 */
export function accountMatchesAuthToken(account, rawToken, fields, now = new Date()) {
  if (!account || account.deletedAt) return false;
  if (!rawToken || !fields?.hash || !fields?.expiry) return false;

  const tokenHash = hashAuthToken(rawToken);
  const accepted = new Set();
  const primary = account[fields.hash];
  if (typeof primary === 'string' && primary) accepted.add(primary);
  if (fields.prevHashes && Array.isArray(account[fields.prevHashes])) {
    for (const h of account[fields.prevHashes]) {
      if (typeof h === 'string' && h) accepted.add(h);
    }
  }
  if (!accepted.has(tokenHash)) return false;

  const expiryRaw = account[fields.expiry];
  if (!expiryRaw) return false;

  const expiry = new Date(expiryRaw);
  if (Number.isNaN(expiry.getTime()) || expiry <= now) return false;

  return true;
}

/** Al reenviar: guarda el hash actual en el historial y pone el nuevo como vigente. */
export function buildEmailVerificationTokenUpdate(account, rawToken, expiryIso, nowIso = new Date().toISOString()) {
  const nextHash = hashAuthToken(rawToken);
  const prev = [];
  const current = account?.emailVerificationTokenHash;
  if (typeof current === 'string' && current && current !== nextHash) {
    prev.push(current);
  }
  if (Array.isArray(account?.emailVerificationPrevHashes)) {
    for (const h of account.emailVerificationPrevHashes) {
      if (typeof h === 'string' && h && h !== nextHash && !prev.includes(h)) {
        prev.push(h);
      }
    }
  }
  return {
    emailVerificationTokenHash: nextHash,
    emailVerificationPrevHashes: prev.slice(0, EMAIL_VERIFICATION_PREV_HASH_LIMIT),
    emailVerificationExpiry: expiryIso,
    lastVerificationEmailSentAt: nowIso,
    updatedAt: nowIso,
  };
}
