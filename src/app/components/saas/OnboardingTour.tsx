import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Building2, Users, Package, TrendingUp,
  X, ChevronRight, ChevronLeft, Sparkles, CheckCircle2, Rocket,
  Settings,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TourStep {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  hint?: string;
  route?: string;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    title: '¡Bienvenido a tu plataforma!',
    description: 'Vamos a enseñarte los módulos principales para que puedas poner tu negocio en marcha en minutos. Sigue los pasos y empieza a operar cuanto antes.',
    hint: 'Este tour te llevará por las áreas clave del sistema.',
  },
  {
    id: 'configure',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Configura tu negocio',
    description: 'Empieza completando los datos de tu empresa: nombre comercial, datos fiscales, dirección y contacto. Así tus documentos y facturas saldrán con la información correcta.',
    hint: 'Accede desde Ajustes → Empresa para completar tu perfil.',
    route: '/saas/settings/empresa',
  },
  {
    id: 'clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Sube tus clientes',
    description: 'Importa tu base de clientes desde Excel o créalos manualmente. Con el CRM integrado podrás gestionar clientes y leads desde un mismo sitio.',
    hint: 'Puedes importar clientes en bloque desde un fichero CSV o Excel.',
    route: '/saas/delivery-crm',
  },
  {
    id: 'catalog',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Crea tu catálogo',
    description: 'Da de alta tus productos o servicios. Asigna categorías, precios, impuestos y toda la información necesaria para empezar a vender.',
    hint: 'Puedes añadir productos de uno en uno o importar en bloque.',
    route: '/saas/catalog',
  },
  {
    id: 'operations',
    icon: <Settings className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-gray-700 to-gray-900',
    title: 'Configura tu operativa',
    description: 'Define la numeración de documentos, invita a tu equipo y configura los permisos básicos para que todos puedan trabajar.',
    hint: 'Accede a Ajustes para personalizar numeración, plantillas y roles.',
    route: '/saas/settings/numeracion',
  },
  {
    id: 'sales',
    icon: <TrendingUp className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Realiza tu primera venta',
    description: 'Ya estás listo para crear tu primera operación. Registra una venta, genera el documento correspondiente y comprueba que todo funciona correctamente.',
    hint: 'Desde Ventas puedes crear operaciones y generar facturas.',
    route: '/saas/sales',
  },
  {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Todo listo para empezar!',
    description: 'Ya conoces los módulos principales. En el Dashboard encontrarás la guía de arranque rápido para completar la configuración de tu negocio paso a paso.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  },
];

const STORAGE_KEY = 'vertial_onboarding_completed';
const STORAGE_VERSION = '2';
const STEP_KEY = 'vertial_onboarding_step';
const ACTIVE_KEY = 'vertial_onboarding_active';

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onComplete?: () => void;
}

export function OnboardingTour({ onComplete }: Props) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndexRaw] = useState(() => {
    const saved = sessionStorage.getItem(STEP_KEY);
    return saved ? Math.min(Number(saved) || 0, TOUR_STEPS.length - 1) : 0;
  });

  const setStepIndex = useCallback((idx: number) => {
    setStepIndexRaw(idx);
    sessionStorage.setItem(STEP_KEY, String(idx));
  }, []);

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed === STORAGE_VERSION) return;
    const wasActive = sessionStorage.getItem(ACTIVE_KEY) === '1';
    if (wasActive) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => {
        setVisible(true);
        sessionStorage.setItem(ACTIVE_KEY, '1');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const closeTour = useCallback((completed = false) => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      localStorage.setItem(STORAGE_KEY, STORAGE_VERSION);
      sessionStorage.removeItem(STEP_KEY);
      sessionStorage.removeItem(ACTIVE_KEY);
      if (completed) onComplete?.();
    }, 250);
  }, [onComplete]);

  const handleNext = useCallback(() => {
    const next = stepIndex + 1;
    const step = TOUR_STEPS[next];

    if (next >= TOUR_STEPS.length) {
      closeTour(true);
      return;
    }

    setStepIndex(next);
    if (step?.route) {
      navigate(step.route);
    }
  }, [stepIndex, closeTour, navigate, setStepIndex]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      const step = TOUR_STEPS[prev];
      setStepIndex(prev);
      if (step?.route) navigate(step.route);
    }
  }, [stepIndex, navigate, setStepIndex]);

  const handleDotClick = useCallback((idx: number) => {
    const step = TOUR_STEPS[idx];
    setStepIndex(idx);
    if (step?.route) navigate(step.route);
  }, [navigate, setStepIndex]);

  useModalClose(visible, closeTour);

  if (!visible) return null;

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progress = ((stepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center pb-4 sm:pb-0 px-4 pointer-events-none transition-opacity duration-250 ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Semi-transparent overlay (no cierra el tour al hacer clic) */}
      <div className="absolute inset-0 bg-black/20 pointer-events-auto" />

      {/* Tour card */}
      <div
        className={`relative pointer-events-auto w-full sm:w-[480px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-black/40 border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ${exiting ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Close */}
        <button
          onClick={() => closeTour()}
          className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors z-10"
          title="Saltar tour"
        >
          <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Icon + step counter */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 rounded-2xl ${step.iconBg} flex items-center justify-center flex-shrink-0 shadow-lg dark:shadow-gray-900/40`}>
              {step.icon}
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                Paso {stepIndex + 1} de {TOUR_STEPS.length}
              </p>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {step.title}
              </h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Hint */}
          {step.hint && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-100 dark:border-amber-900 mb-5">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">{step.hint}</p>
            </div>
          )}

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                className={`rounded-full transition-all duration-200 ${idx === stepIndex ? 'w-5 h-2 bg-amber-500 dark:bg-amber-400' : idx < stepIndex ? 'w-2 h-2 bg-emerald-400 dark:bg-emerald-500' : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              />
            ))}
          </div>

          {/* Actions */}
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

// ─── Hook to restart tour ─────────────────────────────────────────────────────

export function useRestartTour() {
  const restart = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STEP_KEY);
    sessionStorage.removeItem(ACTIVE_KEY);
    window.location.reload();
  }, []);
  return restart;
}
