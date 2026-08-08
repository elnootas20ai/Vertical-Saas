import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Search } from 'lucide-react';

export type SaasTabStatTone = 'default' | 'amber' | 'emerald' | 'red' | 'indigo';

export type SaasTabStat = {
  label: string;
  value: string | number;
  tone?: SaasTabStatTone;
};

const statToneClass: Record<SaasTabStatTone, string> = {
  default: 'text-gray-900 dark:text-gray-100',
  amber: 'text-amber-700 dark:text-amber-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  red: 'text-red-700 dark:text-red-400',
  indigo: 'text-indigo-700 dark:text-indigo-400',
};

/** Contenedor unificado para el contenido de cada pestaña del SaaS (catálogo, ingredientes, etc.). */
export function SaasTabWorkspace({
  stats,
  statsTrailing,
  toolbar,
  banner,
  children,
}: {
  stats?: SaasTabStat[];
  statsTrailing?: ReactNode;
  toolbar?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const hasStats = (stats && stats.length > 0) || statsTrailing;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      {hasStats ? (
        <div className="flex flex-wrap items-center gap-y-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 rounded-t-xl">
          <div className="flex flex-wrap items-center gap-y-1.5 divide-x divide-gray-200/80 dark:divide-gray-700">
            {stats?.map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5 px-3 first:pl-0">
                <span className={`text-sm font-bold tabular-nums ${statToneClass[s.tone || 'default']}`}>
                  {s.value}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          {statsTrailing ? <div className="ml-auto flex flex-wrap items-center gap-2">{statsTrailing}</div> : null}
        </div>
      ) : null}
      {banner ? (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs">{banner}</div>
      ) : null}
      {toolbar ? (
        <div className="relative z-20 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 space-y-2 overflow-visible">
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-b-xl">{children}</div>
    </div>
  );
}

export function SaasTabSearch({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className || 'relative w-full sm:w-52'}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      />
    </div>
  );
}

export function SaasTabToolbarRow({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">{left}</div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end shrink-0">{right}</div>
    </div>
  );
}

export function SaasTabPrimaryButton({
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export function SaasTabSecondaryButton({
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export function SaasTabDataTable({ children, minWidth }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}

export function SaasTabEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 px-4">
      <div className="mb-2 opacity-35">{icon}</div>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      {description ? <p className="text-xs mt-0.5 text-center max-w-sm">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
