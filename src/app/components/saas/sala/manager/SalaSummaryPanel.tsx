import { Building2, LayoutGrid, Users, Clock } from 'lucide-react';
import type { RestaurantSummary } from '../../../../lib/salaStudioTypes';
import type { SalaTpvDisplay } from '../../../../lib/salaStoreTpv';
import { SalaManagerStat } from './SalaManagerStat';
import { SalaTpvStatusBlock } from './SalaTpvStatusBlock';

type Props = {
  summary: RestaurantSummary;
  lastModified: string | null;
  storeTpv: SalaTpvDisplay | null;
};

export function SalaSummaryPanel({ summary, lastModified, storeTpv }: Props) {
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

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <SalaManagerStat icon={Building2} label="Total salas" value={summary.roomCount} />
        <SalaManagerStat icon={LayoutGrid} label="Total mesas" value={summary.tableCount} />
        <SalaManagerStat icon={Users} label="Capacidad total" value={`${summary.capacity} pers.`} />
        <SalaManagerStat icon={Clock} label="Última modificación" value={formattedDate} compact />
      </div>

      {storeTpv?.terminalCode ? (
        <div className="border-t border-gray-200/80 p-4 dark:border-gray-800">
          <SalaTpvStatusBlock tpv={storeTpv} variant="minimal" />
        </div>
      ) : null}
    </aside>
  );
}
