import { useMemo, useState } from 'react';
import { EntregasListPanel } from './EntregasListPanel';
import { EntregasDetailPanel } from './EntregasDetailPanel';
import { EntregasDetailActionBar } from './EntregasDetailActionBar';
import type { EntregaListItem } from './entregasListData';

export function EntregasModuleShell() {
  const [entregas] = useState<EntregaListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEntrega = useMemo(
    () => entregas.find((e) => e.id === selectedId) ?? null,
    [entregas, selectedId],
  );

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="shrink-0 border-b border-gray-200/80 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Entregas
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Último paso del ciclo: entrega del vehículo al cliente
            </p>
          </div>
        </div>
        {selectedEntrega ? (
          <EntregasDetailActionBar showActions />
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <EntregasListPanel
          entregas={entregas}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <EntregasDetailPanel entrega={selectedEntrega} />
      </div>
    </div>
  );
}
