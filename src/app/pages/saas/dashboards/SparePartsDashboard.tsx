import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import {
  BookOpen,
  ClipboardList,
  Banknote,
  AlertTriangle,
  LayoutGrid,
  ShoppingCart,
  Truck,
  PlusCircle,
  Loader2,
} from 'lucide-react';

type SparePartsDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  delta: string;
  iconWrap: string;
  iconColor: string;
};

export function SparePartsDashboard({ onSelectGeneral }: SparePartsDashboardProps) {
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('spareparts'), []);
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
        icon: BookOpen,
        value: String(counts.catalog ?? 0),
        label: 'Referencias catálogo',
        delta: '—',
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
      },
      {
        icon: ClipboardList,
        value: String(counts.orders ?? 0),
        label: 'Pedidos pendientes',
        delta: '—',
        iconWrap: 'bg-indigo-50 dark:bg-indigo-900/30',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        icon: Banknote,
        value: `€${counts.counterTickets ?? 0}`,
        label: 'Ventas hoy',
        delta: '—',
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        icon: AlertTriangle,
        value: String(counts.stock ?? 0),
        label: 'Stock bajo mínimos',
        delta: '—',
        iconWrap: 'bg-amber-50 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
    ],
    [counts]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Nueva venta', icon: ShoppingCart },
      { label: 'Hacer pedido', icon: Truck },
      { label: 'Añadir referencia', icon: PlusCircle },
    ],
    []
  );

  const actividades = useMemo(
    () =>
      (dashData?.recentActivity || []).map((r) => ({
        title: String(r.summary || r.type || 'Actividad'),
        detail: String(r.type || ''),
        time: r.updatedAt ? new Date(r.updatedAt).toLocaleString('es-ES') : '',
        icon: ShoppingCart,
        tone: 'text-indigo-600 dark:text-indigo-400',
      })),
    [dashData]
  );

  const resumenMes = useMemo(
    () => [
      { label: 'Líneas de pedido servidas', value: String(counts.orders ?? 0) },
      { label: 'Rotación media de stock', value: String(counts.stock ?? 0) },
      { label: 'Márgenes brutos acumulados', value: `€${counts.counterTickets ?? 0}` },
      { label: 'Referencias nuevas altas', value: String(counts.catalog ?? 0) },
    ],
    [counts]
  );

  const visibleActivity = showAllActivity ? actividades : actividades.slice(0, 4);

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
          </div>
        ) : (
          <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel de recambios</p>
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
            const isAlertBadge = k.delta === 'Alerta';
            return (
              <div
                key={k.label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${k.iconWrap}`}>
                    <Icon className={`w-5 h-5 ${k.iconColor}`} />
                  </div>
                  <span
                    className={
                      isAlertBadge
                        ? 'text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full'
                        : 'text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full'
                    }
                  >
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
              Ventas, entregas de pedido y alertas de inventario
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
              KPIs consolidados del mes
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
