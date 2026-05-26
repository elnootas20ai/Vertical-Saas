import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModalClose } from '../../hooks/useModalClose';
import { X, ChevronRight, ChevronLeft, Sparkles, Rocket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import {
  clearOnboardingTourForBusiness,
  isOnboardingTourCompleted,
  markOnboardingTourCompleted,
  ONBOARDING_TOUR_ARM_EVENT,
} from '../../lib/onboardingLocalKeys';
import { getOnboardingTourSteps } from '../../lib/onboardingTourSteps';

function resolveAccountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

function tourRouteNavigate(navigate: ReturnType<typeof useNavigate>, route?: string) {
  const raw = String(route || '').trim();
  if (!raw) return;
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) {
    navigate(raw);
    return;
  }
  navigate({ pathname: raw.slice(0, qIdx), search: raw.slice(qIdx) });
}

interface Props {
  onComplete?: () => void;
}

export function OnboardingTour({ onComplete }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;

  const steps = useMemo(
    () =>
      getOnboardingTourSteps(currentBusiness?.businessType, {
        firstName: user?.firstName,
        businessName: currentBusiness?.name,
      }),
    [currentBusiness?.businessType, currentBusiness?.name, user?.firstName],
  );

  const accountUserId = resolveAccountUserId(user);
  const businessId = String(currentBusiness?.business_id || '').trim();
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [closedThisSession, setClosedThisSession] = useState(false);
  // Recordamos a quién pertenece la sesión actual para evitar carry-over entre logins.
  const ownerRef = useRef<string>('');

  useEffect(() => {
    if (!accountUserId || !businessId || !businessesFetchSettled) return;

    const ownerKey = `${accountUserId}::${businessId}`;
    // Al cambiar de empresa / sesión, reiniciamos el estado de cierre local.
    if (ownerRef.current !== ownerKey) {
      ownerRef.current = ownerKey;
      setClosedThisSession(false);
      setStepIndex(0);
    }

    const alreadySeen = isOnboardingTourCompleted(accountUserId, businessId);

    const openTour = () => setVisible(true);

    const onArmed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; businessId?: string }>).detail;
      if (detail?.userId === accountUserId && detail?.businessId === businessId) {
        setStepIndex(0);
        setClosedThisSession(false);
        openTour();
      }
    };

    window.addEventListener(ONBOARDING_TOUR_ARM_EVENT, onArmed);

    // Auto-apertura SOLO la primera vez (no tras saltar/completar ni en recargas posteriores).
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!alreadySeen && !closedThisSession) {
      timer = setTimeout(openTour, 800);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(ONBOARDING_TOUR_ARM_EVENT, onArmed);
    };
  }, [accountUserId, businessId, businessesFetchSettled, closedThisSession]);

  useEffect(() => {
    setStepIndex((idx) => Math.max(0, Math.min(idx, steps.length - 1)));
  }, [steps.length]);

  const closeTour = useCallback(
    (completed = false) => {
      // Persistimos «ya visto» de forma SÍNCRONA al pulsar (no dentro del timeout de
      // la animación) para que, si el usuario recarga durante la salida, ya quede
      // guardado en localStorage según contrato del checklist:
      // «al saltar o terminar no vuelve al recargar».
      if (accountUserId && businessId) {
        markOnboardingTourCompleted(accountUserId, businessId);
      }
      setExiting(true);
      setTimeout(() => {
        setVisible(false);
        setExiting(false);
        setClosedThisSession(true);
        if (completed) onComplete?.();
      }, 250);
    },
    [onComplete, accountUserId, businessId],
  );

  const handleNext = useCallback(() => {
    const next = stepIndex + 1;
    const step = steps[next];

    if (next >= steps.length) {
      closeTour(true);
      return;
    }

    setStepIndex(next);
    tourRouteNavigate(navigate, step?.route);
  }, [stepIndex, closeTour, navigate, steps]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      const step = steps[prev];
      setStepIndex(prev);
      tourRouteNavigate(navigate, step?.route);
    }
  }, [stepIndex, navigate, steps]);

  const handleDotClick = useCallback(
    (idx: number) => {
      const step = steps[idx];
      setStepIndex(idx);
      tourRouteNavigate(navigate, step?.route);
    },
    [navigate, steps],
  );

  useModalClose(visible, closeTour);

  if (!visible) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

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
          onClick={() => closeTour()}
          className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors z-10"
          title="Saltar tour"
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
                Paso {stepIndex + 1} de {steps.length}
              </p>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {step.title}
              </h3>
            </div>
          </div>

          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
            {step.description}
          </p>

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
                onClick={() => handleDotClick(idx)}
                className={`rounded-full transition-all duration-200 ${idx === stepIndex ? 'w-5 h-2 bg-amber-500 dark:bg-amber-400' : idx < stepIndex ? 'w-2 h-2 bg-emerald-400 dark:bg-emerald-500' : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors"
            >
              {isLast ? (
                <>
                  <Rocket className="w-4 h-4" />
                  Empezar a trabajar
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
              onClick={() => closeTour()}
              className="w-full mt-2 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-center"
            >
              Saltar tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useRestartTour() {
  const { user } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const restart = useCallback(() => {
    const accountUserId = resolveAccountUserId(user);
    const businessId = String(currentBusiness?.business_id || '').trim();
    if (!accountUserId || !businessId) return;
    // Borramos cualquier marca de «ya visto» para que el evento ARM pueda reabrirlo
    // y para que tampoco se considere completado tras cerrar (relanzamos de cero).
    clearOnboardingTourForBusiness(accountUserId, businessId);
    window.dispatchEvent(
      new CustomEvent(ONBOARDING_TOUR_ARM_EVENT, {
        detail: { userId: accountUserId, businessId },
      }),
    );
  }, [user, currentBusiness?.business_id]);
  return restart;
}
