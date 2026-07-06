import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useAuthOptional } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { useActivationChecklist } from '../../context/ActivationChecklistContext';
import { isWorkerAccount } from '../../lib/authApi';
import { isGuidedActivationBusinessType } from '../../lib/deliveryOpsTypes';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import {
  isOnboardingTourCompleted,
  isTourCompleteAcknowledged,
  markTourCompleteAcknowledged,
  ONBOARDING_TOUR_COMPLETED_EVENT,
} from '../../lib/onboardingLocalKeys';

function resolveAccountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

export function OnboardingTourCompleteToast() {
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const { completionPct, totalSteps } = useActivationChecklist();

  const accountUserId = resolveAccountUserId(user);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const usesGuidedActivation = isGuidedActivationBusinessType(currentBusiness?.businessType);
  const guidedActivationComplete =
    usesGuidedActivation && totalSteps > 0 && completionPct >= 100;

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    hideTimerRef.current = null;
    ackTimerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    if (!accountUserId || !businessId) return;
    setExiting(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setExiting(false);
      markTourCompleteAcknowledged(accountUserId, businessId);
    }, 280);
  }, [accountUserId, businessId]);

  const maybeShow = useCallback(() => {
    if (isWorkerAccount(user)) {
      setVisible(false);
      return;
    }
    if (!accountUserId || !businessId || !businessesFetchSettled) {
      setVisible(false);
      return;
    }
    if (isTourCompleteAcknowledged(accountUserId, businessId)) {
      setVisible(false);
      return;
    }

    const shouldShow = usesGuidedActivation
      ? guidedActivationComplete
      : isOnboardingTourCompleted(accountUserId, businessId);

    if (!shouldShow) {
      setVisible(false);
      clearTimers();
      return;
    }

    setExiting(false);
    setVisible(true);

    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    ackTimerRef.current = setTimeout(() => dismiss(), 4500);
  }, [
    accountUserId,
    businessId,
    businessesFetchSettled,
    clearTimers,
    dismiss,
    guidedActivationComplete,
    user,
    usesGuidedActivation,
  ]);

  useEffect(() => {
    setVisible(false);
    setExiting(false);
    clearTimers();
  }, [businessId, clearTimers]);

  useEffect(() => {
    maybeShow();
  }, [maybeShow]);

  useEffect(() => {
    if (isWorkerAccount(user)) return;
    if (!accountUserId || !businessId) return;

    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; businessId?: string }>).detail;
      if (detail?.userId !== accountUserId || detail?.businessId !== businessId) return;
      maybeShow();
    };

    window.addEventListener(ONBOARDING_TOUR_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(ONBOARDING_TOUR_COMPLETED_EVENT, onCompleted);
  }, [accountUserId, businessId, maybeShow, user]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[95] pointer-events-none transition-all duration-300 ${
        exiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-xl shadow-emerald-100/50 dark:shadow-black/40">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {usesGuidedActivation ? 'Alta completada' : 'Tour completado'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {usesGuidedActivation
              ? 'Has terminado todos los pasos de configuración'
              : 'Ya puedes usar el panel con normalidad'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
