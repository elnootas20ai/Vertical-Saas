/**
 * Plan por día de un evento fijo: productos, equipo, ruta (fases/horarios).
 * Persistido en WorkCenter.eventsFixedDayPlans.
 */
import { normalizeEventsPdvLoad, type EventsPdvLoadLine } from './eventsPdvLoad';
import {
  DAY_PHASE_META,
  defaultDayPhases,
  type DayPhase,
  type DayPhaseId,
} from './eventsDayOps';

export type EventsFixedDayPlanLine = {
  catalogItemId: string;
  name: string;
  qty: number;
};

export type EventsFixedDayCrew = {
  id: string;
  name: string;
};

export type EventsFixedDayRouteStop = {
  id: DayPhaseId;
  plannedTime: string;
  note: string;
};

export type EventsFixedDayPlan = {
  /** YYYY-MM-DD */
  date: string;
  lines: EventsFixedDayPlanLine[];
  crew: EventsFixedDayCrew[];
  /** Ruta del día (timeline operativo). */
  route: EventsFixedDayRouteStop[];
  /** HH:mm inicio del evento ese día */
  startTime: string;
  /** HH:mm fin del evento ese día */
  endTime: string;
};

function normalizeDate(raw: unknown): string {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return s;
}

function normalizeHm(raw: unknown): string {
  const s = String(raw || '').trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s)) return '';
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));
  if (!Number.isFinite(h) || h < 0 || h > 23) return '';
  if (!Number.isFinite(m) || m < 0 || m > 59) return '';
  return s;
}

function normalizeRoute(raw: unknown): EventsFixedDayRouteStop[] {
  const byId = new Map<DayPhaseId, EventsFixedDayRouteStop>();
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || '').trim() as DayPhaseId;
    if (!DAY_PHASE_META.some((m) => m.id === id)) continue;
    byId.set(id, {
      id,
      plannedTime: String(r.plannedTime || '').trim().slice(0, 5),
      note: String(r.note || '').trim(),
    });
  }
  return DAY_PHASE_META.map((m) => byId.get(m.id) || {
    id: m.id,
    plannedTime: '',
    note: '',
  });
}

export function defaultFixedDayRoute(): EventsFixedDayRouteStop[] {
  return defaultDayPhases().map((p: DayPhase) => ({
    id: p.id,
    plannedTime: p.plannedTime,
    note: p.note || '',
  }));
}

export function normalizeEventsFixedDayPlan(raw: unknown): EventsFixedDayPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const date = normalizeDate(r.date);
  if (!date) return null;
  const linesRaw = Array.isArray(r.lines) ? r.lines : [];
  const lines: EventsFixedDayPlanLine[] = [];
  const seen = new Set<string>();
  for (const row of linesRaw) {
    if (!row || typeof row !== 'object') continue;
    const x = row as Record<string, unknown>;
    const catalogItemId = String(x.catalogItemId || x.id || '').trim();
    if (!catalogItemId || seen.has(catalogItemId)) continue;
    seen.add(catalogItemId);
    lines.push({
      catalogItemId,
      name: String(x.name || catalogItemId).trim() || catalogItemId,
      qty: Math.max(0, Math.floor(Number(x.qty) || 0)),
    });
  }
  const crewRaw = Array.isArray(r.crew) ? r.crew : [];
  const crew: EventsFixedDayCrew[] = [];
  const seenCrew = new Set<string>();
  for (const row of crewRaw) {
    if (!row || typeof row !== 'object') continue;
    const x = row as Record<string, unknown>;
    const id = String(x.id || x.user_id || '').trim();
    const name = String(x.name || x.fullName || '').trim();
    if (!id || !name || seenCrew.has(id)) continue;
    seenCrew.add(id);
    crew.push({ id, name });
  }
  const route = normalizeRoute(r.route ?? r.phases);
  return {
    date,
    lines,
    crew,
    route,
    startTime: normalizeHm(r.startTime ?? r.horaInicio),
    endTime: normalizeHm(r.endTime ?? r.horaFin),
  };
}

