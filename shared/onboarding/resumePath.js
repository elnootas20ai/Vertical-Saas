/** Rutas del alta empresa (mismo orden que OnboardingContext.ONBOARDING_ROUTES). */
export const COMPANY_ONBOARDING_ROUTES = [
  '/auth/onboarding/business-type',
  '/auth/onboarding/company',
  '/auth/onboarding/structure',
  '/auth/onboarding/needs',
  '/auth/onboarding/recommendation',
  '/auth/onboarding/payment-info',
  '/auth/onboarding/contrato',
];

/**
 * Retoma el onboarding en el siguiente paso pendiente.
 * Si no hay progreso, empieza en tipo de negocio.
 */
export function resolveCompanyOnboardingResumePath(account) {
  const data = account?.onboardingData && typeof account.onboardingData === 'object'
    ? account.onboardingData
    : {};
  const completed = Number(data.completedStep);
  if (!Number.isFinite(completed) || completed < 0) {
    return COMPANY_ONBOARDING_ROUTES[0];
  }
  const next = Math.min(Math.floor(completed) + 1, COMPANY_ONBOARDING_ROUTES.length - 1);
  return COMPANY_ONBOARDING_ROUTES[Math.max(0, next)];
}

/** Empresa de alta incompleta: debe terminar onboarding antes del paywall. */
export function companyNeedsOnboarding(account) {
  if (!account) return false;
  if (account.accountType === 'user') return false;
  if (String(account.invitedBy || '').trim()) return false;
  return !Boolean(account.onboardingCompleted);
}
