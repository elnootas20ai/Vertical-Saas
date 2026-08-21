import {
  EVENT_FLOW_STEPS,
  buildEventStageMetrics,
  currentStageDwellLabel,
  dwellMsInStage,
  eventMoney,
  formatDurationEs,
} from '../../../lib/eventsStageTiming';
import { EVENT_STAGE_CONFIG, type EventRecord } from '../../../lib/eventsTypes';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';

export function EventsStageMetrics({
  events = [],
  event,
}: {
  events?: EventRecord[];
  event?: EventRecord;
}) {
  const now = Date.now();
  const singleMoney = event ? eventMoney(event) : null;
  const metrics = event
    ? EVENT_FLOW_STEPS.map((step) => ({
        id: step.id,
        label: step.label,
        count: event.estado === step.id ? 1 : 0,
        avgDwellMs: dwellMsInStage(event, step.id, now),
        budget: 0,
        collected: 0,
      }))
    : buildEventStageMetrics(events, now);

  return (
    <div className={`${VERTIAL_SURFACE} px-4 py-4 sm:px-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {event ? 'Tiempo en cada paso' : 'Tiempo por paso'}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {event
              ? 'Cuánto ha tardado esta contratación en cada punto'
              : 'Cuántos eventos hay en cada fase y cuánto tardan de media'}
          </p>
        </div>
        {singleMoney ? (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            <span className="font-semibold text-stone-900 dark:text-stone-100">{formatMoneyEs(singleMoney.budget)}</span>
            {' · '}cobrado {formatMoneyEs(singleMoney.collected)}
            {' · '}pendiente {formatMoneyEs(singleMoney.pending)}
          </p>
        ) : null}
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {metrics.map((step, index) => {
          const current = event ? event.estado === step.id : step.count > 0;
          const timeLabel = step.avgDwellMs == null ? '—' : formatDurationEs(step.avgDwellMs);
          return (
            <li
              key={step.id}
              className={`rounded-xl border px-3 py-3 ${
                current
                  ? 'border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/30'
                  : 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/50'
              }`}
            >
              <p className={`text-[11px] font-semibold ${current ? 'text-[#2563EB]' : 'text-stone-500'}`}>
                {index + 1}. {step.label}
              </p>
              {!event && (
                <p className="mt-2 text-lg font-bold text-stone-900 dark:text-stone-100">
                  {formatNumberEs(step.count, { maxFraction: 0 })}
                  <span className="ml-1 text-xs font-medium text-stone-400">ev.</span>
                </p>
              )}
              <p className={`${event ? 'mt-2' : 'mt-1'} text-sm font-semibold text-stone-800 dark:text-stone-100`}>
                {timeLabel}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function EventsStageDots({ event }: { event: EventRecord }) {
  const currentIndex = Math.max(0, EVENT_FLOW_STEPS.findIndex((s) => s.id === event.estado));
  const dwell = currentStageDwellLabel(event);
  const money = eventMoney(event);
  const cfg = EVENT_STAGE_CONFIG[event.estado] || EVENT_STAGE_CONFIG.presupuesto;

  if (event.estado === 'cancelado') {
    return <span className="text-xs font-semibold text-rose-600">Cancelado</span>;
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
      <ol className="flex items-center gap-1" aria-label={`Paso ${currentIndex + 1} de 7`}>
        {EVENT_FLOW_STEPS.map((step, index) => {
          const active = index === currentIndex;
          const done = index < currentIndex;
          return (
            <li key={step.id}>
              <span
                className={`block h-2 w-2 rounded-full ${
                  active
                    ? 'bg-[#2563EB]'
                    : done
                      ? 'bg-emerald-500'
                      : 'bg-stone-200 dark:bg-stone-700'
                }`}
                title={step.label}
              />
            </li>
          );
        })}
      </ol>
      <span className={`text-[11px] font-semibold ${cfg.text}`}>
        {dwell} · {formatMoneyEs(money.budget)}
      </span>
    </div>
  );
}
