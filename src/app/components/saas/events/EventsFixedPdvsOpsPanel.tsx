/**
 * Plan operativo del evento fijo por pasos:
 * día → horario → productos → ruta → equipo → guardar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Package,
  Route,
  Users,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { listUsersRequest } from '../../../lib/authApi';
import { DAY_PHASE_META } from '../../../lib/eventsDayOps';
import {
  defaultFixedDayRoute,
  findEventsFixedDayPlan,
  formatEventsFixedDurationEs,
  seedDayPlanFromLoad,
  upsertEventsFixedDayPlan,
  type EventsFixedDayCrew,
  type EventsFixedDayPlan,
  type EventsFixedDayPlanLine,
  type EventsFixedDayRouteStop,
  type EventsFixedOpsDraft,
} from '../../../lib/eventsFixedDayPlan';
import {
  eventsTpvProductId,
  eventsTpvProductName,
  listActiveEventsTpvProducts,
} from '../../../lib/eventsTpvProducts';
import { mergeBusinessMembers } from '../../../lib/schedulesDisplay';
import { updateWorkCenter, type WorkCenter } from '../../../lib/workCentersApi';
import { notifyDeliveryWorkCentersChanged } from '../../../lib/deliverySetup';
import { formatDateEs } from '../../../lib/formatDateEs';
import { ScheduleTimeField } from '../ScheduleTimeField';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
} from '../../../lib/vertialUiTokens';

type Props = {
  workCenter: WorkCenter;
  /** Titular: productos de Servicios → Productos si la carga del día está vacía. */
  dataUserId?: string;
  businessId?: string;
  businessMembers?: { user_id: string; fullName?: string; email?: string; role?: string }[];
  ownerUserId?: string;
  selfUser?: { user_id?: string; fullName?: string; firstName?: string; lastName?: string; email?: string } | null;
  onEditProducts: () => void;
  /** Alta de catálogo (Servicios → Productos). Si no hay productos, el CTA principal va aquí. */
  onManageProductCatalog?: () => void;
  onSaved: () => void;
};

type StepId = 'dia' | 'horario' | 'productos' | 'ruta' | 'equipo';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'dia', label: 'Día', hint: 'Días que se va (calendario)' },
  { id: 'horario', label: 'Horario', hint: 'Día elegido y duración' },
  { id: 'productos', label: 'Productos', hint: 'Qué se lleva y qty' },
  { id: 'ruta', label: 'Ruta', hint: 'Timeline del día' },
  { id: 'equipo', label: 'Equipo', hint: 'Quién trabaja' },
];

