import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Rocket } from 'lucide-react';
import { useSetupProgress } from '../../context/SetupProgressContext';

export function SetupProgressWidget() {
  const navigate = useNavigate();
  const { status, definitions, progress, loading } = useSetupProgress();

  if (loading || !status || !progress || !definitions) return null;
  if (status.overallCompleted) return null;

  const pendingDefs = definitions
    .filter((d) => {
      const step = progress.steps.find((s) => s.key === d.key);
      return step && !step.completed && !step.skipped;
    })
    .slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Configuración inicial</h3>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">{status.percentComplete}%</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{status.completedCount} de {status.totalCount} pasos completados</p>
        </div>
        {status.trialDaysRemaining > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <Clock className="w-3 h-3" />
            <span>{status.trialDaysRemaining}d trial</span>
          </div>
        )}
      </div>

      <div className="w-full h-2 bg-white dark:bg-gray-800 rounded-full overflow-hidden mb-4 border border-amber-200/60 dark:border-amber-800/60">
        <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700" style={{ width: `${status.percentComplete}%` }} />
      </div>

      {pendingDefs.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {pendingDefs.map((def) => (
            <div key={def.key} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span>{def.title}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => navigate('/saas/onboarding')} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-black dark:hover:bg-gray-100 transition-colors w-full justify-center">
        Continuar configuración <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
