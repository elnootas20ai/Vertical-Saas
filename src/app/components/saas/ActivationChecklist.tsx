import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, X, Rocket, Lock,
  Building2, Users, Package, Warehouse, Settings, Store, Layers, Clock,
} from 'lucide-react';
import { useActivationChecklist, type OnboardingStep } from '../../context/ActivationChecklistContext';
import { useBusiness } from '../../context/BusinessContext';
import { isDeliveryBusinessType } from '../../lib/deliverySetup';

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
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <Icon style={{ width: size, height: size }} className="text-amber-500" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
      </div>
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
  const { steps, completionPct, completedSteps, totalSteps, isVisible, dismiss } = useActivationChecklist();
  const [expanded, setExpanded] = useState(readExpandedPreference);
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const canDismissChecklist = !isDelivery;
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
          title={`${checklistTitle}: ${completionPct}%`}
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
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 flex-1 text-left group"
          >
            <Rocket className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {checklistTitle}
            </span>
            <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400">
              {completedSteps}/{totalSteps}
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
              title="Ocultar por ahora"
            >
              <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      {expanded && (
        <div className="px-2 pb-3 space-y-0.5">
          {steps.map(step => (
            <StepRow
              key={step.id}
              step={step}
              onNavigate={() => navigate(step.locked && step.unlockRoute ? step.unlockRoute : step.route)}
            />
          ))}
          {canDismissChecklist && (
            <button
              onClick={dismiss}
              className="w-full mt-1 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-center"
            >
              Saltar por ahora
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, onNavigate }: { step: OnboardingStep; onNavigate: () => void }) {
  const isCompleted = step.status === 'completed';
  const isActive = step.status === 'in_progress' && !step.locked;
  const isLocked = Boolean(step.locked) && !isCompleted;

  const handleClick = () => {
    if (isCompleted) return;
    if (isLocked && step.unlockRoute) {
      onNavigate();
      return;
    }
    if (!isLocked) onNavigate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isCompleted}
      title={isLocked ? step.lockedReason : undefined}
      className={`w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
        isCompleted
          ? 'opacity-50 cursor-default'
          : isLocked
            ? 'opacity-70 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
            : isActive
              ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800 cursor-pointer'
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
        <div className="flex items-center gap-1.5">
          <p
            className={`text-xs font-medium leading-tight ${
              isCompleted
                ? 'line-through text-gray-400 dark:text-gray-500'
                : isLocked
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {step.label}
          </p>
          {!isCompleted && !isLocked && step.totalSubSteps > 0 && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500 tabular-nums">
              {step.completedSubSteps}/{step.totalSubSteps}
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
  );
}
