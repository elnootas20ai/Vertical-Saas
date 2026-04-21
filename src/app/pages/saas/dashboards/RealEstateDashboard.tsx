import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Layout } from '../../../components/saas/Layout';
import {
  Building2,
  Footprints,
  FileSignature,
  Euro,
  LayoutDashboard,
  Clock,
  Home,
  CalendarPlus,
  FilePlus2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';

type RealEstateDashboardProps = {
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

export function RealEstateDashboard({ onSelectGeneral }: RealEstateDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('realestate'), []);
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
      { label: 'Captaciones nuevas', value: String(dashData?.counts?.properties ?? 0) },
      { label: 'Ofertas recibidas', value: String(dashData?.counts?.visits ?? 0) },
      { label: 'Tiempo medio de venta', value: '—' },
      { label: 'Cartera valorada (aprox.)', value: `€${dashData?.counts?.contracts ?? 0}` },
    ],
    [dashData],
  );

  return (
    <Layout title="Dashboard">
      <div className="pb-8 relative">
        {loading ? (
          <div className="flex justify-center items-center py-16 mb-6" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
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
            icon={Building2}
            iconClass="bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
            trend="—"
            value={String(dashData?.counts?.properties ?? 0)}
            label="Propiedades activas"
          />
          <KpiCard
            icon={Footprints}
            iconClass="bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
            trend="—"
            value={String(dashData?.counts?.visits ?? 0)}
            label="Visitas mes"
          />
          <KpiCard
            icon={FileSignature}
            iconClass="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
            trend="—"
            value={String(dashData?.counts?.contracts ?? 0)}
            label="Contratos cerrados"
          />
          <KpiCard
            icon={Euro}
            iconClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            trend="—"
            value={`€${dashData?.counts?.appraisals ?? 0}`}
            label="Comisiones mes"
          />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <Home className="w-4 h-4" />
              Nueva propiedad
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              Agendar visita
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
              Nuevo contrato
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
              Indicadores orientativos de tu cartera inmobiliaria.
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
              El ratio visitas por cierre mejoró un 14% respecto al trimestre anterior.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
