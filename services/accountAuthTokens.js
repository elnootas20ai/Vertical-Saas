import crypto from 'node:crypto';

/** Campos CouchDB por tipo de token de cuenta (un solo lugar para evitar divergencias). */
export const ACCOUNT_AUTH_TOKEN_FIELDS = {
  emailVerification: {
    hash: 'emailVerificationTokenHash',
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

export function hashAuthToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

/**
 * Comprueba token + caducidad sobre un documento de cuenta (función pura, testeable).
 * @param {object|null|undefined} account
 * @param {string} rawToken
 * @param {{ hash: string, expiry: string }} fields
 * @param {Date} [now]
 */
export function accountMatchesAuthToken(account, rawToken, fields, now = new Date()) {
  if (!account || account.deletedAt) return false;
  if (!rawToken || !fields?.hash || !fields?.expiry) return false;

  const tokenHash = hashAuthToken(rawToken);
  if (account[fields.hash] !== tokenHash) return false;

  const expiryRaw = account[fields.expiry];
  if (!expiryRaw) return false;

  const expiry = new Date(expiryRaw);
  if (Number.isNaN(expiry.getTime()) || expiry <= now) return false;

  return true;
}
