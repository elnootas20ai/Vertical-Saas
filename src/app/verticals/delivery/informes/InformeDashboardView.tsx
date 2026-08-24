import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Download, FileSpreadsheet, FileText, Info, Lock } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import type {
  InformeAlert,
  InformeChart,
  InformeDashboard,
  InformeFilters,
  InformeKpi,
  InformeTable,
} from './loaders/informeTypes';
import type { InformeExportFormat } from './VertialInformeProgress';

function KpiCard({ kpi }: { kpi: InformeKpi }) {
  const delta = kpi.deltaPct;
  const deltaTone =
    delta == null
      ? 'text-stone-400'
      : delta > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : delta < 0
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-stone-500';
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{kpi.label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-stone-900 dark:text-stone-100">{kpi.value}</p>
      {delta !== undefined && (
        <p className={`mt-1 text-xs font-semibold tabular-nums ${deltaTone}`}>
          {delta == null ? 'vs ant. n/d' : `${delta > 0 ? '+' : ''}${formatNumberEs(delta, { minFraction: 1, maxFraction: 1 })} % vs ant.`}
        </p>
      )}
      {kpi.hint ? <p className="mt-1 text-[10px] text-stone-400">{kpi.hint}</p> : null}
    </div>
  );
}

function AlertBanner({ alert }: { alert: InformeAlert }) {
  const cls =
    alert.severity === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
      : alert.severity === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
  return (
    <div className={`flex gap-2 rounded-xl border px-3 py-2 text-xs ${cls}`}>
      {alert.severity === 'info' ? <Info className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span>{alert.message}</span>
    </div>
  );
}

function formatTableCell(format: InformeTable['columns'][0]['format'], value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (format === 'money') return formatMoneyEs(value);
    if (format === 'pct') return `${formatNumberEs(value, { minFraction: 1, maxFraction: 1 })} %`;
    if (format === 'number') return formatNumberEs(value, { minFraction: 0, maxFraction: 2 });
  }
  return String(value);
}

