import { Check } from 'lucide-react';
import { formatDateTimeEs } from '../../../lib/formatDateEs';
import { dwellMsInStage, formatDurationEs } from '../../../lib/eventsStageTiming';
import {
  EVENT_CONTRACT_STAGES,
  EVENT_STAGE_CONFIG,
  furthestReachedStage,
  stageOrder,
  type EventContractStage,
  type EventRecord,
} from '../../../lib/eventsTypes';

const FLOW_STEPS = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado');

function timestampForStage(event: EventRecord | undefined, stage: EventContractStage): string {
  if (!event) return '';
  if (stage === 'presupuesto') return String(event.createdAt || '');
  if (stage === 'enviado') return String(event.quoteSentAt || event.quotePdfSentAt || '');
  if (stage === 'aceptado') return String(event.acceptedAt || '');
  if (stage === 'contratado') return String(event.contractedAt || event.depositPaidAt || '');
  if (stage === 'planificacion') return String(event.planificacionAt || '');
  if (stage === 'en_curso') return String(event.enCursoAt || '');
  if (stage === 'finalizado') return String(event.finishedAt || '');
  return '';
}

export function EventContractStepper({
  current,
  compact = false,
  event,
  onSelectStep,
}: {
  current: EventContractStage;
  compact?: boolean;
  event?: EventRecord;
  onSelectStep?: (stage: EventContractStage) => void;
}) {
  if (current === 'cancelado') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">Cancelado</p>
        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">Este evento no se realizará.</p>
      </div>
    );
  }

  const currentIndex = Math.max(0, FLOW_STEPS.findIndex((s) => s.id === current));
  const furthest = event ? furthestReachedStage(event) : current;
  const furthestIndex = Math.max(
    currentIndex,
    FLOW_STEPS.findIndex((s) => s.id === furthest),
  );
  const currentMeta = FLOW_STEPS[currentIndex] || FLOW_STEPS[0];
  const progressPct = FLOW_STEPS.length <= 1
    ? 100
    : (furthestIndex / (FLOW_STEPS.length - 1)) * 100;
  const currentWhen = timestampForStage(event, current);
  const historySteps = FLOW_STEPS.filter((_, index) => index <= furthestIndex);
  const dwellByStage = event
    ? Object.fromEntries(
        FLOW_STEPS.map((step) => {
          const ms = dwellMsInStage(event, step.id);
          return [step.id, ms == null ? '—' : formatDurationEs(ms)] as const;
        }),
      )
    : null;

  return (
    <div
      className={`rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950 ${
        compact ? 'px-3 py-3' : 'px-4 py-4 sm:px-5'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3 sm:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {currentMeta.label}
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              {currentMeta.hint}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {currentIndex + 1}/{FLOW_STEPS.length}
        </span>
      </div>

      <div className="relative px-1 pt-1">
        <div
          className="pointer-events-none absolute left-[1.125rem] right-[1.125rem] top-[1.125rem] h-0.5 -translate-y-1/2 rounded-full bg-stone-200 dark:bg-stone-700"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-[#2563EB] transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <ol className="relative z-[1] flex w-full items-start justify-between">
          {FLOW_STEPS.map((step, index) => {
            const reached = index <= furthestIndex;
            const done = reached && index !== currentIndex;
            const active = index === currentIndex;
            const nextStep = index === currentIndex + 1;
            const canSelect = Boolean(onSelectStep && (done || nextStep));
            const goingForward = stageOrder(step.id) > stageOrder(current);
            return (
              <li
                key={step.id}
                className="flex w-8 flex-col items-center sm:w-auto sm:max-w-[5.5rem] sm:flex-1"
              >
                <button
                  type="button"
                  disabled={!canSelect}
                  onClick={() => {
                    if (canSelect) onSelectStep?.(step.id);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white dark:ring-stone-950 ${
                    active
                      ? 'bg-[#2563EB] text-white'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-300'
                  } ${canSelect ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                  aria-current={active ? 'step' : undefined}
                  aria-label={
                    nextStep
                      ? `Pasar a ${step.label}`
                      : done
                        ? goingForward
                          ? `Continuar a ${step.label}`
                          : `Volver a ${step.label}`
                        : step.label
                  }
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : index + 1}
                </button>
                <span
                  className={`mt-2 hidden text-center text-[11px] font-medium leading-tight sm:block ${
                    active
                      ? 'text-stone-900 dark:text-stone-100'
                      : done
                        ? 'text-stone-600 dark:text-stone-300'
                        : 'text-stone-400 dark:text-stone-500'
                  }`}
                >
                  {step.label}
                </span>
                {dwellByStage ? (
                  <span
                    className={`mt-0.5 text-[10px] font-semibold ${
                      active ? 'text-[#2563EB]' : 'text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {dwellByStage[step.id]}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {!compact && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            <span className="font-semibold text-stone-700 dark:text-stone-200">{currentMeta.label}</span>
            {' · '}
            {currentMeta.hint}
            {currentWhen ? ` · ${formatDateTimeEs(currentWhen)}` : null}
          </p>

          {historySteps.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Historial · pulsa un paso para ir
              </p>
              <ul className="space-y-1.5">
                {historySteps.map((step) => {
                  const when = timestampForStage(event, step.id);
                  const isCurrent = step.id === current;
                  const goingForward = stageOrder(step.id) > stageOrder(current);
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        disabled={isCurrent || !onSelectStep}
                        onClick={() => {
                          if (!isCurrent) onSelectStep?.(step.id);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left text-sm ${
                          isCurrent
                            ? 'bg-stone-50 dark:bg-stone-900'
                            : 'hover:bg-stone-50 dark:hover:bg-stone-900'
                        } ${isCurrent || !onSelectStep ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <span className="inline-flex items-center gap-2 text-stone-700 dark:text-stone-200">
                          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                          {step.label}
                          {isCurrent ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">
                              Ahora
                            </span>
                          ) : goingForward ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                              Hecho
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[11px] text-stone-400">
                          {when ? formatDateTimeEs(when) : 'Hecho'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
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

/**
 * Indicador compacto para listados (Centro de eventos): paso actual + progreso del flujo.
 */
export function EventHubStageProgress({
  stage,
  rejected = false,
}: {
  stage: EventContractStage;
  rejected?: boolean;
}) {
  if (rejected) {
    return (
      <div className="shrink-0 min-w-[7.5rem] text-right sm:text-left">
        <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          Rechazado
        </span>
      </div>
    );
  }

  if (stage === 'cancelado') {
    return (
      <div className="shrink-0 min-w-[7.5rem]">
        <EventStageBadge stage="cancelado" />
      </div>
    );
  }

  const idx = Math.max(0, FLOW_STEPS.findIndex((s) => s.id === stage));
  const cfg = EVENT_STAGE_CONFIG[stage] || EVENT_STAGE_CONFIG.presupuesto;
  const stepLabel = FLOW_STEPS[idx]?.label || cfg.label;

  return (
    <div
      className="shrink-0 w-[8.5rem] sm:w-44"
      title={`Paso ${idx + 1} de ${FLOW_STEPS.length}: ${stepLabel}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
          {stepLabel}
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
          {idx + 1}/{FLOW_STEPS.length}
        </span>
      </div>
      <div className="flex gap-0.5" aria-hidden>
        {FLOW_STEPS.map((step, i) => (
          <span
            key={step.id}
            className={`h-1 flex-1 rounded-full ${
              i < idx
                ? 'bg-emerald-500'
                : i === idx
                  ? 'bg-[#2563EB]'
                  : 'bg-stone-200 dark:bg-stone-700'
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-stone-400 dark:text-stone-500 truncate hidden sm:block">
        {FLOW_STEPS[idx]?.hint || ''}
      </p>
    </div>
  );
}

