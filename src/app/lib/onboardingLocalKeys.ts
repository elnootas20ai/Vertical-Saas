import {
  clearLegacyOnboardingDraft,
  dispatchOnboardingReset,
  ONBOARDING_DATA_LEGACY_KEY,
  onboardingDataStorageKey,
} from './onboardingStorage';

/** Tour y checklist por usuario + empresa (cada negocio nuevo puede ver el tour). */

/** Sube al cambiar pasos del tour; usuarios con versión antigua vuelven a verlo una vez. */
export const ONBOARDING_TOUR_VERSION = '5';

/** Disparado al crear empresa en sesión para abrir el tour sin recargar. */
export const ONBOARDING_TOUR_ARM_EVENT = 'vertial:onboarding-tour-arm';

const EMAIL_VERIFY_RESEND_COOLDOWN_KEY = 'emailVerifResendAt';

const PENDING_VERIFY_EMAIL_KEY = 'vertial_pending_verify_email';

function trimId(id: string): string {
  return String(id || '').trim();
}

/** Email pendiente de verificar (persiste al recargar «Revisa tu correo»). */
export function setPendingVerifyEmail(email: string): void {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  try {
    sessionStorage.setItem(PENDING_VERIFY_EMAIL_KEY, normalized);
  } catch {
    /* ignore */
  }
}

