/** Cuenta interna con panel SaaS global (misma regla que el front). */
export const VERTIAL_SUPER_ADMIN_EMAIL = 'uriel@admin.com';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isVertialSuperAdminEmail(email) {
  return normalizeEmail(email) === VERTIAL_SUPER_ADMIN_EMAIL;
}
