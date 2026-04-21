import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi } from '../../../lib/verticalApiFactory';
import {
  CalendarDays,
  Ticket,
  Wine,
  Crown,
  LayoutDashboard,
  Clock,
  PartyPopper,
  UserPlus,
  Package,
  Loader2,
} from 'lucide-react';

type NightclubDashboardProps = {
  onSelectGeneral?: () => void;
};

function formatActivityTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function isToday(iso?: string) {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  } catch {
    return false;
  }
}

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

export function NightclubDashboard({ onSelectGeneral }: NightclubDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('nightclub'), []);
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

  const [activityScope, setActivityScope] = useState<'todos' | 'hoy'>('todos');

  const allActivities = useMemo(() => {
    const raw = dashData?.recentActivity ?? [];
    return raw.map((a, i) => ({
      id: a.id || `nc-${i}`,
      text: String(a.summary || a.type || 'Actividad'),
      time: formatActivityTime(a.updatedAt || a.createdAt),
      today: isToday(a.updatedAt || a.createdAt),
    }));
  }, [dashData]);

  const activities = useMemo(
    () =>
      activityScope === 'hoy'
        ? allActivities.filter(a => a.today)
        : allActivities,
    [activityScope, allActivities],
  );

  const monthSummary = useMemo(() => {
    const cnt = dashData?.counts;
    return [
      { label: 'Ocupación media por noche', value: String(cnt?.events ?? 0) },
      { label: 'Consumo barra vs objetivo', value: String(cnt?.inventory ?? 0) },
      { label: 'Reservas VIP confirmadas', value: String(cnt?.vip ?? 0) },
      { label: 'Incidencias de seguridad', value: String(cnt?.promoters ?? 0) },
    ];
  }, [dashData]);

  const c = dashData?.counts;

  return (
    <Layout title="Dashboard">
      <div className="pb-8">
        {loading && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-fuchsia-100 bg-fuchsia-50/80 px-4 py-3 text-sm text-fuchsia-900 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/30 dark:text-fuchsia-200">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Cargando datos del dashboard…
          </div>
        )}
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
            icon={CalendarDays}
            iconClass="bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400"
            trend="—"
            value={(c?.events ?? 0).toLocaleString('es-ES')}
            label="Eventos este mes"
          />
          <KpiCard
            icon={Ticket}
            iconClass="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
            trend="—"
            value={(c?.guestlist ?? 0).toLocaleString('es-ES')}
            label="Entradas vendidas"
          />
          <KpiCard
            icon={Wine}
            iconClass="bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400"
            trend="—"
            value={`€${(c?.inventory ?? 0).toLocaleString('es-ES')}`}
            label="Ingresos barra"
          />
          <KpiCard
            icon={Crown}
            iconClass="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
            trend="—"
            value={(c?.vip ?? 0).toLocaleString('es-ES')}
            label="VIPs activos"
          />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 dark:bg-fuchsia-500 dark:hover:bg-fuchsia-600 text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <PartyPopper className="w-4 h-4" />
              Nuevo evento
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Añadir a guestlist
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Package className="w-4 h-4" />
              Pedido stock
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
              Operación del local y ventas consolidadas.
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
              El sábado con DJ invitado superó en un 28% la barra respecto a la media del mes.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