export function getPendingVerifyEmail(): string {
  try {
    return sessionStorage.getItem(PENDING_VERIFY_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function clearPendingVerifyEmail(): void {
  try {
    sessionStorage.removeItem(PENDING_VERIFY_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

/** Clave legacy (solo usuario): migrar a claves por empresa. */
export function onboardingTourCompletedLegacyKey(userId: string): string {
  return `vertial_onboarding_completed:${trimId(userId)}`;
}

export function onboardingTourCompletedKey(userId: string, businessId: string): string {
  return `vertial_onboarding_completed:${trimId(userId)}:${trimId(businessId)}`;
}

export function activationDismissedKey(userId: string, businessId: string): string {
  return `vertial_activation_dismissed:${trimId(userId)}:${trimId(businessId)}`;
}

export function onboardingTourStepKey(userId: string, businessId: string): string {
  return `vertial_onboarding_step:${trimId(userId)}:${trimId(businessId)}`;
}

export function onboardingTourActiveKey(userId: string, businessId: string): string {
  return `vertial_onboarding_active:${trimId(userId)}:${trimId(businessId)}`;
}

export function activationInProgressKey(userId: string, businessId: string): string {
  return `vertial_onboarding_in_progress_step:${trimId(userId)}:${trimId(businessId)}`;
}

export function isActivationChecklistDismissed(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    return localStorage.getItem(activationDismissedKey(userId, businessId)) === 'true';
  } catch {
    return false;
  }
}

export function setActivationChecklistDismissed(
  userId: string,
  businessId: string,
  dismissed: boolean,
): void {
  if (!userId || !businessId) return;
  try {
    const key = activationDismissedKey(userId, businessId);
    if (dismissed) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
    localStorage.removeItem('vertial_activation_dismissed');
  } catch {
    /* ignore */
  }
}

/**
 * Usuarios que completaron el tour con la clave antigua (solo userId):
 * marcar completado en cada empresa ya existente para no repetir el tour al abrir A.
 */
export function migrateLegacyOnboardingGuidesForBusinesses(
  userId: string,
  businessIds: string[],
): void {
  const uid = trimId(userId);
  if (!uid || businessIds.length === 0) return;

  try {
    const legacyTour = localStorage.getItem(onboardingTourCompletedLegacyKey(uid));
    if (legacyTour === ONBOARDING_TOUR_VERSION || legacyTour === '2') {
      for (const bid of businessIds) {
        const id = trimId(bid);
        if (!id) continue;
        const key = onboardingTourCompletedKey(uid, id);
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, ONBOARDING_TOUR_VERSION);
        }
      }
      localStorage.removeItem(onboardingTourCompletedLegacyKey(uid));
    }

    const legacyDismissed =
      localStorage.getItem('vertial_activation_dismissed') === 'true' ||
      localStorage.getItem(`vertial_activation_dismissed:${uid}`) === 'true';
    if (legacyDismissed) {
      for (const bid of businessIds) {
        const id = trimId(bid);
        if (!id) continue;
        if (!localStorage.getItem(activationDismissedKey(uid, id))) {
          localStorage.setItem(activationDismissedKey(uid, id), 'true');
        }
      }
      localStorage.removeItem('vertial_activation_dismissed');
      localStorage.removeItem(`vertial_activation_dismissed:${uid}`);
    }
  } catch {
    /* ignore */
  }
}

/** Limpia guías de primer uso al crear cuenta (mismo PC, otra cuenta). */
export function resetFirstRunGuides(userId?: string): void {
  try {
    localStorage.removeItem('vertial_onboarding_completed');
    localStorage.removeItem('vertial_activation_dismissed');
    sessionStorage.removeItem('vertial_onboarding_step');
    sessionStorage.removeItem('vertial_onboarding_active');
    sessionStorage.removeItem(PENDING_VERIFY_EMAIL_KEY);
    if (userId) {
      const uid = trimId(userId);
      localStorage.removeItem(onboardingTourCompletedLegacyKey(uid));
      localStorage.removeItem(`vertial_activation_dismissed:${uid}`);
      sessionStorage.removeItem(`vertial_onboarding_step:${uid}`);
      sessionStorage.removeItem(`vertial_onboarding_active:${uid}`);
      localStorage.removeItem(`vertial_onboarding_in_progress_step:${uid}`);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Nueva cuenta en el mismo navegador: borrador de onboarding (empresa, tarjeta, pasos),
 * scope de negocio y guías de primer uso. No borra sesión ni «recordar email» de login.
 */
export function clearOnboardingDraftForNewAccount(userId: string): void {
  const id = trimId(userId);
  try {
    clearLegacyOnboardingDraft();
    localStorage.removeItem(ONBOARDING_DATA_LEGACY_KEY);
    if (id) {
      localStorage.removeItem(onboardingDataStorageKey(id));
      localStorage.removeItem(`vertial_current_business:${id}`);
      localStorage.removeItem(`vertial_current_group:${id}`);
    }
    sessionStorage.removeItem(PENDING_VERIFY_EMAIL_KEY);
    localStorage.removeItem(EMAIL_VERIFY_RESEND_COOLDOWN_KEY);
    resetFirstRunGuides(id);
    dispatchOnboardingReset(id);
  } catch {
    /* ignore */
  }
}

export { clearLegacyOnboardingDraft, onboardingDataStorageKey, ONBOARDING_DATA_LEGACY_KEY };

export function isOnboardingTourCompleted(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    return (
      localStorage.getItem(onboardingTourCompletedKey(userId, businessId)) ===
      ONBOARDING_TOUR_VERSION
    );
  } catch {
    return false;
  }
}

export function markOnboardingTourCompleted(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    localStorage.setItem(
      onboardingTourCompletedKey(userId, businessId),
      ONBOARDING_TOUR_VERSION,
    );
    localStorage.removeItem('vertial_onboarding_completed');
    sessionStorage.removeItem(onboardingTourStepKey(userId, businessId));
    sessionStorage.removeItem(onboardingTourActiveKey(userId, businessId));
  } catch {
    /* ignore */
  }
}

export function clearOnboardingTourForBusiness(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    localStorage.removeItem(onboardingTourCompletedKey(userId, businessId));
    sessionStorage.removeItem(onboardingTourStepKey(userId, businessId));
    sessionStorage.removeItem(onboardingTourActiveKey(userId, businessId));
  } catch {
    /* ignore */
  }
}

/** Tras crear una empresa en sesión: tour desde paso 0 en esa empresa (sin recargar). */
export function armOnboardingTourForBusiness(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    clearOnboardingTourForBusiness(userId, businessId);
    sessionStorage.setItem(onboardingTourStepKey(userId, businessId), '0');
    sessionStorage.setItem(onboardingTourActiveKey(userId, businessId), '1');
    window.dispatchEvent(
      new CustomEvent(ONBOARDING_TOUR_ARM_EVENT, {
        detail: { userId: trimId(userId), businessId: trimId(businessId) },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function resetActivationGuidesForBusiness(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    setActivationChecklistDismissed(userId, businessId, false);
    localStorage.removeItem(activationInProgressKey(userId, businessId));
  } catch {
    /* ignore */
  }
}

/** Reinicio manual desde Ayuda (empresa activa). */
export function clearOnboardingTourForUser(userId: string, businessId: string): void {
  clearOnboardingTourForBusiness(userId, businessId);
}
