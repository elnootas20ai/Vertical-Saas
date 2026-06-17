import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { isTpvTabletBound, resolveTpvTabletWorkerPath } from '../../lib/tpvTabletSession';
import { requestTpvStockReviewOpen, tpvPathWithStockReview } from '../../lib/tpvStockReview';
/** Acceso rápido a revisión de stock — en TPV embebido; fuera del TPV va a la ruta worker. */
export function WorkerStockReviewBanner() {
  const navigate = useNavigate();
  const { config } = useVerticalCatalog();

  if (config.features?.stock === false) return null;

  const handleClick = () => {
    if (isTpvTabletBound()) {
      navigate(tpvPathWithStockReview(resolveTpvTabletWorkerPath()), { replace: true });
      return;
    }
    requestTpvStockReviewOpen();
  };

  return (
    <div className="shrink-0 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2.5">
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] touch-manipulation rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
      >
        <ClipboardCheck className="w-5 h-5" />
        Revisión de stock
      </button>
    </div>
  );
}
