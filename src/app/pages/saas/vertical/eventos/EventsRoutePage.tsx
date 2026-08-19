import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import { loadEvents, resolveEventsUserId } from '../../../../lib/eventsFlow';
import { EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import {
  EVENT_STAGE_CONFIG,
  type EventContractStage,
  type EventRecord,
} from '../../../../lib/eventsTypes';
import { formatDateEs } from '../../../../lib/formatDateEs';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../../../lib/vertialUiTokens';
import {
  Loader2, MapPin, Plus, RefreshCw, Route, Users,
} from 'lucide-react';

const ROUTE_STAGES = new Set<EventContractStage>([
  'aceptado', 'contratado', 'planificacion', 'en_curso', 'finalizado',
]);

const ACTIVE_ROUTE_STAGES = new Set<EventContractStage>([
  'aceptado', 'contratado', 'planificacion', 'en_curso',
]);

type RouteFilter = 'activos' | 'en_curso' | 'todos';

function eventDay(event: EventRecord): string {
  return String(event.fecha || '').slice(0, 10);
}

function eventTime(event: EventRecord): string {
  const raw = String(event.fecha || '');
  const dt = new Date(raw);
  if (!raw || Number.isNaN(dt.getTime())) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return '';
  return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function sortByFecha(a: EventRecord, b: EventRecord): number {
  const byDate = String(a.fecha || '').localeCompare(String(b.fecha || ''));
  if (byDate !== 0) return byDate;
  return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
}

export function EventsRoutePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RouteFilter>('activos');

  const refresh = useCallback(async () => {
    if (!dataUserId) {
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

  useEffect(() => { void refresh(); }, [refresh]);

  const routeEvents = useMemo(() => {
    return events
      .filter((e) => ROUTE_STAGES.has(e.estado))
      .sort(sortByFecha);
  }, [events]);

  const stops = useMemo(() => {
    if (filter === 'en_curso') {
      return routeEvents.filter((e) => e.estado === 'en_curso');
    }
    if (filter === 'activos') {
      return routeEvents.filter((e) => ACTIVE_ROUTE_STAGES.has(e.estado));
    }
    return routeEvents;
  }, [routeEvents, filter]);

  const openCreate = () => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'));

  const filters: { id: RouteFilter; label: string; count: number }[] = [
    {
      id: 'activos',
      label: 'Activos',
      count: routeEvents.filter((e) => ACTIVE_ROUTE_STAGES.has(e.estado)).length,
    },
    {
      id: 'en_curso',
      label: 'En directo',
      count: routeEvents.filter((e) => e.estado === 'en_curso').length,
    },
    {
      id: 'todos',
      label: 'Todos',
      count: routeEvents.length,
    },
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 inline-flex items-center gap-2">
              <Route className="w-5 h-5 text-[var(--v-blue,#2563eb)]" />
              Ruta de eventos
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Eventos de la ruta: fecha, lugar, hora y fase
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className={VERTIAL_BTN_SECONDARY}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button type="button" onClick={openCreate} className={VERTIAL_BTN_PRIMARY}>
              <Plus className="w-4 h-4" />
              Nueva contratación
            </button>
          </div>
        </div>

        <section className={`${VERTIAL_SURFACE} p-4 space-y-3`}>
          <div>
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Crear y controlar</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Alta nueva → aparece en la ruta al aceptar/contratar. Abre cada evento para avanzar fase, lugar y cobros.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openCreate} className={VERTIAL_BTN_PRIMARY}>
              <Plus className="w-4 h-4" />
              Crear evento
            </button>
            <button
              type="button"
              onClick={() => navigate(scoped('/saas/vertical/eventos/contrataciones'))}
              className={VERTIAL_BTN_SECONDARY}
            >
              Ver pipeline
            </button>
            <button
              type="button"
              onClick={() => navigate(scoped('/saas/events-services'))}
              className={VERTIAL_BTN_SECONDARY}
            >
              Servicios
            </button>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors',
                  active
                    ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900',
                ].join(' ')}
              >
                {f.label}
                <span className="tabular-nums opacity-70">{f.count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          </div>
        ) : stops.length === 0 ? (
          <div className={`${VERTIAL_SURFACE} px-4 py-12 text-center space-y-3`}>
            <p className="text-sm text-stone-500">
              {filter === 'en_curso'
                ? 'No hay eventos en directo ahora.'
                : 'Aún no hay eventos en la ruta.'}
            </p>
            <button type="button" onClick={openCreate} className={VERTIAL_BTN_PRIMARY}>
              <Plus className="w-4 h-4" />
              Crear el primero
            </button>
          </div>
        ) : (
          <ol className={`${VERTIAL_SURFACE} divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden`}>
            {stops.map((event, index) => {
              const time = eventTime(event);
              const day = eventDay(event);
              const bar = EVENT_STAGE_CONFIG[event.estado]?.bar || 'bg-slate-400';
              return (
                <li key={event._id}>
                  <button
                    type="button"
                    onClick={() => navigate(scoped(`/saas/vertical/eventos/${event._id}`))}
                    className="w-full flex text-left hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                  >
                    <span className={`w-1 shrink-0 ${bar}`} aria-hidden />
                    <div className="flex items-start gap-3 px-4 py-3.5 flex-1 min-w-0">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[11px] font-bold text-[var(--v-blue,#2563eb)] tabular-nums dark:bg-blue-950/40 dark:text-blue-300">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {event.nombre}
                          </p>
                          <EventStageBadge stage={event.estado} />
                        </div>
                        <p className="text-xs text-stone-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {day && (
                            <span className="font-semibold text-stone-700 dark:text-stone-300">
                              {formatDateEs(day)}
                              {time ? ` · ${time}` : ''}
                            </span>
                          )}
                          <span>{event.cliente || 'Sin cliente'}</span>
                          {event.lugar && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" />
                              {event.lugar}
                            </span>
                          )}
                          {Number(event.invitados) > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Users className="w-3 h-3" />
                              {event.invitados}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Layout>
  );
}
