import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, UserCheck } from 'lucide-react';
import { useAuthOptional } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import {
  WORKER_OWNED_FIELD_DEFS,
  isWorkerProfileSubject,
} from '../../lib/workerProfileCompletion';

/**
 * Solo avisa al trabajador de lo que ÉL debe completar.
 * Fecha de alta / grupo de cotización / mutua → Gestor/RRHH (no se muestran aquí).
 */
export function WorkerProfileCompletionBanner() {
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const user = auth?.user;

  if (!user || !isWorkerAccount(user) || !isWorkerProfileSubject(user)) return null;
  if (!String(user.linkedBusinessId || '').trim()) return null;

  const completion = user.workerProfileCompletion;
  if (!completion || completion.workerCompleted) return null;

  const workerLabels = WORKER_OWNED_FIELD_DEFS
    .filter((f) => completion.workerMissing?.includes(f.id))
    .map((f) => f.label);

  if (workerLabels.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Completa tu ficha de trabajador
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            Faltan datos que solo tú puedes aportar (identidad y nómina personal).
          </p>
          <div className="mt-3 rounded-xl border border-blue-100 bg-white/70 px-3 py-2 dark:border-blue-900 dark:bg-gray-900/40">
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
          <button
            type="button"
            onClick={() => navigate('/saas/worker/complete-payroll')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Completar mis datos
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
