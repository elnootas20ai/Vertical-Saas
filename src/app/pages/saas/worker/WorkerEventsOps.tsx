import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { loadEvents, resolveEventsUserId } from '../../../lib/eventsFlow';
import {
  filterEventsForToday,
  filterEventsThisWeek,
  loadWorkerLogisticsTasks,
  type WorkerLogisticsTask,
} from '../../../lib/eventsPlanning';
import {
  filterEventsForWorkerDayOps,
  findDayOpsCrewMember,
  hydrateDayOpsFromEvent,
} from '../../../lib/eventsDayOps';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  PartyPopper, CalendarDays, ListChecks, ArrowRight, Loader2, MapPin, Clock,
} from 'lucide-react';

const ACTIVE_STAGES = new Set(['aceptado', 'contratado', 'planificacion', 'en_curso']);

export function WorkerEventsOps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const workerId = String(user?.user_id || user?.id || '').trim();
  const workerName = user?.fullName || user?.firstName || '';

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [tasks, setTasks] = useState<WorkerLogisticsTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allEvents, logistics] = await Promise.all([
        loadEvents(dataUserId),
        loadWorkerLogisticsTasks(dataUserId, workerName),
      ]);
      setEvents(allEvents.filter((e) => e.estado !== 'cancelado'));
      setTasks(logistics);
    } finally {
      setLoading(false);
    }
  }, [dataUserId, workerName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myDayEvents = useMemo(
    () =>
      filterEventsForWorkerDayOps(events, { workerId, workerName }).filter((e) =>
        ACTIVE_STAGES.has(e.estado),
      ),
    [events, workerId, workerName],
  );

  const todayEvents = filterEventsForToday(myDayEvents.length ? myDayEvents : events).filter((e) =>
    ACTIVE_STAGES.has(e.estado),
  );
  const weekEvents = filterEventsThisWeek(myDayEvents.length ? myDayEvents : events).filter((e) =>
    ACTIVE_STAGES.has(e.estado),
  );
  const urgentTasks = tasks.filter(
    (t) =>
      t.prioridad === 'alta'
      || String(t.fechaLimite || '').slice(0, 10) <= new Date().toISOString().slice(0, 10),
  );

  const openDay = (eventId: string) => navigate(`/saas/worker/events/dia/${eventId}`);

  return (
    <Layout title="Operaciones eventos" subtitle={currentBusiness?.name || 'Campo y coordinación'}>
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <div className="rounded-2xl bg-[#2563EB] p-5 text-white">
          <div className="flex items-center gap-3">
            <PartyPopper className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Tu jornada de eventos</h1>
              <p className="text-white/85 text-sm">Tu parte del Día D: hora, rol, brief y checks.</p>
            </div>
          </div>
          <Link
            to="/saas/worker/clock"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
          >
            <Clock className="w-4 h-4" />
            Fichar entrada / salida
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> Hoy ({todayEvents.length})
              </h2>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">
                  No tienes eventos asignados hoy.
                </p>
              ) : (
                todayEvents.map((event) => (
                  <EventOpsCard
                    key={event._id}
                    event={event}
                    workerId={workerId}
                    workerName={workerName}
                    onOpen={() => openDay(event._id)}
                    badge="Hoy"
                  />
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Esta semana ({weekEvents.length})
              </h2>
              {weekEvents.filter((e) => !todayEvents.some((t) => t._id === e._id)).length === 0 ? (
                <p className="text-sm text-gray-500">Sin más eventos asignados en los próximos 7 días.</p>
              ) : (
                weekEvents
                  .filter((e) => !todayEvents.some((t) => t._id === e._id))
                  .map((event) => (
                    <EventOpsCard
                      key={event._id}
                      event={event}
                      workerId={workerId}
                      workerName={workerName}
                      onOpen={() => openDay(event._id)}
                    />
                  ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> Mis tareas ({urgentTasks.length})
              </h2>
              {urgentTasks.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">
                  No tienes tareas logísticas pendientes asignadas.
                </p>
              ) : (
                urgentTasks.slice(0, 8).map((task) => (
                  <div
                    key={task._id}
                    className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 flex items-start justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{task.tarea}</p>
                      <p className="text-xs text-gray-500 mt-1">{task.evento} · {task.fechaLimite || 'Sin fecha'}</p>
                    </div>
                    {task.eventId ? (
                      <button
                        type="button"
                        onClick={() => openDay(task.eventId!)}
                        className="text-xs font-semibold text-[#2563EB] shrink-0"
                      >
                        Día D
                      </button>
                    ) : (
                      <Link
                        to={`/saas/events-services?tab=logistica&eventName=${encodeURIComponent(task.evento)}`}
                        className="text-xs font-semibold text-[#2563EB] shrink-0"
                      >
                        Abrir
                      </Link>
                    )}
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function EventOpsCard({
  event,
  onOpen,
  badge,
  workerId,
  workerName,
}: {
  event: EventRecord;
  onOpen: () => void;
  badge?: string;
  workerId: string;
  workerName: string;
}) {
  const me = findDayOpsCrewMember(hydrateDayOpsFromEvent(event), { workerId, workerName });
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 hover:border-[#2563EB] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{event.nombre}</p>
            {badge && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-[#2563EB] dark:bg-blue-950/40 dark:text-blue-300">
                {badge}
              </span>
            )}
            {me?.arriveTime && (
              <span className="text-[11px] font-semibold tabular-nums text-stone-500">
                {me.arriveTime}
              </span>
            )}
            {me?.checkedIn && (
              <span className="text-[10px] font-bold uppercase text-emerald-600">Ya estoy</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {event.lugar || 'Sin lugar'} · {event.cliente}
            {me?.role ? ` · ${me.role}` : ''}
          </p>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
      </div>
    </button>
  );
}
