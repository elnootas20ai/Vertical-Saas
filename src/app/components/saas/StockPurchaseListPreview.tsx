import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, ShoppingCart, Truck } from 'lucide-react';
import {
  createPurchaseOrdersFromStockListRequest,
  getStockCountPurchaseListRequest,
  type StockPurchaseList,
} from '../../lib/stockPurchaseListApi';

const URGENCY_LABELS: Record<string, { label: string; className: string }> = {
  critical: { label: 'Crítico', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  high: { label: 'Alto', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  normal: { label: 'Normal', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
};

const REASON_LABELS: Record<string, string> = {
  inventario_faltante: 'Faltan unidades',
  bajo_minimo: 'Bajo mínimo',
  agotado: 'Agotado',
};

export interface StockPurchaseListPreviewProps {
  userId: string;
  countId: string;
  countName?: string;
  compact?: boolean;
  onGoToPurchaseOrders?: (countId: string) => void;
  onOrdersCreated?: (created: number) => void;
}

export function StockPurchaseListPreview({
  userId,
  countId,
  countName,
  compact = false,
  onGoToPurchaseOrders,
  onOrdersCreated,
}: StockPurchaseListPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<StockPurchaseList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !countId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStockCountPurchaseListRequest(userId, countId);
      setList(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista');
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [userId, countId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateOrders = async () => {
    if (!userId || !countId) return;
    setCreating(true);
    try {
      const result = await createPurchaseOrdersFromStockListRequest(userId, countId);
      if (result.pending) {
        toast.info(result.message || 'No se pudieron crear pedidos automáticamente.');
      } else if (result.created > 0) {
        toast.success(`${result.created} pedido(s) creado(s) en borrador`);
        onOrdersCreated?.(result.created);
      } else {
        toast.info(result.message || 'No hay productos que requieran pedido.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear pedidos');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Calculando lista de compra…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!list || list.itemCount === 0) {
    return (
      <p className="text-sm text-gray-500">
        Tras esta revisión no hay productos que sugieran pedido automático.
      </p>
    );
  }

  const title = countName || list.countName || 'Revisión de stock';

  if (compact) {
    return (
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Lista de compra sugerida
            </p>
            <p className="text-sm text-blue-800/80 dark:text-blue-200/80 mt-1">
              {list.itemCount} producto(s) · ~{list.totalEstimated.toFixed(2)} € · {list.supplierGroups.length} proveedor(es)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onGoToPurchaseOrders && (
              <button
                type="button"
                onClick={() => onGoToPurchaseOrders(countId)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Ver en pedidos
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-500" />
            Lista de compra — {title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {list.itemCount} producto(s) · Valor estimado {list.totalEstimated.toFixed(2)} €
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onGoToPurchaseOrders && (
            <button
              type="button"
              onClick={() => onGoToPurchaseOrders(countId)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Ir a pedidos de compra
            </button>
          )}
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateOrders()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Generar pedidos
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {list.supplierGroups.map((group) => (
          <div key={group.supplierId || group.supplierName} className="px-5 py-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-gray-400" />
              {group.supplierName}
              <span className="text-xs font-normal text-gray-400">
                ({group.items.length} · {group.estimatedTotal.toFixed(2)} €)
              </span>
            </p>
            <div className="space-y-2">
              {group.items.map((item) => {
                const urg = URGENCY_LABELS[item.urgency] || URGENCY_LABELS.normal;
                return (
                  <div
                    key={item.catalogItemId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        Stock {item.currentStock} {item.unit}
                        {item.minStock > 0 ? ` · mín. ${item.minStock}` : ''}
                        {item.reasons.map((r) => REASON_LABELS[r] || r).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${urg.className}`}>
                        {urg.label}
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {item.suggestedQuantity} {item.unit}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        ~{item.estimatedTotal.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-100 dark:border-amber-900/30 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Lista preparada desde el inventario. Los pedidos se crean en borrador, agrupados por proveedor.
        </span>
      </div>
    </div>
  );
}
