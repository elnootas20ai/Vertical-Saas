import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, X, Rocket, Lock,
  Building2, Users, Package, Warehouse, Settings, Store, Layers, Clock,
  MousePointerClick,
} from 'lucide-react';
import { useActivationChecklist, type OnboardingStep } from '../../context/ActivationChecklistContext';
import { useBusiness } from '../../context/BusinessContext';
import { isDeliveryBusinessType, resolveBusinessScopeId } from '../../lib/deliverySetup';
import { buildActivationTargetUrl, getSubStepGuide } from '../../lib/activationGuide';
import { useAuth } from '../../context/AuthContext';
import {
  dismissOnboardingWelcomeTourForActivation,
  setActivationInProgressStep,
  setOnboardingTourActive,
} from '../../lib/onboardingLocalKeys';

const ACTIVATION_CHECKLIST_EXPANDED_KEY = 'saas_activation_checklist_expanded';

function readExpandedPreference(): boolean {
  try {
    const stored = localStorage.getItem(ACTIVATION_CHECKLIST_EXPANDED_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch { /* ignore */ }
  return true;
}

const STEP_ICONS: Record<string, typeof Building2> = {
  building: Building2,
  users: Users,
  package: Package,
  warehouse: Warehouse,
  settings: Settings,
  rocket: Rocket,
  store: Store,
  brand: Layers,
  clock: Clock,
};

function StepIcon({ iconKey, status, size = 16 }: { iconKey: string; status: string; size?: number }) {
  const Icon = STEP_ICONS[iconKey] || Circle;
  if (status === 'completed') {
    return <CheckCircle2 style={{ width: size, height: size }} className="text-emerald-500 flex-shrink-0" />;
  }
  if (status === 'in_progress') {
    return (
      <Icon style={{ width: size, height: size }} className="text-amber-500 flex-shrink-0" />
    );
  }
  return <Icon style={{ width: size, height: size }} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />;
}

interface Props {
  collapsed: boolean;
}

export function ActivationChecklist({ collapsed }: Props) {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { steps, completionPct, completedSteps, totalSteps, isVisible, dismiss } =
    useActivationChecklist();
  const allStepsDone = totalSteps > 0 && completedSteps >= totalSteps;
  const [expanded, setExpanded] = useState(readExpandedPreference);
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const canDismissChecklist = !isDelivery || allStepsDone;
  const checklistTitle = isDelivery ? 'Alta delivery' : 'Arranque rápido';

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVATION_CHECKLIST_EXPANDED_KEY, String(expanded));
    } catch { /* ignore */ }
  }, [expanded]);

  if (!isVisible) return null;

  if (collapsed) {
    return (
      <div className="px-2 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate('/saas/dashboard')}
          title={`${checklistTitle}: ${completionPct}% · ${completedSteps} de ${totalSteps} pasos`}
          className="relative w-10 h-10 mx-auto flex items-center justify-center"
        >
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18" cy="18" r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="18" cy="18" r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 15}`}
              strokeDashoffset={`${2 * Math.PI * 15 * (1 - completionPct / 100)}`}
              strokeLinecap="round"
              className="text-amber-500 transition-all duration-500"
            />
          </svg>
          <Rocket className="absolute w-3.5 h-3.5 text-amber-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 flex-1 text-left group"
          >
            <Rocket className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {checklistTitle}
            </span>
            <span
              className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums"
              title="Pasos principales (tienda, marca, catálogo…)"
            >
              {completedSteps}/{totalSteps}
              <span className="font-normal text-gray-400 dark:text-gray-500"> pasos</span>
            </span>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 ml-1" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 ml-1" />
            }
          </button>
          {canDismissChecklist && (
            <button
              onClick={dismiss}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors ml-1"
              title="Ocultar del menú (no volver a mostrar)"
            >
              <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>
        <p className="text-[9px] leading-snug text-gray-400 dark:text-gray-500 mb-1.5 pr-6">
          {allStepsDone ? (
            <>
              Datos del alta completos ({completedSteps}/{totalSteps}). Pulsa cualquier paso para{' '}
              <strong className="font-semibold text-gray-500">repasar</strong> o usa{' '}
              <strong className="font-semibold text-gray-500">Ayuda → Continuar tour</strong>.
            </>
          ) : (
            <>
              Progreso real del alta. En cada fila, <strong className="font-semibold text-gray-500">datos</strong> = campos de ese paso (ej. 3/4 en Empresa).
            </>
          )}
        </p>
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-3 space-y-0.5">
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              isDelivery={isDelivery}
              onNavigate={(url) => navigate(url)}
            />
          ))}
          {canDismissChecklist && (
            <button
              onClick={dismiss}
              className="w-full mt-1 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-center"
            >
              {isDelivery ? 'Ocultar guía del menú' : 'Saltar por ahora'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  onNavigate,
  isDelivery,
}: {
  step: OnboardingStep;
  onNavigate: (url: string) => void;
  isDelivery: boolean;
}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const isCompleted = step.status === 'completed';
  const isActive = step.status === 'in_progress' && !step.locked;
  const isLocked = Boolean(step.locked) && !isCompleted;
  const route = step.locked && step.unlockRoute ? step.unlockRoute : step.route;

  const navigateForActivation = (url: string, stepId?: string) => {
    const uid = String(user?.user_id || user?.id || '').trim();
    const bid = resolveBusinessScopeId(currentBusiness);
    if (uid && bid && stepId) {
      setActivationInProgressStep(uid, bid, stepId);
    }
    if (isDelivery) {
      setOnboardingTourActive(uid, bid, true);
    } else {
      dismissOnboardingWelcomeTourForActivation(uid, bid);
    }
    onNavigate(url);
  };

  const handleStepClick = () => {
    if (isLocked && step.unlockRoute) {
      navigateForActivation(step.unlockRoute, step.id);
      return;
    }
    navigateForActivation(route, step.id);
  };

  return (
    <div
      className={`rounded-lg ${
        isActive
          ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800'
          : ''
      }`}
    >
      <button
        type="button"
        onClick={handleStepClick}
        title={isLocked ? step.lockedReason : isCompleted ? 'Repasar este paso' : undefined}
        className={`w-full flex items-start gap-2.5 px-2 py-2 text-left transition-all ${
          isCompleted
            ? 'opacity-80 hover:opacity-100 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer'
            : isLocked
              ? 'opacity-70 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer'
        }`}
      >
        <div className="mt-0.5">
          {isLocked ? (
            <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          ) : (
            <StepIcon iconKey={step.icon} status={step.status} size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p
              className={`text-xs font-medium leading-tight ${
                isCompleted
                  ? 'text-gray-500 dark:text-gray-400'
                  : isLocked
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {step.label}
              {isCompleted ? (
                <span className="ml-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                  · repasar
                </span>
              ) : null}
            </p>
            {!isCompleted && !isLocked && step.totalSubSteps > 0 && (
              <span
                className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded"
                title="Datos de este paso (no confundir con pasos del alta)"
              >
                {step.completedSubSteps}/{step.totalSubSteps} datos
              </span>
            )}
          </div>
          {!isCompleted && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 line-clamp-2">
              {isLocked && step.lockedReason ? step.lockedReason : step.description}
            </p>
          )}
        </div>
      </button>

      {(isActive || isCompleted) && !isLocked && step.subSteps.length > 0 && (
        <ul className="px-2 pb-2 pl-8 space-y-1" aria-label={`Detalle: ${step.label}`}>
          {step.subSteps.map((sub) => {
            const guide = getSubStepGuide(sub.id);
            const canDeepLink = Boolean(guide?.fieldKey);
            return (
              <li key={sub.id}>
                <div
                  className={`flex items-start gap-1.5 rounded-md px-1.5 py-1 ${
                    sub.completed
                      ? 'opacity-60'
                      : 'bg-white/60 dark:bg-gray-900/40'
                  }`}
                >
                  {sub.completed ? (
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500 fill-amber-50 dark:fill-amber-950" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span
                      className={`text-[10px] leading-tight block ${
                        sub.completed
                          ? 'text-gray-400 line-through'
                          : 'font-semibold text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {sub.label}
                    </span>
                    {!sub.completed && guide?.clickHint && (
                      <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight block mt-0.5">
                        {guide.clickHint}
                      </span>
                    )}
                  </div>
                  {!sub.completed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateForActivation(buildActivationTargetUrl(route, sub.id), step.id);
                      }}
                      className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-amber-500 hover:bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-white"
                      title={canDeepLink ? 'Ir y resaltar el campo' : 'Ir a la pantalla'}
                    >
                      <MousePointerClick className="w-2.5 h-2.5" />
                      Ir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
