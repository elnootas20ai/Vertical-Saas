import { MonitorSmartphone, Building2, LayoutGrid, Users, Clock } from 'lucide-react';
import type { RestaurantSummary } from '../../../../lib/salaStudioTypes';

type Props = {
  summary: RestaurantSummary;
  lastModified: string | null;
  onOpenTpv: () => void;
};

export function SalaSummaryPanel({ summary, lastModified, onOpenTpv }: Props) {
  const formattedDate = lastModified
    ? new Date(lastModified).toLocaleString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-200/80 px-5 py-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Resumen</h2>
        <p className="mt-0.5 text-xs text-gray-500">Tu restaurante</p>
      </div>

      <div className="flex-1 space-y-3 p-4">
        <SummaryRow icon={Building2} label="Total salas" value={summary.roomCount} />
        <SummaryRow icon={LayoutGrid} label="Total mesas" value={summary.tableCount} />
        <SummaryRow icon={Users} label="Capacidad total" value={`${summary.capacity} pers.`} />
        <SummaryRow icon={Clock} label="Última modificación" value={formattedDate} small />
      </div>

      <div className="border-t border-gray-200/80 p-4 dark:border-gray-800">
        <button
          type="button"
          onClick={onOpenTpv}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          <MonitorSmartphone className="h-4 w-4" />
          Abrir TPV
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          Abre el terminal de la sala activa en el TPV
        </p>
      </div>
    </aside>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="rounded-lg bg-white p-2 shadow-sm dark:bg-gray-800">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`mt-0.5 font-semibold text-gray-900 dark:text-gray-100 ${small ? 'text-xs' : 'text-lg tabular-nums'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