export function normalizeEventsFixedDayPlans(raw: unknown): EventsFixedDayPlan[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, EventsFixedDayPlan>();
  for (const row of raw) {
    const plan = normalizeEventsFixedDayPlan(row);
    if (!plan) continue;
    byDate.set(plan.date, plan);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function findEventsFixedDayPlan(
  plans: EventsFixedDayPlan[] | null | undefined,
  date: string,
): EventsFixedDayPlan | null {
  const d = normalizeDate(date);
  if (!d) return null;
  return (plans || []).find((p) => p.date === d) || null;
}

/** Si no hay plan del día, parte de la carga TPV del PDV. */
export function seedDayPlanFromLoad(
  date: string,
  load: EventsPdvLoadLine[] | null | undefined,
  existing?: EventsFixedDayPlan | null,
): EventsFixedDayPlan {
  const d = normalizeDate(date) || new Date().toISOString().slice(0, 10);
  if (existing && existing.date === d) {
    return {
      date: d,
      lines: existing.lines.map((l) => ({ ...l })),
      crew: existing.crew.map((c) => ({ ...c })),
      route: (existing.route?.length ? existing.route : defaultFixedDayRoute()).map((s) => ({ ...s })),
      startTime: existing.startTime || '',
      endTime: existing.endTime || '',
    };
  }
  const base = normalizeEventsPdvLoad(load);
  return {
    date: d,
    lines: base.map((l) => ({
      catalogItemId: l.catalogItemId,
      name: l.name,
      qty: l.qty,
    })),
    crew: [],
    route: defaultFixedDayRoute(),
    startTime: '',
    endTime: '',
  };
}

export function upsertEventsFixedDayPlan(
  plans: EventsFixedDayPlan[] | null | undefined,
  next: EventsFixedDayPlan,
): EventsFixedDayPlan[] {
  const normalized = normalizeEventsFixedDayPlan(next);
  if (!normalized) return normalizeEventsFixedDayPlans(plans);
  const rest = normalizeEventsFixedDayPlans(plans).filter((p) => p.date !== normalized.date);
  return [...rest, normalized].sort((a, b) => a.date.localeCompare(b.date));
}

/** Borrador de la secuencia ops (día→…→equipo) de un evento fijo. */
export type EventsFixedOpsDraft = {
  stepIdx: number;
  date: string;
  selectedDates: string[];
  lines: EventsFixedDayPlanLine[];
  crew: EventsFixedDayCrew[];
  route: EventsFixedDayRouteStop[];
  startTime: string;
  endTime: string;
  updatedAt: string;
};

export function normalizeEventsFixedOpsDraft(raw: unknown): EventsFixedOpsDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const date = normalizeDate(r.date);
  const selectedRaw = Array.isArray(r.selectedDates) ? r.selectedDates : [];
  const selectedDates = Array.from(
    new Set(
      selectedRaw
        .map((d) => normalizeDate(d))
        .filter(Boolean),
    ),
  ).sort();
  if (selectedDates.length === 0 && date) selectedDates.push(date);
  if (selectedDates.length === 0) return null;
  const focus = date && selectedDates.includes(date) ? date : selectedDates[selectedDates.length - 1];
  const planSlice = normalizeEventsFixedDayPlan({
    date: focus,
    lines: r.lines,
    crew: r.crew,
    route: r.route,
    startTime: r.startTime,
    endTime: r.endTime,
  });
  const stepIdx = Math.max(0, Math.min(4, Math.floor(Number(r.stepIdx) || 0)));
  return {
    stepIdx,
    date: focus,
    selectedDates,
    lines: planSlice?.lines || [],
    crew: planSlice?.crew || [],
    route: planSlice?.route?.length ? planSlice.route : defaultFixedDayRoute(),
    startTime: planSlice?.startTime || normalizeHm(r.startTime),
    endTime: planSlice?.endTime || normalizeHm(r.endTime),
    updatedAt: String(r.updatedAt || '').trim() || new Date().toISOString(),
  };
}

/** Minutos entre inicio y fin (si fin ≤ inicio, asume cruza medianoche). */
export function eventsFixedDurationMinutes(startTime: string, endTime: string): number | null {
  const a = normalizeHm(startTime);
  const b = normalizeHm(endTime);
  if (!a || !b) return null;
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  let diff = toMin(b) - toMin(a);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

export function formatEventsFixedDurationEs(startTime: string, endTime: string): string {
  const mins = eventsFixedDurationMinutes(startTime, endTime);
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

/** Hay secuencia a medias en este PDV (bloquea abrir otro evento fijo). */
export function hasEventsFixedOpsDraft(wc: { eventsFixedOpsDraft?: EventsFixedOpsDraft | null } | null | undefined): boolean {
  return Boolean(wc?.eventsFixedOpsDraft);
}
