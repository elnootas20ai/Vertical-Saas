/**
 * Barra inferior tablet bar/restaurante: Salir · Mesas · Cocina · Espera · Stock.
 * No reutiliza WorkerTpvBottomBar de Delivery.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { Armchair, Boxes, ChefHat, LayoutGrid, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { isTpvTabletBound, leaveTpvTabletSession, readTpvTabletBinding } from '../../lib/tpvTabletSession';
import { resolveTpvCeoExitPath } from '../../lib/retailOpsPaths';
import { requestTpvStockReviewOpen, tpvPathWithStockReview } from '../../lib/tpvStockReview';

export type RestaurantTabletNavTab = 'mesas' | 'cocina' | 'espera' | 'stock';

const PATHS = {
  mesasCeo: '/saas/caja/tpv',
  mesasTablet: '/saas/worker/tpv/restaurant',
  cocina: '/saas/cocina',
  espera: '/saas/lista-espera',
} as const;

function mesasPath(): string {
  return readTpvTabletBinding()?.pdvId ? PATHS.mesasTablet : PATHS.mesasCeo;
}

function isOnRestaurantTpvShell(pathname: string): boolean {
  const path = String(pathname || '').toLowerCase();
  return path.includes('/caja/tpv') || path.includes('/worker/tpv/restaurant');
}

export function shouldShowRestaurantTabletNav(opts?: {
  tabletMode?: boolean;
  pathname?: string;
}): boolean {
  if (opts?.tabletMode) return true;
  if (readTpvTabletBinding()?.pdvId) return true;
  const path = String(opts?.pathname || '').toLowerCase();
  return path.includes('/worker/tpv');
}

type Props = {
  active: RestaurantTabletNavTab;
  className?: string;
  /** Si Stock está abierto en el shell TPV, Mesas cierra el overlay. */
  onCloseStock?: () => void;
};

export function RestaurantTabletBottomNav({ active, className = '', onCloseStock }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const tabletBound = isTpvTabletBound();

  const handleExit = () => {
    if (tabletBound) {
      void leaveTpvTabletSession(logout, { navigate });
      return;
    }
    navigate(
      resolveTpvCeoExitPath(window.location.pathname, currentBusiness?.businessType),
      { replace: true },
    );
  };

  const handleStock = () => {
    const target = mesasPath();
    if (isOnRestaurantTpvShell(location.pathname)) {
      requestTpvStockReviewOpen();
      return;
    }
    navigate(tpvPathWithStockReview(target));
  };

  const tabs: Array<{
    id: Exclude<RestaurantTabletNavTab, 'stock'>;
    label: string;
    icon: typeof LayoutGrid;
    path: string;
  }> = [
    { id: 'mesas', label: 'Mesas', icon: LayoutGrid, path: mesasPath() },
    { id: 'cocina', label: 'Cocina', icon: ChefHat, path: PATHS.cocina },
    { id: 'espera', label: 'Espera', icon: Armchair, path: PATHS.espera },
  ];

  return (
    <nav
      className={`shrink-0 border-t border-stone-200 bg-white/95 px-2 py-1.5 dark:border-stone-700 dark:bg-stone-900/95 ${className}`}
      aria-label="Navegación tablet sala"
    >
      <div className="mx-auto flex max-w-3xl items-stretch gap-1.5">
        <button
          type="button"
          onClick={handleExit}
          className="flex shrink-0 min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 touch-manipulation hover:bg-blue-50/60 hover:border-blue-200 hover:text-[var(--v-blue,#2563eb)] dark:border-slate-600 dark:bg-stone-900 dark:text-slate-200 dark:hover:bg-blue-950/40"
          title="Salir a Vertial"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Salir a Vertial</span>
          <span className="sm:hidden">Salir</span>
        </button>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (active === 'stock' && tab.id === 'mesas' && onCloseStock) {
                  onCloseStock();
                  return;
                }
                if (!isActive) navigate(tab.path);
              }}
              className={`flex flex-1 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold touch-manipulation ${
                isActive
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : tab.id === 'cocina'
                    ? 'border border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                    : tab.id === 'espera'
                      ? 'border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                      : 'border border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200'
              }`}
              title={tab.label}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={handleStock}
          className={`flex shrink-0 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold touch-manipulation ${
            active === 'stock'
              ? 'bg-emerald-700 text-white dark:bg-emerald-500 dark:text-stone-900'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
          }`}
          title="Stock"
        >
          <Boxes className="h-4 w-4" />
          Stock
        </button>
      </div>
    </nav>
  );
}
