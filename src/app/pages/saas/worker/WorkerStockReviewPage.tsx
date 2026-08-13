import { Navigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { StockRevisionPanel } from '../../../components/saas/StockRevisionPanel';
import { useStockWorkspace } from '../../../hooks/useStockWorkspace';
import { useTpvStockScope } from '../../../hooks/useTpvStockScope';
import { useVerticalCatalog } from '../../../hooks/useVerticalCatalog';
import { isTpvTabletBound, resolveTpvTabletWorkerPath } from '../../../lib/tpvTabletSession';
import { tpvPathWithStockReview } from '../../../lib/tpvStockReview';

export function WorkerStockReviewPage() {
  const tabletBound = isTpvTabletBound();
  const tpvScope = useTpvStockScope();
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

  if (tabletBound) {
    return <Navigate to={tpvPathWithStockReview(resolveTpvTabletWorkerPath())} replace />;
  }

  const itemLabel = config.itemLabelPlural || 'Productos';

  return (
    <Layout title="Revisión de stock" subtitle="Revisión de hoy — pasa lista sin esperar al encargado">
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
    </Layout>
  );
}
