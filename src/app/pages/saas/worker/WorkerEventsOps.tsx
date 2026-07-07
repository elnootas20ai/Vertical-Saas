import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { loadEvents } from '../../../lib/eventsFlow';
import {
  filterEventsForToday,
  filterEventsThisWeek,
  loadWorkerLogisticsTasks,
  type WorkerLogisticsTask,
} from '../../../lib/eventsPlanning';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  PartyPopper, CalendarDays, ListChecks, ArrowRight, Loader2, MapPin, Clock,
} from 'lucide-react';

const ACTIVE_STAGES = new Set(['contratado', 'planificacion', 'en_curso']);

export function WorkerEventsOps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.id || '';
  const workerName = user?.fullName || user?.firstName || '';

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [tasks, setTasks] = useState<WorkerLogisticsTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allEvents, logistics] = await Promise.all([
        loadEvents(userId),
        loadWorkerLogisticsTasks(userId, workerName),
      ]);
      setEvents(allEvents.filter((e) => e.estado !== 'cancelado'));
      setTasks(logistics);
    } finally {
      setLoading(false);
    }
  }, [userId, workerName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const todayEvents = filterEventsForToday(events).filter((e) => ACTIVE_STAGES.has(e.estado));
  const weekEvents = filterEventsThisWeek(events).filter((e) => ACTIVE_STAGES.has(e.estado));
  const urgentTasks = tasks.filter((t) => t.prioridad === 'alta' || String(t.fechaLimite || '').slice(0, 10) <= new Date().toISOString().slice(0, 10));

  return (
    <Layout title="Operaciones eventos" subtitle={currentBusiness?.name || 'Campo y coordinación'}>
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <div className="rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <PartyPopper className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Tu jornada de eventos</h1>
              <p className="text-white/80 text-sm">Contrataciones activas, logística y día D — sin TPV.</p>
            </div>
          </div>
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
                  No hay eventos en curso hoy.
                </p>
              ) : (
                todayEvents.map((event) => (
                  <EventOpsCard key={event._id} event={event} onOpen={() => navigate(`/saas/vertical/eventos/${event._id}`)} badge="Hoy" />
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Esta semana ({weekEvents.length})
              </h2>
              {weekEvents.filter((e) => !todayEvents.some((t) => t._id === e._id)).length === 0 ? (
                <p className="text-sm text-gray-500">Sin más eventos activos en los próximos 7 días.</p>
              ) : (
                weekEvents
                  .filter((e) => !todayEvents.some((t) => t._id === e._id))
                  .map((event) => (
                    <EventOpsCard key={event._id} event={event} onOpen={() => navigate(`/saas/vertical/eventos/${event._id}`)} />
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
                    <Link
                      to={`/saas/events-logistics?eventName=${encodeURIComponent(task.evento)}${task.eventId ? `&eventId=${encodeURIComponent(task.eventId)}` : ''}`}
                      className="text-xs font-semibold text-cyan-600 shrink-0"
                    >
                      Abrir
                    </Link>
                  </div>
                ))
              )}
            </section>

            <button
              type="button"
              onClick={() => navigate('/saas/vertical/eventos/contrataciones')}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Ver pipeline completo
            </button>
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
}: {
  event: EventRecord;
  onOpen: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 hover:border-cyan-400 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{event.nombre}</p>
            {badge && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {event.lugar || 'Sin lugar'} · {event.cliente}
          </p>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
      </div>
    </button>
  );
}
