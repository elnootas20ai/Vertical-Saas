import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { EventsStageDots, EventsStageMetrics } from '../../../components/saas/events/EventsStagePulse';
import { EventStageBadge } from '../../../components/saas/events/EventContractStepper';
import { formatEventPaymentBreakdown } from '../../../components/saas/events/EventsStagePaymentCard';
import { loadEvents, resolveEventsUserId } from '../../../lib/eventsFlow';
import { summarizeEventFinancials } from '../../../lib/eventsFinance';
import {
  eventMoney,
  formatDurationEs,
  inCourseSnapshot,
  pipelineSnapshot,
  currentStageDwellLabel,
} from '../../../lib/eventsStageTiming';
import {
  buildEventsDashboardActivity,
  isActivityToday,
  type DashboardActivityEntry,
  type EventActivityTone,
} from '../../../lib/eventsActivityRegistry';
import { formatDateEs, formatDateTimeEs } from '../../../lib/formatDateEs';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { listNotificationsRequest, type NotificationRecord } from '../../../lib/notificationApi';
import {
  EVENT_CONTRACT_STAGES,
  type EventContractStage,
  type EventRecord,
} from '../../../lib/eventsTypes';
import { VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';
import {
  CalendarDays,
  Briefcase,
  Clock,
  Wallet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  CircleDot,
  Send,
  MapPin,
  Euro,
  PartyPopper,
  ArrowRight,
} from 'lucide-react';

type EventsDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  hint: string;
  iconWrap: string;
  iconColor: string;
  onClick?: () => void;
};

const EVENTS_NOTIF_CATS = new Set([
  'events',
  'events_quote_accepted',
  'events_fully_paid',
  'events_cash_pending_close',
  'events_cash_discrepancy',
  'events_register_closed_ok',
  'merma_registered',
]);

const PIPELINE_STAGES = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado');

function toneFromNotif(n: NotificationRecord): EventActivityTone {
  const level = String(n.level || '');
  if (level === 'success') return 'success';
  if (level === 'warning' || level === 'alert') return 'warning';
  if (level === 'info') return 'info';
  return 'neutral';
}

function activityIcon(tone: EventActivityTone) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'warning') return AlertTriangle;
  if (tone === 'info') return Info;
  return CircleDot;
}

function activityIconClass(tone: EventActivityTone): string {
  if (tone === 'success') return 'text-emerald-600 dark:text-emerald-400';
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (tone === 'info') return 'text-[#2563EB]';
  return 'text-stone-400';
}

function parseEventDay(fecha: string): number | null {
  const raw = String(fecha || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d).setHours(0, 0, 0, 0);
  }
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const dt = new Date(t);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).setHours(0, 0, 0, 0);
}

function EventRow({
  event,
  onOpen,
}: {
  event: EventRecord;
  onOpen: () => void;
}) {
  const money = eventMoney(event);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-900/60"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">{event.nombre}</p>
        <p className="text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{event.cliente || '—'}</span>
          {event.fecha ? <span>{formatDateEs(event.fecha)}</span> : null}
          {event.lugar ? (
            <span className="inline-flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {event.lugar}
            </span>
          ) : null}
        </p>
        <p className="text-[11px] text-stone-500 mt-1">
          {formatEventPaymentBreakdown(event)}
          {' · '}
          {currentStageDwellLabel(event)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">
          {formatMoneyEs(money.budget)}
        </p>
        {money.pending > 0.01 ? (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
            Pend. {formatMoneyEs(money.pending)}
          </p>
        ) : money.collected > 0 ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Cobrado</p>
        ) : null}
      </div>
      <EventStageBadge stage={event.estado} />
      <EventsStageDots event={event} />
    </button>
  );
}

