import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { listDiningTablesRequest, type DiningTable } from '../../../lib/salaApi';
import { findOpenDiningOrderForTable } from '../../../lib/restaurantDiningTpv';
import { toastActionError } from '../../../lib/userFacingError';

type Props = {
  userId: string;
  currentTableId: string;
  onSelect: (table: DiningTable) => void;
  onClose: () => void;
  title?: string;
};

export function RestaurantChangeTableModal({ userId, currentTableId, onSelect, onClose, title = 'Cambiar mesa' }: Props) {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await listDiningTablesRequest(userId);
        if (!cancelled) setTables(rows.filter((t) => t.active !== false && t.visible !== false));
      } catch {
        if (!cancelled) setTables([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const candidates = useMemo(
    () => tables
      .filter((t) => t._id !== currentTableId)
      .filter((t) => t.status === 'available' || t.status === 'reserved')
      .sort((a, b) => a.number - b.number),
    [tables, currentTableId],
  );

  const handlePick = async (table: DiningTable) => {
    if (busyId) return;
    if (!['available', 'reserved'].includes(table.status)) return;
    setBusyId(table._id);
    try {
      const open = await findOpenDiningOrderForTable(userId, table._id);
      if (open) {
        throw new Error(`Mesa ${table.number} ya tiene cuenta abierta`);
      }
      onSelect(table);
    } catch (err: unknown) {
      toastActionError(err, 'elegir_mesa', 'No se pudo cambiar de mesa');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando mesas…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No hay mesas libres</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((table) => (
                <button
                  key={table._id}
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => void handlePick(table)}
                  className="min-h-[56px] rounded-xl border-2 border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-800 transition-colors touch-manipulation hover:border-emerald-400 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                >
                  {table.number}
                  {table.zone ? (
                    <span className="block truncate px-1 text-[10px] font-normal opacity-70">{table.zone}</span>
                  ) : null}
                  {table.status === 'reserved' ? (
                    <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-300">Reservada</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
