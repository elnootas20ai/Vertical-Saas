import { EVENT_CONTRACT_STAGES, EVENT_STAGE_CONFIG, type EventContractStage } from '../../../lib/eventsTypes';

export function EventContractStepper({
  current,
  compact = false,
}: {
  current: EventContractStage;
  compact?: boolean;
}) {
  const steps = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado');
  const currentOrder = steps.find((s) => s.id === current)?.order ?? 0;

  return (
    <ol className={`flex flex-wrap gap-2 ${compact ? '' : 'sm:gap-0 sm:flex-nowrap'}`}>
      {steps.map((step, index) => {
        const done = step.order < currentOrder;
        const active = step.id === current;
        const cfg = EVENT_STAGE_CONFIG[step.id];
        return (
          <li
            key={step.id}
            className={`flex items-center gap-2 ${compact ? '' : 'sm:flex-1 sm:min-w-0'}`}
          >
            <div
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 sm:px-3 ${
                active
                  ? 'border-cyan-600 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-950/40'
                  : done
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? 'bg-cyan-600 text-white'
                    : done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <div className="min-w-0 hidden sm:block">
                <p className={`text-xs font-semibold truncate ${active ? cfg.text : 'text-gray-700 dark:text-gray-300'}`}>
                  {step.label}
                </p>
                {!compact && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{step.hint}</p>
                )}
              </div>
            </div>
            {index < steps.length - 1 && !compact && (
              <div className="hidden sm:block h-px flex-1 min-w-[8px] bg-gray-200 dark:bg-gray-700 mx-1" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function EventStageBadge({ stage }: { stage: EventContractStage }) {
  const cfg = EVENT_STAGE_CONFIG[stage] || EVENT_STAGE_CONFIG.presupuesto;
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
