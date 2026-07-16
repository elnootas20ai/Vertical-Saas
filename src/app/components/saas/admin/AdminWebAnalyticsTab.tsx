import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Eye,
  MousePointerClick,
  RefreshCw,
  UserPlus,
  Users,
  Globe,
} from 'lucide-react';
import { authFetch } from '../../../lib/authApi';
import { getApiBase } from '../../../lib/apiBase';
import { toast } from 'sonner';

type DayPoint = {
  date: string;
  pageviews: number;
  uniqueVisitors: number;
  events: number;
};

type AnalyticsPayload = {
  days: number;
  totals: {
    pageviews: number;
    uniqueVisitors: number;
    ctaClicks: number;
    eventsTotal: number;
  };
  series: DayPoint[];
  topPaths: Array<{ key: string; count: number }>;
  topEvents: Array<{ key: string; count: number }>;
  topReferrers: Array<{ key: string; count: number }>;
};

type SignupsPayload = {
  days: number;
  newAccounts: number;
  newCompanies: number;
};

const EVENT_LABELS: Record<string, string> = {
  cta_register: 'Probar / registro',
  cta_sales: 'Hazte colaborador',
  cta_login: 'Empezar / login',
  cta_plan: 'CTA plan',
  cta_worker: 'Acceso trabajadores',
  cta_tablet: 'TPV tablet',
  section_view: 'Sección vista',
};

function formatDay(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">
        <Icon className="w-4 h-4 text-amber-500" />
        {label}
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function MiniBars({ series }: { series: DayPoint[] }) {
  const max = Math.max(1, ...series.map((s) => s.pageviews));
  return (
    <div className="flex items-end gap-1 h-28">
      {series.map((s) => (
        <div key={s.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full rounded-t bg-amber-400/80 dark:bg-amber-500/70"
            style={{ height: `${Math.max(4, (s.pageviews / max) * 100)}%` }}
            title={`${s.date}: ${s.pageviews} visitas`}
          />
          <span className="text-[9px] text-gray-400 truncate w-full text-center">
            {formatDay(s.date)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RankList({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  labelFor?: (key: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sin datos todavía.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-gray-700 dark:text-gray-300">
                {labelFor ? labelFor(row.key) : row.key}
              </span>
              <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminWebAnalyticsTab() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [signups, setSignups] = useState<SignupsPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${getApiBase()}/api/admin/web-analytics?days=${days}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo cargar');
      }
      setAnalytics(data.analytics || null);
      setSignups(data.signups || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar estadísticas');
      setAnalytics(null);
      setSignups(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = analytics?.series || [];
  const chartSeries = series.length > 14 ? series.slice(-14) : series;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Web y landing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Visitas de la página pública (con consentimiento de cookies) y altas SaaS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Eye}
          label="Visitas"
          value={analytics?.totals.pageviews ?? '—'}
          hint={`Últimos ${days} días`}
        />
        <StatCard
          icon={Users}
          label="Visitantes únicos"
          value={analytics?.totals.uniqueVisitors ?? '—'}
          hint="Aprox. por sesión / día"
        />
        <StatCard
          icon={MousePointerClick}
          label="Clicks CTA"
          value={analytics?.totals.ctaClicks ?? '—'}
          hint="Registro, ventas, planes…"
        />
        <StatCard
          icon={UserPlus}
          label="Altas empresa"
          value={signups?.newCompanies ?? '—'}
          hint={`${signups?.newAccounts ?? 0} cuentas en total`}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Visitas diarias {chartSeries.length < series.length ? '(últimos 14 días)' : ''}
          </h3>
        </div>
        {loading && !analytics ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : chartSeries.every((s) => s.pageviews === 0) ? (
          <p className="text-sm text-gray-500">
            Aún no hay visitas registradas. Se cuentan cuando un visitante acepta cookies analíticas
            en la landing.
          </p>
        ) : (
          <MiniBars series={chartSeries} />
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <RankList title="Rutas más vistas" rows={analytics?.topPaths || []} />
        <RankList
          title="Eventos / CTAs"
          rows={analytics?.topEvents || []}
          labelFor={(k) => EVENT_LABELS[k] || k}
        />
        <RankList
          title="Orígenes"
          rows={analytics?.topReferrers || []}
          labelFor={(k) => (k === 'direct' ? 'Directo / sin referrer' : k)}
        />
      </div>

      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
        <Globe className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          RGPD: solo se registra tráfico de quien acepta cookies analíticas. Las altas SaaS salen
          de cuentas reales (sí se ven aunque no haya tracking de landing).
        </p>
      </div>
    </div>
  );
}
