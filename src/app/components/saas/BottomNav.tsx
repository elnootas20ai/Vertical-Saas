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
  Package,
  ChefHat,
  Truck,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuthOptional } from '../../context/AuthContext';
import { isWorkerAccount, type AccountPermissionMatrix } from '../../lib/authApi';
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
  /** Rutas adicionales que marcan la pestaña como activa */
  matchPaths?: string[];
};

const HOME_ITEM: BottomNavItem = {
  id: 'dashboard',
  path: '/saas/dashboard',
  icon: LayoutDashboard,
  label: 'Inicio',
};

const CLIENTS_ITEM: BottomNavItem = {
  id: 'clients',
  path: '/saas/clients',
  icon: Users,
  label: 'Clientes',
  matchPaths: ['/saas/crm/clientes'],
};

const ALERTS_ITEM: BottomNavItem = {
  id: 'alertas',
  path: '/saas/alerts',
  icon: Bell,
  label: 'Alertas',
};

function hasWorkerPermission(permissions: AccountPermissionMatrix | undefined, key: string): boolean {
  const value = permissions?.[key];
  if (value === true) return true;
  if (typeof value === 'string' && value.length > 0 && value !== 'none') return true;
  if (typeof value === 'object' && value !== null) return true;
  return false;
}

/** Dueño / admin: pestañas operativas del día según vertical. */
function ownerNavItemsForVertical(businessType?: string | null): BottomNavItem[] {
  if (isRestaurantBusinessType(businessType)) {
    return [
      HOME_ITEM,
      { id: 'sala', path: '/saas/sala', icon: Armchair, label: 'Sala' },
      { id: 'tpv', path: '/saas/caja/tpv', icon: Zap, label: 'TPV' },
      { id: 'cocina', path: '/saas/cocina', icon: ChefHat, label: 'Cocina' },
      CLIENTS_ITEM,
    ];
  }

  if (isDeliveryBusinessType(businessType)) {
    return [
      HOME_ITEM,
      {
        id: 'ops',
        path: '/saas/delivery-ops',
        icon: ClipboardList,
        label: 'Operativa',
        matchPaths: ['/saas/vertical/delivery/pedidos', '/saas/vertical/delivery'],
      },
      {
        id: 'caja',
        path: '/saas/vertical/delivery/caja',
        icon: Calculator,
        label: 'Caja',
        matchPaths: ['/saas/vertical/delivery/tpv'],
      },
      CLIENTS_ITEM,
    ];
  }

  if (businessType === 'workshop') {
    return [
      HOME_ITEM,
      {
        id: 'workshop',
        path: '/saas/workshop',
        icon: Wrench,
        label: 'Taller',
      },
      {
        id: 'parts',
        path: '/saas/parts',
        icon: Package,
        label: 'Recambios',
      },
      CLIENTS_ITEM,
    ];
  }

  if (businessType === 'carDealership') {
    return [
      HOME_ITEM,
      {
        id: 'vehicles',
        path: '/saas/vehicles',
        icon: Car,
        label: 'Vehículos',
      },
      {
        id: 'sales',
        path: '/saas/vertical/compraventa/ventas',
        icon: TrendingUp,
        label: 'Ventas',
        matchPaths: ['/saas/sales', '/saas/vertical/compraventa'],
      },
      CLIENTS_ITEM,
    ];
  }

  return [
    HOME_ITEM,
    { id: 'sales', path: '/saas/sales', icon: TrendingUp, label: 'Ventas' },
    CLIENTS_ITEM,
  ];
}

/** Trabajador: mismas verticales, pero rutas que sí puede usar en el día a día. */
function workerNavItemsForVertical(
  businessType: string | null | undefined,
  permissions: AccountPermissionMatrix | undefined,
): BottomNavItem[] {
  if (isRestaurantBusinessType(businessType)) {
    const items: BottomNavItem[] = [HOME_ITEM, { id: 'sala', path: '/saas/sala', icon: Armchair, label: 'Sala' }];
    if (hasWorkerPermission(permissions, 'delivery')) {
      items.push({ id: 'cocina', path: '/saas/cocina', icon: ChefHat, label: 'Cocina' });
    }
    items.push(CLIENTS_ITEM);
    return items;
  }

  if (isDeliveryBusinessType(businessType)) {
    const items: BottomNavItem[] = [HOME_ITEM];
    if (hasWorkerPermission(permissions, 'delivery')) {
      items.push(
        { id: 'cocina', path: '/saas/delivery-kitchen', icon: ChefHat, label: 'Cocina' },
        {
          id: 'reparto',
          path: '/saas/vertical/delivery/reparto',
          icon: Truck,
          label: 'Reparto',
          matchPaths: ['/saas/delivery-reparto'],
        },
      );
    }
    items.push(CLIENTS_ITEM);
    return items;
  }

  if (businessType === 'workshop') {
    return [
      HOME_ITEM,
      { id: 'workshop', path: '/saas/workshop', icon: Wrench, label: 'Taller' },
      { id: 'parts', path: '/saas/parts', icon: Package, label: 'Recambios' },
      CLIENTS_ITEM,
    ];
  }

  if (businessType === 'carDealership') {
    const items: BottomNavItem[] = [HOME_ITEM];
    if (hasWorkerPermission(permissions, 'vehicles')) {
      items.push({ id: 'vehicles', path: '/saas/vehicles', icon: Car, label: 'Vehículos' });
    }
    if (hasWorkerPermission(permissions, 'sales')) {
      items.push({
        id: 'sales',
        path: '/saas/vertical/compraventa/ventas',
        icon: TrendingUp,
        label: 'Ventas',
        matchPaths: ['/saas/sales'],
      });
    }
    items.push(CLIENTS_ITEM);
    return items;
  }

  const items: BottomNavItem[] = [HOME_ITEM];
  if (hasWorkerPermission(permissions, 'sales')) {
    items.push({ id: 'sales', path: '/saas/sales', icon: TrendingUp, label: 'Ventas' });
  }
  items.push(CLIENTS_ITEM);
  return items;
}

function navItemsForVertical(
  businessType: string | null | undefined,
  isWorker: boolean,
  permissions: AccountPermissionMatrix | undefined,
): BottomNavItem[] {
  if (isWorker) {
    return workerNavItemsForVertical(businessType, permissions);
  }
  return ownerNavItemsForVertical(businessType);
}

function isNavItemActive(pathname: string, item: BottomNavItem): boolean {
  if (item.id === 'alertas') {
    return pathname.startsWith('/saas/alerts');
  }

  const candidates = [item.path, ...(item.matchPaths ?? [])];
  return candidates.some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
}

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

  const verticalItems = navItemsForVertical(
    currentBusiness?.businessType,
    isWorker,
    auth?.user?.permissions,
  );
  const navItems = isWorker ? verticalItems : [...verticalItems, ALERTS_ITEM];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch">
        {navItems.map(({ id, path, icon: Icon, label, matchPaths }) => {
          const isActive = isNavItemActive(location.pathname, { id, path, icon: Icon, label, matchPaths });
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
