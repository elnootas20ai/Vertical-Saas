import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import { loadEvents, resolveEventsUserId } from '../../../../lib/eventsFlow';
import { summarizeEventFinancials } from '../../../../lib/eventsFinance';
import { EVENT_STAGE_CONFIG, type EventContractStage, type EventRecord } from '../../../../lib/eventsTypes';
import { EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import { VERTIAL_BTN_PRIMARY } from '../../../../lib/vertialUiTokens';
import {
  PartyPopper, Plus, ArrowRight, CalendarDays, FileText, CheckCircle2,
  Loader2, RefreshCw, Users, MapPin,
} from 'lucide-react';

function fmtEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

function hubPaymentLabel(event: EventRecord): { text: string; className: string } {
  const fin = summarizeEventFinancials(event);
  if (fin.presupuesto <= 0) return { text: 'Sin importe', className: 'text-stone-400' };
  if (fin.pendiente <= 0.01) return { text: `Cobrado ${fmtEuro(fin.cobradoTotal)}`, className: 'text-emerald-700 dark:text-emerald-300' };
  if (fin.cobradoTotal > 0) {
    return {
      text: `Cobrado ${fmtEuro(fin.cobradoTotal)} · falta ${fmtEuro(fin.pendiente)}`,
      className: 'text-amber-700 dark:text-amber-300',
    };
  }
  return { text: `Pendiente ${fmtEuro(fin.pendiente)}`, className: 'text-rose-700 dark:text-rose-300' };
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
      const list = await loadEvents(dataUserId);
      setEvents(
        [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
      );
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

  const kpis = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const activeStages: EventContractStage[] = ['presupuesto', 'enviado', 'aceptado', 'contratado', 'planificacion', 'en_curso'];
    const revenueStages: EventContractStage[] = ['enviado', 'aceptado', 'contratado', 'planificacion', 'en_curso', 'finalizado'];
    const active = events.filter((e) => activeStages.includes(e.estado));
    const pipelineValue = active.reduce((s, e) => s + (Number(e.presupuesto) || 0), 0);
    const ingresosMes = events
      .filter((e) => e.fecha?.startsWith(monthPrefix) && revenueStages.includes(e.estado))
      .reduce((s, e) => s + (Number(e.presupuesto) || 0), 0);
    const upcoming = events.filter((e) => {
      if (e.estado === 'cancelado' || e.estado === 'finalizado') return false;
      if (!e.fecha) return false;
      return new Date(e.fecha) >= new Date(now.toISOString().slice(0, 10));
    }).length;
    const contracted = events.filter((e) => ['contratado', 'planificacion', 'en_curso', 'finalizado'].includes(e.estado)).length;
    return { active: active.length, pipelineValue, ingresosMes, upcoming, contracted };
  }, [events]);

  const recent = events.slice(0, 8);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <PartyPopper className="w-7 h-7 text-cyan-600" />
              Centro de eventos
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Flujo lineal: presupuesto → aceptación → contrato → planificación → evento
            </p>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'En pipeline', value: String(kpis.active), icon: FileText, color: 'text-cyan-600' },
            { label: 'Valor pipeline', value: fmtEuro(kpis.pipelineValue), icon: CalendarDays, color: 'text-emerald-600' },
            { label: 'Ingresos mes', value: fmtEuro(kpis.ingresosMes), icon: CheckCircle2, color: 'text-indigo-600' },
            { label: 'Contratados', value: String(kpis.contracted), icon: Users, color: 'text-violet-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                {label}
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>

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
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{event.nombre}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{event.cliente}</span>
                            {event.fecha && (
                              <>
                                <span>·</span>
                                <span>{new Date(event.fecha).toLocaleDateString('es-ES')}</span>
                              </>
                            )}
                            {event.lugar && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{event.lugar}</span>
                              </>
                            )}
                          </p>
                          <p className={`text-[11px] font-semibold mt-1 ${pay.className}`}>{pay.text}</p>
                        </div>
                        <EventStageBadge stage={event.estado} />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                          {fmtEuro(Number(event.presupuesto) || 0)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Servicios', path: '/saas/events-services', hint: 'Catálogo y tarifas' },
            { label: 'Espacios', path: '/saas/events-venues', hint: 'Salones, fincas, hoteles…' },
            { label: 'Externos', path: '/saas/events-vendors', hint: 'DJ, florista, foto…' },
            { label: 'Catering', path: '/saas/events-catering', hint: 'Menús y banquete' },
            { label: 'Logística', path: '/saas/events-logistics', hint: 'Tareas y montaje' },
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
