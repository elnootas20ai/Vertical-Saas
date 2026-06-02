import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, UserCheck, FileWarning } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import {
  HR_OWNED_FIELD_DEFS,
  WORKER_OWNED_FIELD_DEFS,
  isWorkerProfileSubject,
} from '../../lib/workerProfileCompletion';

export function WorkerProfileCompletionBanner() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user || !isWorkerAccount(user) || !isWorkerProfileSubject(user)) return null;
  if (!String(user.linkedBusinessId || '').trim()) return null;

  const completion = user.workerProfileCompletion;
  if (!completion || completion.fullyCompleted) return null;

  const workerLabels = WORKER_OWNED_FIELD_DEFS
    .filter((f) => completion.workerMissing?.includes(f.id))
    .map((f) => f.label);
  const hrLabels = HR_OWNED_FIELD_DEFS
    .filter((f) => completion.hrMissing?.includes(f.id))
    .map((f) => f.label);

  return (
    <div className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Completa tu ficha de trabajador
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            Tu empresa necesita estos datos para el alta laboral y la nómina.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {!completion.workerCompleted && (
              <div className="rounded-xl border border-blue-100 bg-white/70 px-3 py-2 dark:border-blue-900 dark:bg-gray-900/40">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-blue-800 dark:text-blue-300">
                  <UserCheck className="h-3.5 w-3.5" />
                  Tú debes completar
                </p>
                <ul className="space-y-0.5">
                  {workerLabels.map((label) => (
                    <li key={label} className="text-[10px] text-blue-700 dark:text-blue-300">· {label}</li>
                  ))}
                </ul>
              </div>
            )}
            {!completion.hrCompleted && (
              <div className="rounded-xl border border-violet-100 bg-white/70 px-3 py-2 dark:border-violet-900 dark:bg-gray-900/40">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-violet-800 dark:text-violet-300">
                  <FileWarning className="h-3.5 w-3.5" />
                  Gestoría / RRHH completará
                </p>
                <ul className="space-y-0.5">
                  {hrLabels.map((label) => (
                    <li key={label} className="text-[10px] text-violet-700 dark:text-violet-300">· {label}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {!completion.workerCompleted && (
            <button
              type="button"
              onClick={() => navigate('/saas/worker/complete-payroll')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Completar datos de nómina
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
