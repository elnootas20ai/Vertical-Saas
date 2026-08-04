import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  getButcherSalesTodayRequest,
  getButcherOrdersTodayRequest,
} from '../../../lib/butcherApi';
import {
  Beef, ShoppingCart, ClipboardList, Truck, Scissors, Scale,
  BarChart3, ArrowRight, Loader2, Recycle, Package,
} from 'lucide-react';

type Props = { onSelectGeneral?: () => void };

const LINKS = [
  { label: 'TPV', path: '/saas/vertical/carniceria/tpv', icon: ShoppingCart },
  { label: 'Encargos', path: '/saas/butcher-orders', icon: ClipboardList },
  { label: 'Compras', path: '/saas/vertical/carniceria/compras', icon: Package },
  { label: 'Despiece', path: '/saas/vertical/carniceria/despiece', icon: Scissors },
  { label: 'Repartos', path: '/saas/vertical/carniceria/reparto', icon: Truck },
  { label: 'Básculas', path: '/saas/vertical/carniceria/basculas', icon: Scale },
  { label: 'Merma', path: '/saas/butcher-waste', icon: Recycle },
  { label: 'Informes', path: '/saas/vertical/carniceria/informes', icon: BarChart3 },
  { label: 'Centro ops', path: '/saas/butcher-hub', icon: Beef },
];

export function ButcherDashboard({ onSelectGeneral }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.id || '';
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [sales, orders] = await Promise.all([
        getButcherSalesTodayRequest(userId).catch(() => null),
        getButcherOrdersTodayRequest(userId).catch(() => null),
      ]);
      setRevenue(Number(sales?.stats?.totalRevenue ?? 0));
      setTickets(Number(sales?.stats?.count ?? 0));
      const list = Array.isArray(orders?.orders) ? orders.orders : [];
      setPendingOrders(list.filter((o: { status?: string }) =>
        !['picked_up', 'delivered', 'cancelled'].includes(String(o.status || ''))).length);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const links = useMemo(() => {
    if (currentBusiness?.ownDeliveryEnabled) return LINKS;
    return LINKS.filter((l) => l.path !== '/saas/vertical/carniceria/reparto');
  }, [currentBusiness?.ownDeliveryEnabled]);

  return (
    <Layout title="Carnicería" subtitle={currentBusiness?.name || 'Panel vertical'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Resumen del día · operativa carnicería</p>
        {onSelectGeneral && (
          <button type="button" onClick={onSelectGeneral} className="text-xs text-gray-500 hover:underline">
            Ver dashboard general
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <p className="text-xs text-gray-500">Ventas hoy</p>
            <p className="text-2xl font-bold mt-1">
              {revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
            <p className="text-xs text-gray-400 mt-1">{tickets} tickets</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <p className="text-xs text-gray-500">Encargos activos</p>
            <p className="text-2xl font-bold mt-1">{pendingOrders}</p>
          </div>
          <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-5">
            <p className="text-xs text-violet-600">Acceso rápido</p>
            <button
              type="button"
              onClick={() => navigate('/saas/butcher-hub')}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-violet-800 dark:text-violet-200"
            >
              Abrir centro operativo <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {links.map((l) => (
          <button
            key={l.path}
            type="button"
            onClick={() => navigate(l.path)}
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300 dark:hover:border-red-700 text-left transition"
          >
            <l.icon className="w-5 h-5 text-red-600" />
            <span className="font-semibold text-sm">{l.label}</span>
          </button>
        ))}
      </div>
    </Layout>
  );
}
