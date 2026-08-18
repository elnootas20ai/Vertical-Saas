import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useModalClose } from '../../hooks/useModalClose';
import { X, ChevronRight, ChevronLeft, Sparkles, Rocket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { useActivationChecklist } from '../../context/ActivationChecklistContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { ACTIVATION_FOCUS_PARAM } from '../../lib/activationGuide';
import {
  armOnboardingTourForBusiness,
  isOnboardingTourActive,
  isOnboardingTourCompleted,
  markOnboardingTourCompleted,
  ONBOARDING_TOUR_ARM_EVENT,
  setOnboardingTourActive,
  resolveOnboardingTourStepIndex,
  setOnboardingTourStep,
} from '../../lib/onboardingLocalKeys';
import { getOnboardingTourSteps } from '../../lib/onboardingTourSteps';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import {
  getGuidedActivationFirstStepId,
  isGuidedActivationBusinessType,
} from '../../lib/deliveryOpsTypes';

/** Delivery/restaurant: no abrir el tour hasta saber el % del checklist (evita flash → “completado”). */
function checklistReadyForTourGate(
  usesGuided: boolean,
  checklistTotalSteps: number,
): boolean {
  if (!usesGuided) return true;
  return checklistTotalSteps > 0;
}

function resolveAccountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

function tourRouteNavigate(
  navigate: ReturnType<typeof useNavigate>,
  route: string | undefined,
  businessId?: string | null,
) {
  const raw = String(route || '').trim();
  if (!raw) return;
  const scoped = saasPathWithBusinessScope(raw, businessId);
  const qIdx = scoped.indexOf('?');
  if (qIdx === -1) {
    navigate(scoped);
    return;
  }
  navigate({ pathname: scoped.slice(0, qIdx), search: scoped.slice(qIdx) });
}

interface Props {
  onComplete?: () => void;
}

export function OnboardingTour({ onComplete }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const { completionPct: checklistCompletionPct, totalSteps: checklistTotalSteps } =
    useActivationChecklist();
  const checklistComplete =
    checklistTotalSteps > 0 && checklistCompletionPct >= 100;

  const businessType = currentBusiness?.businessType;
  const steps = useMemo(
    () =>
      businessType
        ? getOnboardingTourSteps(businessType, {
            firstName: user?.firstName,
            businessName: currentBusiness?.name,
          })
        : [],
    [businessType, currentBusiness?.name, user?.firstName],
  );

  const accountUserId = resolveAccountUserId(user);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const hasActivationFocus = useMemo(
    () => new URLSearchParams(location.search).has(ACTIVATION_FOCUS_PARAM),
    [location.search],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [tourGate, setTourGate] = useState<'loading' | 'hide' | 'show'>('loading');
  const [exiting, setExiting] = useState(false);
  const [pausedThisSession, setPausedThisSession] = useState(false);
  const ownerRef = useRef<string>('');
  /** Evita que re-renders del contexto empresa oculten el tour a mitad de recorrido. */
  const showLockRef = useRef(false);

  /** Reinicio manual (Ayuda → Tour): siempre escuchar aunque el tour ya estuviera marcado como visto. */
  useEffect(() => {
    if (isWorkerAccount(user)) return;
    if (!accountUserId || !businessId) return;

    const onArmed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; businessId?: string; stepIndex?: number }>).detail;
      if (detail?.userId !== accountUserId || detail?.businessId !== businessId) return;
      const start =
        typeof detail?.stepIndex === 'number' && detail.stepIndex >= 0
          ? Math.min(detail.stepIndex, steps.length - 1)
          : 0;
      const startStep = steps[start];
      setStepIndex(start);
      setOnboardingTourStep(accountUserId, businessId, start, startStep?.id || 'welcome');
      showLockRef.current = true;
      setPausedThisSession(false);
      setOnboardingTourActive(accountUserId, businessId, true);
      setTourGate('show');
      if (startStep?.route) tourRouteNavigate(navigate, startStep.route, businessId);
    };

    window.addEventListener(ONBOARDING_TOUR_ARM_EVENT, onArmed);
    return () => window.removeEventListener(ONBOARDING_TOUR_ARM_EVENT, onArmed);
  }, [accountUserId, businessId, user, navigate, steps]);

  useEffect(() => {
    if (isWorkerAccount(user)) {
      if (accountUserId && businessId) {
        markOnboardingTourCompleted(accountUserId, businessId);
        setOnboardingTourActive(accountUserId, businessId, false);
      }
      showLockRef.current = false;
      setTourGate('hide');
      return;
    }

    if (!accountUserId || !businessId || !businessesFetchSettled || !currentBusiness?.businessType) {
      if (!showLockRef.current) setTourGate('loading');
      return;
    }

    if (steps.length === 0) {
      setTourGate('hide');
      return;
    }

    const usesGuided = isGuidedActivationBusinessType(businessType);
    if (!checklistReadyForTourGate(usesGuided, checklistTotalSteps)) {
      if (!showLockRef.current) setTourGate('loading');
      return;
    }

    if (checklistComplete) {
      if (accountUserId && businessId) {
        markOnboardingTourCompleted(accountUserId, businessId);
        setOnboardingTourActive(accountUserId, businessId, false);
      }
      showLockRef.current = false;
      setTourGate('hide');
      return;
    }

    const ownerKey = `${accountUserId}::${businessId}`;
    if (ownerRef.current !== ownerKey) {
      ownerRef.current = ownerKey;
      showLockRef.current = false;
      setPausedThisSession(false);
      setTourGate('loading');
    }

    const alreadySeen = isOnboardingTourCompleted(accountUserId, businessId);
    if (alreadySeen || hasActivationFocus) {
      if (!showLockRef.current) {
        setOnboardingTourActive(accountUserId, businessId, false);
        setTourGate('hide');
      }
      return;
    }

    const wasActive = isOnboardingTourActive(accountUserId, businessId);
    const savedStepIndex = resolveOnboardingTourStepIndex(steps, accountUserId, businessId);

    const openTour = () => {
      if (checklistComplete) {
        if (accountUserId && businessId) {
          markOnboardingTourCompleted(accountUserId, businessId);
          setOnboardingTourActive(accountUserId, businessId, false);
        }
        showLockRef.current = false;
        setTourGate('hide');
        return;
      }
      if (isOnboardingTourCompleted(accountUserId, businessId)) {
        if (!showLockRef.current) {
          setOnboardingTourActive(accountUserId, businessId, false);
          setTourGate('hide');
        }
        return;
      }
      showLockRef.current = true;
      setPausedThisSession(false);
      setOnboardingTourActive(accountUserId, businessId, true);
      setTourGate('show');
    };

    if (showLockRef.current) {
      setOnboardingTourActive(accountUserId, businessId, true);
      setTourGate('show');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!pausedThisSession) {
      if (wasActive && savedStepIndex > 0) {
        openTour();
      } else if (!wasActive || savedStepIndex === 0) {
        // Primera visita o tour armado en createBusiness antes de montar Layout (wasActive + paso 0).
        timer = setTimeout(openTour, 600);
      }
    } else {
      setTourGate('hide');
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    accountUserId,
    businessId,
    businessesFetchSettled,
    pausedThisSession,
    currentBusiness,
    user,
    checklistComplete,
    checklistTotalSteps,
    hasActivationFocus,
    steps,
  ]);

  useEffect(() => {
    if (!accountUserId || !businessId || !businessesFetchSettled || !currentBusiness?.businessType) return;
    if (steps.length === 0) return;
    setStepIndex(resolveOnboardingTourStepIndex(steps, accountUserId, businessId));
  }, [accountUserId, businessId, businessesFetchSettled, currentBusiness?.businessType, steps]);

  const hideTourUi = useCallback(
    (options?: { markCompleted?: boolean; pauseForSession?: boolean }) => {
      const markCompleted = options?.markCompleted ?? false;
      const pauseForSession = options?.pauseForSession ?? false;

      if (markCompleted && accountUserId && businessId) {
        markOnboardingTourCompleted(accountUserId, businessId);
        showLockRef.current = false;
      } else if (pauseForSession && accountUserId && businessId) {
        setOnboardingTourActive(accountUserId, businessId, true);
        showLockRef.current = false;
        setPausedThisSession(true);
      } else if (accountUserId && businessId) {
        setOnboardingTourActive(accountUserId, businessId, false);
        showLockRef.current = false;
      }

      setExiting(true);
      setTimeout(() => {
        setTourGate('hide');
        setExiting(false);
        if (options?.markCompleted) onComplete?.();
      }, 250);
    },
    [onComplete, accountUserId, businessId],
  );

  const finishTour = useCallback(() => {
    hideTourUi({ markCompleted: true });
  }, [hideTourUi]);

  const pauseTour = useCallback(() => {
    hideTourUi({ markCompleted: true });
  }, [hideTourUi]);

  const handleNext = useCallback(() => {
    const next = stepIndex + 1;
    const step = steps[next];

    if (next >= steps.length) {
      finishTour();
      return;
    }

    setStepIndex(next);
    setOnboardingTourStep(accountUserId, businessId, next, step?.id);
    tourRouteNavigate(navigate, step?.route, businessId);
  }, [stepIndex, finishTour, navigate, steps, accountUserId, businessId]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      const step = steps[prev];
      setStepIndex(prev);
      setOnboardingTourStep(accountUserId, businessId, prev, step?.id);
      tourRouteNavigate(navigate, step?.route, businessId);
    }
  }, [stepIndex, navigate, steps, accountUserId, businessId]);

  const handleDotClick = useCallback(
    (idx: number) => {
      const step = steps[idx];
      setStepIndex(idx);
      setOnboardingTourStep(accountUserId, businessId, idx, step?.id);
      tourRouteNavigate(navigate, step?.route, businessId);
    },
    [navigate, steps, accountUserId, businessId],
  );

  useModalClose(tourGate === 'show', pauseTour);

  if (isWorkerAccount(user) || tourGate !== 'show' || steps.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const step = steps[safeIndex];
  if (!step) return null;
  const isLast = safeIndex === steps.length - 1;
  const progress = ((safeIndex + 1) / steps.length) * 100;

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center pb-4 sm:pb-0 px-4 pointer-events-none transition-opacity duration-250 ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-auto" />

      <div
        className={`relative pointer-events-auto w-full sm:w-[480px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-black/40 border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ${exiting ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <button
          onClick={pauseTour}
          className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors z-10"
          title="Cerrar tour (no volver a mostrar)"
        >
          <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div
              className={`w-14 h-14 rounded-2xl ${step.iconBg} flex items-center justify-center flex-shrink-0 shadow-lg dark:shadow-gray-900/40`}
            >
              {step.icon}
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                Paso {safeIndex + 1} de {steps.length}
              </p>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {step.title}
              </h3>
            </div>
          </div>

          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
            {step.description}
          </p>

          {step.checklist && step.checklist.length > 0 && (
            <ul className="mb-4 space-y-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-3 py-2.5">
              {step.checklist.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          )}

          {step.hint && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-100 dark:border-amber-900 mb-5">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">{step.hint}</p>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 mb-4">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleDotClick(idx)}
                className={`rounded-full transition-all duration-200 ${idx === stepIndex ? 'w-5 h-2 bg-amber-500 dark:bg-amber-400' : idx < stepIndex ? 'w-2 h-2 bg-emerald-400 dark:bg-emerald-500' : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors"
            >
              {isLast ? (
                <>
                  <Rocket className="w-4 h-4" />
                  Empezar a trabajar
                </>
              ) : step.route ? (
                <>
                  Ir a este paso
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {!isLast && (
            <button
              type="button"
              onClick={finishTour}
              className="w-full mt-2 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-center"
            >
              Saltar tour (no volver a mostrar)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useRestartTour() {
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const restart = useCallback(
    (options?: { fromBeginning?: boolean }) => {
      const accountUserId = resolveAccountUserId(user);
      const businessId = resolveBusinessScopeId(currentBusiness);
      if (!accountUserId || !businessId) return false;
      if (!isGuidedActivationBusinessType(currentBusiness?.businessType)) return false;
      const fromBeginning = options?.fromBeginning !== false;
      armOnboardingTourForBusiness(accountUserId, businessId, {
        fromBeginning,
        activationStepId: fromBeginning
          ? getGuidedActivationFirstStepId(currentBusiness?.businessType)
          : undefined,
      });
      return true;
    },
    [user, currentBusiness?.business_id, currentBusiness?.businessType],
  );
  return restart;
}
