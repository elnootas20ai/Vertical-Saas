/** Almacenamiento del wizard de alta (empresa, tarjeta, etc.) — por usuario, no global. */

export const ONBOARDING_DATA_LEGACY_KEY = 'vertial_onboarding_data';

export const ONBOARDING_RESET_EVENT = 'vertial:onboarding-reset';

export function onboardingDataStorageKey(userId: string): string {
  const id = String(userId || '').trim();
  if (!id) return ONBOARDING_DATA_LEGACY_KEY;
  return `vertial_onboarding_data:${id}`;
}

export function dispatchOnboardingReset(userId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_RESET_EVENT, { detail: { userId: String(userId || '').trim() } }),
  );
}

/** Borra el borrador global antiguo (p. ej. al entrar en /auth/register). */
export function clearLegacyOnboardingDraft(): void {
  try {
    localStorage.removeItem(ONBOARDING_DATA_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
