/**
 * Reglas puras para unicidad de email en cuentas SaaS.
 */

export class AccountEmailConflictError extends Error {
  constructor(email, existingUserId) {
    super(`Ya existe una cuenta con el email ${email}`);
    this.name = 'AccountEmailConflictError';
    this.code = 'ACCOUNT_EMAIL_CONFLICT';
    this.email = email;
    this.existingUserId = existingUserId;
  }
}

export function isActiveAccount(doc) {
  return doc?.type === 'account' && !doc?.deletedAt;
}

export function accountMatchesEmail(doc, normalizedEmail) {
  if (!isActiveAccount(doc) || !normalizedEmail) return false;
  return String(doc.email || '').trim().toLowerCase() === normalizedEmail;
}

/**
 * Elige la cuenta canónica cuando hay duplicados (login / findAccountByEmail).
 * Prioridad: activa > verificada > último login > más antigua (createdAt).
 */
export function pickPrimaryAccountByEmail(accounts) {
  const list = (accounts || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const sorted = [...list].sort((a, b) => {
    const aActive = a.status !== 'inactive' ? 1 : 0;
    const bActive = b.status !== 'inactive' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const aVerified = a.emailVerified ? 1 : 0;
    const bVerified = b.emailVerified ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;

    const aLogin = Date.parse(a.lastLoginAt || '') || 0;
    const bLogin = Date.parse(b.lastLoginAt || '') || 0;
    if (aLogin !== bLogin) return bLogin - aLogin;

    const aCreated = Date.parse(a.createdAt || '') || 0;
    const bCreated = Date.parse(b.createdAt || '') || 0;
    return aCreated - bCreated;
  });

  return sorted[0] || null;
}

export function findDuplicateEmailAccounts(allDocs, normalizedEmail, excludeUserId = '') {
  const exclude = String(excludeUserId || '').trim();
  return (allDocs || []).filter((doc) => {
    if (!accountMatchesEmail(doc, normalizedEmail)) return false;
    if (exclude && doc.user_id === exclude) return false;
    return true;
  });
}

export function assertAccountEmailUnique(allDocs, email, excludeUserId = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;

  const duplicates = findDuplicateEmailAccounts(allDocs, normalizedEmail, excludeUserId);
  if (!duplicates.length) return;

  const primary = pickPrimaryAccountByEmail(duplicates);
  throw new AccountEmailConflictError(normalizedEmail, primary?.user_id || duplicates[0]?.user_id || '');
}
