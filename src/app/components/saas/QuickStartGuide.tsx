import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Package, Warehouse, Settings, Rocket,
  CheckCircle2, ChevronRight, ChevronDown, X, Upload,
  ArrowRight, Download, Truck, Circle, MousePointerClick,
} from 'lucide-react';
import { useActivationChecklist, type OnboardingStep, type OnboardingSubStep } from '../../context/ActivationChecklistContext';
import { buildActivationTargetUrl, getSubStepGuide } from '../../lib/activationGuide';

const ICON_MAP: Record<string, typeof Building2> = {
  building: Building2,
  users: Users,
  package: Package,
  warehouse: Warehouse,
  settings: Settings,
  rocket: Rocket,
};

const GRADIENT_MAP: Record<string, string> = {
  building: 'from-blue-500 to-indigo-600',
  users: 'from-violet-500 to-purple-600',
  package: 'from-emerald-500 to-green-600',
  warehouse: 'from-orange-500 to-amber-600',
  settings: 'from-gray-600 to-gray-800',
  rocket: 'from-rose-500 to-pink-600',
};

const ACCENT_MAP: Record<string, { bg: string; text: string; ring: string; light: string }> = {
  building: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-200 dark:ring-blue-800', light: 'bg-blue-100 dark:bg-blue-900' },
  users: { bg: 'bg-violet-50 dark:bg-violet-950', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-200 dark:ring-violet-800', light: 'bg-violet-100 dark:bg-violet-900' },
  package: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800', light: 'bg-emerald-100 dark:bg-emerald-900' },
  warehouse: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-200 dark:ring-orange-800', light: 'bg-orange-100 dark:bg-orange-900' },
  settings: { bg: 'bg-gray-50 dark:bg-gray-900', text: 'text-gray-600 dark:text-gray-400', ring: 'ring-gray-200 dark:ring-gray-700', light: 'bg-gray-100 dark:bg-gray-800' },
  rocket: { bg: 'bg-rose-50 dark:bg-rose-950', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-800', light: 'bg-rose-100 dark:bg-rose-900' },
};

export function QuickStartGuide() {
  const navigate = useNavigate();
  const {
    steps, completionPct, completedSteps, totalSteps,
    isVisible, dismiss, currentStepIndex,
  } = useActivationChecklist();
  const [expandedStep, setExpandedStep] = useState<string | null>(
    () => steps[currentStepIndex]?.id ?? null,
  );

  const handleToggle = useCallback((stepId: string) => {
    setExpandedStep(prev => prev === stepId ? null : stepId);
  }, []);

  if (!isVisible) return null;

  const nextStep = steps.find(s => s.status !== 'completed');

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="relative px-6 pt-6 pb-4">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Saltar por ahora"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Pon tu negocio en marcha
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Completa estos pasos para empezar a operar cuanto antes
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {completedSteps} de {totalSteps} completados
            </span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {completionPct}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3">
            {steps.map(step => (
              <div
                key={step.id}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  step.status === 'completed'
                    ? 'bg-emerald-400 dark:bg-emerald-500'
                    : step.status === 'in_progress'
                      ? 'bg-amber-400 dark:bg-amber-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 pb-2">
        {steps.map(step => (
          <StepCard
            key={step.id}
            step={step}
            isExpanded={expandedStep === step.id}
            isNext={nextStep?.id === step.id}
            onToggle={() => handleToggle(step.id)}
            onNavigate={(url) => navigate(url)}
          />
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <ImportDropdown />
          <button
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          >
            Saltar por ahora
          </button>
          {nextStep && (
            <button
              onClick={() => navigate(nextStep.route)}
              className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-black dark:hover:bg-gray-100 transition-colors shadow-sm"
            >
              {nextStep.status === 'in_progress' ? 'Continuar' : 'Siguiente paso'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step, isExpanded, isNext, onToggle, onNavigate,
}: {
  step: OnboardingStep;
  isExpanded: boolean;
  isNext: boolean;
  onToggle: () => void;
  onNavigate: (url: string) => void;
}) {
  const Icon = ICON_MAP[step.icon] || Rocket;
  const gradient = GRADIENT_MAP[step.icon] || 'from-gray-500 to-gray-600';
  const accent = ACCENT_MAP[step.icon] || ACCENT_MAP.settings;
  const isCompleted = step.status === 'completed';
  const isInProgress = step.status === 'in_progress';

  return (
    <div
      className={`mb-2 rounded-xl border transition-all duration-200 ${
        isCompleted
          ? 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30'
          : isNext
            ? `border-gray-200 dark:border-gray-700 ring-1 ${accent.ring} ${accent.bg}`
            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'
      }`}
    >
      {/* Step header */}
      <button
        onClick={isCompleted ? undefined : onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${isCompleted ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {/* Number / Status indicator */}
        {isCompleted ? (
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
        ) : (
          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold leading-tight ${
              isCompleted
                ? 'text-gray-400 dark:text-gray-500 line-through'
                : 'text-gray-800 dark:text-gray-200'
            }`}>
              {step.label}
            </span>
            {isInProgress && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-md">
                En curso
              </span>
            )}
          </div>
          {!isCompleted && !isExpanded && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
              {step.description}
            </p>
          )}
        </div>

        {/* Progress + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isCompleted && step.totalSubSteps > 0 && (
            <span
              className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded"
              title="Datos de este paso"
            >
              {step.completedSubSteps}/{step.totalSubSteps} datos
            </span>
          )}
          {!isCompleted && (
            <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && !isCompleted && (
        <div className="px-4 pb-4 pt-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 pl-11">
            {step.description}
          </p>

          {/* Sub-steps */}
          <div className="space-y-1.5 pl-11 mb-4">
            {step.subSteps.map((sub) => (
              <SubStepRow key={sub.id} sub={sub} stepRoute={step.route} />
            ))}
          </div>

          {/* Action button */}
          <div className="pl-11">
            <button
              onClick={() => onNavigate(step.route)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all shadow-sm ${
                isNext
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-black dark:hover:bg-gray-100'
                  : `${accent.light} ${accent.text} hover:opacity-80`
              }`}
            >
              {isInProgress ? 'Continuar' : 'Comenzar'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-step row ─────────────────────────────────────────────────────────────

function SubStepRow({ sub, stepRoute }: { sub: OnboardingSubStep; stepRoute: string }) {
  const navigate = useNavigate();
  const guide = getSubStepGuide(sub.id);
  return (
    <div className="flex items-start gap-2 rounded-md py-1">
      {sub.completed ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5 fill-amber-50 dark:fill-amber-950" />
      )}
      <div className="min-w-0 flex-1">
        <span className={`text-xs block ${sub.completed ? 'text-gray-400 dark:text-gray-500 line-through' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
          {sub.label}
        </span>
        {!sub.completed && guide?.clickHint && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 block mt-0.5">{guide.clickHint}</span>
        )}
      </div>
      {!sub.completed && (
        <button
          type="button"
          onClick={() => navigate(buildActivationTargetUrl(stepRoute, sub.id))}
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-amber-500 hover:bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-white"
        >
          <MousePointerClick className="w-2.5 h-2.5" />
          Ir
        </button>
      )}
    </div>
  );
}

// ─── Import dropdown ──────────────────────────────────────────────────────────

const IMPORT_OPTIONS = [
  { id: 'clients', label: 'Clientes / Leads', icon: Users, route: '/saas/clients', hint: 'CSV o Excel' },
  { id: 'catalog', label: 'Catálogo / Productos', icon: Package, route: '/saas/catalog', hint: 'CSV o Excel' },
  { id: 'suppliers', label: 'Proveedores', icon: Truck, route: '/saas/suppliers', hint: 'CSV o Excel' },
] as const;

function ImportDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Importar datos
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-20 py-1.5">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Importar desde CSV / Excel
          </p>
          {IMPORT_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => { navigate(opt.route); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{opt.label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{opt.hint}</p>
                </div>
                <Download className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 ml-auto flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
