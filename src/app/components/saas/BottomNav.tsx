import { useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  ShoppingCart,
  Car,
  TrendingUp,
  Users,
  Kanban,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', path: '/saas/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { id: 'vehicles',  path: '/saas/vehicles',  icon: Car,             label: 'Vehículos' },
  { id: 'sales',     path: '/saas/sales',     icon: TrendingUp,      label: 'Ventas' },
  { id: 'clients',   path: '/saas/clients',   icon: Users,           label: 'Clientes' },
  { id: 'pipeline',  path: '/saas/pipeline',  icon: Kanban,          label: 'Pipeline' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isSaasRoute = location.pathname.startsWith('/saas');
  if (!isSaasRoute) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-stretch">
        {NAV_ITEMS.map(({ id, path, icon: Icon, label }) => {
          const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
          return (
            <button
              key={id}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors ${
                isActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
              </span>
              {isActive && (
                <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-500 dark:bg-amber-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