export function EventsDashboard(_props: EventsDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadEvents>>>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityScope, setActivityScope] = useState<'todos' | 'hoy'>('todos');

  const loadData = useCallback(async () => {
    if (!dataUserId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEvents(await loadEvents(dataUserId));
    } catch {
      /* Conservar lista */
    } finally {
      setLoading(false);
    }
  }, [dataUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    void listNotificationsRequest(uid)
      .then((res) => {
        if (cancelled) return;
        setNotifications(Array.isArray(res.notifications) ? res.notifications : []);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.user_id, user?.id]);

  const inCourse = useMemo(() => inCourseSnapshot(events), [events]);
  const pipeline = useMemo(() => pipelineSnapshot(events), [events]);

  const openEvents = useMemo(
    () => events.filter((e) => !['finalizado', 'cancelado'].includes(e.estado)),
    [events],
  );

  const waitingAccept = useMemo(
    () => events.filter((e) => e.estado === 'enviado'),
    [events],
  );

  const liveNow = useMemo(
    () => events.filter((e) => e.estado === 'en_curso'),
    [events],
  );

  const pendingPay = useMemo(
    () => openEvents
      .map((e) => ({ event: e, fin: summarizeEventFinancials(e) }))
      .filter((row) => row.fin.pendiente > 0.01 && row.fin.presupuesto > 0)
      .sort((a, b) => b.fin.pendiente - a.fin.pendiente)
      .slice(0, 8),
    [openEvents],
  );

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const horizon = todayMs + 30 * 24 * 60 * 60 * 1000;
    return openEvents
      .map((e) => ({ event: e, day: parseEventDay(e.fecha) }))
      .filter((row): row is { event: EventRecord; day: number } => row.day != null && row.day >= todayMs && row.day <= horizon)
      .sort((a, b) => a.day - b.day)
      .slice(0, 8)
      .map((row) => row.event);
  }, [openEvents]);

  const stageCounts = useMemo(() => {
    const map = new Map<EventContractStage, number>();
    for (const s of PIPELINE_STAGES) map.set(s.id, 0);
    for (const e of events) {
      if (e.estado === 'cancelado') continue;
      map.set(e.estado, (map.get(e.estado) || 0) + 1);
    }
    return map;
  }, [events]);

  const totalPending = useMemo(
    () => openEvents.reduce((s, e) => s + eventMoney(e).pending, 0),
    [openEvents],
  );

  const totalCollectedOpen = useMemo(
    () => openEvents.reduce((s, e) => s + eventMoney(e).collected, 0),
    [openEvents],
  );

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        icon: Briefcase,
        value: String(openEvents.length),
        label: 'Contrataciones abiertas',
        hint: `${liveNow.length} en curso`,
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-[#2563EB]',
        onClick: () => navigate('/saas/vertical/eventos/contrataciones'),
      },
      {
        icon: Send,
        value: String(waitingAccept.length),
        label: 'Esperando aceptación',
        hint: waitingAccept.length ? 'Presupuestos enviados al cliente' : 'Ninguno pendiente',
        iconWrap: 'bg-sky-50 dark:bg-sky-900/30',
        iconColor: 'text-sky-600 dark:text-sky-400',
      },
      {
        icon: Wallet,
        value: formatMoneyEs(totalPending),
        label: 'Pendiente de cobrar',
        hint: `Ya cobrado ${formatMoneyEs(totalCollectedOpen)}`,
        iconWrap: 'bg-amber-50 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
      {
        icon: Clock,
        value: inCourse.count
          ? (inCourse.avgDwellMs == null ? '—' : formatDurationEs(inCourse.avgDwellMs))
          : '0',
        label: 'En curso, duración media',
        hint: formatMoneyEs(inCourse.budget),
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
    ],
    [
      openEvents.length,
      liveNow.length,
      waitingAccept.length,
      totalPending,
      totalCollectedOpen,
      inCourse,
      navigate,
    ],
  );

  const liveEventsSorted = useMemo(
    () => [...openEvents]
      .sort((a, b) => (Number(eventMoney(b).budget) || 0) - (Number(eventMoney(a).budget) || 0)),
    [openEvents],
  );

  const allActivities = useMemo(() => {
    const fromEvents = buildEventsDashboardActivity(events, 40);
    const eventIds = new Set(events.map((e) => String(e._id || '').trim()).filter(Boolean));
    const fromNotifs: DashboardActivityEntry[] = [];

    for (const n of notifications) {
      const cat = String(n.category || '').trim();
      const route = String(n.route || '');
      const isEventsCat = EVENTS_NOTIF_CATS.has(cat) || cat.startsWith('events_');
      const isEventsRoute = route.includes('/eventos');
      if (!isEventsCat && !isEventsRoute && cat !== 'merma_registered') continue;

      const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata as Record<string, unknown> : {};
      const eventId = String(n.entityId || meta.eventId || '').trim();
      const linkedEvent = eventId ? events.find((e) => e._id === eventId) : null;
      const eventName = linkedEvent?.nombre
        || String(meta.productName || '')
        || (cat === 'merma_registered' ? 'Merma' : 'Eventos');

      if (eventId && eventIds.has(eventId)) {
        const title = String(n.title || '').toLowerCase();
        if (title.includes('aceptado') || title.includes('rechazado') || title.includes('cobrado al completo')) {
          continue;
        }
      }

      const at = String(n.createdAt || '').trim();
      if (!at) continue;
      fromNotifs.push({
        id: `notif-${n.id || at}`,
        at,
        title: String(n.title || 'Aviso').trim() || 'Aviso',
        detail: String(n.message || eventName).trim() || eventName,
        tone: toneFromNotif(n),
        kind: `notif:${cat || 'events'}`,
        eventId: eventId || '',
        eventName,
      });
    }

    return [...fromEvents, ...fromNotifs]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 30);
  }, [events, notifications]);

  const activities = useMemo(
    () => (activityScope === 'hoy' ? allActivities.filter((a) => isActivityToday(a.at)) : allActivities),
    [activityScope, allActivities],
  );

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0 space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-[#2563EB]" aria-hidden />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-stone-500 inline-flex items-center gap-1.5">
                  <PartyPopper className="w-4 h-4 text-[#2563EB]" />
                  {currentBusiness?.name || 'Eventos'}
                </p>
                <h1 className="text-xl font-semibold text-stone-900 dark:text-white mt-0.5">
                  Dashboard de eventos
                </h1>
                <p className="text-sm text-stone-500 mt-0.5">
                  Cartera {formatMoneyEs(pipeline.budget)} · pendiente {formatMoneyEs(pipeline.pending)}
                </p>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((k) => {
                const Icon = k.icon;
                const Comp = k.onClick ? 'button' : 'div';
                return (
                  <Comp
                    key={k.label}
                    type={k.onClick ? 'button' : undefined}
                    onClick={k.onClick}
                    className={`bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 text-left ${
                      k.onClick ? 'hover:border-blue-300 dark:hover:border-blue-700 transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2.5 rounded-xl ${k.iconWrap}`}>
                        <Icon className={`w-5 h-5 ${k.iconColor}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-stone-900 dark:text-white tabular-nums">{k.value}</p>
                    <p className="text-sm text-stone-800 dark:text-stone-200 mt-1">{k.label}</p>
                    <p className="text-xs text-stone-500 mt-1">{k.hint}</p>
                  </Comp>
                );
              })}
            </div>

            {/* Embudo por fase */}
            <section className={`${VERTIAL_SURFACE} p-5`}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Embudo</h2>
                  <p className="text-sm text-stone-500 mt-0.5">Cuántas contrataciones hay en cada fase</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/saas/vertical/eventos/contrataciones')}
                  className="text-sm font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                >
                  Ver pipeline
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {PIPELINE_STAGES.map((stage) => {
                  const count = stageCounts.get(stage.id) || 0;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => navigate('/saas/vertical/eventos/contrataciones')}
                      className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/40 px-3 py-3 text-left hover:border-blue-300 dark:hover:border-blue-700"
                    >
                      <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-white">{count}</p>
                      <p className="text-xs font-medium text-stone-600 dark:text-stone-300 mt-1 leading-snug">
                        {stage.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="mb-0">
              <EventsStageMetrics events={events} />
            </div>

            {/* Próximos */}
            <section className={`${VERTIAL_SURFACE} p-5`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-semibold text-stone-900 dark:text-white inline-flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#2563EB]" />
                  Próximos 30 días
                </h2>
                <span className="text-xs font-semibold text-stone-500">{upcoming.length}</span>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-stone-500 py-6 text-center">Sin eventos con fecha próxima.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {upcoming.map((event) => (
                    <li key={event._id}>
                      <EventRow
                        event={event}
                        onOpen={() => navigate(`/saas/vertical/eventos/${event._id}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Por cobrar — ancho completo */}
            <section className={`${VERTIAL_SURFACE} p-5`}>
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-stone-900 dark:text-white inline-flex items-center gap-2">
                    <Euro className="w-4 h-4 text-amber-600" />
                    Por cobrar
                  </h2>
                  <p className="text-sm text-stone-500 mt-0.5">
                    Saldo pendiente de las contrataciones abiertas
                  </p>
                </div>
                <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-white">
                  {formatMoneyEs(totalPending)}
                </p>
              </div>
              {pendingPay.length === 0 ? (
                <p className="text-sm text-stone-500 py-6 text-center">Nada pendiente de cobro.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {pendingPay.map(({ event, fin }) => (
                    <li key={event._id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/saas/vertical/eventos/${event._id}`)}
                        className="flex w-full flex-wrap items-center gap-3 py-3.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/60 -mx-1 px-1 rounded-xl"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {event.nombre || 'Evento'}
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{event.cliente || 'Sin cliente'}</span>
                            {event.fecha ? <span>{formatDateEs(event.fecha)}</span> : null}
                            <span className="text-stone-400">
                              Cobrado {formatMoneyEs(fin.cobradoTotal)} de {formatMoneyEs(fin.presupuesto)}
                            </span>
                          </p>
                        </div>
                        <EventStageBadge stage={event.estado} />
                        <div className="text-right shrink-0 min-w-[7.5rem]">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                            Pendiente
                          </p>
                          <p className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">
                            {formatMoneyEs(fin.pendiente)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Esperando aceptación */}
            {waitingAccept.length > 0 ? (
              <section className={`${VERTIAL_SURFACE} p-5`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-base font-semibold text-stone-900 dark:text-white inline-flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-600" />
                    Presupuestos enviados (esperando cliente)
                  </h2>
                </div>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {waitingAccept.slice(0, 6).map((event) => (
                    <li key={event._id}>
                      <EventRow
                        event={event}
                        onOpen={() => navigate(`/saas/vertical/eventos/${event._id}`)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className={`${VERTIAL_SURFACE} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Contrataciones abiertas</h2>
                    <p className="text-sm text-stone-500 mt-0.5">Ordenadas por presupuesto</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/saas/vertical/eventos/contrataciones')}
                    className="text-sm font-semibold text-[#2563EB] hover:underline"
                  >
                    Ver todas
                  </button>
                </div>
                {liveEventsSorted.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-stone-500">Aún no hay contrataciones abiertas.</p>
                    <button
                      type="button"
                      onClick={() => navigate('/saas/vertical/eventos/nueva-contratacion')}
                      className="mt-3 text-sm font-semibold text-[#2563EB] hover:underline"
                    >
                      Crear la primera
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-800 max-h-[28rem] overflow-y-auto">
                    {liveEventsSorted.slice(0, 10).map((event) => (
                      <li key={event._id}>
                        <EventRow
                          event={event}
                          onOpen={() => navigate(`/saas/vertical/eventos/${event._id}`)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={`${VERTIAL_SURFACE} p-5`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Actividad reciente</h2>
                    <p className="text-sm text-stone-500 mt-0.5">Envíos, cobros, fases, caja y merma</p>
                  </div>
                  <div className="flex rounded-xl border border-stone-200 p-0.5 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50">
                    <button
                      type="button"
                      onClick={() => setActivityScope('todos')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        activityScope === 'todos'
                          ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityScope('hoy')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        activityScope === 'hoy'
                          ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      Hoy
                    </button>
                  </div>
                </div>
                {activities.length === 0 ? (
                  <p className="py-8 text-center text-sm text-stone-500">
                    {activityScope === 'hoy'
                      ? 'Sin actividad hoy.'
                      : 'Cuando envíes, acepten o cobres, saldrá aquí.'}
                  </p>
                ) : (
                  <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto">
                    {activities.map((item) => {
                      const Icon = activityIcon(item.tone);
                      const canOpen = Boolean(item.eventId);
                      const body = (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${activityIconClass(item.tone)}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{item.title}</p>
                            {item.detail ? (
                              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">{item.detail}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-stone-400">{formatDateTimeEs(item.at)}</p>
                          </div>
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {canOpen ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/saas/vertical/eventos/${item.eventId}`)}
                              className="flex w-full gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 text-left hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:bg-stone-900/70"
                            >
                              {body}
                            </button>
                          ) : (
                            <div className="flex w-full gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 dark:border-stone-800 dark:bg-stone-900/40">
                              {body}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/saas/events-services')}
                className={VERTIAL_BTN_SECONDARY}
              >
                Catálogo / servicios
              </button>
              <button
                type="button"
                onClick={() => navigate('/saas/events-services?tab=externos')}
                className={VERTIAL_BTN_SECONDARY}
              >
                Externos
              </button>
              <button
                type="button"
                onClick={() => navigate('/saas/calendar')}
                className={VERTIAL_BTN_SECONDARY}
              >
                <CalendarDays className="w-4 h-4" />
                Calendario
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
