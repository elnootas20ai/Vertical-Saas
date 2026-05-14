/** Cuenta interna con panel SaaS global y herramientas de desarrollo (única fuente de verdad). */
export const VERTIAL_SUPER_ADMIN_EMAIL = 'uriel@admin.com';

export function isVertialSuperAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === VERTIAL_SUPER_ADMIN_EMAIL;
}
