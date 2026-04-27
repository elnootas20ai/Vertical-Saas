import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, MapPin, UserPlus, Package, Warehouse,
  Monitor, Kanban, Wrench, FileText, Rocket,
  CheckCircle2, Circle, ChevronDown, ChevronRight,
  ArrowRight, SkipForward, Clock, Loader2, Trophy,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useSetupProgress } from '../../context/SetupProgressContext';
import { useAuth } from '../../context/AuthContext';
import type { StepDefinition, SetupStep } from '../../lib/setupProgressApi';

const ICON_MAP: Record<string, React.ReactNode> = {
  Building2: <Building2 className="w-5 h-5" />,
  Users: <Users className="w-5 h-5" />,
  MapPin: <MapPin className="w-5 h-5" />,
  UserPlus: <UserPlus className="w-5 h-5" />,
  Package: <Package className="w-5 h-5" />,
  Warehouse: <Warehouse className="w-5 h-5" />,
  Monitor: <Monitor className="w-5 h-5" />,
  Kanban: <Kanban className="w-5 h-5" />,
  Wrench: <Wrench className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  Rocket: <Rocket className="w-5 h-5" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  base: 'Configuración base',
  crm: 'CRM y clientes',
  stock: 'Stock y catálogo',
  tpv: 'Punto de venta',
  workshop: 'Taller',
};

const CATEGORY_ORDER = ['base', 'crm', 'stock', 'tpv', 'workshop'];

interface StepCardProps {
  definition: StepDefinition;
  step: SetupStep;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onNavigate: () => void;
}

function StepCard({ definition, step, expanded, onToggle, onComplete, onSkip, onNavigate }: StepCardProps) {
  const isDone = step.completed || step.skipped;
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border-2 transition-all duration-200 ${step.completed ? 'border-emerald-200 dark:border-emerald-800' : step.skipped ? 'border-gray-200 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-4 text-left">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${step.completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : step.skipped ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
          {ICON_MAP[definition.icon] || <Circle className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'} ${step.skipped ? 'line-through' : ''}`}>
              {definition.title}
            </h3>
            {definition.required && !isDone && (
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded uppercase">Requerido</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{definition.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {step.completed && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {step.skipped && <SkipForward className="w-4 h-4 text-gray-400" />}
          {!isDone && (expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
        </div>
      </button>
      {expanded && !isDone && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{definition.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onNavigate} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-black dark:hover:bg-gray-100 transition-colors">
              Ir a configurar <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={onComplete} className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Marcar completado
            </button>
            {!definition.required && (
              <button onClick={onSkip} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                <SkipForward className="w-3.5 h-3.5" /> Saltar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SetupOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { progress, definitions, status, loading, completeStep, skipStep, skipAll, verifyAll } = useSetupProgress();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setVerifying(true);
      await verifyAll();
      if (!cancelled) setVerifying(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!expandedStep && progress?.steps) {
      const firstPending = progress.steps.find((s) => !s.completed && !s.skipped);
      if (firstPending) setExpandedStep(firstPending.key);
    }
  }, [progress?.steps, expandedStep]);

  if (loading || verifying) {
    return (
      <Layout title="Configuración inicial" subtitle="Preparando tu espacio...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!progress || !definitions || !status) {
    return (
      <Layout title="Configuración inicial">
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">No se pudo cargar el progreso.</div>
      </Layout>
    );
  }

  if (status.overallCompleted && !status.skippedAt) {
    return (
      <Layout title="Configuración inicial">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-20 h-20 mx-auto mb-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
            <Trophy className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Tu negocio está listo</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">Has completado la configuración inicial.</p>
          <button onClick={() => navigate('/saas/dashboard')} className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold hover:bg-black dark:hover:bg-gray-100 transition-colors">
            Ir al Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Layout>
    );
  }

  const stepsByCategory = new Map<string, { def: StepDefinition; step: SetupStep }[]>();
  for (const def of definitions) {
    const step = progress.steps.find((s) => s.key === def.key);
    if (!step) continue;
    const cat = def.category || 'base';
    if (!stepsByCategory.has(cat)) stepsByCategory.set(cat, []);
    stepsByCategory.get(cat)!.push({ def, step });
  }

  const userName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const companyName = user?.companyName || '';

  return (
    <Layout title="Configuración inicial" subtitle="Prepara tu negocio paso a paso">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {userName ? `¡Hola, ${userName}!` : '¡Bienvenido!'}{' '}
                {companyName ? `Vamos a preparar ${companyName}` : 'Vamos a preparar tu negocio'}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Completa estos pasos para dejar el sistema listo y empezar a operar.</p>
            </div>
            {status.trialDaysRemaining > 0 && (
              <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{status.trialDaysRemaining} días de prueba</span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300">{status.completedCount} de {status.totalCount} pasos completados</span>
              <span className="font-bold text-amber-700 dark:text-amber-300">{status.percentComplete}%</span>
            </div>
            <div className="w-full h-2.5 bg-white dark:bg-gray-800 rounded-full overflow-hidden border border-amber-200/60 dark:border-amber-800/60">
              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${status.percentComplete}%` }} />
            </div>
          </div>
        </div>

        {CATEGORY_ORDER.filter((cat) => stepsByCategory.has(cat)).map((cat) => {
          const items = stepsByCategory.get(cat)!;
          const allDone = items.every(({ step }) => step.completed || step.skipped);
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{CATEGORY_LABELS[cat] || cat}</h2>
                {allDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <div className="space-y-2">
                {items.map(({ def, step }) => (
                  <StepCard key={def.key} definition={def} step={step} expanded={expandedStep === def.key} onToggle={() => setExpandedStep(expandedStep === def.key ? null : def.key)} onComplete={() => completeStep(def.key)} onSkip={() => skipStep(def.key)} onNavigate={() => navigate(def.route)} />
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={async () => {
              const confirmLeave = window.confirm('Se marcara la configuracion inicial como pendiente para mas tarde. Quieres continuar?');
              if (!confirmLeave) return;
              await skipAll();
              navigate('/saas/dashboard');
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Clock className="w-4 h-4" />
            Saltar todo e ir al Dashboard
          </button>
          {status.percentComplete === 100 && (
            <button onClick={() => navigate('/saas/dashboard')} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors">
              <Rocket className="w-4 h-4" /> Empezar a trabajar
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
