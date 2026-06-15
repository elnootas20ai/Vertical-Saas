import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, LogOut } from 'lucide-react';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { exitTpvTabletSessionPath, isTpvTabletBound } from '../../lib/tpvTabletSession';

/** Barra inferior del TPV trabajador: revisión de stock + salir (tablet por código). */
export function WorkerTpvBottomBar() {
  const navigate = useNavigate();
  const { config } = useVerticalCatalog();
  const tabletBound = isTpvTabletBound();
  const showStock = config.features?.stock !== false;

  if (!showStock && !tabletBound) return null;

  const handleExitTablet = () => {
    navigate(exitTpvTabletSessionPath(), { replace: true });
  };

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
      {showStock && (
        <button
          type="button"
          onClick={() => navigate('/saas/worker/stock-review')}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] touch-manipulation rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
        >
          <ClipboardCheck className="w-5 h-5" />
          Revisión de stock
        </button>
      )}
      {tabletBound && (
        <button
          type="button"
          onClick={handleExitTablet}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] touch-manipulation rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Salir del TPV
        </button>
      )}
    </div>
  );
}
