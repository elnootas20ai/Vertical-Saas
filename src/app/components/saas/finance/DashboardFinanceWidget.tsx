import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { listFinanceMovements } from '../../../lib/financeApi';
import { listBankAccounts } from '../../../lib/bankAccountsApi';
import type { FinanceMovementRecord } from '../../../lib/financeTypes';
import type { BankAccount } from '../../../lib/bankAccountTypes';
import { getTotalBalance } from '../../../lib/bankAccountTypes';

interface DashboardFinanceWidgetProps {
  userId: string;
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

function getMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

function buildChartData(movements: FinanceMovementRecord[], months: string[]) {
  const map = new Map<string, { income: number; expense: number }>();
  for (const key of months) map.set(key, { income: 0, expense: 0 });

  for (const m of movements) {
    const key = getMonthKey(m.date);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (m.type === 'cobro') bucket.income += m.totalAmount;
    else bucket.expense += m.totalAmount;
  }

  return months.map((key) => {
    const v = map.get(key)!;
    return {
      month: getMonthLabel(key),
      income: Number(v.income.toFixed(2)),
      expense: Number(v.expense.toFixed(2)),
    };
  });
}

function getLast6Months(): string[] {
  const now = new Date();
  const result: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${y}-${m}`);
  }
  return result;
}

function computeAlerts(movements: FinanceMovementRecord[]) {
  let pending = 0;
  let overdue = 0;
  let unreconciled = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const m of movements) {
    if (m.status === 'pending') {
      pending++;
      if (m.dueDate && m.dueDate < today) overdue++;
    }
    if (!m.reconciled) unreconciled++;
  }

  return { pending, overdue, unreconciled };
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
      <div className="h-[80px] bg-gray-100 dark:bg-gray-800 rounded-lg" />
    </div>
  );
}

export function DashboardFinanceWidget({ userId }: DashboardFinanceWidgetProps) {
  const navigate = useNavigate();

  const [movements, setMovements] = useState<FinanceMovementRecord[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [movs, accs] = await Promise.all([
          listFinanceMovements(userId),
          listBankAccounts(userId),
        ]);
        if (cancelled) return;
        setMovements(movs);
        setAccounts(accs);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al cargar finanzas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const totalBalance = accounts.length > 0 ? getTotalBalance(accounts) : 0;

  const monthMovements = movements.filter((m) => getMonthKey(m.date) === currentMonth);
  const incomeMonth = monthMovements
    .filter((m) => m.type === 'cobro')
    .reduce((s, m) => s + m.totalAmount, 0);
  const expenseMonth = monthMovements
    .filter((m) => m.type === 'pago')
    .reduce((s, m) => s + m.totalAmount, 0);

  const months = getLast6Months();
  const chartData = buildChartData(movements, months);
  const alerts = computeAlerts(movements);
  const hasAlerts = alerts.pending > 0 || alerts.overdue > 0 || alerts.unreconciled > 0;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Finanzas</h3>
        </div>
        <button
          onClick={() => navigate('/saas/finance')}
          className="text-gray-400 hover:text-blue-500 transition-colors"
          aria-label="Ir a finanzas"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Saldo total
          </p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400 truncate">
            {fmtCurrency(totalBalance)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
            Ingresos mes
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          </p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate">
            {fmtCurrency(incomeMonth)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
            Gastos mes
            <TrendingDown className="h-3 w-3 text-red-500" />
          </p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 truncate">
            {fmtCurrency(expenseMonth)}
          </p>
        </div>
      </div>

      {/* Spark Chart */}
      <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2">
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="finIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="finExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,.12)',
              }}
              formatter={(value: number, name: string) => [
                fmtCurrency(value),
                name === 'income' ? 'Ingresos' : 'Gastos',
              ]}
              labelFormatter={(label: string) => label}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#finIncomeGrad)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#finExpenseGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-2">
          {alerts.pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">
              <ArrowDownRight className="h-3 w-3" />
              {alerts.pending} pendiente{alerts.pending !== 1 ? 's' : ''}
            </span>
          )}
          {alerts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 text-[10px] font-semibold">
              <AlertTriangle className="h-3 w-3" />
              {alerts.overdue} vencido{alerts.overdue !== 1 ? 's' : ''}
            </span>
          )}
          {alerts.unreconciled > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">
              {alerts.unreconciled} sin conciliar
            </span>
          )}
        </div>
      )}
    </div>
  );
}
