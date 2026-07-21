import React from 'react';
import {
  Hash, Euro, Calendar, Tag, Gift, Star, Repeat, ShoppingBag, Clock,
  Phone, Mail, MapPin, Eye, Lock, Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { VertialBillingUpgradeLink } from '../VertialBillingUpgradeLink';

export type DeliveryListClientStats = {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
};

export type DeliveryListClientLoyalty = {
  enrolled?: boolean;
  points: number;
  level: string;
};

const LOYALTY_LABELS: Record<string, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  platinum: 'Platino',
};

const TIER_STYLES = {
  vip: { label: 'VIP', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200', icon: Star },
  frecuente: { label: 'Frecuente', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200', icon: Repeat },
  ocasional: { label: 'Ocasional', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200', icon: ShoppingBag },
  nuevo: { label: 'Nuevo', bg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200', icon: Clock },
  inactivo: { label: 'Inactivo', bg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: Clock },
};

function formatEuro(value: number) {
  if (value <= 0) return '—';
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function computeDeliveryListTier(stats: DeliveryListClientStats): keyof typeof TIER_STYLES {
  const { totalOrders, totalSpent, lastOrderDate } = stats;
  if (totalOrders === 0) return 'nuevo';
  if (lastOrderDate) {
    const daysSince = (Date.now() - new Date(lastOrderDate).getTime()) / 86400000;
    if (daysSince > 90) return 'inactivo';
  }
  if (totalOrders >= 10 || totalSpent >= 400) return 'vip';
  if (totalOrders >= 3) return 'frecuente';
  return 'ocasional';
}

export function ClientListTierBadge({ stats, show }: { stats: DeliveryListClientStats; show: boolean }) {
  if (!show) return null;
  const tier = computeDeliveryListTier(stats);
  const cfg = TIER_STYLES[tier];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export function ClientsListPlanBanner({
  planLabel,
  unlockedCount,
  lockedCount,
}: {
  planLabel: string;
  unlockedCount: number;
  lockedCount: number;
}) {
  const isFull = lockedCount <= 0;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${
      isFull
        ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-teal-950/30'
        : 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 dark:border-indigo-800 dark:from-indigo-950/40 dark:to-violet-950/30'
    }`}>
      <div className="flex flex-1 items-start gap-3 min-w-0">
        <Hash className={`mt-0.5 h-5 w-5 shrink-0 ${isFull ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
        <div>
          <p className={`text-sm font-bold ${isFull ? 'text-emerald-900 dark:text-emerald-100' : 'text-indigo-900 dark:text-indigo-100'}`}>
            Plan {planLabel} — {isFull ? 'listado completo' : 'listado limitado'}
          </p>
          <p className={`mt-1 text-xs ${isFull ? 'text-emerald-700/90 dark:text-emerald-300' : 'text-indigo-700/90 dark:text-indigo-300'}`}>
            {isFull
              ? `${unlockedCount} funciones activas (KPIs, etiquetas, segmentos, export…).`
              : `${unlockedCount} activa${unlockedCount !== 1 ? 's' : ''} · ${lockedCount} bloqueada${lockedCount !== 1 ? 's' : ''} en planes superiores.`}
          </p>
        </div>
      </div>
      {!isFull && (
        <VertialBillingUpgradeLink
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
          fallback={
            <span className="text-[11px] text-indigo-700/80 dark:text-indigo-300">
              En iOS no se cambian planes
            </span>
          }
        >
          Ver planes
        </VertialBillingUpgradeLink>
      )}
    </div>
  );
}

export function LockedColumnHint({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500" title={`Disponible en plan ${label}`}>
      <Lock className="h-3 w-3" />
      {label}
    </span>
  );
}

export function DeliveryClientNameCell({
  name,
  dni,
  phone,
  stats,
  showTier,
}: {
  name: string;
  dni: string;
  phone: string;
  stats: DeliveryListClientStats;
  showTier: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</p>
        <ClientListTierBadge stats={stats} show={showTier} />
      </div>
      <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{dni || phone || '—'}</p>
    </div>
  );
}

export function DeliveryClientContactCell({ phone, email }: { phone: string; email: string }) {
  return (
    <div className="space-y-1">
      {phone ? (
        <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-emerald-600 dark:text-gray-400">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span>{phone}</span>
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 dark:text-gray-400 min-w-0">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[180px]">{email}</span>
        </a>
      ) : null}
      {!phone && !email ? <span className="text-sm text-gray-400">—</span> : null}
    </div>
  );
}

export function DeliveryClientOrdersCell({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Hash className="h-3.5 w-3.5 text-blue-500" />
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{count || 0}</span>
    </div>
  );
}

export function DeliveryClientSpentCell({ amount }: { amount: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Euro className="h-3.5 w-3.5 text-emerald-600" />
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatEuro(amount)}</span>
    </div>
  );
}

export function DeliveryClientLastOrderCell({ date }: { date: string | null }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
      <Calendar className="h-3.5 w-3.5 text-amber-500" />
      {formatShortDate(date)}
    </div>
  );
}

export function DeliveryClientTagsCell({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return <span className="text-sm text-gray-400">—</span>;
  const visible = tags.slice(0, max);
  const rest = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
          <Tag className="h-2.5 w-2.5" />
          {tag}
        </span>
      ))}
      {rest > 0 ? <span className="text-[10px] text-gray-400">+{rest}</span> : null}
    </div>
  );
}

export function DeliveryClientLoyaltyCell({ loyalty }: { loyalty: DeliveryListClientLoyalty | null | undefined }) {
  if (!loyalty || (!loyalty.points && !loyalty.enrolled)) {
    return <span className="text-sm text-gray-400">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
      <Gift className="h-3 w-3" />
      {loyalty.points} pts · {LOYALTY_LABELS[loyalty.level] || loyalty.level}
    </span>
  );
}

export function DeliveryClientRowActions({
  onView,
  onNewOrder,
  onDelete,
  alwaysVisible = false,
  deleting = false,
}: {
  onView: () => void;
  onNewOrder: () => void;
  onDelete?: () => void;
  alwaysVisible?: boolean;
  deleting?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 ${alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNewOrder(); }}
        className="rounded-lg p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
        title="Nuevo pedido"
      >
        <ShoppingBag className="h-4 w-4 text-emerald-600" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onView(); }}
        className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Ver ficha"
      >
        <Eye className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={deleting}
          className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
          title="Eliminar cliente"
        >
          <Trash2 className={`h-4 w-4 text-red-500 ${deleting ? 'animate-spin' : ''}`} />
        </button>
      ) : null}
    </div>
  );
}

