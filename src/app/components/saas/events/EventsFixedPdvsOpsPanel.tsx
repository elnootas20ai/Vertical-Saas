/**
 * Plan operativo del evento fijo por pasos:
 * día → horario → productos → ruta → equipo → guardar.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { listUsersRequest } from '../../../lib/authApi';
import {
  createBlankBusinessHoursConfig,
  hasValidBusinessHoursConfig,
  normalizeBusinessHoursConfig,
} from '../../../lib/businessHoursUtils';
import { DAY_PHASE_META } from '../../../lib/eventsDayOps';
import {
  defaultFixedDayRoute,
  findEventsFixedDayPlan,
  seedDayPlanFromLoad,
  upsertEventsFixedDayPlan,
  type EventsFixedDayCrew,
  type EventsFixedDayPlan,
  type EventsFixedDayPlanLine,
  type EventsFixedDayRouteStop,
} from '../../../lib/eventsFixedDayPlan';
import type { BusinessHoursConfig } from '../../../lib/settingsApi';
import { mergeBusinessMembers } from '../../../lib/schedulesDisplay';
import { updateWorkCenter, type WorkCenter } from '../../../lib/workCentersApi';
import { notifyDeliveryWorkCentersChanged } from '../../../lib/deliverySetup';
import { BusinessHoursEditor } from '../settings/BusinessHoursEditor';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
} from '../../../lib/vertialUiTokens';

type Props = {
  workCenter: WorkCenter;
  businessId?: string;
  businessMembers?: { user_id: string; fullName?: string; email?: string; role?: string }[];
  ownerUserId?: string;
  selfUser?: { user_id?: string; fullName?: string; firstName?: string; lastName?: string; email?: string } | null;
  onEditProducts: () => void;
  onSaved: () => void;
};

type StepId = 'dia' | 'horario' | 'productos' | 'ruta' | 'equipo';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'dia', label: 'Día', hint: 'Qué día se hace' },
  { id: 'horario', label: 'Horario', hint: 'Días y horas del PDV' },
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

function initialDateForWc(wc: WorkCenter): string {
  const today = todayYmd();
  const plans = Array.isArray(wc.eventsFixedDayPlans) ? wc.eventsFixedDayPlans : [];
  if (plans.some((p) => p.date === today)) return today;
  if (plans.length > 0) return plans[plans.length - 1].date;
  return today;
}

function hoursFor(wc: WorkCenter): BusinessHoursConfig {
  return hasValidBusinessHoursConfig(wc.openingHours)
    ? normalizeBusinessHoursConfig(wc.openingHours)
    : createBlankBusinessHoursConfig();
}

export function EventsFixedPdvsOpsPanel({
  workCenter,
  businessId,
  businessMembers = [],
  ownerUserId,
  selfUser,
  onEditProducts,
  onSaved,
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [date, setDate] = useState(() => initialDateForWc(workCenter));
  const [hours, setHours] = useState<BusinessHoursConfig>(() => hoursFor(workCenter));
  const [lines, setLines] = useState<EventsFixedDayPlanLine[]>([]);
  const [crew, setCrew] = useState<EventsFixedDayCrew[]>([]);
  const [route, setRoute] = useState<EventsFixedDayRouteStop[]>(() => defaultFixedDayRoute());
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const plans = workCenter.eventsFixedDayPlans;
  const wcId = workCenter._id;
  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  useEffect(() => {
    setHours(hoursFor(workCenter));
  }, [wcId, workCenter._rev, workCenter.openingHours]);

  useEffect(() => {
    const existing = findEventsFixedDayPlan(workCenter.eventsFixedDayPlans, date);
    const seeded = seedDayPlanFromLoad(date, workCenter.eventsTpvLoad, existing);
    setLines(seeded.lines.map((l) => ({ ...l })));
    setCrew(seeded.crew.map((c) => ({ ...c })));
    setRoute(
      (seeded.route?.length ? seeded.route : defaultFixedDayRoute()).map((s) => ({ ...s })),
    );
  }, [date, wcId, workCenter._rev, workCenter.eventsTpvLoad, workCenter.eventsFixedDayPlans]);

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
    if (!date) {
      toast.error('Elige un día');
      return;
    }
    setSaving(true);
    try {
      const plan: EventsFixedDayPlan = {
        date,
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
      };
      const nextPlans = upsertEventsFixedDayPlan(workCenter.eventsFixedDayPlans, plan);
      await updateWorkCenter({
        ...workCenter,
        openingHours: normalizeBusinessHoursConfig(hours),
        eventsFixedDayPlans: nextPlans,
      });
      notifyDeliveryWorkCentersChanged(businessId);
      toast.success('Evento guardado');
      onSaved();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      void save();
      return;
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
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
              Día del evento
            </h3>
          </div>
          <div className="px-3 py-3 space-y-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayYmd())}
              className={inputClass}
            />
            {plannedDates.size > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(plannedDates).sort().map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDate(d)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums border ${
                      d === date
                        ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-[var(--v-blue,#2563eb)]'
                        : 'border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {new Date(`${d}T12:00:00`).toLocaleDateString('es-ES')}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-500">
                Elige el día concreto de este evento. Luego el horario semanal del PDV.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {step.id === 'horario' ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Horario del PDV
            </h3>
          </div>
          <BusinessHoursEditor
            config={hours}
            onChange={setHours}
            storeLabel={workCenter.name || 'Evento fijo'}
            wizard
          />
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
              Carta
            </button>
          </div>
          <div className="px-3 py-3 space-y-2">
            {lines.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-stone-500">
                  No hay productos en la carga de este evento.
                </p>
                <button type="button" onClick={onEditProducts} className={`${VERTIAL_BTN_PRIMARY} mt-3 mx-auto`}>
                  Elegir productos
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
          <button type="button" onClick={goBack} className={VERTIAL_BTN_SECONDARY}>
            <ChevronLeft className="w-4 h-4" />
            Atrás
          </button>
        ) : null}
        <button
          type="button"
          onClick={goNext}
          disabled={saving}
          className={`${VERTIAL_BTN_PRIMARY} ml-auto`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isLast ? 'Guardar' : 'Siguiente'}
          {!isLast && !saving ? <ChevronRight className="w-4 h-4" /> : null}
        </button>
      </div>
    </div>
  );
}