function BreakdownTable({ table }: { table: InformeTable }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    if (!sortKey) return table.rows;
    const copy = [...table.rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = typeof va === 'number' ? va : Number(va);
      const nb = typeof vb === 'number' ? vb : Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return asc ? na - nb : nb - na;
      return asc
        ? String(va ?? '').localeCompare(String(vb ?? ''), 'es')
        : String(vb ?? '').localeCompare(String(va ?? ''), 'es');
    });
    return copy;
  }, [table.rows, sortKey, asc]);

  const onSort = (key: string) => {
    if (!table.sortable) return;
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{table.title}</h3>
      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-stone-50 dark:bg-stone-800/80">
            <tr>
              {table.columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : ''
                  } ${table.sortable ? 'cursor-pointer select-none hover:text-blue-600' : ''}`}
                  onClick={() => onSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? (asc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={table.columns.length} className="px-3 py-4 text-stone-400">
                  Sin datos en este desglose
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx} className="bg-white dark:bg-stone-900">
                  {table.columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-stone-800 dark:text-stone-200 ${
                        col.align === 'right' || col.format === 'money' || col.format === 'pct' || col.format === 'number'
                          ? 'text-right tabular-nums font-medium'
                          : ''
                      }`}
                    >
                      {formatTableCell(col.format, row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartBlock({ chart }: { chart: InformeChart }) {
  if (!chart.points.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900">
        Sin serie temporal para este periodo
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: { background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' },
    itemStyle: { color: '#fff' },
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <h3 className="mb-3 text-sm font-bold text-stone-900 dark:text-stone-100">{chart.title}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'stackedBar' ? (
            <BarChart data={chart.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              {chart.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color || '#2563eb'} />
              ))}
            </BarChart>
          ) : chart.type === 'bar' ? (
            <BarChart data={chart.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              {chart.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || '#2563eb'} />
              ))}
            </BarChart>
          ) : chart.type === 'composed' ? (
            <ComposedChart data={chart.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              {chart.series.map((s, i) =>
                i === 0 ? (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || '#22c55e'} />
                ) : (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color || '#2563eb'}
                    strokeWidth={2}
                    dot={false}
                  />
                ),
              )}
            </ComposedChart>
          ) : (
            <LineChart data={chart.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              {chart.series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color || (i === 0 ? '#2563eb' : '#94a3b8')}
                  strokeWidth={2}
                  strokeDasharray={i > 0 ? '4 4' : undefined}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function InformeCommonFiltersBar({
  filters,
  onChange,
  centers,
  categories,
  employees,
  providers,
  showCategory,
  showEmployee,
  showProvider,
}: {
  filters: InformeFilters;
  onChange: (next: InformeFilters) => void;
  centers?: { id: string; name: string }[];
  categories?: string[];
  employees?: string[];
  providers?: string[];
  showCategory?: boolean;
  showEmployee?: boolean;
  showProvider?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
      <div>
        <label className="text-[10px] font-bold uppercase text-stone-400">Desde</label>
        <input
          type="date"
          value={filters.dateFrom || ''}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="mt-1 block rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase text-stone-400">Hasta</label>
        <input
          type="date"
          value={filters.dateTo || ''}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="mt-1 block rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase text-stone-400">Centro / sucursal</label>
        <select
          value={filters.centerId || ''}
          onChange={(e) => onChange({ ...filters, centerId: e.target.value || undefined })}
          className="mt-1 block min-w-[10rem] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <option value="">Todas</option>
          {(centers || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
        <input
          type="checkbox"
          checked={Boolean(filters.comparePrevious)}
          onChange={(e) => onChange({ ...filters, comparePrevious: e.target.checked })}
          className="rounded border-stone-300"
        />
        Comparar con periodo anterior
      </label>
      {showCategory && (categories?.length || 0) > 0 && (
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400">Categoría</label>
          <select
            value={filters.category || ''}
            onChange={(e) => onChange({ ...filters, category: e.target.value || undefined })}
            className="mt-1 block min-w-[9rem] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="">Todas</option>
            {categories!.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      {showEmployee && (employees?.length || 0) > 0 && (
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400">Empleado</label>
          <select
            value={filters.employee || ''}
            onChange={(e) => onChange({ ...filters, employee: e.target.value || undefined })}
            className="mt-1 block min-w-[9rem] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="">Todos</option>
            {employees!.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      {showProvider && (providers?.length || 0) > 0 && (
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400">Proveedor</label>
          <select
            value={filters.provider || ''}
            onChange={(e) => onChange({ ...filters, provider: e.target.value || undefined })}
            className="mt-1 block min-w-[9rem] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="">Todos</option>
            {providers!.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function InformeDashboardView({
  title,
  summary,
  dashboard,
  filters,
  onFiltersChange,
  extraFilters,
  onBack,
  onDownload,
}: {
  title: string;
  summary: string;
  dashboard: InformeDashboard;
  filters: InformeFilters;
  onFiltersChange: (next: InformeFilters) => void;
  extraFilters?: { category?: boolean; employee?: boolean; provider?: boolean };
  onBack: () => void;
  onDownload: (format: InformeExportFormat) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<InformeExportFormat | null>(null);

  const run = async (format: InformeExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      await onDownload(format);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Informe listo
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={VERTIAL_BTN_PRIMARY} disabled={Boolean(busy)} onClick={() => void run('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" />
            {busy === 'xlsx' ? '…' : 'Excel'}
          </button>
          <button type="button" className={VERTIAL_BTN_PRIMARY} disabled={Boolean(busy)} onClick={() => void run('pdf')}>
            <FileText className="h-4 w-4" />
            {busy === 'pdf' ? '…' : 'PDF'}
          </button>
          <button type="button" className={VERTIAL_BTN_SECONDARY} disabled={Boolean(busy)} onClick={() => void run('csv')}>
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      <InformeCommonFiltersBar
        filters={filters}
        onChange={onFiltersChange}
        centers={dashboard.filterOptions?.centers}
        categories={dashboard.filterOptions?.categories}
        employees={dashboard.filterOptions?.employees}
        providers={dashboard.filterOptions?.providers}
        showCategory={extraFilters?.category}
        showEmployee={extraFilters?.employee}
        showProvider={extraFilters?.provider}
      />

      {(dashboard.alerts || []).map((a) => (
        <AlertBanner key={a.id} alert={a} />
      ))}

      {/* 1) KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dashboard.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* 2) Chart */}
      {dashboard.chart ? <ChartBlock chart={dashboard.chart} /> : null}

      {/* 3) Tables */}
      <div className="space-y-5">
        {dashboard.tables.map((t) => (
          <BreakdownTable key={t.id} table={t} />
        ))}
      </div>

      <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={onBack}>
        Cambiar mes
      </button>
    </div>
  );
}

export function InformePlanLockedCard({
  title,
  requiredPlan,
  onBack,
}: {
  title: string;
  requiredPlan: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border-2 border-dashed border-stone-200 bg-white p-8 text-center dark:border-stone-700 dark:bg-stone-900">
      <Lock className="mx-auto h-10 w-10 text-stone-300" />
      <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Este informe requiere plan <span className="font-bold">{requiredPlan}</span>. Actualiza tu suscripción para desbloquearlo.
      </p>
      <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={onBack}>
        Volver al catálogo
      </button>
    </div>
  );
}
