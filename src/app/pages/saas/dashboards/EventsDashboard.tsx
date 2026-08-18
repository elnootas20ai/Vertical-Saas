import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { EventsStageDots, EventsStageMetrics } from '../../../components/saas/events/EventsStagePulse';
import { EventStageBadge } from '../../../components/saas/events/EventContractStepper';
import { loadEvents, resolveEventsUserId } from '../../../lib/eventsFlow';
import {
  eventMoney,
  formatDurationEs,
  inCourseSnapshot,
  pipelineSnapshot,
} from '../../../lib/eventsStageTiming';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';
import {
  CalendarDays,
  Briefcase,
  Clock,
  Wallet,
  LayoutGrid,
  PlusCircle,
  Loader2,
} from 'lucide-react';

type EventsDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  hint: string;
  iconWrap: string;
  iconColor: string;
};

export function EventsDashboard({ onSelectGeneral }: EventsDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadEvents>>>([]);
  const [loading, setLoading] = useState(true);

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

  const inCourse = useMemo(() => inCourseSnapshot(events), [events]);
  const pipeline = useMemo(() => pipelineSnapshot(events), [events]);

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        icon: Clock,
        value: inCourse.count ? (inCourse.avgDwellMs == null ? '—' : formatDurationEs(inCourse.avgDwellMs)) : '0',
        label: 'En curso, cuánto tardan',
        hint: inCourse.count === 1 ? '1 evento' : `${inCourse.count} eventos`,
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-[#2563EB]',
      },
      {
        icon: Wallet,
        value: formatMoneyEs(inCourse.budget),
        label: 'En curso, cuánto generan',
        hint: inCourse.collected > 0 ? `Cobrado ${formatMoneyEs(inCourse.collected)}` : 'Presupuesto de los que están en curso',
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        icon: Briefcase,
        value: formatMoneyEs(pipeline.budget),
        label: 'Cartera contratada',
        hint: `${pipeline.count} en contrato / planificación / curso`,
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        icon: CalendarDays,
        value: formatMoneyEs(pipeline.pending),
        label: 'Pendiente de cobrar',
        hint: `Ya cobrado ${formatMoneyEs(pipeline.collected)}`,
        iconWrap: 'bg-amber-50 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
    ],
    [inCourse, pipeline],
  );

  const liveEvents = useMemo(
    () => [...events]
      .filter((e) => !['finalizado', 'cancelado'].includes(e.estado))
      .sort((a, b) => (Number(eventMoney(b).budget) || 0) - (Number(eventMoney(a).budget) || 0)),
    [events],
  );

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-[#2563EB]" aria-hidden />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div>
                <p className="text-sm text-stone-500">Panel de eventos</p>
                <h1 className="text-xl font-semibold text-stone-900 dark:text-white mt-0.5">
                  Métricas
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/saas/vertical/eventos')}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  Centro de eventos
                </button>
                {onSelectGeneral && (
                  <button
                    type="button"
                    onClick={onSelectGeneral}
                    className={VERTIAL_BTN_SECONDARY}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Vista general
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {kpis.map((k) => {
                const Icon = k.icon;
                return (
                  <div
                    key={k.label}
                    className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2.5 rounded-xl ${k.iconWrap}`}>
                        <Icon className={`w-5 h-5 ${k.iconColor}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-stone-900 dark:text-white">{k.value}</p>
                    <p className="text-sm text-stone-800 dark:text-stone-200 mt-1">{k.label}</p>
                    <p className="text-xs text-stone-500 mt-1">{k.hint}</p>
                  </div>
                );
              })}
            </div>

            <div className="mb-6">
              <EventsStageMetrics events={events} />
            </div>

            <section className={`${VERTIAL_SURFACE} p-5 mb-6`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Contrataciones abiertas</h2>
                  <p className="text-sm text-stone-500 mt-0.5">
                    Tiempo en el paso actual y lo que genera cada una
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/saas/vertical/eventos/contrataciones')}
                  className="text-sm font-semibold text-[#2563EB] hover:underline"
                >
                  Ver todas
                </button>
              </div>
              {liveEvents.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">Aún no hay contrataciones abiertas.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {liveEvents.map((event) => (
                    <li key={event._id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/saas/vertical/eventos/${event._id}`)}
                        className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-900/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">{event.nombre}</p>
                          <p className="text-xs text-stone-500 mt-0.5">{event.cliente}</p>
                        </div>
                        <EventStageBadge stage={event.estado} />
                        <EventsStageDots event={event} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/saas/vertical/eventos/nueva-contratacion')}
                className={VERTIAL_BTN_PRIMARY}
              >
                <PlusCircle className="w-4 h-4" />
                Nueva contratación
              </button>
              <button
                type="button"
                onClick={() => navigate('/saas/events-vendors')}
                className={VERTIAL_BTN_SECONDARY}
              >
                <Briefcase className="w-4 h-4" />
                Externos
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
