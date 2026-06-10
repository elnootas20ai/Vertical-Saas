import type { ReactNode, ComponentType } from 'react';
import type { AlertHistoryEntry, AlertPriority, AlertRecord, AlertSource, AlertSummary } from '../../lib/alertCenterApi';
import { SOURCE_LABELS, SOURCE_COLORS, PRIORITY_LABELS, countAlertsForDepartment, formatHistoryEntry, HISTORY_ACTION_LABELS } from '../../lib/alertCenterApi';
import type { BusinessAlertDepartment } from '../../lib/alertDepartments';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight, Clock, Crown, History, Inbox, Settings2 } from 'lucide-react';

/** Gradiente premium Plan PRO — violeta → púrpura → dorado */
export const PRO_PLAN_GRADIENT = 'bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500';
export const PRO_PLAN_GRADIENT_HOVER = 'hover:from-violet-700 hover:via-purple-700 hover:to-amber-600';
export const PRO_PLAN_GRADIENT_TEXT = 'bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 bg-clip-text text-transparent';
export const PRO_PLAN_RING = 'ring-violet-500/40 shadow-violet-500/20';
export const PRO_PLAN_CARD_OPEN = 'border-violet-300/80 bg-gradient-to-br from-violet-50/90 via-purple-50/40 to-amber-50/50 shadow-md shadow-violet-500/15 ring-2 ring-violet-400/35 dark:from-violet-950/40 dark:via-purple-950/25 dark:to-amber-950/15 dark:border-violet-700/60';

export function ProPlanBadge({
  size = 'sm',
  className = '',
  label = 'PRO',
  showIcon = true,
}: {
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
  showIcon?: boolean;
}) {
  const sizeClasses = size === 'sm'
    ? 'gap-1 px-2 py-0.5 text-[10px]'
    : 'gap-1.5 px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide text-white shadow-sm shadow-violet-500/30 ${PRO_PLAN_GRADIENT} ${sizeClasses} ${className}`}
    >
      {showIcon && <Crown className={iconSize} />}
      {label}
    </span>
  );
}

export const PRIORITY_ACCENT: Record<AlertPriority, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-sky-500',
};

export const PRIORITY_GLOW: Record<AlertPriority, string> = {
  high: 'shadow-[inset_3px_0_0_0_rgb(239_68_68)]',
  medium: 'shadow-[inset_3px_0_0_0_rgb(245_158_11)]',
  low: 'shadow-[inset_3px_0_0_0_rgb(14_165_233)]',
};

