import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Layout } from '../../../components/saas/Layout';
import {
  GraduationCap,
  BookOpen,
  Percent,
  Euro,
  LayoutDashboard,
  Clock,
  UserPlus,
  PlusCircle,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';

type AcademyDashboardProps = {
  onSelectGeneral?: () => void;
};

function KpiCard({
  icon: Icon,
  iconClass,
  trend,
  value,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  trend: string;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
          {trend}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

export function AcademyDashboard({ onSelectGeneral }: AcademyDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('academy'), []);
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

  const [activityScope, setActivityScope] = useState<'todos' | 'hoy'>('todos');

  const allActivities = useMemo(() => {
    const raw = dashData?.recentActivity || [];
    return raw.map(a => {
      const d = new Date(a.updatedAt || a.createdAt || 0);
      const today = new Date().toDateString() === d.toDateString();
      return {
        id: a.id,
        text: a.summary || a.type || '',
        time: d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
        today,
      };
    });
  }, [dashData]);

  const activities = useMemo(
    () =>
      activityScope === 'hoy'
        ? allActivities.filter(a => a.today)
        : allActivities,
    [activityScope, allActivities],
  );

  const monthSummary = useMemo(
    () => [
      { label: 'Nuevas matrículas', value: String(dashData?.counts?.enrollments ?? 0) },
      { label: 'Cursos con lista de espera', value: String(dashData?.counts?.courses ?? 0) },
      { label: 'Tasa de asistencia media', value: '—' },
      { label: 'Ingresos vs mes anterior', value: '—' },
    ],
    [dashData],
  );

  return (
    <Layout title="Dashboard">
      <div className="pb-8 relative">
        {loading ? (
          <div className="flex justify-center items-center py-16 mb-6" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          </div>
        ) : null}
        {onSelectGeneral ? (
          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={onSelectGeneral}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Vista general
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            icon={GraduationCap}
            iconClass="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            trend="—"
            value={String(dashData?.counts?.students ?? 0)}
            label="Alumnos matriculados"
          />
          <KpiCard
            icon={BookOpen}
            iconClass="bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
            trend="—"
            value={String(dashData?.counts?.courses ?? 0)}
            label="Cursos activos"
          />
          <KpiCard
            icon={Percent}
            iconClass="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            trend="—"
            value={String(dashData?.counts?.grades ?? 0)}
            label="Tasa aprobados"
          />
          <KpiCard
            icon={Euro}
            iconClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            trend="—"
            value={`€${dashData?.counts?.enrollments ?? 0}`}
            label="Ingresos mes"
          />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Nueva matrícula
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Crear curso
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              Registrar notas
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Actividad reciente
              </h2>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-900/50">
                <button
                  type="button"
                  onClick={() => setActivityScope('todos')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activityScope === 'todos'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setActivityScope('hoy')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activityScope === 'hoy'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Hoy
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {activities.map(item => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-3"
                >
                  <Clock className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{item.text}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{item.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Resumen del mes
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Indicadores del centro formativo.
            </p>
            <ul className="space-y-3">
              {monthSummary.map(row => (
                <li
                  key={row.label}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-300">{row.label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
              Los objetivos de captación se cumplieron al 104% respecto al plan inicial.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
