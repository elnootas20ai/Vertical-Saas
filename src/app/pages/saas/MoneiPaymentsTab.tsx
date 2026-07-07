import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Check,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  XCircle,
  PauseCircle,
  PlayCircle,
  DollarSign,
  Percent,
  Users,
  UserCheck,
  UserX,
  Activity,
  Calendar,
  BarChart3,
  ArrowUpRight,
  Search,
  TestTube,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Ban,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

import { getAuthHeaders } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';


const API = getApiBase();

async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MoneiConfig {
  maskedKey: string;
  testMode: boolean;
  commissionPercent: number;
  live?: { hasApiKey: boolean; hasPublicKey: boolean };
  test?: { hasApiKey: boolean; hasPublicKey: boolean };
}

type PaymentMode = 'test' | 'live';

interface DashboardStats {
  totalPayments: number;
  succeededPayments: number;
  totalRevenue: number;
  commissionAmount: number;
  commissionPercent: number;
  netRevenue: number;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  cancelledSubscriptions: number;
  pausedSubscriptions: number;
  totalSubscriptions: number;
  monthlyRecurring: number;
  totalUsers: number;
  activeUsers: number;
  unpaidUsers: number;
  noSubscriptionUsers: number;
  usersWithSubscription: number;
}

interface DailyData {
  date: string;
  count: number;
  amount: number;
}

interface ForecastItem {
  month: string;
  projected: number;
  projectedNet: number;
}

interface MoneiPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  statusCode?: string;
  description?: string;
  createdAt?: number;
  customer?: { name?: string; email?: string };
  subscriptionId?: string;
}

interface MoneiSubscription {
  id: string;
  amount: number;
  currency: string;
  status: string;
  interval: string;
  intervalCount: number;
  description?: string;
  createdAt?: number;
  customer?: { name?: string; email?: string };
  metadata?: { userId?: string; planId?: string };
  nextPaymentAt?: number;
  trialEnd?: number;
}

interface UserInfo {
  userId: string;
  fullName: string;
  email: string;
  plan?: string;
  status?: string;
  lastPaymentAt?: string;
  createdAt?: string;
}

type FilterPeriod = 'day' | 'week' | 'month' | 'year' | 'all';
type Section = 'overview' | 'test' | 'subscriptions' | 'payments' | 'users' | 'forecast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function centsToEur(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatDate(ts: number | string | undefined) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusColor(status: string) {
  const s = status?.toUpperCase();
  if (s === 'SUCCEEDED' || s === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'TRIALING') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'PENDING' || s === 'PAUSED') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'FAILED' || s === 'PAST_DUE' || s === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

function userStatusColor(status: string) {
  if (status === 'subscription_active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'trial_active') return 'bg-blue-50 text-blue-700';
  if (status === 'payment_failed') return 'bg-red-50 text-red-700';
  if (status === 'suspended') return 'bg-red-50 text-red-700';
  if (status === 'grace_period') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

const FILTER_LABELS: Record<FilterPeriod, string> = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  all: 'Todo',
};

const TEST_CARDS = [
  { number: '4444 4444 4444 4406', brand: 'Visa', desc: '3D Secure Challenge' },
  { number: '4444 4444 4444 4414', brand: 'Visa', desc: 'Direct (sin challenge)' },
  { number: '4444 4444 4444 4422', brand: 'Visa', desc: 'Frictionless' },
  { number: '5555 5555 5555 5524', brand: 'Mastercard', desc: 'Direct (sin challenge)' },
  { number: '5555 5555 5555 5565', brand: 'Mastercard', desc: 'Challenge (fallo tras 1er pago)' },
];

const SECTIONS: { id: Section; label: string; icon: typeof CreditCard }[] = [
  { id: 'overview', label: 'Resumen', icon: BarChart3 },
  { id: 'test', label: 'Test Pagos', icon: TestTube },
  { id: 'subscriptions', label: 'Suscripciones', icon: Activity },
  { id: 'payments', label: 'Cobros', icon: CreditCard },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'forecast', label: 'Pronóstico', icon: TrendingUp },
];

// ─── Mini Chart (SVG) ────────────────────────────────────────────────────────

