/** Rutas públicas de acceso — empresa vs trabajador (mismo backend, dos puertas). */
export const AUTH_PATHS = {
  entry: '/auth/entry',
  companyLogin: '/auth/login',
  workerLogin: '/auth/worker-login',
  teamLogin: '/auth/team-login',
  register: '/auth/register',
  /** Alias cortos (redirigen en routes.tsx) */
  companyPortal: '/acceso/empresa',
  workerPortal: '/acceso/trabajador',
} as const;

export type AuthAccountType = 'company' | 'user';
