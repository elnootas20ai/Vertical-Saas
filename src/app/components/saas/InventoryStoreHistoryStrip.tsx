/**
 * Almacén: selector de tiendas + historial.
 * Al abrir el panel, carga sola (con debounce) — sin botón Recargar.
 */
import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, Store, X } from 'lucide-react';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import {
  getMovementsByWarehouseRequest,
  stockMovementUserMessage,
  type StockMovement,
} from '../../lib/stockMovementApi';
import { movementTypeLabel } from '../../lib/inventoryUtils';
import { storeWarehouseDisplayName } from '../../lib/warehouseStockQty';
import { VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

const HISTORY_LIMIT = 40;
/** Carga despacio al entrar / cambiar tienda: no dispara la API al instante. */
const LOAD_DEBOUNCE_MS = 450;

function formatMovementWhen(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function qtySign(movement: StockMovement): string {
  const q = Number(movement.quantity || 0);
  const t = String(movement.movementType || '');
  const out =
    t === 'sale'
    || t === 'adjustment_out'
    || t === 'internal_consumption'
    || t === 'transfer_out'
    || t === 'return_supplier'
    || t === 'recipe_consumption'
    || t === 'waste';
  if (out) return `−${Math.abs(q)}`;
  if (q === 0) return '0';
  return `+${Math.abs(q)}`;
}

/** Botón visible (fila de pestañas): abre/cierra el historial de la tienda. */
export function InventoryStoreHistoryButton({
  open,
  onOpenChange,
  stale = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stale?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
      aria-label={open ? 'Cerrar historial de esta tienda' : 'Ver historial de esta tienda'}
      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 h-[50px] px-3 py-1.5 text-xs rounded-xl shadow-none inline-flex items-center gap-1.5 shrink-0 ${
        open
          ? '!bg-blue-50 !border-blue-300 !text-[var(--v-blue,#2563eb)] dark:!bg-blue-950/40 dark:!border-blue-700 dark:!text-blue-300'
          : ''
      }`}
    >
      <Clock3 className="w-4 h-4 shrink-0" />
      <span className="font-semibold whitespace-nowrap">
        {open ? 'Cerrar historial' : 'Historial'}
      </span>
      {stale && !open ? (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Hay cambios nuevos" />
      ) : null}
    </button>
  );
}

type InventoryStoreHistoryStripProps = {
  dataUserId: string;
  storeWarehouseId: string;
  /** Tras una entrada/salida: si el panel está abierto, vuelve a cargar despacio. */
  refreshToken?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaleChange?: (stale: boolean) => void;
};

export function InventoryStoreHistoryStrip({
  dataUserId,
  storeWarehouseId,
  refreshToken = 0,
  open,
  onOpenChange,
  onStaleChange,
}: InventoryStoreHistoryStripProps) {
  const { pointsOfSale, activeSalesPointId, setActiveSalesPoint } = useActiveStoreScope();
  const stores = (pointsOfSale || []).filter((p) => p && !p.deletedAt && p.active !== false);

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const genRef = useRef(0);

  useEffect(() => {
    onStaleChange?.(false);
  }, [onStaleChange]);

  // Hook de carga: solo con el panel abierto; debounce para no frenar la UI.
  useEffect(() => {
    const uid = String(dataUserId || '').trim();
    const wh = String(storeWarehouseId || '').trim();

    if (!open) {
      setLoading(false);
      return;
    }
    if (!uid || !wh) {
      setMovements([]);
      setLoaded(false);
      setError('');
      setLoading(false);
      return;
    }

    const gen = ++genRef.current;
    setLoading(true);
    setError('');

    const timer = window.setTimeout(() => {
      void getMovementsByWarehouseRequest(uid, wh, HISTORY_LIMIT)
        .then((list) => {
          if (gen !== genRef.current) return;
          setMovements(Array.isArray(list) ? list : []);
          setError('');
          setLoaded(true);
        })
        .catch((err) => {
          if (gen !== genRef.current) return;
          setMovements([]);
          setLoaded(false);
          setError(stockMovementUserMessage(err));
        })
        .finally(() => {
          if (gen !== genRef.current) return;
          setLoading(false);
        });
    }, LOAD_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, dataUserId, storeWarehouseId, refreshToken]);

  return (
    <div className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40">
      {stores.length > 0 ? (
        <div className="px-3 pt-3 pb-2 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />
            Tiendas
          </p>
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {stores.map((store) => {
              const id = String(store._id || '').trim();
              const active = id === String(activeSalesPointId || '').trim();
              const label = storeWarehouseDisplayName(store.name || store.code || 'Tienda');
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSalesPoint(id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--v-blue,#2563eb)] text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700 dark:hover:bg-stone-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="px-3 pb-3 space-y-2 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5 text-stone-400" />
              Historial de esta tienda
              {loading ? (
                <span className="inline-flex items-center gap-1 font-medium text-stone-400 normal-case">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Cargando…
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 p-1.5 rounded-xl shadow-none`}
              aria-label="Cerrar historial"
              title="Cerrar historial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!storeWarehouseId ? (
            <p className="text-xs text-stone-500 py-2">Elige una tienda para ver movimientos.</p>
          ) : error ? (
            <p className="text-xs text-amber-700 dark:text-amber-300 py-2">{error}</p>
          ) : loading && !loaded ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando historial…
            </div>
          ) : movements.length === 0 && !loading ? (
            <p className="text-xs text-stone-500 py-2">Aún no hay movimientos en esta tienda.</p>
          ) : (
            <ul
              className={`max-h-[min(28rem,60vh)] overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800 ${
                loading ? 'opacity-60' : ''
              }`}
            >
              {movements.map((m) => (
                <li
                  key={m._id || m.id}
                  className="flex items-start gap-2 px-2.5 py-2 text-xs"
                >
                  <span className="shrink-0 tabular-nums text-stone-400 w-[4.5rem]">
                    {formatMovementWhen(m.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-stone-800 dark:text-stone-100">
                    {m.catalogItemName || 'Artículo'}
                    <span className="text-stone-400"> · {movementTypeLabel(m.movementType)}</span>
                  </span>
                  <span
                    className={`shrink-0 tabular-nums font-semibold ${
                      qtySign(m).startsWith('−')
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {qtySign(m)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
