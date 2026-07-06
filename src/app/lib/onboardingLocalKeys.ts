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

/** Alta guiada al 100 % — mostrar toast de confirmación una vez por empresa. */
export const ONBOARDING_TOUR_COMPLETED_EVENT = 'vertial:onboarding-tour-completed';

/** Checklist lateral: paso «Ir» / reinicio de tour cambió el paso activo. */
export const ACTIVATION_IN_PROGRESS_CHANGED = 'vertial:activation-in-progress-changed';

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

function onboardingTourCompleteAckKey(userId: string, businessId: string): string {
  return `vertial_onboarding_tour_ack:${trimId(userId)}:${trimId(businessId)}`;
}

export function activationInProgressKey(userId: string, businessId: string): string {
  return `vertial_onboarding_in_progress_step:${trimId(userId)}:${trimId(businessId)}`;
}

function activationForceVisibleKey(userId: string, businessId: string): string {
  return `vertial_activation_force_visible:${trimId(userId)}:${trimId(businessId)}`;
}

/** Tras «Tour interactivo» en Ayuda: volver a mostrar la guía del sidebar aunque esté al 100 %. */
export function setActivationChecklistForceVisible(
  userId: string,
  businessId: string,
  visible: boolean,
): void {
  if (!userId || !businessId) return;
  try {
    const key = activationForceVisibleKey(userId, businessId);
    if (visible) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isActivationChecklistForceVisible(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    return localStorage.getItem(activationForceVisibleKey(userId, businessId)) === '1';
  } catch {
    return false;
  }
}

export function setActivationInProgressStep(
  userId: string,
  businessId: string,
  stepId: string | null,
): void {
  if (!userId || !businessId) return;
  try {
    const key = activationInProgressKey(userId, businessId);
    const id = String(stepId || '').trim();
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
    window.dispatchEvent(
      new CustomEvent(ACTIVATION_IN_PROGRESS_CHANGED, {
        detail: { userId: trimId(userId), businessId: trimId(businessId), stepId: id || null },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function getActivationInProgressStep(userId: string, businessId: string): string | null {
  if (!userId || !businessId) return null;
  try {
    return localStorage.getItem(activationInProgressKey(userId, businessId));
  } catch {
    return null;
  }
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
    const migratedFlag = `vertial_onboarding_legacy_migrated:${uid}`;
    if (localStorage.getItem(migratedFlag) === '1') {
      return;
    }

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
    localStorage.setItem(migratedFlag, '1');

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

/** Tour ya terminado o saltado para esta empresa (solo clave por empresa; sin legacy global). */
export function isOnboardingTourCompleted(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    const perBusiness = localStorage.getItem(onboardingTourCompletedKey(userId, businessId));
    return perBusiness != null && perBusiness !== '';
  } catch {
    return false;
  }
}

type OnboardingTourStepSnapshot = { i: number; id: string };

function clampOnboardingTourStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), stepCount - 1));
}

/**
 * Paso actual del tour persistido en sessionStorage (sobrevive al refresh dentro
 * de la misma pestaña). Devuelve 0 si no hay valor o es inválido.
 * @deprecated Prefer {@link resolveOnboardingTourStepIndex} con la lista de pasos actual.
 */
export function getOnboardingTourStep(userId: string, businessId: string): number {
  return resolveOnboardingTourStepIndex([], userId, businessId);
}

/** Restaura el índice del paso por `id` (genérico vs delivery comparten longitud pero no el orden semántico). */
export function resolveOnboardingTourStepIndex(
  steps: { id: string }[],
  userId: string,
  businessId: string,
): number {
  if (!userId || !businessId || steps.length === 0) return 0;
  try {
    const raw = sessionStorage.getItem(onboardingTourStepKey(userId, businessId));
    if (!raw) return 0;
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number.parseInt(trimmed, 10);
      return Number.isFinite(n) ? clampOnboardingTourStepIndex(n, steps.length) : 0;
    }
    const parsed = JSON.parse(trimmed) as Partial<OnboardingTourStepSnapshot>;
    const id = String(parsed.id || '').trim();
    if (id) {
      const byId = steps.findIndex((s) => s.id === id);
      if (byId >= 0) return byId;
      // ID de otro tour (p. ej. genérico 6 pasos vs ops 5) → no reutilizar índice numérico
      return 0;
    }
    if (typeof parsed.i === 'number' && Number.isFinite(parsed.i)) {
      return clampOnboardingTourStepIndex(parsed.i, steps.length);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export function setOnboardingTourStep(
  userId: string,
  businessId: string,
  step: number,
  stepId?: string,
): void {
  if (!userId || !businessId) return;
  try {
    const payload: OnboardingTourStepSnapshot = {
      i: Math.max(0, Math.floor(step)),
      id: String(stepId || '').trim(),
    };
    sessionStorage.setItem(onboardingTourStepKey(userId, businessId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Flag "tour abierto en esta sesión": permite reabrirlo en el paso guardado tras un refresh. */
export function isOnboardingTourActive(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    return sessionStorage.getItem(onboardingTourActiveKey(userId, businessId)) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingTourActive(
  userId: string,
  businessId: string,
  active: boolean,
): void {
  if (!userId || !businessId) return;
  try {
    const key = onboardingTourActiveKey(userId, businessId);
    if (active) sessionStorage.setItem(key, '1');
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isTourCompleteAcknowledged(userId: string, businessId: string): boolean {
  if (!userId || !businessId) return false;
  try {
    return localStorage.getItem(onboardingTourCompleteAckKey(userId, businessId)) === '1';
  } catch {
    return false;
  }
}

export function markTourCompleteAcknowledged(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    localStorage.setItem(onboardingTourCompleteAckKey(userId, businessId), '1');
  } catch {
    /* ignore */
  }
}

export function clearTourCompleteAcknowledged(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    localStorage.removeItem(onboardingTourCompleteAckKey(userId, businessId));
  } catch {
    /* ignore */
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

/** Alta guiada terminada (checklist 100 %) — dispara el toast de confirmación. */
export function notifyGuidedActivationComplete(userId: string, businessId: string): void {
  if (!userId || !businessId || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(ONBOARDING_TOUR_COMPLETED_EVENT, {
        detail: { userId: trimId(userId), businessId: trimId(businessId) },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Alta delivery / checklist: no volver a mostrar el popup de bienvenida al pulsar Ir. */
export function dismissOnboardingWelcomeTourForActivation(userId: string, businessId: string): void {
  markOnboardingTourCompleted(userId, businessId);
  setOnboardingTourActive(userId, businessId, false);
}

export function clearOnboardingTourForBusiness(userId: string, businessId: string): void {
  if (!userId || !businessId) return;
  try {
    localStorage.removeItem(onboardingTourCompletedKey(userId, businessId));
    localStorage.removeItem(onboardingTourCompletedLegacyKey(userId));
    localStorage.removeItem('vertial_onboarding_completed');
    clearTourCompleteAcknowledged(userId, businessId);
    sessionStorage.removeItem(onboardingTourStepKey(userId, businessId));
    sessionStorage.removeItem(onboardingTourActiveKey(userId, businessId));
  } catch {
    /* ignore */
  }
}

/** Tras crear una empresa en sesión: tour desde paso 0 en esa empresa (sin recargar). */
export function armOnboardingTourForBusiness(
  userId: string,
  businessId: string,
  options?: { fromBeginning?: boolean; activationStepId?: string | null },
): void {
  if (!userId || !businessId) return;
  try {
    const fromBeginning = options?.fromBeginning !== false;
    let stepIndex = 0;
    if (!fromBeginning) {
      const raw = sessionStorage.getItem(onboardingTourStepKey(userId, businessId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<OnboardingTourStepSnapshot>;
          if (typeof parsed?.i === 'number' && parsed.i > 0) stepIndex = parsed.i;
        } catch {
          /* ignore */
        }
      }
    }
    if (options?.activationStepId) {
      setActivationInProgressStep(userId, businessId, options.activationStepId);
    } else if (fromBeginning) {
      setActivationInProgressStep(userId, businessId, null);
    }
    clearOnboardingTourForBusiness(userId, businessId);
    sessionStorage.setItem(
      onboardingTourStepKey(userId, businessId),
      JSON.stringify({ i: stepIndex, id: stepIndex === 0 ? 'welcome' : '' } satisfies OnboardingTourStepSnapshot),
    );
    sessionStorage.setItem(onboardingTourActiveKey(userId, businessId), '1');
    window.dispatchEvent(
      new CustomEvent(ONBOARDING_TOUR_ARM_EVENT, {
        detail: { userId: trimId(userId), businessId: trimId(businessId), stepIndex },
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
