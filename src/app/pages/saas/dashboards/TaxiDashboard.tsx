import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi } from '../../../lib/verticalApiFactory';
import {
  Car,
  Route,
  Euro,
  Gauge,
  CalendarClock,
  MapPin,
  AlertTriangle,
  UserCheck,
  Wrench,
  Loader2,
} from 'lucide-react';

type TaxiDashboardProps = {
  onSelectGeneral?: () => void;
};

type ActivityKind = 'trip' | 'checkin' | 'maintenance';

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  time: string;
};

function kindFromTaxiType(type: string): ActivityKind {
  if (type.includes('trip')) return 'trip';
  if (type.includes('driver') || type.includes('shift')) return 'checkin';
  if (type.includes('maintenance')) return 'maintenance';
  return 'trip';
}

function formatActivityTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function TaxiDashboard({ onSelectGeneral }: TaxiDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('taxi'), []);
  const userId = user?.user_id || user?.id || '';
  const [dashData, setDashData] = useState<{
    counts: Record<string, number>;
    recentActivity: { id: string; type: string; updatedAt: string; createdAt: string; summary: string }[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await dashApi.load(userId);
      setDashData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, dashApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [activityFilter, setActivityFilter] = useState<ActivityKind | 'all'>('all');

  const activitiesFromApi = useMemo((): ActivityItem[] => {
    const raw = dashData?.recentActivity ?? [];
    return raw.map((a) => ({
      id: a.id,
      kind: kindFromTaxiType(a.type || ''),
      title: String(a.summary || a.type || 'Actividad'),
      subtitle: a.type || '',
      time: formatActivityTime(a.updatedAt || a.createdAt),
    }));
  }, [dashData]);

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return activitiesFromApi;
    return activitiesFromApi.filter((a) => a.kind === activityFilter);
  }, [activityFilter, activitiesFromApi]);

  const monthSummary = useMemo(() => {
    const c = dashData?.counts;
    return {
      carreras: c?.trips ?? 0,
      ingresos: `€${(c?.billing ?? 0).toLocaleString('es-ES')}`,
      km: c?.shifts ?? 0,
      incidencias: c?.maintenance ?? 0,
    };
  }, [dashData]);

  const c = dashData?.counts;

  const activityIcon = (kind: ActivityKind) => {
    switch (kind) {
      case 'trip':
        return <Route className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'checkin':
        return <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    }
  };

  return (
    <Layout title="Dashboard">
      <div className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Cargando datos del dashboard…
          </div>
        )}
        {onSelectGeneral && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSelectGeneral}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              Vista general
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.vehicles ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Vehículos activos</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <Route className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.trips ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Carreras hoy</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <Euro className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              €{(c?.billing ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ingresos hoy</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.shifts ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Km recorridos hoy</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <span className="w-full text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:w-auto sm:mr-2 sm:self-center">
            Acciones rápidas
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <CalendarClock className="h-4 w-4" />
            Asignar turno
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <AlertTriangle className="h-4 w-4" />
            Nueva incidencia
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <MapPin className="h-4 w-4" />
            Ver mapa flota
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Actividad reciente</h2>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { key: 'all' as const, label: 'Todo' },
                    { key: 'trip' as const, label: 'Carreras' },
                    { key: 'checkin' as const, label: 'Conductores' },
                    { key: 'maintenance' as const, label: 'Mantenimiento' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivityFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      activityFilter === key
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-3">
              {filteredActivities.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700/80 dark:bg-gray-900/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
                    {activityIcon(item.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{item.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.subtitle}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Resumen del mes</h2>
            <ul className="space-y-4">
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Carreras completadas</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {monthSummary.carreras.toLocaleString('es-ES')}
                </span>
              </li>
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Ingresos acumulados</span>
                <span className="font-semibold text-gray-900 dark:text-white">{monthSummary.ingresos}</span>
              </li>
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Kilómetros totales</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {monthSummary.km.toLocaleString('es-ES')} km
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Incidencias registradas</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{monthSummary.incidencias}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
