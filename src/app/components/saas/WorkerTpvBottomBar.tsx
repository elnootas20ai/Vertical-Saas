import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, LogOut } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { exitTpvTabletSessionPath, isTpvTabletBound } from '../../lib/tpvTabletSession';
import { requestTpvStockReviewOpen } from '../../lib/tpvStockReview';
import { resolveTpvCeoExitPath } from '../../lib/retailOpsPaths';

/** Barra inferior del TPV: revisión de stock + salir (tablet o modo CEO). */
export function WorkerTpvBottomBar({
  ceoMode = false,
  onExitCeo,
}: {
  /** TPV Rápido gerente: salir sin cerrar caja. */
  ceoMode?: boolean;
  onExitCeo?: () => void;
} = {}) {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { config } = useVerticalCatalog();
  const tabletBound = isTpvTabletBound();
  const showStock = config.features?.stock !== false;
  const showExit = tabletBound || ceoMode;
  const compact = tabletBound || ceoMode;

  if (!showStock && !showExit) return null;

  const handleExitTablet = () => {
    navigate(exitTpvTabletSessionPath(), { replace: true });
  };

  const handleExitCeo = () => {
    if (onExitCeo) {
      onExitCeo();
      return;
    }
    navigate(resolveTpvCeoExitPath(window.location.pathname, currentBusiness?.businessType), { replace: true });
  };

  const btnBase = compact
    ? 'flex flex-1 items-center justify-center gap-1.5 min-h-[40px] touch-manipulation rounded-xl font-semibold text-xs transition-colors'
    : 'w-full flex items-center justify-center gap-2 min-h-[44px] touch-manipulation rounded-xl font-bold text-sm transition-colors';

  return (
    <div
      className={`shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pb-[max(0.375rem,env(safe-area-inset-bottom))] ${
        compact
          ? 'px-2 py-1.5 flex flex-row items-stretch gap-1.5'
          : 'px-3 py-2.5 flex flex-col gap-2'
      }`}
    >
      {showStock && (
        <button
          type="button"
          onClick={() => requestTpvStockReviewOpen()}
          className={`${btnBase} border border-slate-300 dark:border-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100`}
        >
          <ClipboardCheck className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          {compact ? 'Stock' : 'Revisión de stock'}
        </button>
      )}
      {showExit && (
        <button
          type="button"
          onClick={ceoMode ? handleExitCeo : handleExitTablet}
          className={`${btnBase} border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800`}
        >
          <LogOut className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          Salir del TPV
        </button>
      )}
    </div>
  );
}
