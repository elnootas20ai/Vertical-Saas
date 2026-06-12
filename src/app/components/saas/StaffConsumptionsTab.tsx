import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Search, User, UtensilsCrossed } from 'lucide-react';
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

type ViewMode = 'list' | 'by-worker';

interface WorkerSummary {
  workerId: string;
  workerName: string;
  count: number;
  total: number;
  cashNow: number;
  payroll: number;
  items: StaffConsumption[];
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

function memberLabel(member: AuthUser) {
  return (
    String(member.fullName || '').trim()
    || `${member.firstName || ''} ${member.lastName || ''}`.trim()
    || member.email?.split('@')[0]
    || 'Trabajador'
  );
}

function resolveWorkerDisplayName(workerId: string, workerName: string, members: AuthUser[]) {
  const fromTeam = members.find((m) => (m.user_id || m.id) === workerId);
  if (fromTeam) return memberLabel(fromTeam);
  return workerName || 'Trabajador';
}

function workerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());

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
      const worker = resolveWorkerDisplayName(item.workerId, item.workerName, members);
      return (
        worker.toLowerCase().includes(q)
        || item.workerName.toLowerCase().includes(q)
        || item.itemName.toLowerCase().includes(q)
        || item.category.toLowerCase().includes(q)
        || item.recordedByName?.toLowerCase().includes(q)
      );
    });
  }, [items, paymentFilter, search, members]);

  const summary = useMemo(() => {
    const total = filtered.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cashNow = filtered
      .filter((row) => row.paymentMode === 'cash_now')
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    const payroll = filtered
      .filter((row) => row.paymentMode === 'payroll_deduction')
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    const workers = new Set(filtered.map((row) => row.workerId).filter(Boolean));
    return { count: filtered.length, total, cashNow, payroll, workerCount: workers.size };
  }, [filtered]);

  const workerSummaries = useMemo(() => {
    const map = new Map<string, WorkerSummary>();
    for (const row of filtered) {
      const key = row.workerId || row.workerName || 'unknown';
      const name = resolveWorkerDisplayName(row.workerId, row.workerName, members);
      if (!map.has(key)) {
        map.set(key, {
          workerId: key,
          workerName: name,
          count: 0,
          total: 0,
          cashNow: 0,
          payroll: 0,
          items: [],
        });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.total += Number(row.total || 0);
      if (row.paymentMode === 'cash_now') entry.cashNow += Number(row.total || 0);
      else entry.payroll += Number(row.total || 0);
      entry.items.push(row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, members]);

  const toggleWorkerExpanded = (workerId: string) => {
    setExpandedWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const renderConsumptionRow = (row: StaffConsumption) => (
    <tr key={row._id} className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
        {formatDate(row.createdAt)}
      </td>
      {viewMode === 'list' && (
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
          {resolveWorkerDisplayName(row.workerId, row.workerName, members)}
        </td>
      )}
      <td className="px-4 py-3">
        <div>{row.itemName}</div>
        <div className="text-xs text-gray-500">{row.category}</div>
      </td>
      <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
      <td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(row.total)}</td>
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
      <td className="px-4 py-3 text-xs text-gray-500">
        {row.salesPointName || '—'}
        {row.recordedByName && row.recordedByName !== row.workerName && (
          <div className="text-[10px] text-gray-400 mt-0.5">Registrado por {row.recordedByName}</div>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-3">Resumen del periodo</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">Total periodo</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{formatCurrency(summary.total)}</p>
          <p className="text-xs text-gray-500 mt-1">{summary.count} consumo{summary.count === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">Trabajadores</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{summary.workerCount}</p>
          <p className="text-xs text-gray-500 mt-1">con consumos en el mes</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Pagado en el momento</p>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 tabular-nums mt-1">{formatCurrency(summary.cashNow)}</p>
        </div>
        <div className="rounded-xl border-2 border-violet-400 dark:border-violet-700 bg-violet-100/80 dark:bg-violet-950/40 p-4 shadow-sm">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">A descontar de nómina</p>
          <p className="text-2xl font-bold text-violet-900 dark:text-violet-100 tabular-nums mt-1">{formatCurrency(summary.payroll)}</p>
        </div>
        </div>
      </div>

      {workerSummaries.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Por trabajador</p>
          <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {workerSummaries.map((worker) => {
              const active = workerFilter === worker.workerId;
              return (
                <button
                  key={worker.workerId}
                  type="button"
                  onClick={() => setWorkerFilter(active ? 'all' : worker.workerId)}
                  className={`shrink-0 w-[200px] rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 ring-2 ring-violet-500/30'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                      {workerInitials(worker.workerName)}
                    </span>
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{worker.workerName}</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(worker.total)}</p>
                  <p className="text-xs text-gray-500 mt-1">{worker.count} consumo{worker.count === 1 ? '' : 's'}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
        />
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm min-w-[180px]"
        >
          <option value="all">Todos los trabajadores</option>
          {members.map((member) => {
            const id = member.user_id || member.id;
            if (!id) return null;
            return (
              <option key={id} value={id}>
                {memberLabel(member)}
              </option>
            );
          })}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as StaffConsumptionPaymentMode | 'all')}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
        >
          <option value="all">Todos los pagos</option>
          <option value="cash_now">Pago ahora</option>
          <option value="payroll_deduction">Descontar nómina</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto o trabajador…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-2.5 text-xs font-semibold ${viewMode === 'list' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600'}`}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setViewMode('by-worker')}
            className={`px-3 py-2.5 text-xs font-semibold ${viewMode === 'by-worker' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600'}`}
          >
            Por trabajador
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-gray-700 dark:text-gray-300">Sin consumos en este periodo</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Los registros aparecen cuando un trabajador consume desde el TPV → Consumo equipo.
          </p>
        </div>
      ) : viewMode === 'by-worker' ? (
        <div className="space-y-3">
          {workerSummaries.map((worker) => {
            const expanded = expandedWorkers.has(worker.workerId) || workerSummaries.length <= 5;
            return (
              <div
                key={worker.workerId}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleWorkerExpanded(worker.workerId)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-sm font-bold text-violet-700 dark:text-violet-300 shrink-0">
                    {workerInitials(worker.workerName)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{worker.workerName}</p>
                    <p className="text-xs text-gray-500">{worker.count} consumo{worker.count === 1 ? '' : 's'} · Nómina {formatCurrency(worker.payroll)} · Efectivo {formatCurrency(worker.cashNow)}</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{formatCurrency(worker.total)}</p>
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2">Producto</th>
                          <th className="px-4 py-2">Cant.</th>
                          <th className="px-4 py-2">Total</th>
                          <th className="px-4 py-2">Pago</th>
                          <th className="px-4 py-2">Tienda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worker.items
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((row) => renderConsumptionRow(row))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">
                  <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> Trabajador</span>
                </th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Cant.</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Tienda / Registro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => renderConsumptionRow(row))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
