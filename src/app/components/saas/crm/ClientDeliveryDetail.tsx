import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, Receipt, Hash, TrendingUp, Calendar, MapPin, Phone, Mail,
  ChevronDown, ChevronRight, Package, Truck, Store, Clock, Euro,
  Star, Gift, BarChart3, Repeat, Award, Megaphone, UtensilsCrossed, Lock,
} from 'lucide-react';
import type { ClientDetailSummary } from '../../lib/crmApi';
import type { DeliveryOrder } from '../../lib/deliveryApi';

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  domicilio: 'A domicilio',
  recogida: 'Recogida',
  sala: 'En sala',
};

const CHANNEL_LABELS: Record<string, string> = {
  tpv: 'TPV',
  phone: 'Teléfono',
  direct: 'Directo',
  web: 'Web',
  app: 'App',
  glovo: 'Glovo',
  justeat: 'Just Eat',
  ubereats: 'Uber Eats',
  flipdish: 'Flipdish',
};

const LOYALTY_LABELS: Record<string, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  platinum: 'Platino',
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  nuevo: { label: 'Nuevo', bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300' },
  cocina: { label: 'En cocina', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300' },
  listo: { label: 'Listo', bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300' },
  en_reparto: { label: 'En reparto', bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300' },
  entregado: { label: 'Entregado', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
  devuelto: { label: 'Devuelto', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300' },
  cancelled: { label: 'Cancelado', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  incident: { label: 'Incidencia', bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300' },
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  partial: 'Parcial',
  refunded: 'Devuelto',
};

const TIER_CONFIG = {
  vip: { label: 'Cliente VIP', bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-200', icon: Star },
  frecuente: { label: 'Cliente frecuente', bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-800 dark:text-emerald-200', icon: Repeat },
  ocasional: { label: 'Cliente ocasional', bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-800 dark:text-blue-200', icon: ShoppingBag },
  nuevo: { label: 'Cliente nuevo', bg: 'bg-sky-100 dark:bg-sky-950/50', text: 'text-sky-800 dark:text-sky-200', icon: Award },
  inactivo: { label: 'Inactivo', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', icon: Clock },
};

function formatEuro(value: number) {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatOrderItemsPreview(
  items: DeliveryOrder['items'] | undefined,
  maxLines = 4,
): string | null {
  if (!items?.length) return null;
  const named = items.filter((i) => i && typeof i === 'object' && String(i.name || '').trim());
  if (!named.length) return null;
  const lines = named.slice(0, maxLines).map((i) => {
    const qty = Number(i.quantity || 1);
    const name = String(i.name || '').trim();
    return qty > 1 ? `${qty}× ${name}` : name;
  });
  if (named.length > maxLines) lines.push(`+${named.length - maxLines} más`);
  return lines.join(' · ');
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-ES', { month: 'short' });
}

function computeClientTier(orders: DeliveryOrder[], totalSpent: number): keyof typeof TIER_CONFIG {
  if (orders.length === 0) return 'nuevo';
  const lastDate = orders.map((o) => o.createdAt).filter(Boolean).sort().pop();
  if (lastDate) {
    const daysSince = (Date.now() - new Date(lastDate).getTime()) / 86400000;
    if (daysSince > 90) return 'inactivo';
  }
  if (orders.length >= 10 || totalSpent >= 400) return 'vip';
  if (orders.length >= 3) return 'frecuente';
  if (orders.length >= 1) return 'ocasional';
  return 'nuevo';
}

function computeDeliveryAnalytics(orders: DeliveryOrder[]) {
  const totalSpent = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
  const deliveredCount = orders.filter((o) => o.status === 'entregado').length;
  const totalItems = orders.reduce((s, o) => s + (o.items || []).reduce((n, i) => n + Number(i.quantity || 1), 0), 0);

  const byType: Record<string, { count: number; revenue: number }> = {};
  const byChannel: Record<string, number> = {};
  const byStore: Record<string, number> = {};
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>();

  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(monthKey(d));
  }
  const monthlySpending: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));

  for (const order of orders) {
    const amount = Number(order.totalAmount || 0);
    const type = String(order.deliveryType || 'otro');
    if (!byType[type]) byType[type] = { count: 0, revenue: 0 };
    byType[type].count += 1;
    byType[type].revenue += amount;

    const channel = String(order.channel || 'tpv');
    byChannel[channel] = (byChannel[channel] || 0) + 1;

    const store = String(order.salesPointName || '').trim();
    if (store) byStore[store] = (byStore[store] || 0) + 1;

    if (order.createdAt) {
      const mk = monthKey(new Date(order.createdAt));
      if (mk in monthlySpending) monthlySpending[mk] += amount;
    }

    for (const item of order.items || []) {
      const key = String(item.catalogItemId || item.name || item.id);
      const prev = productMap.get(key) || { name: String(item.name || 'Artículo'), qty: 0, revenue: 0 };
      prev.qty += Number(item.quantity || 1);
      prev.revenue += Number(item.total || 0);
      productMap.set(key, prev);
    }
  }

  const dates = orders.map((o) => o.createdAt).filter(Boolean).sort();
  let avgDaysBetween: number | null = null;
  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    }
    avgDaysBetween = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const favoriteStore = Object.entries(byStore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const favoriteChannel = Object.entries(byChannel).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const monthlyChart = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    amount: monthlySpending[key] || 0,
  }));
  const maxMonthly = Math.max(...monthlyChart.map((m) => m.amount), 1);

  const typeBreakdown = Object.entries(byType)
    .map(([key, val]) => ({
      key,
      label: DELIVERY_TYPE_LABELS[key] || key,
      count: val.count,
      revenue: val.revenue,
      pct: orders.length > 0 ? Math.round((val.count / orders.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const channelBreakdown = Object.entries(byChannel)
    .map(([key, count]) => ({
      key,
      label: CHANNEL_LABELS[key] || key,
      count,
      pct: orders.length > 0 ? Math.round((count / orders.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSpent,
    deliveredCount,
    totalItems,
    avgDaysBetween,
    firstOrderDate: dates[0] || null,
    topProducts,
    favoriteStore,
    favoriteChannel,
    monthlyChart,
    maxMonthly,
    typeBreakdown,
    channelBreakdown,
    tier: computeClientTier(orders, totalSpent),
  };
}

function OrderStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status || '—', bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-800 ${accent || 'border-gray-200/80 dark:border-gray-700'}`}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function BreakdownBar({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}

export interface DeliveryClientInfo {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  createdAt?: string;
}

export interface DeliveryClientLoyalty {
  points: number;
  level: string;
  totalVisits: number;
  enrolled?: boolean;
}

function AnalyticsUpgradeTeaser() {
  return (
    <div className="rounded-2xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/60 p-6 text-center dark:border-indigo-800 dark:from-indigo-950/30 dark:to-violet-950/20">
      <Lock className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
      <p className="font-semibold text-gray-900 dark:text-gray-100">Analíticas avanzadas — plan Normal</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        Gráficos de gasto, top productos, canales y segmentación VIP en plan Normal o Pro.
      </p>
      <Link
        to="/saas/billing"
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Ver planes
      </Link>
    </div>
  );
}

interface DeliveryClientResumenProps {
  client: DeliveryClientInfo;
  summary: ClientDetailSummary | null;
  orders: DeliveryOrder[];
  loadingSummary: boolean;
  activePromotionsCount?: number;
  loyalty?: DeliveryClientLoyalty | null;
  analyticsUnlocked?: boolean;
  loyaltyUnlocked?: boolean;
  promosLinkUnlocked?: boolean;
  maxRecentOrders?: number;
  onNewOrder: () => void;
  onGoToPedidos: () => void;
  onGoToPromociones?: () => void;
}

export function DeliveryClientResumen({
  client,
  summary,
  orders,
  loadingSummary,
  activePromotionsCount = 0,
  loyalty,
  analyticsUnlocked = true,
  loyaltyUnlocked = true,
  promosLinkUnlocked = true,
  maxRecentOrders = 5,
  onNewOrder,
  onGoToPedidos,
  onGoToPromociones,
}: DeliveryClientResumenProps) {
  const analytics = useMemo(() => computeDeliveryAnalytics(orders), [orders]);

  const computed = useMemo(() => {
    if (orders.length > 0) {
      const total = analytics.totalSpent;
      const dates = orders.map((o) => o.createdAt).filter(Boolean).sort();
      return {
        totalInvoiced: total,
        totalOrders: orders.length,
        avgTicket: orders.length > 0 ? total / orders.length : 0,
        lastPurchase: dates[dates.length - 1] || null,
        deliveryOrders: orders.length,
      };
    }
    if (summary) {
      return {
        totalInvoiced: summary.totalInvoiced,
        totalOrders: summary.totalOrders,
        avgTicket: summary.avgTicket,
        lastPurchase: summary.lastPurchase,
        deliveryOrders: summary.deliveryOrders ?? summary.totalOrders,
      };
    }
    return null;
  }, [orders, summary, analytics.totalSpent]);

  const recentOrders = useMemo(() => {
    if (orders.length > 0) return orders.slice(0, maxRecentOrders);
    return (summary?.recentOrders || []).slice(0, maxRecentOrders).map((o) => ({
      _id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status as DeliveryOrder['status'],
      deliveryType: o.deliveryType as DeliveryOrder['deliveryType'],
      totalAmount: o.totalAmount,
      salesPointName: o.salesPointName,
      items: Array.from({ length: o.itemCount }),
      customerAddress: o.customerAddress,
      paymentStatus: o.paymentStatus as DeliveryOrder['paymentStatus'],
    })) as DeliveryOrder[];
  }, [orders, summary?.recentOrders, maxRecentOrders]);

  const tierCfg = analyticsUnlocked ? TIER_CONFIG[analytics.tier] : TIER_CONFIG.nuevo;
  const TierIcon = tierCfg.icon;

  if (loadingSummary && !computed && orders.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  const totalOrders = computed?.totalOrders ?? 0;
  const hasActivity = totalOrders > 0 || orders.length > 0;

  return (
    <div className="space-y-6">
      {/* Perfil + acción rápida */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/40 p-5 dark:border-gray-700 dark:from-gray-800 dark:via-emerald-950/20 dark:to-teal-950/10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {analyticsUnlocked && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${tierCfg.bg} ${tierCfg.text}`}>
              <TierIcon className="h-3.5 w-3.5" />
              {tierCfg.label}
            </span>
          )}
          {loyaltyUnlocked && loyalty?.enrolled !== false && loyalty && loyalty.points > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
              <Gift className="h-3.5 w-3.5" />
              {loyalty.points} pts · {LOYALTY_LABELS[loyalty.level] || loyalty.level}
            </span>
          )}
          {promosLinkUnlocked && activePromotionsCount > 0 && (
            <button
              type="button"
              onClick={onGoToPromociones}
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800 hover:bg-orange-200 dark:bg-orange-950/50 dark:text-orange-200"
            >
              <Megaphone className="h-3.5 w-3.5" />
              {activePromotionsCount} promo{activePromotionsCount !== 1 ? 's' : ''} activa{activePromotionsCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <ShoppingBag className="h-4 w-4" />
          Nuevo pedido
        </button>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Euro className="h-4 w-4 text-emerald-600" />}
          label="Total gastado"
          value={computed ? formatEuro(computed.totalInvoiced) : '—'}
          sub={hasActivity && analyticsUnlocked && analytics.firstOrderDate ? `Desde ${formatDate(analytics.firstOrderDate)}` : undefined}
          accent="border-emerald-200/60 dark:border-emerald-900/40"
        />
        <StatCard
          icon={<Hash className="h-4 w-4 text-blue-600" />}
          label="Pedidos"
          value={String(totalOrders || orders.length)}
          sub={analytics.deliveredCount > 0 ? `${analytics.deliveredCount} entregados` : undefined}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-violet-600" />}
          label="Ticket medio"
          value={computed ? formatEuro(computed.avgTicket) : '—'}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4 text-amber-600" />}
          label="Último pedido"
          value={computed?.lastPurchase ? formatDate(computed.lastPurchase) : '—'}
          sub={analyticsUnlocked && analytics.avgDaysBetween != null ? `Cada ~${Math.round(analytics.avgDaysBetween)} días` : undefined}
        />
      </div>

      {/* Mini stats secundarias */}
      {hasActivity && analyticsUnlocked && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="Artículos pedidos" value={String(analytics.totalItems)} />
          <MiniStat
            label="Tienda favorita"
            value={analytics.favoriteStore || '—'}
          />
          <MiniStat
            label="Canal principal"
            value={analytics.favoriteChannel ? (CHANNEL_LABELS[analytics.favoriteChannel] || analytics.favoriteChannel) : '—'}
          />
          <MiniStat
            label="Promos activas"
            value={String(activePromotionsCount)}
          />
        </div>
      )}

      {/* Analíticas */}
      {hasActivity && !analyticsUnlocked && <AnalyticsUpgradeTeaser />}
      {hasActivity && analyticsUnlocked && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gasto mensual */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Gasto mensual</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Últimos 6 meses</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 h-36">
              {analytics.monthlyChart.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">
                    {m.amount > 0 ? `${Math.round(m.amount)}€` : ''}
                  </span>
                  <div
                    className="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-emerald-600 to-teal-400 transition-all"
                    style={{ height: `${Math.max(8, (m.amount / analytics.maxMonthly) * 100)}%`, minHeight: m.amount > 0 ? '8px' : '4px' }}
                    title={`${m.label}: ${formatEuro(m.amount)}`}
                  />
                  <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top productos */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-orange-600" />
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Lo que más pide</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Top productos por cantidad</p>
              </div>
            </div>
            {analytics.topProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">Sin datos de productos aún</p>
            ) : (
              <div className="space-y-3">
                {analytics.topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.qty} uds · {formatEuro(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tipo de pedido */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Tipo de pedido</h3>
            </div>
            <div className="space-y-4">
              {analytics.typeBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">Sin datos</p>
              ) : analytics.typeBreakdown.map((t) => (
                <BreakdownBar
                  key={t.key}
                  label={t.label}
                  pct={t.pct}
                  detail={`${t.count} pedidos · ${t.pct}% · ${formatEuro(t.revenue)}`}
                />
              ))}
            </div>
          </div>

          {/* Canales */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <Store className="h-5 w-5 text-violet-600" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Canales de pedido</h3>
            </div>
            <div className="space-y-4">
              {analytics.channelBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">Sin datos</p>
              ) : analytics.channelBreakdown.map((c) => (
                <BreakdownBar
                  key={c.key}
                  label={c.label}
                  pct={c.pct}
                  detail={`${c.count} pedidos · ${c.pct}%`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pedidos recientes + contacto */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Últimos pedidos</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Historial reciente</p>
              </div>
              {hasActivity && (
                <button
                  type="button"
                  onClick={onGoToPedidos}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  Ver todos →
                </button>
              )}
            </div>
            {!hasActivity ? (
              <div className="px-5 py-12 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="font-medium text-gray-700 dark:text-gray-300">Sin pedidos todavía</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Cuando este cliente pida por TPV o delivery, aparecerá aquí con estadísticas automáticas.
                </p>
                <button
                  type="button"
                  onClick={onNewOrder}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Crear primer pedido
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentOrders.map((order) => {
                  const itemsPreview = formatOrderItemsPreview(order.items);
                  return (
                  <div key={order._id} className="px-5 py-4">
                    <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900">
                      {order.deliveryType === 'domicilio'
                        ? <Truck className="h-4 w-4 text-indigo-600" />
                        : order.deliveryType === 'recogida'
                          ? <Store className="h-4 w-4 text-violet-600" />
                          : <ShoppingBag className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          #{order.orderNumber || order._id.slice(-6)}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(order.createdAt, true)}
                        {order.salesPointName ? ` · ${order.salesPointName}` : ''}
                        {!itemsPreview && order.items?.length
                          ? ` · ${order.items.length} artículo${order.items.length !== 1 ? 's' : ''}`
                          : ''}
                      </p>
                      {itemsPreview ? (
                        <p className="mt-1.5 text-xs leading-relaxed text-gray-700 dark:text-gray-300 line-clamp-2">
                          {itemsPreview}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-gray-900 dark:text-gray-100">{formatEuro(Number(order.totalAmount || 0))}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {DELIVERY_TYPE_LABELS[order.deliveryType] || order.deliveryType}
                      </p>
                    </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-bold text-gray-900 dark:text-gray-100">Datos de contacto</h3>
            <div className="space-y-3 text-sm">
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-gray-700 hover:text-emerald-600 dark:text-gray-300">
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-gray-700 hover:text-emerald-600 dark:text-gray-300">
                  <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{client.email}</span>
                </a>
              )}
              {(client.address || client.city) && (
                <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span>{[client.address, client.postalCode, client.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {client.createdAt && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  Cliente desde {formatDate(client.createdAt)}
                </div>
              )}
            </div>
          </div>
          {client.notes ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <h3 className="mb-2 text-sm font-bold text-amber-900 dark:text-amber-100">Notas internas</h3>
              <p className="whitespace-pre-wrap text-sm text-amber-900/90 dark:text-amber-200/90">{client.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface DeliveryClientPedidosTabProps {
  orders: DeliveryOrder[];
  loading: boolean;
  search: string;
  onNewOrder: () => void;
  canExpandDetalle?: boolean;
  maxOrdersVisible?: number;
  totalOrdersCount?: number;
}

function OrderRow({ order, canExpandDetalle }: { order: DeliveryOrder; canExpandDetalle: boolean }) {
  const [open, setOpen] = useState(false);
  const typeLabel = DELIVERY_TYPE_LABELS[order.deliveryType] || order.deliveryType;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => canExpandDetalle && setOpen((v) => !v)}
        className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${canExpandDetalle ? 'hover:bg-gray-50 dark:hover:bg-gray-900/50' : 'cursor-default'}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900">
          {canExpandDetalle
            ? (open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />)
            : <Lock className="h-4 w-4 text-gray-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-gray-100">#{order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {typeLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {formatDate(order.createdAt, true)}
            {order.salesPointName ? ` · ${order.salesPointName}` : ''}
            {order.channel ? ` · ${CHANNEL_LABELS[order.channel] || order.channel}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatEuro(Number(order.totalAmount || 0))}</p>
          <p className="text-xs text-gray-500">{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus || '—'}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/30">
          {order.customerAddress && order.deliveryType === 'domicilio' && (
            <p className="mb-3 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              {order.customerAddress}
            </p>
          )}
          <div className="space-y-2">
            {(order.items || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-800 dark:text-gray-200">
                  <span className="font-semibold">{item.quantity}×</span> {item.name}
                  {item.extras?.length ? (
                    <span className="ml-1 text-xs text-gray-500">(+{item.extras.join(', ')})</span>
                  ) : null}
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{formatEuro(Number(item.total || 0))}</span>
              </div>
            ))}
          </div>
          {order.notes ? (
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Nota: {order.notes}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function DeliveryClientPedidosTab({
  orders,
  loading,
  search,
  onNewOrder,
  canExpandDetalle = true,
  maxOrdersVisible,
  totalOrdersCount,
}: DeliveryClientPedidosTabProps) {
  const visibleOrders = useMemo(() => {
    if (maxOrdersVisible == null || maxOrdersVisible === Infinity) return orders;
    return orders.slice(0, maxOrdersVisible);
  }, [orders, maxOrdersVisible]);

  const analytics = useMemo(() => computeDeliveryAnalytics(visibleOrders), [visibleOrders]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleOrders;
    return visibleOrders.filter((o) =>
      `${o.orderNumber} ${o.customerAddress} ${o.salesPointName} ${o.status}`.toLowerCase().includes(q),
    );
  }, [visibleOrders, search]);

  const hiddenOrdersCount = totalOrdersCount != null && maxOrdersVisible != null && maxOrdersVisible !== Infinity
    ? Math.max(0, totalOrdersCount - maxOrdersVisible)
    : 0;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hiddenOrdersCount > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-indigo-900 dark:text-indigo-200">
            Mostrando {visibleOrders.length} de {totalOrdersCount ?? orders.length} pedidos en plan Básico.
          </p>
          <Link
            to="/saas/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Ver planes
          </Link>
        </div>
      )}

      {!canExpandDetalle && orders.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          El detalle de líneas por pedido está disponible desde plan Normal.
        </p>
      )}

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="Total pedidos" value={String(totalOrdersCount ?? orders.length)} />
          <MiniStat label="Total gastado" value={formatEuro(analytics.totalSpent)} />
          <MiniStat label="Ticket medio" value={formatEuro(visibleOrders.length ? analytics.totalSpent / visibleOrders.length : 0)} />
          <MiniStat label="Entregados" value={String(analytics.deliveredCount)} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {search.trim()
            ? `${filtered.length} de ${orders.length} pedidos`
            : `${totalOrdersCount ?? orders.length} pedido${(totalOrdersCount ?? orders.length) !== 1 ? 's' : ''} en total`}
        </p>
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <ShoppingBag className="h-4 w-4" />
          Nuevo pedido
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-800">
          <Receipt className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-semibold text-gray-800 dark:text-gray-200">Este cliente aún no tiene pedidos</p>
          <p className="mt-1 text-sm text-gray-500">Los pedidos del TPV y delivery aparecerán aquí automáticamente.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500">Ningún pedido coincide con la búsqueda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderRow key={order._id} order={order} canExpandDetalle={canExpandDetalle} />
          ))}
        </div>
      )}
    </div>
  );
}
