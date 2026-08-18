import {
  EVENT_CONTRACT_STAGES,
  stageOrder,
  type EventContractStage,
  type EventRecord,
} from './eventsTypes';

export const EVENT_FLOW_STEPS = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado');

export function timestampForEventStage(
  event: Pick<
    EventRecord,
    | 'createdAt'
    | 'quoteSentAt'
    | 'quotePdfSentAt'
    | 'acceptedAt'
    | 'contractedAt'
    | 'depositPaidAt'
    | 'planificacionAt'
    | 'enCursoAt'
    | 'finishedAt'
  >,
  stage: EventContractStage,
): string {
  if (stage === 'presupuesto') return String(event.createdAt || '');
  if (stage === 'enviado') return String(event.quoteSentAt || event.quotePdfSentAt || '');
  if (stage === 'aceptado') return String(event.acceptedAt || '');
  if (stage === 'contratado') return String(event.contractedAt || event.depositPaidAt || '');
  if (stage === 'planificacion') return String(event.planificacionAt || '');
  if (stage === 'en_curso') return String(event.enCursoAt || '');
  if (stage === 'finalizado') return String(event.finishedAt || '');
  return '';
}

export function formatDurationEs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

/** Tiempo en un paso: hasta el siguiente con fecha, o hasta ahora si es el actual. */
export function dwellMsInStage(
  event: EventRecord,
  stage: EventContractStage,
  nowMs = Date.now(),
): number | null {
  const startRaw = timestampForEventStage(event, stage);
  const start = startRaw ? Date.parse(startRaw) : NaN;
  if (!Number.isFinite(start)) {
    if (event.estado === stage && event.updatedAt) {
      const fallback = Date.parse(String(event.updatedAt));
      if (Number.isFinite(fallback)) return Math.max(0, nowMs - fallback);
    }
    return null;
  }
  const fromOrder = stageOrder(stage);
  const nextWithTime = EVENT_FLOW_STEPS.find((s) => {
    if (stageOrder(s.id) <= fromOrder) return false;
    return Boolean(timestampForEventStage(event, s.id));
  });
  if (nextWithTime) {
    const end = Date.parse(timestampForEventStage(event, nextWithTime.id));
    if (Number.isFinite(end) && end >= start) return end - start;
  }
  if (stageOrder(event.estado) >= fromOrder && event.estado !== 'cancelado') {
    return Math.max(0, nowMs - start);
  }
  return null;
}

export function currentStageDwellLabel(event: EventRecord, nowMs = Date.now()): string {
  if (event.estado === 'cancelado') return 'Cancelado';
  const ms = dwellMsInStage(event, event.estado, nowMs);
  if (ms == null) return 'Sin tiempo';
  return formatDurationEs(ms);
}

export type EventMoney = {
  budget: number;
  collected: number;
  pending: number;
};

export function eventMoney(event: Pick<EventRecord, 'presupuesto' | 'depositPaidAmount' | 'finalPaidAmount'>): EventMoney {
  const budget = Number(event.presupuesto) || 0;
  const collected = (Number(event.depositPaidAmount) || 0) + (Number(event.finalPaidAmount) || 0);
  return {
    budget,
    collected,
    pending: Math.max(0, budget - collected),
  };
}

export type EventStageMetric = {
  id: (typeof EVENT_FLOW_STEPS)[number]['id'];
  label: string;
  count: number;
  avgDwellMs: number | null;
  budget: number;
  collected: number;
};

function avgMs(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((s, n) => s + n, 0) / values.length);
}

/** Métricas por paso: cuántos hay ahora, cuánto tardan y cuánto generan. */
export function buildEventStageMetrics(events: EventRecord[], nowMs = Date.now()): EventStageMetric[] {
  const usable = events.filter((e) => e.estado !== 'cancelado');
  return EVENT_FLOW_STEPS.map((step) => {
    const current = usable.filter((e) => e.estado === step.id);
    const dwells = usable
      .map((e) => dwellMsInStage(e, step.id, nowMs))
      .filter((n): n is number => n != null);
    return {
      id: step.id,
      label: step.label,
      count: current.length,
      avgDwellMs: avgMs(dwells),
      budget: current.reduce((s, e) => s + eventMoney(e).budget, 0),
      collected: current.reduce((s, e) => s + eventMoney(e).collected, 0),
    };
  });
}

export function inCourseSnapshot(events: EventRecord[], nowMs = Date.now()) {
  const live = events.filter((e) => e.estado === 'en_curso');
  const dwells = live
    .map((e) => dwellMsInStage(e, 'en_curso', nowMs))
    .filter((n): n is number => n != null);
  const money = live.reduce(
    (acc, e) => {
      const m = eventMoney(e);
      acc.budget += m.budget;
      acc.collected += m.collected;
      acc.pending += m.pending;
      return acc;
    },
    { budget: 0, collected: 0, pending: 0 },
  );
  return {
    count: live.length,
    avgDwellMs: avgMs(dwells),
    ...money,
  };
}

const PIPELINE_STAGES = new Set(['contratado', 'planificacion', 'en_curso']);

export function pipelineSnapshot(events: EventRecord[]) {
  const live = events.filter((e) => PIPELINE_STAGES.has(e.estado));
  return live.reduce(
    (acc, e) => {
      const m = eventMoney(e);
      acc.count += 1;
      acc.budget += m.budget;
      acc.collected += m.collected;
      acc.pending += m.pending;
      return acc;
    },
    { count: 0, budget: 0, collected: 0, pending: 0 },
  );
}