const inputClass =
  `w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function initialDateForWc(wc: WorkCenter): string {
  const today = todayYmd();
  const plans = Array.isArray(wc.eventsFixedDayPlans) ? wc.eventsFixedDayPlans : [];
  if (plans.some((p) => p.date === today)) return today;
  if (plans.length > 0) return plans[plans.length - 1].date;
  return today;
}

function initialFromDraft(wc: WorkCenter) {
  const d = wc.eventsFixedOpsDraft;
  if (!d) return null;
  return d;
}

/** Mini mes: marca programados y permite elegir varios días (toggle). */
function FixedDayMonthPicker({
  selectedDates,
  focusDate,
  plannedDates,
  onToggle,
}: {
  selectedDates: Set<string>;
  focusDate: string;
  plannedDates: Set<string>;
  onToggle: (ymd: string) => void;
}) {
  const focus = useMemo(() => {
    try {
      return parseISO(`${focusDate || todayYmd()}T12:00:00`);
    } catch {
      return new Date();
    }
  }, [focusDate]);
  const [cursor, setCursor] = useState(() => startOfMonth(focus));

  useEffect(() => {
    setCursor(startOfMonth(focus));
  }, [focus]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const selectedSorted = useMemo(
    () => Array.from(selectedDates).sort(),
    [selectedDates],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-2 py-1.5`}
          title="Mes anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 capitalize tabular-nums">
          {format(cursor, 'MMMM yyyy', { locale: es })}
        </p>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-2 py-1.5`}
          title="Mes siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekLabels.map((w) => (
          <span key={w} className="text-[10px] font-bold uppercase text-stone-400 py-1">
            {w}
          </span>
        ))}
        {days.map((day) => {
          const ymd = toYmd(day);
          const inMonth = isSameMonth(day, cursor);
          const isSelected = selectedDates.has(ymd);
          const isPlanned = plannedDates.has(ymd);
          const today = isToday(day);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onToggle(ymd)}
              className={`relative aspect-square rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                isSelected
                  ? 'bg-[var(--v-blue,#2563eb)] text-white'
                  : isPlanned
                    ? 'bg-blue-50 text-[var(--v-blue,#2563eb)] border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800'
                    : inMonth
                      ? 'text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800'
                      : 'text-stone-300 dark:text-stone-600'
              } ${today && !isSelected ? 'ring-1 ring-stone-300 dark:ring-stone-600' : ''}`}
              title={
                isSelected
                  ? `Seleccionado · ${formatDateEs(ymd)}`
                  : isPlanned
                    ? `Ya programado · ${formatDateEs(ymd)}`
                    : formatDateEs(ymd)
              }
            >
              {format(day, 'd')}
              {isPlanned && !isSelected ? (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--v-blue,#2563eb)]" />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
        {selectedSorted.length === 0
          ? 'Ningún día seleccionado'
          : selectedSorted.length === 1
            ? `Seleccionado: ${formatDateEs(selectedSorted[0])}`
            : `${selectedSorted.length} días: ${selectedSorted.map((d) => formatDateEs(d)).join(' · ')}`}
      </p>
    </div>
  );
}

export function EventsFixedPdvsOpsPanel({
  workCenter,
  dataUserId,
  businessId,
  businessMembers = [],
  ownerUserId,
  selfUser,
  onEditProducts,
  onManageProductCatalog,
  onSaved,
}: Props) {
  const bootDraft = initialFromDraft(workCenter);
  const [stepIdx, setStepIdx] = useState(() => bootDraft?.stepIdx ?? 0);
  const [date, setDate] = useState(() => bootDraft?.date || initialDateForWc(workCenter));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(
    () => new Set(
      bootDraft?.selectedDates?.length
        ? bootDraft.selectedDates
        : [initialDateForWc(workCenter)],
    ),
  );
  const [startTime, setStartTime] = useState(() => {
    if (bootDraft?.startTime) return bootDraft.startTime;
    const plan = findEventsFixedDayPlan(
      workCenter.eventsFixedDayPlans,
      bootDraft?.date || initialDateForWc(workCenter),
    );
    return plan?.startTime || '';
  });
  const [endTime, setEndTime] = useState(() => {
    if (bootDraft?.endTime) return bootDraft.endTime;
    const plan = findEventsFixedDayPlan(
      workCenter.eventsFixedDayPlans,
      bootDraft?.date || initialDateForWc(workCenter),
    );
    return plan?.endTime || '';
  });
  const [lines, setLines] = useState<EventsFixedDayPlanLine[]>(
    () => (bootDraft?.lines || []).map((l) => ({ ...l })),
  );
  const [crew, setCrew] = useState<EventsFixedDayCrew[]>(
    () => (bootDraft?.crew || []).map((c) => ({ ...c })),
  );
  const [route, setRoute] = useState<EventsFixedDayRouteStop[]>(() =>
    (bootDraft?.route?.length ? bootDraft.route : defaultFixedDayRoute()).map((s) => ({ ...s })),
  );
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [linesLoading, setLinesLoading] = useState(false);
  /** Evita que el seed pise el borrador al montar. */
  const skipSeedOnceRef = useRef(Boolean(bootDraft));

  const plans = workCenter.eventsFixedDayPlans;
  const wcId = workCenter._id;
  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const durationLabel = formatEventsFixedDurationEs(startTime, endTime);
  const selectedSorted = useMemo(
    () => Array.from(selectedDates).filter(Boolean).sort(),
    [selectedDates],
  );

  // Un día: plan guardado → carga TPV → si vacío, Servicios → Productos.
  useEffect(() => {
    if (selectedDates.size !== 1) return;
    if (skipSeedOnceRef.current) {
      skipSeedOnceRef.current = false;
      return;
    }
    let cancelled = false;
    const only = [...selectedDates][0] || date;
    const existing = findEventsFixedDayPlan(workCenter.eventsFixedDayPlans, only);
    const seeded = seedDayPlanFromLoad(only, workCenter.eventsTpvLoad, existing);

    const apply = async () => {
      let nextLines = seeded.lines.map((l) => ({ ...l }));
      if (nextLines.length === 0 && dataUserId) {
        setLinesLoading(true);
        try {
          const items = await listActiveEventsTpvProducts(dataUserId);
          if (cancelled) return;
          nextLines = items
            .map((it) => ({
              catalogItemId: eventsTpvProductId(it),
              name: eventsTpvProductName(it),
              qty: 0,
            }))
            .filter((l) => l.catalogItemId);
        } finally {
          if (!cancelled) setLinesLoading(false);
        }
      }
      if (cancelled) return;
      setLines(nextLines);
      setCrew(seeded.crew.map((c) => ({ ...c })));
      setRoute(
        (seeded.route?.length ? seeded.route : defaultFixedDayRoute()).map((s) => ({ ...s })),
      );
      if (seeded.startTime) setStartTime(seeded.startTime);
      if (seeded.endTime) setEndTime(seeded.endTime);
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [selectedDates, date, dataUserId, wcId, workCenter.eventsTpvLoad, workCenter.eventsFixedDayPlans]);

  const toggleDate = (ymd: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) {
        if (next.size <= 1) {
          setDate(ymd);
          return next;
        }
        next.delete(ymd);
        const remain = [...next].sort();
        setDate(remain[remain.length - 1] || ymd);
        return next;
      }
      next.add(ymd);
      setDate(ymd);
      return next;
    });
  };

  useEffect(() => {
    if (!businessId) {
      const fallback = (businessMembers || [])
        .map((m) => ({
          id: String(m.user_id || '').trim(),
          name: String(m.fullName || m.email || '').trim() || 'Miembro',
        }))
        .filter((m) => m.id);
      setTeam(fallback);
      return;
    }
    let cancelled = false;
    void listUsersRequest(businessId)
      .then((res) => {
        if (cancelled) return;
        const users = Array.isArray(res.users) ? res.users : [];
        const apiMembers = users.map((u) => ({
          user_id: String(u.user_id || u.id || '').trim(),
          fullName: String(u.fullName || `${u.firstName || ''} ${u.lastName || ''}`).trim() || String(u.email || ''),
          email: String(u.email || ''),
          role: String(u.role || 'Usuario'),
        })).filter((u) => u.user_id);
        const members = [...(businessMembers || [])];
        const ownerId = String(ownerUserId || '').trim();
        if (ownerId && !members.some((m) => String(m.user_id || '').trim() === ownerId)) {
          const ownerFromApi = apiMembers.find((m) => m.user_id === ownerId);
          const self = selfUser && String(selfUser.user_id || '').trim() === ownerId ? selfUser : null;
          members.push({
            user_id: ownerId,
            fullName: ownerFromApi?.fullName
              || String(self?.fullName || `${self?.firstName || ''} ${self?.lastName || ''}`).trim()
              || ownerFromApi?.email
              || String(self?.email || '')
              || 'Titular',
            email: ownerFromApi?.email || String(self?.email || ''),
            role: 'Admin',
          });
        }
        const merged = mergeBusinessMembers(members, apiMembers);
        setTeam(merged.map((m) => ({ id: m.user_id, name: m.fullName })));
      })
      .catch(() => {
        if (cancelled) return;
        setTeam(
          (businessMembers || [])
            .map((m) => ({
              id: String(m.user_id || '').trim(),
              name: String(m.fullName || m.email || '').trim() || 'Miembro',
            }))
            .filter((m) => m.id),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, businessMembers, ownerUserId, selfUser]);

  const plannedDates = useMemo(
    () => new Set((plans || []).map((p) => p.date)),
    [plans],
  );

  const setQty = (catalogItemId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.catalogItemId === catalogItemId
          ? { ...l, qty: Math.max(0, Math.floor(qty) || 0) }
          : l,
      ),
    );
  };

  const setRouteTime = (id: string, plannedTime: string) => {
    setRoute((prev) =>
      prev.map((s) => (s.id === id ? { ...s, plannedTime } : s)),
    );
  };

  const toggleCrew = (person: { id: string; name: string }) => {
    setCrew((prev) => {
      if (prev.some((c) => c.id === person.id)) {
        return prev.filter((c) => c.id !== person.id);
      }
      return [...prev, { id: person.id, name: person.name }];
    });
  };

  const save = async () => {
    const days = Array.from(selectedDates).filter(Boolean).sort();
    if (days.length === 0) {
      toast.error('Elige al menos un día');
      return;
    }
    if (!startTime || !endTime) {
      toast.error('Indica inicio y fin del evento');
      return;
    }
    setSaving(true);
    try {
      const base = {
        lines: lines.map((l) => ({
          catalogItemId: l.catalogItemId,
          name: l.name,
          qty: Math.max(0, Math.floor(l.qty) || 0),
        })),
        crew,
        route: route.map((s) => ({
          id: s.id,
          plannedTime: String(s.plannedTime || '').trim().slice(0, 5),
          note: String(s.note || '').trim(),
        })),
        startTime,
        endTime,
      };
      let nextPlans = workCenter.eventsFixedDayPlans;
      for (const d of days) {
        const plan: EventsFixedDayPlan = { date: d, ...base };
        nextPlans = upsertEventsFixedDayPlan(nextPlans, plan);
      }
      await updateWorkCenter({
        ...workCenter,
        eventsFixedDayPlans: nextPlans,
        eventsFixedOpsDraft: null,
      });
      notifyDeliveryWorkCentersChanged(businessId);
      toast.success(
        days.length === 1
          ? 'Día guardado'
          : `${days.length} días guardados`,
      );
      onSaved();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const buildDraft = (overrideStep?: number): EventsFixedOpsDraft => ({
    stepIdx: overrideStep ?? stepIdx,
    date,
    selectedDates: Array.from(selectedDates).filter(Boolean).sort(),
    lines: lines.map((l) => ({
      catalogItemId: l.catalogItemId,
      name: l.name,
      qty: Math.max(0, Math.floor(l.qty) || 0),
    })),
    crew: crew.map((c) => ({ ...c })),
    route: route.map((s) => ({
      id: s.id,
      plannedTime: String(s.plannedTime || '').trim().slice(0, 5),
      note: String(s.note || '').trim(),
    })),
    startTime,
    endTime,
    updatedAt: new Date().toISOString(),
  });

  const saveDraft = async (opts?: { silent?: boolean; stepIdx?: number }) => {
    const days = Array.from(selectedDates).filter(Boolean);
    if (days.length === 0) {
      toast.error('Elige al menos un día');
      return;
    }
    setSaving(true);
    try {
      const draft = buildDraft(opts?.stepIdx);
      await updateWorkCenter({
        ...workCenter,
        eventsFixedOpsDraft: draft,
      });
      notifyDeliveryWorkCentersChanged(businessId);
      if (!opts?.silent) toast.success('Borrador guardado');
      onSaved();
    } catch {
      toast.error('No se pudo guardar el borrador');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      void save();
      return;
    }
    if (step.id === 'horario' && (!startTime || !endTime)) {
      toast.error('Indica inicio y fin del evento');
      return;
    }
    const next = Math.min(stepIdx + 1, STEPS.length - 1);
    setStepIdx(next);
    // Al avanzar queda bloqueado el resto de eventos fijos (secuencia en curso).
    void saveDraft({ silent: true, stepIdx: next });
  };

  const goBack = () => {
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
          {workCenter.name || 'Evento fijo'}
        </p>
        <p className="text-xs text-stone-500 mt-0.5">
          Paso {stepIdx + 1} de {STEPS.length} · {step.hint}
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Pasos">
        {STEPS.map((s, i) => {
          const active = i === stepIdx;
          const done = i < stepIdx;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStepIdx(i)}
              className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                active
                  ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40'
                  : done
                    ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
                    : 'border-stone-200 dark:border-stone-700'
              }`}
            >
              <span className="flex items-center gap-1">
                {done ? (
                  <Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />
                ) : (
                  <span className={`text-[10px] font-bold tabular-nums ${active ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-400'}`}>
                    {i + 1}
                  </span>
                )}
                <span
                  className={`text-[11px] font-bold ${
                    active ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {s.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {step.id === 'dia' ? (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50">
            <CalendarDays className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Días del evento
            </h3>
          </div>
          <div className="px-3 py-3 space-y-3">
            <FixedDayMonthPicker
              selectedDates={selectedDates}
              focusDate={date}
              plannedDates={plannedDates}
              onToggle={toggleDate}
            />
            <p className="text-xs text-stone-500">
              Toca varios días para marcarlos. Al guardar, el mismo plan (productos, ruta y equipo) se aplica a todos los seleccionados.
            </p>
          </div>
        </section>
      ) : null}

      {step.id === 'horario' ? (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50">
            <Clock className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Día y duración del evento
            </h3>
          </div>
          <div className="px-3 py-3 space-y-4">
            {selectedSorted.length === 0 ? (
              <p className="text-sm text-stone-500">
                Elige al menos un día en el paso anterior.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Día{selectedSorted.length === 1 ? '' : 's'} seleccionado{selectedSorted.length === 1 ? '' : 's'}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {selectedSorted.map((d) => (
                      <li
                        key={d}
                        className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm font-semibold text-stone-800 dark:text-stone-100"
                      >
                        {formatDateEs(d)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <ScheduleTimeField label="Inicio" value={startTime} onChange={setStartTime} />
                  <span className="pb-2 text-sm font-semibold text-stone-400" aria-hidden>
                    –
                  </span>
                  <ScheduleTimeField label="Fin" value={endTime} onChange={setEndTime} />
                </div>
                {durationLabel ? (
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Duración: <span className="font-semibold tabular-nums">{durationLabel}</span>
                    {selectedSorted.length > 1 ? ' · mismo horario en todos los días' : ''}
                  </p>
                ) : (
                  <p className="text-xs text-stone-500">
                    Indica a qué hora empieza y termina el evento ese día.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}

      {step.id === 'productos' ? (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-4 h-4 text-stone-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 truncate">
                Productos · cuántos se llevan
              </h3>
            </div>
            <button type="button" onClick={onEditProducts} className={VERTIAL_BTN_SECONDARY}>
              Ajustar carga
            </button>
          </div>
          <div className="px-3 py-3 space-y-2">
            {linesLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando productos…
              </div>
            ) : lines.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-stone-500">
                  No hay productos. Añádelos en Servicios → Productos (bebida, merch, extras…).
                </p>
                <button
                  type="button"
                  onClick={onManageProductCatalog || onEditProducts}
                  className={`${VERTIAL_BTN_PRIMARY} mt-3 mx-auto`}
                >
                  Ir a Servicios → Productos
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.catalogItemId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 dark:border-stone-800 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate min-w-0">
                      {line.name}
                    </span>
                    <label className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-semibold uppercase text-stone-400">Qty</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.qty}
                        onChange={(e) => setQty(line.catalogItemId, Number(e.target.value))}
                        className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm tabular-nums text-right dark:border-stone-700 dark:bg-stone-900"
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {step.id === 'ruta' ? (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50">
            <Route className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Ruta del día
            </h3>
          </div>
          <ol className="px-3 py-3 space-y-2">
            {route.map((stop, idx) => {
              const meta = DAY_PHASE_META.find((m) => m.id === stop.id);
              return (
                <li
                  key={stop.id}
                  className="flex items-center gap-2 rounded-xl border border-stone-100 dark:border-stone-800 px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-xs font-bold tabular-nums text-stone-500 dark:border-stone-700 dark:bg-stone-900">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {meta?.label || stop.id}
                    </p>
                    <p className="text-[11px] text-stone-500">{meta?.hint}</p>
                  </div>
                  <input
                    type="time"
                    value={stop.plannedTime}
                    onChange={(e) => setRouteTime(stop.id, e.target.value)}
                    className="w-[7.5rem] rounded-xl border border-stone-200 bg-white px-2 py-2 text-sm tabular-nums dark:border-stone-700 dark:bg-stone-900"
                    aria-label={`Hora ${meta?.label || stop.id}`}
                  />
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {step.id === 'equipo' ? (
        <section className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50">
            <Users className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Quién trabaja ahí
            </h3>
            <span className="ml-auto text-[11px] font-semibold text-stone-400 tabular-nums">
              {crew.length}
            </span>
          </div>
          <div className="px-3 py-3 space-y-2">
            {team.length === 0 ? (
              <p className="text-sm text-stone-500">
                Aún no hay equipo en Vertial. Invita trabajadores desde Equipo.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {team.map((person) => {
                  const selected = crew.some((c) => c.id === person.id);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => toggleCrew(person)}
                        aria-pressed={selected}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/30'
                            : 'border-stone-200 dark:border-stone-700 hover:border-blue-300'
                        }`}
                      >
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                          {person.name}
                        </span>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            selected ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-400'
                          }`}
                        >
                          {selected ? 'Va' : 'Añadir'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {!isFirst ? (
          <button type="button" onClick={goBack} className={VERTIAL_BTN_SECONDARY} disabled={saving}>
            <ChevronLeft className="w-4 h-4" />
            Atrás
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={saving}
          className={VERTIAL_BTN_SECONDARY}
        >
          Guardar en borrador
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={saving}
          className={`${VERTIAL_BTN_PRIMARY} ml-auto`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isLast
            ? (saving
              ? 'Guardando…'
              : selectedDates.size > 1
                ? `Guardar ${selectedDates.size} días`
                : 'Guardar')
            : 'Siguiente'}
          {!isLast && !saving ? <ChevronRight className="w-4 h-4" /> : null}
        </button>
      </div>
    </div>
  );
}
