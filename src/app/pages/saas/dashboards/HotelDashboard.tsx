import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import {
  BedDouble,
  LogIn,
  LogOut,
  TrendingUp,
  Activity,
  CalendarPlus,
  LayoutGrid,
  UtensilsCrossed,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';

type HotelDashboardProps = { onSelectGeneral?: () => void };

export function HotelDashboard({ onSelectGeneral }: HotelDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('hotel'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId) {
      setDashData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await dashApi.load(userId);
      setDashData(d);
    } catch {
      setDashData(null);
    } finally {
      setLoading(false);
    }
  }, [dashApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const [businessName] = useState('Hotel Boutique del Mar');

  const activities = useMemo(() => {
    const raw = dashData?.recentActivity || [];
    return raw.map(a => {
      const d = new Date(a.updatedAt || a.createdAt || 0);
      return {
        id: a.id,
        icon: CalendarPlus,
        tone: 'text-indigo-500 dark:text-indigo-400',
        title: a.summary || a.type || '',
        meta: d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
      };
    });
  }, [dashData]);

  const monthSummary = useMemo(() => {
    const c = dashData?.counts;
    const lines =
      dashData == null
        ? ([] as string[])
        : [
            `Registros totales: ${dashData.total}`,
            `Reservas: ${c?.reservations ?? 0}`,
            `Habitaciones: ${c?.rooms ?? 0}`,
            `Huéspedes: ${c?.guests ?? 0}`,
          ];
    return {
      title: 'Resumen del mes',
      lines,
    };
  }, [dashData]);

  return (
    <Layout title="Dashboard">
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto relative">
        {loading ? (
          <div className="flex justify-center items-center py-12" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          </div>
        ) : null}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{businessName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel del sector hotel</p>
          </div>
          {onSelectGeneral ? (
            <button
              type="button"
              onClick={() => onSelectGeneral()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Vista general
            </button>
          ) : null}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                <BedDouble className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(dashData?.counts?.reservations ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ocupación</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                <LogIn className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(dashData?.counts?.checkins ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Check-ins hoy</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/30">
                <LogOut className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-xs font-medium text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(dashData?.counts?.guests ?? 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Check-outs hoy</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-900/30">
                <TrendingUp className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {`${dashData?.counts?.roomService ?? 0} €`}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">RevPAR</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-2">
            Acciones rápidas
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Nuevo check-in
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            Nueva reserva
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <UtensilsCrossed className="w-4 h-4" />
            Room service
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              Actividad reciente
            </h2>
            <ul className="space-y-3">
              {activities.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="flex gap-3 text-sm border-b border-gray-100 dark:border-gray-700/80 pb-3 last:border-0 last:pb-0"
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${item.tone}`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.meta}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-indigo-500" />
              {monthSummary.title}
            </h2>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              {monthSummary.lines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <ClipboardList className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
