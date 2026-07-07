import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import { loadEvents } from '../../../lib/eventsFlow';
import {
  CalendarDays,
  Briefcase,
  Users,
  Wallet,
  LayoutGrid,
  PlusCircle,
  Mail,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

type EventsDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  delta: string;
  iconWrap: string;
  iconColor: string;
};

export function EventsDashboard({ onSelectGeneral }: EventsDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('events'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadEvents>>>([]);
  const [loading, setLoading] = useState(true);

  const [showAllActivity, setShowAllActivity] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setDashData(null);
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, list] = await Promise.all([
        dashApi.load(userId).catch(() => null),
        loadEvents(userId),
      ]);
      setDashData(data);
      setEvents(list);
    } catch {
      setDashData(null);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [dashApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = dashData?.counts || {};

  const ingresosMes = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const revenueStages = ['enviado', 'aceptado', 'contratado', 'planificacion', 'en_curso', 'finalizado'];
    return events
      .filter((e) => e.fecha?.startsWith(monthPrefix) && revenueStages.includes(e.estado))
      .reduce((s, e) => s + (Number(e.presupuesto) || 0), 0);
  }, [events]);

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        icon: CalendarDays,
        value: String(events.filter((e) => !['finalizado', 'cancelado'].includes(e.estado)).length || counts.events || 0),
        label: 'Eventos activos',
        delta: '—',
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        icon: Briefcase,
        value: String(counts.vendors ?? 0),
        label: 'Externos confirmados',
        delta: '—',
        iconWrap: 'bg-violet-50 dark:bg-violet-900/30',
        iconColor: 'text-violet-600 dark:text-violet-400',
      },
      {
        icon: Users,
        value: String(counts.guests ?? 0),
        label: 'Invitados confirmados',
        delta: '—',
        iconWrap: 'bg-amber-50 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
      {
        icon: Wallet,
        value: `${ingresosMes.toLocaleString('es-ES')} €`,
        label: 'Ingresos mes',
        delta: '—',
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
    ],
    [counts, events, ingresosMes]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Nueva contratación', path: '/saas/vertical/eventos/nueva-contratacion', icon: PlusCircle },
      { label: 'Añadir externo', path: '/saas/events-vendors', icon: Briefcase },
      { label: 'Ver invitados', path: '/saas/events-guests', icon: Mail },
    ],
    []
  );

  const actividades = useMemo(
    () =>
      (dashData?.recentActivity || []).map((r) => ({
        title: String(r.summary || r.type || 'Actividad'),
        detail: String(r.type || ''),
        time: r.updatedAt ? new Date(r.updatedAt).toLocaleString('es-ES') : '',
        icon: CheckCircle2,
        tone: 'text-emerald-600 dark:text-emerald-400',
      })),
    [dashData]
  );

  const resumenMes = useMemo(
    () => [
      { label: 'Eventos cerrados este mes', value: String(events.filter((e) => e.estado === 'finalizado').length) },
      { label: 'Contrataciones en pipeline', value: String(events.filter((e) => !['finalizado', 'cancelado'].includes(e.estado)).length) },
      { label: 'Incidencias logísticas resueltas', value: String(counts.logistics ?? 0) },
      { label: 'Facturación provisional', value: `${ingresosMes.toLocaleString('es-ES')} €` },
    ],
    [counts, events, ingresosMes]
  );

  const visibleActivity = showAllActivity ? actividades : actividades.slice(0, 4);

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" aria-hidden />
          </div>
        ) : (
          <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel de eventos</p>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mt-0.5">
              Resumen operativo
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/saas/vertical/eventos')}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 px-4 py-2 text-sm font-medium text-cyan-800 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors"
            >
              Centro de eventos
            </button>
            {onSelectGeneral && (
              <button
                type="button"
                onClick={onSelectGeneral}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${k.iconWrap}`}>
                    <Icon className={`w-5 h-5 ${k.iconColor}`} />
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                    {k.delta}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{k.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => {
              const AIcon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => navigate(a.path)}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <AIcon className="w-4 h-4 shrink-0" />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Actividad reciente</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              RSVPs, confirmaciones de externos y reservas de espacio
            </p>
            <ul className="mt-4 space-y-3">
              {visibleActivity.map((a, idx) => {
                const AIcon = a.icon;
                return (
                  <li
                    key={`${a.title}-${idx}`}
                    className="flex gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-3"
                  >
                    <div className={`shrink-0 p-2 rounded-lg bg-white dark:bg-gray-800 ${a.tone}`}>
                      <AIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{a.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{a.detail}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{a.time}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {actividades.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllActivity((v) => !v)}
                className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showAllActivity ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen del mes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Indicadores agregados del calendario actual
            </p>
            <ul className="mt-4 space-y-3">
              {resumenMes.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-400">{r.label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.value}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
          </>
        )}
      </div>
    </Layout>
  );
}
