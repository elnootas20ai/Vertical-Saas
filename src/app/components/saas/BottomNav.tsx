import { useLocation, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Car,
  TrendingUp,
  Users,
  Bell,
  ClipboardList,
  Calculator,
  Armchair,
  Wrench,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuthOptional } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { useBusiness } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { isDeliveryBusinessType } from '../../lib/deliverySetup';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';

type BottomNavItem = {
  id: string;
  path: string;
  icon: LucideIcon;
  label: string;
  /** Rutas con guard RequireBusinessOwner: ocultas para cuentas de trabajador */
  ownerOnly?: boolean;
};

const HOME_ITEM: BottomNavItem = { id: 'dashboard', path: '/saas/dashboard', icon: LayoutDashboard, label: 'Inicio' };
const CLIENTS_ITEM: BottomNavItem = { id: 'clients', path: '/saas/clients', icon: Users, label: 'Clientes' };
const SALES_ITEM: BottomNavItem = { id: 'sales', path: '/saas/sales', icon: TrendingUp, label: 'Ventas' };

/** Pestañas por vertical: la barra de compraventa (Vehículos/Ventas) no aplica a delivery, restaurante… */
function navItemsForVertical(businessType?: string | null): BottomNavItem[] {
  if (isRestaurantBusinessType(businessType)) {
    return [
      HOME_ITEM,
      { id: 'sala', path: '/saas/sala', icon: Armchair, label: 'Sala' },
      { id: 'caja', path: '/saas/caja', icon: Calculator, label: 'Caja', ownerOnly: true },
      CLIENTS_ITEM,
    ];
  }
  if (isDeliveryBusinessType(businessType)) {
    return [
      HOME_ITEM,
      { id: 'ops', path: '/saas/delivery-ops', icon: ClipboardList, label: 'Operativa', ownerOnly: true },
      { id: 'caja', path: '/saas/vertical/delivery/caja', icon: Calculator, label: 'Caja', ownerOnly: true },
      CLIENTS_ITEM,
    ];
  }
  if (businessType === 'workshop') {
    return [
      HOME_ITEM,
      { id: 'workshop', path: '/saas/workshop', icon: Wrench, label: 'Taller' },
      CLIENTS_ITEM,
    ];
  }
  if (businessType === 'carDealership') {
    return [
      HOME_ITEM,
      { id: 'vehicles', path: '/saas/vehicles', icon: Car, label: 'Vehículos' },
      SALES_ITEM,
      CLIENTS_ITEM,
    ];
  }
  // Resto de verticales: pestañas genéricas del core
  return [HOME_ITEM, SALES_ITEM, CLIENTS_ITEM];
}

const ALERTS_ITEM: BottomNavItem = {
  id: 'alertas',
  path: '/saas/alerts',
  icon: Bell,
  label: 'Alertas',
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const isWorker = Boolean(auth?.user && isWorkerAccount(auth.user));
  const { notifications } = useApp();
  const { currentBusiness } = useBusiness();
  const alertCenterBusinessId = useAlertCenterBusinessId();
  const { unresolved: alertCenterUnresolved, summary } = useAlertCenterSummary(
    !isWorker ? alertCenterBusinessId : undefined,
    { pollMs: 45_000 },
  );

  const isSaasRoute = location.pathname.startsWith('/saas');
  if (!isSaasRoute) return null;

  const workerUnread = notifications.filter((n) => !n.read).length;
  const badgeCount = isWorker ? workerUnread : alertCenterUnresolved;
  const highPriority = (summary?.byPriority?.high ?? 0) > 0;

  const verticalItems = navItemsForVertical(currentBusiness?.businessType).filter(
    (item) => !isWorker || !item.ownerOnly,
  );
  const navItems = isWorker ? verticalItems : [...verticalItems, ALERTS_ITEM];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch">
        {navItems.map(({ id, path, icon: Icon, label }) => {
          const isActive =
            location.pathname === path
            || location.pathname.startsWith(`${path}/`)
            || (id === 'alertas' && location.pathname.startsWith('/saas/alerts'));
          const showBadge = id === 'alertas' && badgeCount > 0;

          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[52px] transition-colors ${
                isActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {showBadge && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-gray-800 ${
                      highPriority ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-medium leading-tight ${
                  isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
