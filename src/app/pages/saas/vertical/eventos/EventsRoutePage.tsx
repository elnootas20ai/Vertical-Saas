import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { EventsDayOpsPanel } from '../../../../components/saas/events/EventsDayOpsPanel';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import {
  loadEvents,
  parseQuoteLines,
  parseRouteExtraStock,
  resolveEventsUserId,
} from '../../../../lib/eventsFlow';
import { ensureEventDayOps } from '../../../../lib/eventsDayOps';
import { EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import {
  EVENT_STAGE_CONFIG,
  parsePlanningChecklist,
  type EventContractStage,
  type EventRecord,
} from '../../../../lib/eventsTypes';
import { listCatalogItemsRequest, type CatalogItem } from '../../../../lib/deliveryApi';
import { filterCatalogItemsForBusinessScope } from '../../../../lib/catalogBusinessScope';
import { dayOpsProgress, hydrateDayOpsFromEvent } from '../../../../lib/eventsDayOps';
import { formatDateEs } from '../../../../lib/formatDateEs';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../../../lib/vertialUiTokens';
import {
  ChevronDown, ChevronUp, Loader2, MapPin, Package, Plus, RefreshCw, Route, Truck, Users,
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
  const [catalogProducts, setCatalogProducts] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RouteFilter>('activos');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [evs, items] = await Promise.all([
        loadEvents(dataUserId),
        listCatalogItemsRequest(dataUserId, 'catalog').catch(() => [] as CatalogItem[]),
      ]);
      setEvents(evs);
      const scopedItems = filterCatalogItemsForBusinessScope(items, businessId || '', [], {
        accountBusinessCount: 1,
        activeBusinessType: 'events',
      });
      setCatalogProducts(
        scopedItems.filter(
          (i) =>
            i.active !== false
            && i.deletedAt == null
            && i.module !== 'stock'
            && String(i.name || '').trim(),
        ),
      );
    } catch {
      /* Conservar lista */
    } finally {
      setLoading(false);
    }
  }, [dataUserId, businessId]);

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

  const openDayOps = async (event: EventRecord) => {
    const nextId = expandedId === event._id ? null : event._id;
    setExpandedId(nextId);
    if (!nextId || !dataUserId) return;
    if (String(event.dayOps || '').trim()) return;
    try {
      const ensured = await ensureEventDayOps(dataUserId, event);
      setEvents((prev) => prev.map((e) => (e._id === ensured._id ? ensured : e)));
    } catch {
      /* panel hidrata en memoria igual */
    }
  };

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
              Día D · Ruta
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Mando del día: timeline, mercancía, equipo, quién lleva y TPV
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

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors min-h-11',
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
              const open = expandedId === event._id;
              const pedidoUnits = parseQuoteLines(event.lineasPresupuesto)
                .reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
              const extraUnits = parseRouteExtraStock(event.routeExtraStock)
                .reduce((s, l) => s + (Number(l.qty) || 0), 0);
              const workers = parsePlanningChecklist(event.planningChecklist).workers;
              const progress = dayOpsProgress(hydrateDayOpsFromEvent(event));
              const tpv = String(event.portableTerminalCode || '').trim().toUpperCase();

              return (
                <li key={event._id}>
                  <div className="flex">
                    <span className={`w-1 shrink-0 ${bar}`} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 px-3 py-3">
                        <button
                          type="button"
                          onClick={() => void openDayOps(event)}
                          className="flex items-start gap-3 flex-1 min-w-0 text-left hover:opacity-90"
                        >
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-[var(--v-blue,#2563eb)] tabular-nums dark:bg-blue-950/40 dark:text-blue-300">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {event.nombre}
                              </p>
                              <EventStageBadge stage={event.estado} />
                              {progress.pct > 0 && (
                                <span className="text-[10px] font-bold tabular-nums text-[#2563EB]">
                                  {progress.pct}% día
                                </span>
                              )}
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
                              <span className="inline-flex items-center gap-0.5">
                                <Package className="w-3 h-3" />
                                {pedidoUnits} ud
                                {extraUnits > 0 ? ` · +${extraUnits}` : ''}
                              </span>
                              {workers.length > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Users className="w-3 h-3" />
                                  {workers.length}
                                </span>
                              )}
                              {tpv && (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[10px]">
                                  <Truck className="w-3 h-3" />
                                  TPV {tpv}
                                </span>
                              )}
                            </p>
                            {progress.pct > 0 && (
                              <div className="h-1.5 max-w-xs rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#2563EB]"
                                  style={{ width: `${progress.pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(scoped(`/saas/vertical/eventos/${event._id}`));
                          }}
                          className="shrink-0 rounded-xl border border-stone-200 dark:border-stone-700 px-2.5 py-2.5 text-[11px] font-semibold text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900 min-h-11"
                        >
                          Ficha
                        </button>
                        <button
                          type="button"
                          onClick={() => void openDayOps(event)}
                          className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2.5 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900 min-h-11"
                        >
                          Día D
                          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {open && dataUserId && (
                        <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40">
                          <EventsDayOpsPanel
                            event={event}
                            userId={dataUserId}
                            catalogProducts={catalogProducts}
                            onEventUpdated={(updated) => {
                              setEvents((prev) =>
                                prev.map((e) => (e._id === updated._id ? updated : e)),
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Layout>
  );
}
