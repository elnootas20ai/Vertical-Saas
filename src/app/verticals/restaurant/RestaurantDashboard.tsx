import { Link } from 'react-router-dom';
import {
  Banknote,
  BookmarkCheck,
  ChefHat,
  ListChecks,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import type { VerticalDashboardProps } from '../../lib/verticalDashboardMap';
import { useBusiness } from '../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';

const LINKS = [
  { label: 'Sala', to: '/saas/sala', icon: UtensilsCrossed },
  { label: 'TPV', to: '/saas/caja/tpv', icon: Zap },
  { label: 'Cocina', to: '/saas/cocina', icon: ChefHat },
  { label: 'Caja', to: '/saas/caja', icon: Banknote },
  { label: 'Reservas', to: '/saas/reservations', icon: BookmarkCheck },
  { label: 'Lista de espera', to: '/saas/lista-espera', icon: ListChecks },
] as const;

export function RestaurantDashboard(_props: VerticalDashboardProps) {
  const { currentBusiness } = useBusiness();
  const businessName = String(currentBusiness?.name || '').trim() || 'Restauración';
  const businessId = currentBusiness?.business_id;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">{businessName}</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Bar / restaurante · elige un módulo del menú o de abajo.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {LINKS.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={saasPathWithBusinessScope(to, businessId)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center shadow-sm transition hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900"
          >
            <Icon className="h-5 w-5 text-stone-700 dark:text-stone-200" />
            <span className="text-sm font-medium text-stone-900 dark:text-stone-50">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
