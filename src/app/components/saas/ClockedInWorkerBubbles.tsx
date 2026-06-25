import { CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import {
  getWorkerInitials,
  type TpvClockedInWorker,
} from '../../lib/tpvClockedInWorkers';
import { normalizeClockinUserId } from '../../lib/clockinUserId';

interface ClockedInWorkerBubblesProps {
  workers: TpvClockedInWorker[];
  selectedId?: string | null;
  onSelect?: (workerId: string) => void;
  loading?: boolean;
  compact?: boolean;
  ultraCompact?: boolean;
  label?: string;
}

export function ClockedInWorkerBubbles({
  workers,
  selectedId,
  onSelect,
  loading = false,
  compact = false,
  ultraCompact = false,
  label = 'En tienda',
}: ClockedInWorkerBubblesProps) {
  const selectable = Boolean(onSelect);

  if (workers.length === 0) {
    return null;
  }

  return (
    <div className={`${compact ? 'min-w-0' : 'space-y-1.5'} ${loading ? 'opacity-80' : ''}`}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-h-[1.125rem]">
          <UserCheck className="w-3.5 h-3.5" />
          {label}
          {loading && workers.length > 0 && (
            <Loader2 className="w-3 h-3 animate-spin opacity-60" aria-hidden />
          )}
        </div>
      )}
      <div className={`flex items-center flex-wrap min-h-[2rem] ${ultraCompact ? 'gap-0.5' : 'gap-1.5'}`}>
        {workers.map((worker) => {
          const isSelected = normalizeClockinUserId(selectedId) === worker.id;
          const onBreak = worker.status === 'break';
          const initials = getWorkerInitials(worker.name);
          const firstName = worker.name.split(' ')[0] || worker.name;

          const bubble = (
            <>
              <span
                className={`rounded-full flex items-center justify-center font-bold shrink-0 ${
                  ultraCompact ? 'w-6 h-6 text-[9px]' : compact ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-[11px]'
                } ${
                  isSelected
                    ? 'bg-emerald-600 text-white'
                    : onBreak
                      ? 'bg-amber-500 text-white'
                      : 'bg-violet-600 text-white'
                }`}
                title={worker.name}
              >
                {initials}
              </span>
              {!compact && (
                <span className="truncate max-w-[72px]">{firstName}</span>
              )}
              {isSelected && !compact && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
            </>
          );

          if (!selectable) {
            return (
              <div
                key={worker.id}
                title={`${worker.name}${onBreak ? ' (descanso)' : ''}`}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                  onBreak
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-800'
                }`}
              >
                {bubble}
              </div>
            );
          }

          return (
            <button
              key={worker.id}
              type="button"
              onClick={() => onSelect?.(worker.id)}
              title={`${worker.name}${onBreak ? ' (descanso)' : ''}`}
              className={`flex items-center gap-1.5 rounded-full text-xs font-medium transition-all ${
                compact ? 'p-0.5' : 'px-2.5 py-1.5'
              } ${
                isSelected
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-gray-900'
                  : onBreak
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {bubble}
            </button>
          );
        })}
      </div>
    </div>
  );
}
