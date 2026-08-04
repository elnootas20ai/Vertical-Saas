import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { listDiningOrdersRequest, listDiningTablesRequest, type DiningTable } from '../../../lib/salaApi';
import { diningOrderDueAmount } from '../../../lib/restaurantDiningTpv';
import { toastActionError } from '../../../lib/userFacingError';

function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type Props = {
  userId: string;
  currentTableId: string;
  currentOrderId: string;
  onSelect: (sourceOrderId: string, sourceTable: DiningTable) => void;
  onClose: () => void;
};

/** Une otra mesa con cuenta abierta hacia la mesa actual. */
export function RestaurantMergeTableModal({
  userId,
  currentTableId,
  currentOrderId,
  onSelect,
  onClose,
}: Props) {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [orderByTable, setOrderByTable] = useState<Map<string, { orderId: string; due: number }>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [rows, orders] = await Promise.all([
          listDiningTablesRequest(userId),
          listDiningOrdersRequest(userId),
        ]);
        if (cancelled) return;
        const open = new Map<string, { orderId: string; due: number }>();
        for (const o of orders) {
          if (!o._id || o._id === currentOrderId) continue;
          // Backend mergeOrders: open | served | pending_payment
          if (!['open', 'served', 'pending_payment'].includes(String(o.status || ''))) continue;
          const tid = String(o.tableId || '').trim();
          if (!tid || tid === currentTableId) continue;
          open.set(tid, { orderId: o._id, due: diningOrderDueAmount(o) });
        }
        setOrderByTable(open);
        setTables(rows.filter((t) => t.active !== false && t.visible !== false && open.has(t._id)));
      } catch {
        if (!cancelled) {
          setTables([]);
          setOrderByTable(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, currentTableId, currentOrderId]);

  const candidates = useMemo(
    () => [...tables].sort((a, b) => a.number - b.number),
    [tables],
  );

  const handlePick = (table: DiningTable) => {
    if (busyId) return;
    const info = orderByTable.get(table._id);
    if (!info) return;
    setBusyId(table._id);
    try {
      onSelect(info.orderId, table);
    } catch (err: unknown) {
      toastActionError(err, 'unir_mesa', 'No se pudo unir la mesa');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Unir mesa</h3>
            <p className="text-xs text-gray-500">Trae la cuenta de otra mesa a esta</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Cargando mesas…</p>
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No hay otras mesas con cuenta abierta</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((table) => {
                const info = orderByTable.get(table._id);
                return (
                  <button
                    key={table._id}
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => handlePick(table)}
                    className="min-h-[64px] rounded-xl border-2 border-violet-200 bg-violet-50 text-sm font-bold text-violet-900 transition-colors touch-manipulation hover:border-violet-400 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100"
                  >
                    {table.number}
                    {info ? (
                      <span className="block px-1 text-[10px] font-semibold tabular-nums opacity-80">
                        {formatEuro(info.due)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
