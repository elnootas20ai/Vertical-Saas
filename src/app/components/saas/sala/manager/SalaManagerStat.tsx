import type { LucideIcon } from 'lucide-react';

type Props = {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  compact?: boolean;
};

/** Stat card compartida entre las tres columnas del gestor de sala. */
export function SalaManagerStat({ label, value, icon: Icon, compact }: Props) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex items-start gap-2.5">
        {Icon ? (
          <div className="rounded-lg bg-white p-1.5 shadow-sm dark:bg-gray-800">
            <Icon className="h-3.5 w-3.5 text-gray-500" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p
            className={`mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
