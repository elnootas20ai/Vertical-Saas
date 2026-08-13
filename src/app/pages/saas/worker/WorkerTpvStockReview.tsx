import { useMemo } from 'react';
import { ArrowLeft, ClipboardCheck, MapPin } from 'lucide-react';
import { StockRevisionPanel } from '../../../components/saas/StockRevisionPanel';
import { useTpvRegisterIfOpen } from '../../../components/saas/TpvRegisterGate';
import { useStockWorkspace } from '../../../hooks/useStockWorkspace';
import { useTpvStockScope, type TpvStockScopeOverride } from '../../../hooks/useTpvStockScope';
import { useVerticalCatalog } from '../../../hooks/useVerticalCatalog';

type WorkerTpvStockReviewProps = {
  onBack: () => void;
  scopeOverride?: TpvStockScopeOverride;
};

export function WorkerTpvStockReview({ onBack, scopeOverride }: WorkerTpvStockReviewProps) {
  const register = useTpvRegisterIfOpen();
  const sessionPdvId = String(register?.session?.pointOfSaleId || '').trim();
  const sessionStoreLabel = String(register?.session?.pointOfSaleName || '').trim();

  const mergedOverride = useMemo<TpvStockScopeOverride | undefined>(() => {
    const dataUserId = scopeOverride?.dataUserId;
    const pdvId = scopeOverride?.pdvId || sessionPdvId || undefined;
    const storeLabel = scopeOverride?.storeLabel || sessionStoreLabel || undefined;
    if (!dataUserId && !pdvId && !storeLabel) return scopeOverride;
    return { dataUserId, pdvId, storeLabel };
  }, [
    scopeOverride?.dataUserId,
    scopeOverride?.pdvId,
    scopeOverride?.storeLabel,
    sessionPdvId,
    sessionStoreLabel,
  ]);

  const tpvScope = useTpvStockScope(mergedOverride);
  const { config } = useVerticalCatalog();
  const {
    dataUserId,
    storeLabel,
    storeWarehouseId,
    warehouses,
    stockedCount,
    loading,
    reload,
  } = useStockWorkspace({
    dataUserId: tpvScope.dataUserId,
    storeLabel: tpvScope.storeLabel,
    salesPointId: tpvScope.pdvId,
  });

  const itemLabel = config.itemLabelPlural || 'Productos';

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
            aria-label="Volver al TPV"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              Revisión de hoy
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Pasa lista · {storeLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
            <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-blue-900 dark:text-blue-100">
              {itemLabel} de <strong>{storeLabel}</strong>
            </span>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Cargando inventario…</div>
          ) : (
            <StockRevisionPanel
              userId={dataUserId}
              storeLabel={storeLabel}
              storeWarehouseId={storeWarehouseId}
              warehouses={warehouses}
              stockedCount={stockedCount}
              role="worker"
              onRevisionCompleted={reload}
            />
          )}
        </div>
      </div>
    </div>
  );
}
