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
  Umbrella,
  Zap,
  Clock,
  UserRound,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuthOptional } from '../../context/AuthContext';
import { isWorkerAccount, type AccountPermissionMatrix } from '../../lib/authApi';
import { canUseCeoAdminPanel } from '../../lib/teamManagerAccess';
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

/** Inicio del trabajador: backoffice worker, nunca el dashboard de empresa. */
const WORKER_HOME_ITEM: BottomNavItem = {
  id: 'worker-home',
  path: '/saas/worker/tasks',
  icon: ClipboardList,
  label: 'Inicio',
  matchPaths: ['/saas/worker/tasks'],
};

const WORKER_CLOCK_ITEM: BottomNavItem = {
  id: 'worker-clock',
  path: '/saas/worker/clock',
  icon: Clock,
  label: 'Fichaje',
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

/** Trabajador: avisos personales (nómina, contrato…), no Centro de Alertas CEO. */
const WORKER_ALERTS_ITEM: BottomNavItem = {
  id: 'worker-alertas',
  path: '/saas/worker/notifications',
  icon: Bell,
  label: 'Alertas',
  matchPaths: ['/saas/worker/notifications'],
};

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
        id: 'tpv',
        path: '/saas/vertical/delivery/tpv',
        icon: Zap,
        label: 'TPV',
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

  if (businessType === 'events') {
    return [
      HOME_ITEM,
      {
        id: 'events-hub',
        path: '/saas/vertical/eventos',
        icon: ClipboardList,
        label: 'Eventos',
        matchPaths: ['/saas/vertical/eventos'],
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

/** Trabajador: solo su backoffice (sin Inicio de empresa / Gate / clientes CEO). */
function workerNavItemsForVertical(
  _businessType: string | null | undefined,
  _permissions: AccountPermissionMatrix | undefined,
): BottomNavItem[] {
  return [
    WORKER_HOME_ITEM,
    WORKER_CLOCK_ITEM,
    WORKER_ALERTS_ITEM,
    {
      id: 'worker-requests',
      path: '/saas/worker/requests',
      icon: Umbrella,
      label: 'Solicitudes',
    },
    {
      id: 'worker-profile',
      path: '/saas/worker/profile',
      icon: UserRound,
      label: 'Perfil',
    },
  ];
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
  if (item.id === 'worker-alertas') {
    return pathname.startsWith('/saas/worker/notifications');
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
  const { businesses, currentBusiness } = useBusiness();
  const isWorker = Boolean(
    auth?.user && isWorkerAccount(auth.user) && !canUseCeoAdminPanel(auth.user, businesses),
  );
  const { notifications } = useApp();
  const alertCenterBusinessId = useAlertCenterBusinessId();
  const { unresolved: alertCenterUnresolved, summary } = useAlertCenterSummary(
    !isWorker ? alertCenterBusinessId : undefined,
    { pollMs: 120_000 },
  );

  const isSaasRoute = location.pathname.startsWith('/saas');
  if (!isSaasRoute) return null;
  // Panel super-admin: barra fija Guardar/Aprobar; la bottom nav tapaba los botones en móvil.
  if (location.pathname.startsWith('/saas/admin')) return null;

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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 safe-area-bottom backdrop-blur-md"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch">
        {navItems.map(({ id, path, icon: Icon, label, matchPaths }) => {
          const isActive = isNavItemActive(location.pathname, { id, path, icon: Icon, label, matchPaths });
          const showBadge =
            (id === 'alertas' || id === 'worker-alertas') && badgeCount > 0;

          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[52px] transition-colors ${
                isActive
                  ? 'text-[var(--v-blue,#2563eb)]'
                  : 'text-slate-500 dark:text-slate-400 active:text-slate-700'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {showBadge && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 ${
                      highPriority ? 'bg-[var(--v-rose,#e11d48)]' : 'bg-[var(--v-blue,#2563eb)]'
                    }`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-semibold leading-tight ${
                  isActive ? 'text-[var(--v-blue,#2563eb)]' : 'text-slate-500 dark:text-slate-400'
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