/** Cabecera ejecutiva oscura — drawer y página */
export function AlertProShell({
  title,
  subtitle,
  badge,
  actions,
  kpis,
  compact,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  kpis?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`relative shrink-0 overflow-hidden bg-zinc-950 text-white ${compact ? '' : 'rounded-t-2xl'}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.07) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/80 to-transparent" />
      <div className={`relative ${compact ? 'px-5 py-4' : 'px-6 py-5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`font-bold tracking-tight text-white ${compact ? 'text-lg' : 'text-2xl sm:text-3xl'}`}>
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p className={`mt-1 text-zinc-400 ${compact ? 'text-xs' : 'text-sm'}`}>{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </div>
        {kpis && <div className="mt-4">{kpis}</div>}
      </div>
    </div>
  );
}

export function AlertProKpiStrip({
  unresolved,
  high,
  medium,
  newCount,
  compact,
}: {
  unresolved: number;
  high: number;
  medium?: number;
  newCount: number;
  compact?: boolean;
}) {
  const items = [
    { label: 'Pendientes', value: unresolved, warn: unresolved > 0 },
    { label: 'Críticas', value: high, warn: high > 0 },
    ...(medium !== undefined ? [{ label: 'Medias', value: medium, warn: medium > 0 }] : []),
    { label: 'Nuevas', value: newCount, warn: newCount > 0 },
  ];

  return (
    <div className={`grid gap-px overflow-hidden rounded-xl bg-zinc-800/80 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {items.slice(0, compact ? 3 : items.length).map((item) => (
        <div key={item.label} className="bg-zinc-900/90 px-3 py-2.5 sm:px-4 sm:py-3">
          <p className={`font-bold tabular-nums tracking-tight ${compact ? 'text-xl' : 'text-2xl'} ${item.warn ? 'text-white' : 'text-zinc-500'}`}>
            {item.value}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function AlertProDeptTabs({
  summary,
  activeId,
  onChange,
  icons: IconMap,
  compact,
  departments,
  vertical,
}: {
  summary: AlertSummary | null;
  activeId: string;
  onChange: (id: string) => void;
  icons: Record<string, ComponentType<{ className?: string }>>;
  compact?: boolean;
  departments: BusinessAlertDepartment[];
  vertical?: string | null;
}) {
  return (
    <div className={`shrink-0 ${compact ? 'px-3 py-3' : 'px-1 py-4'} bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-200/80 dark:border-zinc-800`}>
      <div className={`flex gap-1 overflow-x-auto ${compact ? '' : 'rounded-xl bg-white dark:bg-zinc-900 p-1 shadow-sm border border-zinc-200/80 dark:border-zinc-800 max-w-fit'}`}>
        {departments.map((dept) => {
          const Icon = IconMap[dept.id];
          const count = countAlertsForDepartment(summary, dept.id, vertical);
          const active = activeId === dept.id;
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => onChange(dept.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold transition-all ${
                compact
                  ? `px-3 py-1.5 rounded-lg text-xs border ${active ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900' : 'bg-white dark:bg-zinc-800 text-zinc-600 border-zinc-200 dark:border-zinc-700'}`
                  : `px-4 py-2 rounded-lg text-sm ${active ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
              {dept.label}
              {count > 0 && (
                <span className={`ml-0.5 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                  active ? 'bg-white/15 text-white dark:bg-zinc-900/15 dark:text-zinc-900' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AlertProRow({
  alert,
  onClick,
  showArrow = true,
}: {
  alert: AlertRecord;
  onClick?: () => void;
  showArrow?: boolean;
}) {
  const sourceColor = SOURCE_COLORS[alert.source as AlertSource] || '#71717a';
  const accent = PRIORITY_ACCENT[alert.priority] || PRIORITY_ACCENT.medium;
  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: es });
    } catch {
      return '';
    }
  })();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`group w-full text-left rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4 pl-3.5 transition-all hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-700 border-l-[3px] ${accent} ${
        alert.status === 'new' ? 'ring-1 ring-amber-500/20' : ''
      } ${alert.status === 'resolved' ? 'opacity-55' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${sourceColor}14` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sourceColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{alert.title}</p>
            {alert.status === 'new' && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Nueva
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 line-clamp-2">{alert.message}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="font-medium text-zinc-500">{PRIORITY_LABELS[alert.priority]}</span>
            <span className="font-medium" style={{ color: sourceColor }}>
              {SOURCE_LABELS[alert.source as AlertSource] || alert.source}
            </span>
            <span className="ml-auto flex items-center gap-1 text-zinc-400">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          </div>
        </div>
        {showArrow && (
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
        )}
      </div>
    </button>
  );
}

export function AlertProIconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function AlertProEmpty({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
        <span className="text-2xl">✓</span>
      </div>
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Todo bajo control</p>
      <p className="mt-1 text-sm text-zinc-500">{label || 'No hay alertas que requieran acción ahora mismo'}</p>
    </div>
  );
}

export type AlertCenterPageTab = 'inbox' | 'history' | 'settings';

export function AlertProCenterTabs({
  activeId,
  onChange,
  inboxCount,
  historyCount,
}: {
  activeId: AlertCenterPageTab;
  onChange: (id: AlertCenterPageTab) => void;
  inboxCount?: number;
  historyCount?: number;
}) {
  const tabs: { id: AlertCenterPageTab; label: string; icon: typeof Inbox; count?: number; highlight?: boolean }[] = [
    { id: 'inbox', label: 'Bandeja', icon: Inbox, count: inboxCount },
    { id: 'history', label: 'Historial', icon: History, count: historyCount },
    { id: 'settings', label: 'Ajustes', icon: Settings2, highlight: true },
  ];

  return (
    <div className="shrink-0 border-b border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? tab.id === 'settings'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25'
                      : 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                    : tab.highlight
                      ? 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {(tab.count ?? 0) > 0 && tab.id !== 'settings' && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    active ? 'bg-white/15 dark:bg-zinc-900/15' : 'bg-zinc-200 dark:bg-zinc-800'
                  }`}>
                    {tab.count! > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {activeId === 'settings' && (
          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
            Configura las alertas de tu negocio
          </span>
        )}
      </div>
    </div>
  );
}

export function AlertProViewTabs({
  activeId,
  onChange,
  activeCount,
  historyCount,
}: {
  activeId: 'active' | 'history';
  onChange: (id: 'active' | 'history') => void;
  activeCount?: number;
  historyCount?: number;
}) {
  const tabs = [
    { id: 'active' as const, label: 'Activas', icon: Inbox, count: activeCount },
    { id: 'history' as const, label: 'Historial', icon: History, count: historyCount },
  ];

  return (
    <div className="shrink-0 border-b border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {(tab.count ?? 0) > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-white/15 dark:bg-zinc-900/15' : 'bg-zinc-200 dark:bg-zinc-800'
                }`}>
                  {tab.count! > 99 ? '99+' : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AlertHistoryTimeline({
  entries,
  compact,
}: {
  entries: AlertHistoryEntry[];
  compact?: boolean;
}) {
  if (!entries.length) {
    return <p className="text-xs text-zinc-500">Sin eventos registrados</p>;
  }

  return (
    <ol className={`relative ${compact ? 'space-y-2' : 'space-y-3'}`}>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1;
        let when = entry.at;
        try {
          when = format(new Date(entry.at), compact ? 'dd MMM · HH:mm' : 'dd MMM yyyy · HH:mm', { locale: es });
        } catch { /* keep raw */ }

        return (
          <li key={`${entry.action}-${entry.at}-${idx}`} className="relative flex gap-3 pl-1">
            {!isLast && (
              <span className="absolute left-[7px] top-5 h-[calc(100%-0.25rem)] w-px bg-zinc-200 dark:bg-zinc-700" />
            )}
            <span className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
              entry.action === 'deleted' ? 'bg-red-500'
                : entry.action === 'created' ? 'bg-sky-500'
                  : entry.to === 'resolved' ? 'bg-emerald-500'
                    : 'bg-amber-500'
            }`} />
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {formatHistoryEntry(entry)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {HISTORY_ACTION_LABELS[entry.action]} · {when}
                {entry.by ? ` · ${entry.by}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AlertProPageKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'danger' | 'warn' | 'ok';
}) {
  const valueCls = {
    neutral: 'text-zinc-900 dark:text-white',
    danger: 'text-red-600 dark:text-red-400',
    warn: 'text-amber-600 dark:text-amber-400',
    ok: 'text-emerald-600 dark:text-emerald-400',
  }[tone || 'neutral'];

  return (
    <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className={`text-3xl font-bold tabular-nums tracking-tight ${valueCls}`}>{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}
