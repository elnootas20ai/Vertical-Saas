import { useEffect, useMemo, useState } from 'react';
import { Clock, Receipt, UtensilsCrossed, Wine } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { resolveTpvRegisterScope } from '../../../lib/tpvRegisterScope';
import { listDiningOrdersRequest, listTableTicketStatsRequest } from '../../../lib/salaApi';
import { isOpenDiningOrder } from '../../../lib/restaurantTableDisplay';
import { summarizeTableTicketStats, formatDurationMinutes } from '../../../lib/restaurantTableStats';
import { localCalendarDayKey } from '../../../lib/tpvCajaScope';

type Props = {
  userId: string;
  businessId?: string;
  pdvId?: string;
  compact?: boolean;
};

export function RestaurantLiveDashboardPanel({ userId, businessId, pdvId, compact = false }: Props) {
  const [openOrders, setOpenOrders] = useState<Awaited<ReturnType<typeof listDiningOrdersRequest>>>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof listTableTicketStatsRequest>>>([]);
  const [loading, setLoading] = useState(true);

  const today = localCalendarDayKey();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listDiningOrdersRequest(userId, {
        dateFrom: `${today}T00:00:00.000Z`,
      }),
      listTableTicketStatsRequest(userId, {
        businessId,
        pdvId,
        dateFrom: today,
        dateTo: today,
      }),
    ])
      .then(([orders, ticketStats]) => {
        if (cancelled) return;
        setOpenOrders(orders.filter(isOpenDiningOrder));
        setStats(ticketStats);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, businessId, pdvId, today]);

  const daySummary = useMemo(() => summarizeTableTicketStats(stats), [stats]);
  const openAccounts = openOrders.filter((o) => Number(o.total || 0) > 0);
  const openTotal = openAccounts.reduce((s, o) => s + Number(o.total || 0), 0);

  if (loading) {
    return (
      <div className={`rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/40 ${compact ? 'p-3' : 'p-4'}`}>
        <p className="text-sm text-gray-500">Cargando sala…</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-stone-200 dark:border-stone-700 bg-gradient-to-br from-stone-900 to-stone-800 text-stone-50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Wine className="w-4 h-4 text-amber-400" />
        <h3 className={`font-bold ${compact ? 'text-sm' : 'text-base'}`}>Sala en vivo</h3>
      </div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400">
            <Receipt className="w-3 h-3" /> Cuentas abiertas
          </div>
          <p className="text-lg font-bold tabular-nums">{openAccounts.length}</p>
          <p className="text-xs text-amber-300 tabular-nums">{openTotal.toFixed(2)} €</p>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400">
            <UtensilsCrossed className="w-3 h-3" /> Tickets hoy
          </div>
          <p className="text-lg font-bold tabular-nums">{daySummary.ticketCount}</p>
          <p className="text-xs text-stone-300 tabular-nums">{daySummary.totalAmount.toFixed(2)} €</p>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400">
            <Clock className="w-3 h-3" /> Media mesa
          </div>
          <p className="text-lg font-bold tabular-nums">
            {daySummary.avgDurationMinutes > 0
              ? formatDurationMinutes(daySummary.avgDurationMinutes)
              : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-white/10 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-stone-400">Ticket medio</div>
          <p className="text-lg font-bold tabular-nums">
            {daySummary.avgTicketAmount > 0 ? `${daySummary.avgTicketAmount.toFixed(2)} €` : '—'}
          </p>
        </div>
      </div>
      {openAccounts.length > 0 && !compact ? (
        <ul className="mt-3 space-y-1 text-xs text-stone-300">
          {openAccounts.slice(0, 5).map((o) => (
            <li key={o._id} className="flex justify-between gap-2">
              <span>{o.tableName || `Mesa ${o.tableNumber}`}</span>
              <span className="font-semibold tabular-nums">{Number(o.total || 0).toFixed(2)} €</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RestaurantLiveDashboardPanelFromContext({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = String(currentBusiness?.business_id || '').replace(/^business:/, '');
  const userId = String(user?.user_id || user?.id || '');
  if (!userId) return null;
  return <RestaurantLiveDashboardPanel userId={userId} businessId={businessId} compact={compact} />;
}
