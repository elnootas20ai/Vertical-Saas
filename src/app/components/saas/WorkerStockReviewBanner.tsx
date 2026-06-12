import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';

/** Acceso rápido a revisión de stock — mismo flujo en todos los verticales con inventario. */
export function WorkerStockReviewBanner() {
  const navigate = useNavigate();
  const { config } = useVerticalCatalog();

  if (config.features?.stock === false) return null;

  return (
    <div className="shrink-0 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2.5">
      <button
        type="button"
        onClick={() => navigate('/saas/worker/stock-review')}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] touch-manipulation rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
      >
        <ClipboardCheck className="w-5 h-5" />
        Revisión de stock
      </button>
    </div>
  );
}
