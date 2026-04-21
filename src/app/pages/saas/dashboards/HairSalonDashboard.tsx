import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import {
  CalendarCheck,
  Euro,
  UserPlus,
  ShoppingBag,
  LayoutGrid,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

type HairSalonDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  delta: string;
  iconWrap: string;
  iconColor: string;
};

export function HairSalonDashboard({ onSelectGeneral }: HairSalonDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('salon'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAllActivity, setShowAllActivity] = useState(false);

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

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        icon: CalendarCheck,
        value: String(counts.appointments ?? 0),
        label: 'Citas hoy',
        delta: '—',
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        icon: Euro,
        value: `€${counts.services ?? 0}`,
        label: 'Ingresos hoy',
        delta: '—',
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        icon: UserPlus,
        value: String(counts.loyalty ?? 0),
        label: 'Clientes nuevos (mes)',
        delta: '—',
        iconWrap: 'bg-fuchsia-50 dark:bg-fuchsia-900/30',
        iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
      },
      {
        icon: ShoppingBag,
        value: String(counts.products ?? 0),
        label: 'Productos vendidos',
        delta: '—',
        iconWrap: 'bg-amber-50 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
    ],
    [counts]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Nueva cita', icon: CalendarCheck },
      { label: 'Nuevo cliente', icon: UserPlus },
      { label: 'Vender producto', icon: ShoppingBag },
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
        tone: 'text-fuchsia-600 dark:text-fuchsia-400',
      })),
    [dashData]
  );

  const resumenMes = useMemo(
    () => [
      { label: 'Citas atendidas', value: String(counts.appointments ?? 0) },
      { label: 'Ticket medio', value: `€${counts.services ?? 0}` },
      { label: 'Tasa de repetición', value: String(counts.clientHistory ?? 0) },
      { label: 'Ventas retail acumuladas', value: `€${counts.products ?? 0}` },
    ],
    [counts]
  );

  const visibleActivity = showAllActivity ? actividades : actividades.slice(0, 4);

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-fuchsia-600 dark:text-fuchsia-400" aria-hidden />
          </div>
        ) : (
          <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel de peluquería</p>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mt-0.5">
              Resumen operativo
            </h1>
          </div>
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
              Citas, ventas de producto y recompensas de fidelización
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
              Cifras acumuladas del mes en curso
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
