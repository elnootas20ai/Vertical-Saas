import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import { loadEvents, loadAllEventQuotes, buildEventQuoteListRows, resolveEventsUserId } from '../../../../lib/eventsFlow';
import { summarizeEventFinancials } from '../../../../lib/eventsFinance';
import { EVENT_STAGE_CONFIG, type EventContractStage, type EventRecord } from '../../../../lib/eventsTypes';
import { EventHubStageProgress } from '../../../../components/saas/events/EventContractStepper';
import { formatEventPaymentBreakdown } from '../../../../components/saas/events/EventsStagePaymentCard';
import { VERTIAL_BTN_PRIMARY } from '../../../../lib/vertialUiTokens';
import {
  PartyPopper, Plus, ArrowRight,
  Loader2, RefreshCw, MapPin,
} from 'lucide-react';

function fmtEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

function quoteRowStage(kind: string): { stage: EventContractStage; rejected: boolean } {
  if (kind === 'rechazado') return { stage: 'presupuesto', rejected: true };
  if (kind === 'enviado') return { stage: 'enviado', rejected: false };
  if (kind === 'aceptado') return { stage: 'aceptado', rejected: false };
  return { stage: 'presupuesto', rejected: false };
}

function hubPaymentLabel(event: EventRecord): { text: string; className: string } {
  const fin = summarizeEventFinancials(event);
  const text = formatEventPaymentBreakdown(event);
  if (fin.presupuesto <= 0) return { text: 'Sin importe', className: 'text-stone-400' };
  if (fin.pendiente <= 0.01 && fin.cobradoTotal > 0) {
    return { text, className: 'text-emerald-700 dark:text-emerald-300' };
  }
  if (fin.cobradoTotal > 0) {
    return { text, className: 'text-amber-700 dark:text-amber-300' };
  }
  return { text, className: 'text-rose-700 dark:text-rose-300' };
}

