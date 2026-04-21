import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import {
  UserRound,
  CalendarClock,
  Euro,
  Star,
  Activity,
  Pill,
  ClipboardList,
  LayoutGrid,
  Sparkles,
  Loader2,
} from 'lucide-react';

type ClinicDashboardProps = { onSelectGeneral?: () => void };

export function ClinicDashboard({ onSelectGeneral }: ClinicDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('clinic'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [businessName] = useState('Clínica Salud Integral');

  const loadData = useCallback(async () => {
    if (!userId) {
      setDashData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await dashApi.load(userId);
      setDashData(data);
    } catch {
      setDashData(null);
    } finally {
      setLoading(false);
    }
  }, [dashApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = dashData?.counts || {};

  const activities = useMemo(
    () =>
      (dashData?.recentActivity || []).map((r) => ({
        id: r.id,
        icon: Activity,
        tone: 'text-sky-600 dark:text-sky-400',
        title: String(r.summary || r.type || 'Actividad'),
        meta: r.updatedAt ? new Date(r.updatedAt).toLocaleString('es-ES') : '',
      })),
    [dashData]
  );

  const monthSummary = useMemo(() => {
    const c = dashData?.counts || {};
    return {
      title: 'Resumen del mes',
      lines: [
        `Pacientes registrados: ${c.patients ?? 0}`,
        `Citas: ${c.appointments ?? 0}`,
        `Historial clínico: ${c.history ?? 0}`,
        `Tratamientos: ${c.treatments ?? 0}`,
        `Recetas: ${c.prescriptions ?? 0}`,
        `Consultorios: ${c.rooms ?? 0}`,
      ],
    };
  }, [dashData]);

  return (
    <Layout title="Dashboard">
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-sky-600 dark:text-sky-400" aria-hidden />
          </div>
        ) : (
          <>
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{businessName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel del sector clínica</p>
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
              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/30">
                <UserRound className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.patients ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pacientes hoy</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/30">
                <CalendarClock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.appointments ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Citas pendientes</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-lime-50 dark:bg-lime-900/30">
                <Euro className="w-5 h-5 text-lime-700 dark:text-lime-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.treatments ?? 0} €</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ingresos mes</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30">
                <Star className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.prescriptions ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Satisfacción</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-2">
            Acciones rápidas
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Nueva cita
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <UserRound className="w-4 h-4" />
            Nuevo paciente
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <Pill className="w-4 h-4" />
            Crear receta
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
              <Sparkles className="w-4 h-4 text-violet-500" />
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
          </>
        )}
      </div>
    </Layout>
  );
}
