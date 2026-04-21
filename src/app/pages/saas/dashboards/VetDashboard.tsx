import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi } from '../../../lib/verticalApiFactory';
import {
  Stethoscope,
  PawPrint,
  Syringe,
  Euro,
  CalendarPlus,
  FlaskConical,
  Bell,
  FileText,
  Loader2,
} from 'lucide-react';

type VetDashboardProps = {
  onSelectGeneral?: () => void;
};

type ActivityKind = 'appointment' | 'vaccine' | 'lab';

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  time: string;
};

function kindFromVetType(type: string): ActivityKind {
  if (type.includes('appointment')) return 'appointment';
  if (type.includes('vaccination')) return 'vaccine';
  if (type.includes('record')) return 'lab';
  return 'appointment';
}

function formatActivityTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function VetDashboard({ onSelectGeneral }: VetDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('vet'), []);
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
      kind: kindFromVetType(a.type || ''),
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
    const cnt = dashData?.counts;
    return {
      consultas: cnt?.appointments ?? 0,
      nuevosPacientes: cnt?.patients ?? 0,
      vacunas: cnt?.vaccinations ?? 0,
      cirugias: cnt?.history ?? 0,
    };
  }, [dashData]);

  const c = dashData?.counts;

  const activityIcon = (kind: ActivityKind) => {
    switch (kind) {
      case 'appointment':
        return <Stethoscope className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'vaccine':
        return <Syringe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <FlaskConical className="h-4 w-4 text-violet-600 dark:text-violet-400" />;
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
                <Stethoscope className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.appointments ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Consultas hoy</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <PawPrint className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.patients ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pacientes registrados</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-900/30">
                <Syringe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(c?.vaccinations ?? 0).toLocaleString('es-ES')}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Vacunaciones pendientes</p>
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
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ingresos mes</p>
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
            <CalendarPlus className="h-4 w-4" />
            Nueva consulta
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <Syringe className="h-4 w-4" />
            Registrar vacuna
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <FileText className="h-4 w-4" />
            Nueva receta
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
                    { key: 'appointment' as const, label: 'Citas' },
                    { key: 'vaccine' as const, label: 'Vacunas' },
                    { key: 'lab' as const, label: 'Laboratorio' },
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
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Bell className="h-5 w-5 text-blue-500" />
              Resumen del mes
            </h2>
            <ul className="space-y-4">
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Consultas realizadas</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {monthSummary.consultas.toLocaleString('es-ES')}
                </span>
              </li>
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Nuevos pacientes</span>
                <span className="font-semibold text-gray-900 dark:text-white">{monthSummary.nuevosPacientes}</span>
              </li>
              <li className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Vacunaciones aplicadas</span>
                <span className="font-semibold text-gray-900 dark:text-white">{monthSummary.vacunas}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Intervenciones quirúrgicas</span>
                <span className="font-semibold text-violet-600 dark:text-violet-400">{monthSummary.cirugias}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
