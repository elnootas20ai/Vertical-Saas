/** Rutas públicas de acceso — empresa vs trabajador vs afiliado (mundos paralelos). */
export const AUTH_PATHS = {
  entry: '/auth/entry',
  companyLogin: '/auth/login',
  workerLogin: '/auth/worker-login',
  teamLogin: '/auth/team-login',
  tpvTabletLogin: '/auth/tpv-tablet',
  register: '/auth/register',
  /** Panel público de afiliados (código AFF). No es SaaS trabajador/empresa. */
  affiliatePortal: '/panel-afiliado',
  /** Solicitud pública de afiliación. */
  affiliateJoin: '/affiliados',
  /** Alias cortos (redirigen en routes.tsx) */
  companyPortal: '/acceso/empresa',
  workerPortal: '/acceso/trabajador',
} as const;

/** Rutas del mundo afiliado (nunca deben redirigir al SaaS trabajador). */
export function isAffiliateWorldPath(pathname: string): boolean {
  const p = String(pathname || '');
  return (
    p === AUTH_PATHS.affiliatePortal
    || p.startsWith(`${AUTH_PATHS.affiliatePortal}/`)
    || p === AUTH_PATHS.affiliateJoin
    || p.startsWith('/docs/affiliate')
  );
}

export type AuthAccountType = 'company' | 'user';