function MiniChart({ data, width = 500, height = 180 }: { data: DailyData[]; width?: number; height?: number }) {
  if (!data.length) return <p className="text-gray-400 text-sm text-center py-8">Sin datos de pagos</p>;

  const maxAmt = Math.max(...data.map(d => d.amount), 1);
  const padX = 50;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padY + chartH - (d.amount / maxAmt) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${padY + chartH} L${points[0].x},${padY + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = padY + chartH - pct * chartH;
        return (
          <g key={pct}>
            <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padX - 6} y={y + 4} textAnchor="end" className="fill-gray-400" fontSize="10">
              {centsToEur(Math.round(maxAmt * pct))}€
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill="url(#chartGrad)" />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#10b981" stroke="#fff" strokeWidth="2" />
          {data.length <= 31 && (
            <text x={p.x} y={padY + chartH + 14} textAnchor="middle" fontSize="8" className="fill-gray-400">
              {p.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ─── Bar Chart (SVG) ─────────────────────────────────────────────────────────

function BarChartForecast({ forecast }: { forecast: ForecastItem[] }) {
  if (!forecast.length) return null;
  const maxVal = Math.max(...forecast.map(f => f.projected), 1);
  const barW = 60;
  const gap = 20;
  const width = forecast.length * (barW + gap) + 60;
  const height = 200;
  const padY = 20;
  const chartH = height - padY * 2 - 20;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {forecast.map((f, i) => {
        const x = 40 + i * (barW + gap);
        const h = (f.projected / maxVal) * chartH;
        const netH = (f.projectedNet / maxVal) * chartH;
        return (
          <g key={f.month}>
            <rect x={x} y={padY + chartH - h} width={barW / 2 - 2} height={h} rx="4" fill="#6366f1" opacity="0.3" />
            <rect x={x + barW / 2 + 2} y={padY + chartH - netH} width={barW / 2 - 2} height={netH} rx="4" fill="#10b981" />
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" fontSize="10" className="fill-gray-500">{f.month.slice(5)}</text>
            <text x={x + barW / 4} y={padY + chartH - h - 4} textAnchor="middle" fontSize="9" className="fill-indigo-500">{centsToEur(f.projected)}€</text>
            <text x={x + barW * 3 / 4} y={padY + chartH - netH - 4} textAnchor="middle" fontSize="9" className="fill-emerald-600">{centsToEur(f.projectedNet)}€</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Token Card ──────────────────────────────────────────────────────────────

function TokenCard({ config }: { config: MoneiConfig | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (config?.maskedKey) {
      navigator.clipboard.writeText(config.maskedKey).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [config]);

  if (!config) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Token MONEI
        </h3>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
          config.testMode
            ? 'bg-amber-50 text-amber-700 border-amber-300'
            : 'bg-emerald-50 text-emerald-700 border-emerald-300'
        }`}>
          {config.testMode ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {config.testMode ? 'MODO TEST' : 'MODO REAL (LIVE)'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="password"
            readOnly
            value={config.maskedKey}
            className="w-full px-4 py-2.5 pr-12 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono text-sm text-gray-800 dark:text-gray-200"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Copiar clave enmascarada"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        La clave completa solo está en el servidor (.env). Admin ve versión enmascarada.
      </p>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Percent className="w-3.5 h-3.5" /> Comisión MONEI: <strong className="text-gray-700 dark:text-gray-300">{config.commissionPercent}%</strong></span>
        {config.testMode && (
          <span className="text-amber-600">Las claves test empiezan por pk_test_</span>
        )}
        {!config.testMode && (
          <span className="text-emerald-600">Clave live — los cobros son reales</span>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'gray' }: {
  label: string; value: string; sub?: string; icon: typeof DollarSign; color?: string;
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-xl ${colorClasses[color] || colorClasses.gray}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MoneiPaymentsTab() {
  const [section, setSection] = useState<Section>('overview');
  const [config, setConfig] = useState<MoneiConfig | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<MoneiSubscription[]>([]);
  const [payments, setPayments] = useState<MoneiPayment[]>([]);
  const [userBreakdown, setUserBreakdown] = useState<{ active: UserInfo[]; unpaid: UserInfo[]; noSubscription: UserInfo[] }>({ active: [], unpaid: [], noSubscription: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterPeriod>('month');
  const [searchQ, setSearchQ] = useState('');
  const [testAmount, setTestAmount] = useState('1.00');
  const [testDesc, setTestDesc] = useState('Pago de prueba admin');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; redirectUrl?: string } | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('test');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userTab, setUserTab] = useState<'active' | 'unpaid' | 'nosub'>('active');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfgRes, dashRes] = await Promise.all([
        apiFetch('/api/admin/monei/config'),
        apiFetch('/api/admin/monei/dashboard'),
      ]);
      const cfgData = await cfgRes.json();
      const dashData = await dashRes.json();

      if (cfgData.ok) setConfig(cfgData);
      if (dashData.ok) {
        setStats(dashData.stats);
        setDailyData(dashData.dailyData || []);
        setForecast(dashData.forecast || []);
        setSubscriptions(dashData.subscriptions || []);
        setPayments(dashData.payments || []);
        setUserBreakdown(dashData.userBreakdown || { active: [], unpaid: [], noSubscription: [] });
      } else {
        setError(dashData.error || 'Error cargando datos');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredDailyData = useMemo(() => {
    if (filter === 'all') return dailyData;
    const now = new Date();
    let start: Date;
    if (filter === 'day') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (filter === 'week') { start = new Date(now); start.setDate(start.getDate() - 7); }
    else if (filter === 'month') { start = new Date(now); start.setMonth(start.getMonth() - 1); }
    else { start = new Date(now); start.setFullYear(start.getFullYear() - 1); }
    return dailyData.filter(d => new Date(d.date) >= start);
  }, [dailyData, filter]);

  const filteredPayments = useMemo(() => {
    let result = payments;
    if (filter !== 'all') {
      const now = new Date();
      let start: Date;
      if (filter === 'day') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
      else if (filter === 'week') { start = new Date(now); start.setDate(start.getDate() - 7); }
      else if (filter === 'month') { start = new Date(now); start.setMonth(start.getMonth() - 1); }
      else { start = new Date(now); start.setFullYear(start.getFullYear() - 1); }
      result = result.filter(p => p.createdAt && new Date(p.createdAt * 1000) >= start);
    }
    if (searchQ) {
      const q = searchQ.toLowerCase();
      result = result.filter(p =>
        p.id?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.customer?.name?.toLowerCase().includes(q) ||
        p.customer?.email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [payments, filter, searchQ]);

  const filteredRevenue = useMemo(() => {
    return filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [filteredPayments]);

  const handleTestPayment = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/admin/monei/test-payment', {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(parseFloat(testAmount) * 100),
          description: testDesc,
          mode: paymentMode,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const redirectUrl = data.payment?.nextAction?.redirectUrl || data.payment?.id;
        setTestResult({ ok: true, message: `Pago creado: ${data.payment?.id}`, redirectUrl });
      } else {
        setTestResult({ ok: false, message: data.error || 'Error creando pago' });
      }
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Error de red' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSubAction = async (subId: string, action: 'cancel' | 'pause' | 'resume') => {
    setActionLoading(`${subId}-${action}`);
    try {
      await apiFetch(`/api/admin/monei/subscriptions/${subId}/${action}`, { method: 'POST' });
      await loadData();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Cargando datos de MONEI...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {error}
        <button onClick={loadData} className="ml-auto text-red-600 hover:text-red-800 font-semibold flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Token Card */}
      <TokenCard config={config} />

      {/* Section Nav */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-x-auto">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          );
        })}
        <button onClick={loadData} className="ml-auto p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="Recargar">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Period Filter */}
      {(section === 'overview' || section === 'payments') && (
        <div className="flex gap-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-1 w-fit">
          {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === p
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {FILTER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {/* ═════════════════════════ OVERVIEW ═════════════════════════ */}
      {section === 'overview' && stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Ingresos totales" value={`${centsToEur(stats.totalRevenue)}€`} sub={`${stats.succeededPayments} pagos`} icon={DollarSign} color="emerald" />
            <StatCard label="Ingresos netos" value={`${centsToEur(stats.netRevenue)}€`} sub={`-${stats.commissionPercent}% comisión`} icon={Wallet} color="blue" />
            <StatCard label="Comisión MONEI" value={`${centsToEur(stats.commissionAmount)}€`} sub={`${stats.commissionPercent}%`} icon={Percent} color="amber" />
            <StatCard label="MRR estimado" value={`${centsToEur(stats.monthlyRecurring)}€`} sub="Ingresos recurrentes mensuales" icon={TrendingUp} color="indigo" />
            <StatCard label="Suscripciones activas" value={String(stats.activeSubscriptions)} sub={`${stats.totalSubscriptions} total`} icon={Activity} color="emerald" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Usuarios activos" value={String(stats.activeUsers)} icon={UserCheck} color="emerald" />
            <StatCard label="Impagados" value={String(stats.unpaidUsers)} icon={UserX} color="red" />
            <StatCard label="Sin suscripción" value={String(stats.noSubscriptionUsers)} icon={Users} color="gray" />
            <StatCard label="Suscr. vencidas" value={String(stats.pastDueSubscriptions)} sub={`${stats.pausedSubscriptions} pausadas`} icon={AlertTriangle} color="amber" />
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Ingresos por período ({FILTER_LABELS[filter]})
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <span>Total período: <strong className="text-emerald-600">{centsToEur(filteredRevenue)}€</strong></span>
              <span>({filteredPayments.length} pagos)</span>
            </div>
            <MiniChart data={filteredDailyData} />
          </div>
        </div>
      )}

      {/* ═════════════════════════ TEST PAYMENTS ═════════════════════════ */}
      {section === 'test' && (
        <div className="space-y-5">
          {/* Mode Toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Modo de pago:</span>
                <button
                  onClick={() => {
                    const next = paymentMode === 'test' ? 'live' : 'test';
                    if (next === 'live' && !config?.live?.hasApiKey) return;
                    if (next === 'test' && !config?.test?.hasApiKey) return;
                    setPaymentMode(next);
                    setTestResult(null);
                  }}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                    paymentMode === 'test'
                      ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                      : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                  }`}
                >
                  {paymentMode === 'test'
                    ? <><ToggleLeft className="w-5 h-5" /><ShieldAlert className="w-4 h-4" /> TEST</>
                    : <><ToggleRight className="w-5 h-5" /><ShieldCheck className="w-4 h-4" /> REAL (LIVE)</>
                  }
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${config?.test?.hasApiKey ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  Test: {config?.test?.hasApiKey ? 'Configurado' : 'Sin clave'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${config?.live?.hasApiKey ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  Live: {config?.live?.hasApiKey ? 'Configurado' : 'Sin clave'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TestTube className="w-5 h-5" /> Crear pago de prueba
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold ${
                paymentMode === 'test'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {paymentMode === 'test' ? 'TEST' : 'LIVE'}
              </span>
            </h3>
            {paymentMode === 'live' && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <div>
                  <strong>Modo LIVE activo.</strong> Los pagos creados aquí son <strong>reales</strong> y se cobrarán a la tarjeta introducida.
                  Usa un importe bajo para verificar que el flujo funciona correctamente.
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={testAmount}
                  onChange={e => setTestAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                <input
                  type="text"
                  value={testDesc}
                  onChange={e => setTestDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleTestPayment}
              disabled={testLoading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-50 ${
                paymentMode === 'test'
                  ? 'bg-indigo-600 hover:bg-indigo-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {paymentMode === 'test' ? 'Crear pago de prueba' : 'Crear pago REAL'}
            </button>
            {testResult && (
              <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {testResult.ok ? <Check className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
                {testResult.redirectUrl && testResult.redirectUrl.startsWith('http') && (
                  <a href={testResult.redirectUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline font-semibold">
                    Ir a pagar
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Test Cards Reference */}
          {paymentMode === 'test' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Tarjetas de prueba MONEI
              </h3>
              <p className="text-xs text-gray-500">Usa estas tarjetas en modo test. Caducidad: <strong>12/34</strong> — CVC: <strong>123</strong></p>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {TEST_CARDS.map(card => (
                  <div key={card.number} className="flex items-center gap-3 py-2.5">
                    <span className="font-mono text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 px-3 py-1 rounded-lg">{card.number}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${card.brand === 'Visa' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                      {card.brand}
                    </span>
                    <span className="text-xs text-gray-500 flex-1">{card.desc}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(card.number.replace(/\s/g, ''))}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Copiar número"
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paymentMode === 'live' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> Modo LIVE — Tarjeta real
              </h3>
              <p className="text-xs text-gray-500">
                Al crear el pago se generará un enlace de MONEI donde podrás introducir tu tarjeta real.
                El cobro será efectivo. Puedes hacer un reembolso desde la pestaña <strong>Cobros</strong> después.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Consejos para probar:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Usa un importe bajo (ej: 0.50€) para minimizar el coste.</li>
                  <li>Tras verificar el pago, puedes reembolsarlo desde Cobros &gt; Reembolsar.</li>
                  <li>Usa tu tarjeta personal de débito/crédito real.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════ SUBSCRIPTIONS ═════════════════════════ */}
      {section === 'subscriptions' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Activity className="w-5 h-5" /> Suscripciones ({subscriptions.length})
            </h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm w-56"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-right">Importe</th>
                  <th className="px-4 py-3 text-center">Intervalo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Próx. pago</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {subscriptions
                  .filter(s => {
                    if (!searchQ) return true;
                    const q = searchQ.toLowerCase();
                    return s.id?.toLowerCase().includes(q) ||
                      s.customer?.name?.toLowerCase().includes(q) ||
                      s.customer?.email?.toLowerCase().includes(q) ||
                      s.description?.toLowerCase().includes(q);
                  })
                  .map(sub => (
                    <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[120px] truncate">{sub.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{sub.customer?.name || '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{sub.customer?.email || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{sub.metadata?.planId || sub.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{centsToEur(sub.amount)}€</td>
                      <td className="px-4 py-3 text-center text-xs">{sub.interval}/{sub.intervalCount || 1}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${statusColor(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {sub.nextPaymentAt ? formatDate(sub.nextPaymentAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(sub.status === 'ACTIVE' || sub.status === 'TRIALING') && (
                            <>
                              <button
                                onClick={() => handleSubAction(sub.id, 'pause')}
                                disabled={actionLoading === `${sub.id}-pause`}
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                                title="Pausar"
                              >
                                <PauseCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleSubAction(sub.id, 'cancel')}
                                disabled={actionLoading === `${sub.id}-cancel`}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                                title="Cancelar"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {sub.status === 'PAUSED' && (
                            <button
                              onClick={() => handleSubAction(sub.id, 'resume')}
                              disabled={actionLoading === `${sub.id}-resume`}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                              title="Reanudar"
                            >
                              <PlayCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                {subscriptions.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay suscripciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════════════════════════ PAYMENTS TABLE ═════════════════════════ */}
      {section === 'payments' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Cobros ({filteredPayments.length})
              <span className="text-xs font-normal text-gray-400 ml-1">Total: {centsToEur(filteredRevenue)}€</span>
            </h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-right">Importe</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[120px] truncate">{p.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.customer?.name || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{p.customer?.email || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{p.description || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{centsToEur(p.amount)}€</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${statusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay pagos en este período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════════════════════════ USERS ═════════════════════════ */}
      {section === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-1 w-fit">
            {([
              { id: 'active' as const, label: `Activos (${userBreakdown.active.length})`, color: 'emerald' },
              { id: 'unpaid' as const, label: `Impagados (${userBreakdown.unpaid.length})`, color: 'red' },
              { id: 'nosub' as const, label: `Sin suscripción (${userBreakdown.noSubscription.length})`, color: 'gray' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setUserTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  userTab === t.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    {userTab !== 'nosub' && <th className="px-4 py-3 text-center">Plan</th>}
                    {userTab !== 'nosub' && <th className="px-4 py-3 text-center">Estado</th>}
                    {userTab !== 'nosub' && <th className="px-4 py-3 text-center">Último pago</th>}
                    {userTab === 'nosub' && <th className="px-4 py-3 text-center">Registrado</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(userTab === 'active' ? userBreakdown.active : userTab === 'unpaid' ? userBreakdown.unpaid : userBreakdown.noSubscription).map(u => (
                    <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{u.fullName || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{u.email || '—'}</td>
                      {userTab !== 'nosub' && <td className="px-4 py-3 text-center text-xs font-semibold">{u.plan || '—'}</td>}
                      {userTab !== 'nosub' && (
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${userStatusColor(u.status || '')}`}>
                            {u.status || '—'}
                          </span>
                        </td>
                      )}
                      {userTab !== 'nosub' && (
                        <td className="px-4 py-3 text-center text-xs text-gray-500">
                          {u.lastPaymentAt ? formatDate(u.lastPaymentAt) : '—'}
                        </td>
                      )}
                      {userTab === 'nosub' && (
                        <td className="px-4 py-3 text-center text-xs text-gray-500">
                          {u.createdAt ? formatDate(u.createdAt) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                  {(userTab === 'active' ? userBreakdown.active : userTab === 'unpaid' ? userBreakdown.unpaid : userBreakdown.noSubscription).length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin usuarios en esta categoría</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════ FORECAST ═════════════════════════ */}
      {section === 'forecast' && stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="MRR actual"
              value={`${centsToEur(stats.monthlyRecurring)}€`}
              sub={`${stats.activeSubscriptions} suscripciones activas`}
              icon={TrendingUp}
              color="indigo"
            />
            <StatCard
              label="Pronóstico 6 meses (bruto)"
              value={`${centsToEur(stats.monthlyRecurring * 6)}€`}
              sub="Basado en suscripciones actuales"
              icon={ArrowUpRight}
              color="emerald"
            />
            <StatCard
              label="Pronóstico 6 meses (neto)"
              value={`${centsToEur(Math.round(stats.monthlyRecurring * 6 * (1 - stats.commissionPercent / 100)))}€`}
              sub={`Después de ${stats.commissionPercent}% comisión`}
              icon={Wallet}
              color="blue"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Pronóstico de ingresos (próximos 6 meses)
            </h3>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-400 inline-block opacity-50" /> Bruto</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Neto</span>
            </div>
            <BarChartForecast forecast={forecast} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Desglose mensual
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Mes</th>
                    <th className="px-4 py-2 text-right">Bruto proyectado</th>
                    <th className="px-4 py-2 text-right">Comisión</th>
                    <th className="px-4 py-2 text-right">Neto proyectado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {forecast.map(f => (
                    <tr key={f.month}>
                      <td className="px-4 py-2 font-medium">{f.month}</td>
                      <td className="px-4 py-2 text-right">{centsToEur(f.projected)}€</td>
                      <td className="px-4 py-2 text-right text-amber-600">{centsToEur(f.projected - f.projectedNet)}€</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-600">{centsToEur(f.projectedNet)}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 space-y-2">
            <h4 className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Análisis
            </h4>
            <ul className="text-sm text-indigo-700 dark:text-indigo-300 space-y-1">
              <li>Con <strong>{stats.activeSubscriptions}</strong> suscripciones activas, generas <strong>{centsToEur(stats.monthlyRecurring)}€/mes</strong> de ingresos recurrentes.</li>
              <li>Tienes <strong>{stats.unpaidUsers}</strong> usuarios con pagos pendientes/fallidos que podrías recuperar.</li>
              <li><strong>{stats.noSubscriptionUsers}</strong> usuarios registrados aún no tienen suscripción — oportunidad de conversión.</li>
              {stats.pastDueSubscriptions > 0 && (
                <li className="text-amber-700 dark:text-amber-400">Hay <strong>{stats.pastDueSubscriptions}</strong> suscripciones vencidas que necesitan atención.</li>
              )}
              <li>Proyección anual estimada: <strong>{centsToEur(stats.monthlyRecurring * 12)}€</strong> bruto / <strong>{centsToEur(Math.round(stats.monthlyRecurring * 12 * (1 - stats.commissionPercent / 100)))}€</strong> neto.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
