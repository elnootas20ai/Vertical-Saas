import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UtensilsCrossed } from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import {
  listStaffConsumptionsRequest,
  type StaffConsumption,
  type StaffConsumptionPaymentMode,
} from '../../lib/deliveryApi';
import { formatStaffConsumptionPaymentLabel } from '../../lib/staffConsumptionUtils';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';

interface StaffConsumptionsTabProps {
  members: AuthUser[];
  currentUser: AuthUser;
}

function formatCurrency(value: number) {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StaffConsumptionsTab({
  members,
  currentUser,
}: StaffConsumptionsTabProps) {
  const { currentBusiness } = useBusiness();
  const userId = resolveBusinessDataUserId(currentUser, currentBusiness);
  const [items, setItems] = useState<StaffConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [workerFilter, setWorkerFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<StaffConsumptionPaymentMode | 'all'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await listStaffConsumptionsRequest(userId, {
        month,
        workerId: workerFilter !== 'all' ? workerFilter : undefined,
      });
      setItems(result.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, month, workerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (paymentFilter !== 'all' && item.paymentMode !== paymentFilter) return false;
      if (!q) return true;
      return (
        item.workerName.toLowerCase().includes(q) ||
        item.itemName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, paymentFilter, search]);

  const summary = useMemo(() => {
    const total = filtered.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cashNow = filtered
      .filter((row) => row.paymentMode === 'cash_now')
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    const payroll = filtered
      .filter((row) => row.paymentMode === 'payroll_deduction')
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    return { count: filtered.length, total, cashNow, payroll };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Total consumos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(summary.total)}</p>
          <p className="text-xs text-gray-400 mt-1">{summary.count} registros</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">Pagado en el momento</p>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{formatCurrency(summary.cashNow)}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/20 p-4">
          <p className="text-xs text-violet-700 dark:text-violet-300">A descontar de nómina</p>
          <p className="text-2xl font-bold text-violet-800 dark:text-violet-200">{formatCurrency(summary.payroll)}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        />
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        >
          <option value="all">Todos los trabajadores</option>
          {members.map((member) => (
            <option key={member.user_id || member.id} value={member.user_id || member.id}>
              {member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim()}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as StaffConsumptionPaymentMode | 'all')}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        >
          <option value="all">Todos los pagos</option>
          <option value="cash_now">Pago ahora</option>
          <option value="payroll_deduction">Descontar nómina</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto o trabajador…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No hay consumos registrados en este periodo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Trabajador</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Cant.</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Pago</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.workerName}</td>
                  <td className="px-4 py-3">
                    <div>{row.itemName}</div>
                    <div className="text-xs text-gray-500">{row.category}</div>
                  </td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(row.total)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        row.paymentMode === 'cash_now'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
                      }`}
                    >
                      {formatStaffConsumptionPaymentLabel(row.paymentMode)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