export function EventsHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [quoteDocs, setQuoteDocs] = useState<Awaited<ReturnType<typeof loadAllEventQuotes>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      if (businessesFetchSettled) setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    try {
      const [list, quotes] = await Promise.all([
        loadEvents(dataUserId),
        loadAllEventQuotes(dataUserId).catch(() => []),
      ]);
      setEvents(
        [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
      );
      setQuoteDocs(quotes);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [dataUserId, businessesFetchSettled]);

  useEffect(() => {
    if (!businessesFetchSettled && !dataUserId) return;
    void refresh();
  }, [refresh, businessesFetchSettled, dataUserId]);

  const recent = events.slice(0, 8);
  const liveEvents = useMemo(
    () => events.filter((e) => e.estado === 'en_curso'),
    [events],
  );
  const recentQuotes = useMemo(() => {
    const rows = buildEventQuoteListRows(events, quoteDocs);
    const order = { borrador: 0, enviado: 1, rechazado: 2, aceptado: 3 } as const;
    return [...rows]
      .sort((a, b) => {
        const byKind = order[a.kind] - order[b.kind];
        if (byKind !== 0) return byKind;
        return String(b.date || '').localeCompare(String(a.date || ''));
      })
      .slice(0, 8);
  }, [events, quoteDocs]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <PartyPopper className="w-7 h-7 text-cyan-600" />
                Centro de eventos
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Contrataciones y presupuestos en curso
              </p>
            </div>

            <section
              className={[
                'rounded-xl border overflow-hidden transition-all duration-300',
                liveEvents.length > 0
                  ? 'w-full max-w-xl border-amber-300/80 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20'
                  : 'w-56 border-dashed border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-950/40',
              ].join(' ')}
            >
              <div
                className={[
                  'flex items-center justify-between gap-2',
                  liveEvents.length > 0
                    ? 'px-3 py-2 border-b border-amber-200/70 dark:border-amber-800/50'
                    : 'px-2.5 py-1.5',
                ].join(' ')}
              >
                <h2 className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 inline-flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </span>
                  Evento en directo
                </h2>
                {liveEvents.length > 0 && (
                  <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    {liveEvents.length}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-gray-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  …
                </div>
              ) : liveEvents.length === 0 ? (
                <p className="px-2.5 pb-2 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                  Vacío · se amplía al haber eventos en curso
                </p>
              ) : (
                <ul className="divide-y divide-amber-100/80 dark:divide-amber-900/40">
                  {liveEvents.map((event) => {
                    const pay = hubPaymentLabel(event);
                    return (
                      <li key={event._id}>
                        <button
                          type="button"
                          onClick={() => navigate(scoped(`/saas/vertical/eventos/${event._id}`))}
                          className="w-full flex text-left hover:bg-amber-100/50 dark:hover:bg-amber-950/30"
                        >
                          <span className="w-1 shrink-0 bg-amber-500" aria-hidden />
                          <div className="flex-1 min-w-0 space-y-1 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{event.nombre}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  <span>{event.cliente}</span>
                                  {event.fecha && <span>{new Date(event.fecha).toLocaleDateString('es-ES')}</span>}
                                  {event.lugar && (
                                    <span className="inline-flex items-center gap-0.5 truncate">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      {event.lugar}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                                {fmtEuro(Number(event.presupuesto) || 0)}
                              </span>
                            </div>
                            <EventHubStageProgress stage={event.estado} />
                            <p className={`text-[10px] font-semibold ${pay.className}`}>{pay.text}</p>
                          </div>
                        </button>
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
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'))}
              className={VERTIAL_BTN_PRIMARY}
            >
              <Plus className="w-4 h-4" />
              Nueva contratación
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contrataciones recientes</h2>
              <Link
                to={scoped('/saas/vertical/eventos/contrataciones')}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-1"
              >
                Ver todas
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando…
              </div>
            ) : recent.length === 0 ? (
              <div className="py-12 text-center px-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loadFailed
                    ? 'No se pudieron cargar las contrataciones. Pulsa Actualizar.'
                    : 'Aún no hay contrataciones.'}
                </p>
                {!loadFailed && (
                  <button
                    type="button"
                    onClick={() => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'))}
                    className="mt-3 text-sm font-semibold text-cyan-600 hover:underline"
                  >
                    Crear la primera
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((event) => {
                  const stageCfg = EVENT_STAGE_CONFIG[event.estado] || EVENT_STAGE_CONFIG.presupuesto;
                  const barClass = stageCfg.bar || 'bg-slate-400';
                  const pay = hubPaymentLabel(event);
                  return (
                    <li key={event._id}>
                      <button
                        type="button"
                        onClick={() => navigate(scoped(`/saas/vertical/eventos/${event._id}`))}
                        className="w-full flex text-left hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                      >
                        <span className={`w-1 shrink-0 ${barClass}`} aria-hidden />
                        <div className="flex-1 min-w-0 space-y-1.5 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{event.nombre}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                <span>{event.cliente}</span>
                                {event.fecha && <span>{new Date(event.fecha).toLocaleDateString('es-ES')}</span>}
                                {event.lugar && (
                                  <span className="inline-flex items-center gap-0.5 truncate">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    {event.lugar}
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                              {fmtEuro(Number(event.presupuesto) || 0)}
                            </span>
                          </div>
                          <EventHubStageProgress stage={event.estado} />
                          <p className={`text-[11px] font-semibold ${pay.className}`}>{pay.text}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Presupuestos abiertos</h2>
              <Link
                to={scoped('/saas/vertical/eventos/presupuestos')}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-1"
              >
                Ver todos
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando…
              </div>
            ) : recentQuotes.length === 0 ? (
              <div className="py-12 text-center px-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loadFailed
                    ? 'No se pudieron cargar los presupuestos. Pulsa Actualizar.'
                    : 'Aún no hay presupuestos abiertos.'}
                </p>
                {!loadFailed && (
                  <button
                    type="button"
                    onClick={() => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'))}
                    className="mt-3 text-sm font-semibold text-cyan-600 hover:underline"
                  >
                    Crear el primero
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentQuotes.map((row) => {
                  const { stage, rejected } = quoteRowStage(row.kind);
                  const stageCfg = EVENT_STAGE_CONFIG[stage] || EVENT_STAGE_CONFIG.presupuesto;
                  const barClass = rejected ? 'bg-[var(--v-rose,#e11d48)]' : (stageCfg.bar || 'bg-slate-400');
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => navigate(scoped(`/saas/vertical/eventos/${row.eventId}`))}
                        className="w-full flex text-left hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                      >
                        <span className={`w-1 shrink-0 ${barClass}`} aria-hidden />
                        <div className="flex-1 min-w-0 space-y-1.5 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{row.nombre}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{row.cliente}</p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                              {fmtEuro(row.importe)}
                            </span>
                          </div>
                          <EventHubStageProgress stage={stage} rejected={rejected} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Contrataciones', path: '/saas/vertical/eventos/contrataciones', hint: 'Pipeline completo por fase' },
            { label: 'Servicios', path: '/saas/events-services', hint: 'Catálogo, espacios, externos, catering y logística' },
            { label: 'Ruta de eventos', path: '/saas/vertical/eventos/ruta', hint: 'Eventos, alta y control' },
          ].map((item) => (
            <Link
              key={item.path}
              to={scoped(item.path)}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors"
            >
              <p className="font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.hint}</p>
            </Link>
          ))}
        </section>
      </div>
    </Layout>
  );
}
