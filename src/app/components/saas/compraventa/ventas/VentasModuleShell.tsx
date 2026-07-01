import { useMemo, useState } from 'react';
import { VentasListPanel } from './VentasListPanel';
import { VentasDetailPanel } from './VentasDetailPanel';
import { VentasNewSaleButton } from './VentasDetailActionBar';
import type { VentaListItem } from './ventasListData';

export function VentasModuleShell() {
  const [sales] = useState<VentaListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedId) ?? null,
    [sales, selectedId],
  );

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Ventas
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reservas, ventas y entregas de vehículos
          </p>
        </div>
        <VentasNewSaleButton />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <VentasListPanel
          sales={sales}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <VentasDetailPanel sale={selectedSale} />
      </div>
    </div>
  );
}
