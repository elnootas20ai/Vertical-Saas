import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import { authFetch, getAuthHeaders } from '../../../lib/authApi';
import { getApiBase } from '../../../lib/apiBase';
import {
  Car, Package, TrendingUp, FileX, LayoutGrid, Truck,
  ShoppingCart, AlertTriangle, Clock, ClipboardCheck,
  MapPin, Link2, Pause, Leaf, FileCheck,
  ArrowRight, Wrench, Boxes, FileText,
  Loader2,
} from 'lucide-react';

const _env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
function _couchHeaders() {
  const h: Record<string, string> = {};
  if (_env.VITE_COUCHDB_URL) h['x-couch-url'] = _env.VITE_COUCHDB_URL;
  if (_env.VITE_COUCHDB_USER) h['x-couch-user'] = _env.VITE_COUCHDB_USER;
  if (_env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = _env.VITE_COUCHDB_PASSWORD;
  return h;
}

interface DocAlert {
  type: string;
  severity: string;
  message: string;
  actionUrl?: string;
  isScrapyard?: boolean;
}

type ScrapyardDashboardProps = { onSelectGeneral?: () => void };

type KpiCard = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  delta: string;
  iconWrap: string;
  iconColor: string;
  href?: string;
};

export function ScrapyardDashboard({ onSelectGeneral }: ScrapyardDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('scrapyard-ops'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAllActivity, setShowAllActivity] = useState(false);
  const [docAlerts, setDocAlerts] = useState<DocAlert[]>([]);

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

  useEffect(() => {
    if (!userId) return;
    authFetch(`${getApiBase()}/api/documents/${userId}/alerts`, {
      headers: { ...getAuthHeaders(), ..._couchHeaders() },
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) setDocAlerts((data.alerts || []).filter((a: DocAlert) => a.isScrapyard));
      })
      .catch(() => {});
  }, [userId]);

  const counts = dashData?.counts || {};

  const kpis = useMemo<KpiCard[]>(
    () => [
      {
        icon: Car,
        value: String(counts.vehicles ?? 0),
        label: 'Vehiculos en stock',
        delta: '\u2014',
        iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
        href: '/saas/scrapyard-vehicles',
      },
      {
        icon: Package,
        value: String(counts.inventory ?? 0),
        label: 'Piezas disponibles',
        delta: '\u2014',
        iconWrap: 'bg-emerald-50 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        href: '/saas/scrapyard-inventory',
      },
      {
        icon: TrendingUp,
        value: `${counts.sales ?? 0} \u20AC`,
        label: 'Ventas (mes)',
        delta: '\u2014',
        iconWrap: 'bg-violet-50 dark:bg-violet-900/30',
        iconColor: 'text-violet-600 dark:text-violet-400',
        href: '/saas/scrapyard-sales',
      },
      {
        icon: FileX,
        value: String(counts.deregistrations ?? 0),
        label: 'Bajas tramitadas',
        delta: '\u2014',
        iconWrap: 'bg-orange-50 dark:bg-orange-900/30',
        iconColor: 'text-orange-600 dark:text-orange-400',
        href: '/saas/scrapyard-deregistrations',
      },
    ],
    [counts]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Registrar compra', icon: ShoppingCart, href: '/saas/vertical/desguaces/compras-retiradas?new=true' },
      { label: 'Dar entrada vehiculo', icon: Truck, href: '/saas/scrapyard-vehicles' },
      { label: 'Nueva venta', icon: ClipboardCheck, href: '/saas/scrapyard-sales' },
      { label: 'Stock de piezas', icon: Boxes, href: '/saas/scrapyard-inventory' },
      { label: 'Tramitar baja', icon: FileX, href: '/saas/scrapyard-deregistrations' },
      { label: 'Despiece', icon: Wrench, href: '/saas/scrapyard-parts' },
      { label: 'Medio ambiente', icon: Leaf, href: '/saas/scrapyard-environment' },
    ],
    []
  );

  const alertasStock = useMemo(
    () => [
      { tipo: 'Stock parado', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: Clock, count: 0 },
      { tipo: 'Sin ubicacion', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: MapPin, count: 0 },
      { tipo: 'Reserva sin cerrar', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: Pause, count: 0 },
      { tipo: 'Sin compatibilidades', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Link2, count: 0 },
    ],
    []
  );

  const actividades = useMemo(
    () =>
      (dashData?.recentActivity || []).map((r) => ({
        title: String(r.summary || r.type || 'Actividad'),
        detail: String(r.type || ''),
        time: r.updatedAt ? new Date(r.updatedAt).toLocaleString('es-ES') : '',
        icon: Truck,
        tone: 'text-violet-600 dark:text-violet-400',
      })),
    [dashData]
  );

  const resumenMes = useMemo(
    () => [
      { label: 'Vehiculos dados de baja (entrada)', value: String(counts.deregistrations ?? 0) },
      { label: 'Piezas recuperadas', value: String(counts.inventory ?? 0) },
      { label: 'Piezas vendidas', value: String(counts.sales ?? 0) },
      { label: 'Valor inventario piezas', value: `${counts.inventory ?? 0} \u20AC` },
      { label: 'Kg de chatarra gestionados', value: String(counts.environment ?? 0) },
      { label: 'Dias promedio en stock', value: String(counts.expeditions ?? 0) },
    ],
    [counts]
  );

  const visibleActivity = showAllActivity ? actividades : actividades.slice(0, 4);
  const totalAlertas = alertasStock.reduce((s, a) => s + a.count, 0);

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl px-1 pb-8 sm:px-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
          </div>
        ) : (
          <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel de desguace</p>
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

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                onClick={() => k.href && navigate(k.href)}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-md transition-shadow"
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

        {/* Acciones rapidas */}
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rapidas
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => {
              const AIcon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => navigate(a.href)}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <AIcon className="w-4 h-4 shrink-0" />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alertas documentales */}
        {docAlerts.length > 0 && (
          <div className="mb-6 rounded-xl border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Alertas documentales</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{docAlerts.length}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/saas/vertical/desguaces/documentacion')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                Documentación <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {docAlerts.slice(0, 8).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{a.message}</span>
                  {a.actionUrl && (
                    <button onClick={() => navigate(a.actionUrl!)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                      Ver
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alertas de Stock */}
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Alertas de Stock</h2>
              {totalAlertas > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{totalAlertas}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/saas/scrapyard-inventory')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              Ver stock <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {alertasStock.map((a) => {
              const AIcon = a.icon;
              return (
                <div key={a.tipo} className={`${a.bg} rounded-lg p-3 flex items-center gap-3`}>
                  <AIcon className={`w-4 h-4 ${a.color}`} />
                  <div>
                    <p className={`text-lg font-bold ${a.color}`}>{a.count}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{a.tipo}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {totalAlertas === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-3 text-center">Sin alertas activas. El stock esta en orden.</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actividad reciente */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Actividad reciente</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Entradas, despieces, ventas y bajas
            </p>
            <ul className="mt-4 space-y-3">
              {visibleActivity.length > 0 ? visibleActivity.map((a, idx) => {
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
              }) : (
                <li className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                  Sin actividad reciente
                </li>
              )}
            </ul>
            {actividades.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllActivity((v) => !v)}
                className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showAllActivity ? 'Ver menos' : 'Ver mas'}
              </button>
            )}
          </section>

          {/* Resumen del mes */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen del mes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Totales del periodo actual
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

        {/* Accesos directos a modulos */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Vehiculos', icon: Car, href: '/saas/scrapyard-vehicles', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Despiece', icon: Wrench, href: '/saas/scrapyard-parts', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Stock Piezas', icon: Package, href: '/saas/scrapyard-inventory', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Ventas', icon: ShoppingCart, href: '/saas/scrapyard-sales', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
            { label: 'Bajas', icon: FileX, href: '/saas/scrapyard-deregistrations', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
            { label: 'Medio Ambiente', icon: Leaf, href: '/saas/scrapyard-environment', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
            { label: 'Documentación', icon: FileText, href: '/saas/vertical/desguaces/documentacion', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          ].map((m) => {
            const MIcon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => navigate(m.href)}
                className={`${m.bg} rounded-xl p-4 flex flex-col items-center gap-2 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all`}
              >
                <MIcon className={`w-6 h-6 ${m.color}`} />
                <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>
              </button>
            );
          })}
        </div>
          </>
        )}
      </div>
    </Layout>
  );
}