export function DeliveryClientCardExtras({
  stats,
  tags,
  loyalty,
  showStats,
  showTags,
  showLoyalty,
  showTier,
}: {
  stats: DeliveryListClientStats;
  tags: string[];
  loyalty: DeliveryListClientLoyalty | null | undefined;
  showStats: boolean;
  showTags: boolean;
  showLoyalty: boolean;
  showTier: boolean;
}) {
  return (
    <div className="space-y-2">
      {showTier && (
        <div className="flex flex-wrap items-center gap-2">
          <ClientListTierBadge stats={stats} show />
        </div>
      )}
      {showStats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-gray-900/50">
            <p className="text-[10px] font-semibold uppercase text-gray-400">Pedidos</p>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{stats.totalOrders || 0}</p>
          </div>
          <div className="rounded-xl bg-emerald-50/80 px-2.5 py-2 dark:bg-emerald-950/30">
            <p className="text-[10px] font-semibold uppercase text-emerald-700/70 dark:text-emerald-300/70">Gastado</p>
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{formatEuro(stats.totalSpent)}</p>
          </div>
          <div className="rounded-xl bg-amber-50/80 px-2.5 py-2 dark:bg-amber-950/30">
            <p className="text-[10px] font-semibold uppercase text-amber-700/70 dark:text-amber-300/70">Último</p>
            <p className="text-xs font-bold text-amber-900 dark:text-amber-100">{formatShortDate(stats.lastOrderDate)}</p>
          </div>
        </div>
      )}
      {!showStats && stats.totalOrders > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <Hash className="h-3.5 w-3.5" />
          {stats.totalOrders} pedido{stats.totalOrders !== 1 ? 's' : ''}
        </div>
      )}
      {(showTags && tags.length > 0) || (showLoyalty && loyalty?.points) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {showTags && tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">
              {tag}
            </span>
          ))}
          {showLoyalty && loyalty?.points ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">
              {loyalty.points} pts
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function getClientDeliveryStats(client: {
  stats?: { totalOrders?: number; totalSpent?: number; lastOrderDate?: string | null };
}): DeliveryListClientStats {
  return {
    totalOrders: Number(client.stats?.totalOrders || 0),
    totalSpent: Number(client.stats?.totalSpent || 0),
    lastOrderDate: client.stats?.lastOrderDate || null,
  };
}
