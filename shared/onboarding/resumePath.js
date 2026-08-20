/** Rutas del alta empresa (mismo orden que OnboardingContext.ONBOARDING_ROUTES). */
export const COMPANY_ONBOARDING_ROUTES = [
  '/auth/onboarding/business-type',
  '/auth/onboarding/company',
  '/auth/onboarding/structure',
  '/auth/onboarding/needs',
  '/auth/onboarding/recommendation',
  '/auth/onboarding/payment-info',
];

const PAYMENT_STEP_INDEX = COMPANY_ONBOARDING_ROUTES.length - 1;

/**
 * Retoma el onboarding en el siguiente paso pendiente.
 * Si no hay progreso, empieza en tipo de negocio.
 * Tras el paso de pago → confirmación (puente al paywall; el dashboard solo tras cobrar).
 */
export function resolveCompanyOnboardingResumePath(account) {
  const data = account?.onboardingData && typeof account.onboardingData === 'object'
    ? account.onboardingData
    : {};
  const completed = Number(data.completedStep);
  if (!Number.isFinite(completed) || completed < 0) {
    return COMPANY_ONBOARDING_ROUTES[0];
  }
  if (Math.floor(completed) >= PAYMENT_STEP_INDEX) {
    return '/auth/onboarding/confirmation';
  }
  const next = Math.min(Math.floor(completed) + 1, PAYMENT_STEP_INDEX);
  return COMPANY_ONBOARDING_ROUTES[Math.max(0, next)];
}

/** Empresa de alta incompleta: debe terminar onboarding antes del paywall. */
export function companyNeedsOnboarding(account) {
  if (!account) return false;
  if (account.accountType === 'user') return false;
  if (String(account.invitedBy || '').trim()) return false;
  return !Boolean(account.onboardingCompleted);
}

/**
 * Contrato SaaS solo tras pago real (no trial ni pending).
 * Quien prueba sin pagar no debe ver el contrato.
 */
export function canAccessServiceAgreement(subscription) {
  const status = String(subscription?.status || '').trim();
  return status === 'subscription_active';
}

export function hasSignedServiceAgreement(account) {
  const data = account?.onboardingData;
  return Boolean(data && typeof data === 'object' && data.serviceAgreement?.signatureDataUrl);
}

/**
 * ¿Bloquear el SaaS hasta firmar el contrato?
 * Solo tras cobro real marcado como pendiente de firma.
 * Nunca a cuentas exentas ni a clientes ya operativos (p. ej. Pau) sin ese flag.
 */
export function mustSignServiceAgreement(account) {
  if (!account) return false;
  if (hasSignedServiceAgreement(account)) return false;
  if (!canAccessServiceAgreement(account.subscription)) return false;
  if (account.subscription?.billingExempt) return false;
  const data = account.onboardingData;
  return Boolean(data && typeof data === 'object' && data.serviceAgreementPending === true);
}

/** Tras cobro: pedir firma. Exentos o ya firmados no se marcan. */
export function withServiceAgreementPendingAfterPayment(account) {
  if (!account) return account;
  const data =
    account.onboardingData && typeof account.onboardingData === 'object'
      ? { ...account.onboardingData }
      : {};
  if (account.subscription?.billingExempt || data.serviceAgreement?.signatureDataUrl) {
    data.serviceAgreementPending = false;
  } else {
    data.serviceAgreementPending = true;
  }
  return { ...account, onboardingData: data };
}
