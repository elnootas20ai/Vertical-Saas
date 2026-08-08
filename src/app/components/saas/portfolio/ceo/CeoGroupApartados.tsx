import { useMemo, type ReactNode } from 'react';
import {
  Banknote,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import type { PortfolioBusiness } from '../../../../hooks/usePortfolioOverview';
import {
  companyGeneratedMonth,
  companyGeneratedPrevMonthComparable,
  sumCompanyGenerated,
} from '../portfolioCompanyPulse';
import { comparableMomPct } from '../../../../lib/portfolioMetrics';
import {
  buildGroupPnL,
  buildPeopleGlance,
  formatMomLabel,
} from './ceoPortfolioMath';
import { MomBadge } from './CeoGlanceRail';
import { CeoMomWinnersLosers } from './CeoCompanyCompare';
import type { CeoCompanyVision } from './ceoVisionModel';
import type { PortfolioFinanceTotals } from '../../../../lib/portfolioMetrics';

/**
 * Apartados GENERALES del grupo (todas las empresas / verticales).
 * Dinero, personas, clientes, ritmo.
 */
export function CeoGroupApartados({
  visions,
  rows,
  finance,
  canViewEbitda,
  laborByBiz,
  laborLoading,
  onOpen,
}: {
  visions: CeoCompanyVision[];
  rows: PortfolioBusiness[];
  finance: PortfolioFinanceTotals;
  canViewEbitda: boolean;
  laborByBiz: Record<string, number>;
  laborLoading: boolean;
  onOpen: (businessId: string) => void;
}) {
  const generated = useMemo(() => sumCompanyGenerated(rows), [rows]);
  const pnl = useMemo(() => buildGroupPnL(finance, canViewEbitda), [finance, canViewEbitda]);
  const people = useMemo(() => buildPeopleGlance(rows), [rows]);
  const laborTotal = useMemo(
    () => Object.values(laborByBiz).reduce((s, n) => s + (Number(n) || 0), 0),
    [laborByBiz],
  );
  const staffTotal = useMemo(
    () => visions.reduce((s, v) => s + (Number(v.staffing) || 0), 0),
    [visions],
  );
  const clients = useMemo(() => {
    let total = 0;
    let neu = 0;
    let prev = 0;
    for (const r of rows) {
      total += Number(r.clients.totalClients) || 0;
      neu += Number(r.clients.newClientsMonth) || 0;
      prev += Number(r.clients.newClientsPrevMonth) || 0;
    }
    return {
      total,
      neu,
      prev,
      mom: comparableMomPct(neu, prev),
    };
  }, [rows]);

  const generatedMom = useMemo(
    () =>
      comparableMomPct(
        generated.month,
        rows.reduce((s, r) => s + companyGeneratedPrevMonthComparable(r), 0),
      ),
    [generated.month, rows],
  );

  const moneyBars = useMemo(
    () =>
      visions
        .map((v) => ({
          id: v.businessId,
          name: v.name.length > 10 ? `${v.name.slice(0, 9)}…` : v.name,
          fullName: v.name,
          ingresos: Math.round(Number(v.financeIncome) || 0),
          gastos: Math.round(Number(v.expenses) || 0),
          color: v.brandColor,
        }))
        .filter((d) => d.ingresos > 0 || d.gastos > 0)
        .slice(0, 8),
    [visions],
  );

  const trendSeries = useMemo(() => buildGroupMonthTrend(rows), [rows]);

  const clientChart = useMemo(() => clientBars(rows, visions), [rows, visions]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Strip: 4 apartados */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ApartadoChip
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="Dinero"
          value={formatMoneyEs(generated.month)}
          sub={formatMomLabel(generatedMom) || 'mes · grupo'}
          tone={generatedMom != null && generatedMom < 0 ? 'bad' : 'ok'}
        />
        <ApartadoChip
          icon={<Users className="h-3.5 w-3.5" />}
          label="Personas"
          value={
            laborLoading && laborTotal === 0
              ? '…'
              : laborTotal > 0
                ? formatMoneyEs(laborTotal)
                : formatNumberEs(people.clockedInNow, { maxFraction: 0 })
          }
          sub={
            laborTotal > 0
              ? `pago trab. · ${formatNumberEs(people.clockedInNow, { maxFraction: 0 })}${staffTotal > 0 ? `/${formatNumberEs(staffTotal, { maxFraction: 0 })}` : ''} fichados`
              : `${formatNumberEs(people.clockedInNow, { maxFraction: 0 })}${staffTotal > 0 ? `/${formatNumberEs(staffTotal, { maxFraction: 0 })}` : ''} fichados`
          }
        />
        <ApartadoChip
          icon={<UserRound className="h-3.5 w-3.5" />}
          label="Clientes nuevos"
          value={
            rows.length === 0
              ? '…'
              : formatNumberEs(clients.neu, { maxFraction: 0 })
          }
          sub={
            rows.length === 0
              ? 'cargando…'
              : `${formatNumberEs(clients.total, { maxFraction: 0 })} en total · mes`
          }
          tone={clients.neu > 0 ? 'ok' : undefined}
        />
        <ApartadoChip
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Ritmo"
          value={formatMomLabel(generatedMom) || '—'}
          sub="mismo tramo vs ant."
          tone={generatedMom != null && generatedMom < 0 ? 'bad' : 'ok'}
        />
      </div>

      {/* 1. Dinero */}
      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
        <header className="border-b border-stone-100 px-3 py-2.5 sm:px-4 dark:border-stone-800">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">1 · Dinero</p>
          <h2 className="text-sm font-bold text-stone-900 dark:text-white">
            Cuenta de resultados del grupo
          </h2>
          <p className="text-[11px] text-stone-500">Todas las empresas · mes en curso</p>
        </header>
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid grid-cols-2 gap-2">
            <MoneyTile label="Generado" value={formatMoneyEs(generated.month)} extra={<MomBadge pct={generatedMom} />} />
            <MoneyTile label="Ingresos" value={formatMoneyEs(pnl.incomeMonth)} extra={<MomBadge pct={pnl.incomeMom} />} />
            <MoneyTile label="Gastos" value={formatMoneyEs(pnl.expensesMonth)} />
            <MoneyTile
              label={pnl.resultLabel}
              value={formatMoneyEs(pnl.result)}
              tone={pnl.result >= 0 ? 'ok' : 'bad'}
            />
            <MoneyTile label="Pendiente" value={formatMoneyEs(pnl.pendingAmount)} />
            <MoneyTile label="Bancos" value={formatMoneyEs(pnl.cashBalance)} />
          </div>
          {moneyBars.length > 0 ? (
            <div className="h-[160px] sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moneyBars} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.18)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#78716c' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatMoneyEs(value), name === 'ingresos' ? 'Ingresos' : 'Gastos']}
                    labelFormatter={(_, p) => p?.[0]?.payload?.fullName || ''}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
                  />
                  <Bar dataKey="ingresos" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="gastos" fill="#a8a29e" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="px-0.5 text-[11px] text-stone-400">Sin movimientos este mes</p>
          )}
        </div>
      </section>

      {/* 2 + 3 Personas / Clientes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
          <header className="border-b border-stone-100 px-3 py-2.5 sm:px-4 dark:border-stone-800">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">2 · Personas</p>
            <h2 className="text-sm font-bold text-stone-900 dark:text-white">RRHH del grupo</h2>
            <p className="text-[11px] text-stone-500">Fichajes en vivo y coste de plantilla · mes</p>
          </header>
          <div className="grid grid-cols-2 gap-2 p-3 sm:p-4">
            <MoneyTile
              label="Pago trabajadores"
              value={laborLoading && laborTotal === 0 ? '…' : laborTotal > 0 ? formatMoneyEs(laborTotal) : '—'}
            />
            <MoneyTile
              label="Fichados ahora"
              value={
                staffTotal > 0
                  ? `${formatNumberEs(people.clockedInNow, { maxFraction: 0 })}/${formatNumberEs(staffTotal, { maxFraction: 0 })}`
                  : formatNumberEs(people.clockedInNow, { maxFraction: 0 })
              }
            />
            <MoneyTile
              label="Vacaciones pend."
              value={formatNumberEs(people.pendingVacations, { maxFraction: 0 })}
            />
            <MoneyTile
              label="Alertas horario"
              value={formatNumberEs(people.scheduleAlerts, { maxFraction: 0 })}
              tone={people.scheduleAlerts > 0 ? 'bad' : undefined}
            />
          </div>
          {visions.length > 0 ? (
            <ul className="flex-1 space-y-1 overflow-y-auto border-t border-stone-100 px-3 py-2 dark:border-stone-800">
              {visions.slice(0, 6).map((v) => {
                const pay = laborByBiz[v.businessId] || 0;
                return (
                  <li key={v.businessId}>
                    <button
                      type="button"
                      onClick={() => onOpen(v.businessId)}
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[11px] hover:bg-stone-50 dark:hover:bg-stone-900/50"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: v.brandColor }} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-stone-800 dark:text-stone-100">
                        {v.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-stone-500">
                        {v.staffing > 0 ? `${v.clockedIn}/${v.staffing} fichados` : '—'}
                      </span>
                      <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                        {pay > 0 ? formatMoneyEs(pay) : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
          <header className="border-b border-stone-100 px-3 py-2.5 sm:px-4 dark:border-stone-800">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">3 · Clientes</p>
            <h2 className="text-sm font-bold text-stone-900 dark:text-white">CRM del grupo</h2>
            <p className="text-[11px] text-stone-500">Altas del mes por empresa</p>
          </header>
          <div className="grid grid-cols-2 gap-2 p-3 sm:p-4">
            <MoneyTile
              label="Nuevos este mes"
              value={rows.length === 0 ? '…' : formatNumberEs(clients.neu, { maxFraction: 0 })}
              extra={rows.length > 0 ? <MomBadge pct={clients.mom} /> : undefined}
            />
            <MoneyTile
              label="Base total"
              value={rows.length === 0 ? '…' : formatNumberEs(clients.total, { maxFraction: 0 })}
            />
          </div>
          {clientChart.length > 0 ? (
            <div className="min-h-[140px] flex-1 px-2 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientChart} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 10, fill: '#78716c' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatNumberEs(value, { maxFraction: 0 }), 'Nuevos']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
                  />
                  <Bar dataKey="neu" radius={[0, 6, 6, 0]} maxBarSize={14}>
                    {clientChart.map((d) => (
                      <Cell key={d.id} fill={d.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-3 pb-4 pt-2">
              <p className="text-[11px] text-stone-400">
                {rows.length === 0 ? 'Cargando clientes…' : 'Sin altas de clientes este mes'}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* 4. Ritmo */}
      <section className="space-y-2">
        <div className="px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">4 · Ritmo</p>
          <h2 className="text-sm font-bold text-stone-900 dark:text-white">Tendencia del grupo</h2>
        </div>
        {trendSeries.length >= 2 ? (
          <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
            <div className="h-[180px] px-2 py-3 sm:px-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#78716c' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatMoneyEs(value), 'Facturación']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#2563eb' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
        <CeoMomWinnersLosers visions={visions} onOpen={onOpen} />
      </section>
    </div>
  );
}

function ApartadoChip({
  icon,
  label,
  value,
  sub,
  tone,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'ok' | 'bad' | 'warn';
  className?: string;
}) {
  const valueCls =
    tone === 'bad'
      ? 'text-rose-600 dark:text-rose-400'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'ok'
          ? 'text-stone-900 dark:text-white'
          : 'text-stone-900 dark:text-white';
  return (
    <div
      className={`rounded-2xl border border-stone-200/80 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950 ${className}`}
    >
      <div className="flex items-center gap-1 text-stone-500">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 truncate text-[15px] font-extrabold tabular-nums sm:text-base ${valueCls}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-stone-400">{sub}</p>
    </div>
  );
}

function MoneyTile({
  label,
  value,
  extra,
  tone,
}: {
  label: string;
  value: string;
  extra?: ReactNode;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/80 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-900/50">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
        <p
          className={`truncate text-sm font-extrabold tabular-nums ${
            tone === 'ok'
              ? 'text-emerald-700 dark:text-emerald-400'
              : tone === 'bad'
                ? 'text-rose-600'
                : 'text-stone-900 dark:text-white'
          }`}
        >
          {value}
        </p>
        {extra}
      </div>
    </div>
  );
}

function clientBars(rows: PortfolioBusiness[], visions: CeoCompanyVision[]) {
  const colorById = new Map(visions.map((v) => [v.businessId, v.brandColor]));
  return rows
    .map((r) => ({
      id: r.businessId,
      name: (r.business.name || 'Empresa').length > 9
        ? `${(r.business.name || '').slice(0, 8)}…`
        : r.business.name || 'Empresa',
      neu: Number(r.clients.newClientsMonth) || 0,
      color: colorById.get(r.businessId) || '#2563eb',
    }))
    .filter((d) => d.neu > 0)
    .sort((a, b) => b.neu - a.neu)
    .slice(0, 6);
}

function buildGroupMonthTrend(rows: PortfolioBusiness[]) {
  const map = new Map<string, { yearMonth: string; label: string; total: number }>();
  for (const r of rows) {
    for (const m of r.cajaMonthlyTotals || []) {
      const key = String(m.yearMonth || '');
      if (!key) continue;
      const prev = map.get(key);
      const add = Number(m.total) || 0;
      if (prev) prev.total += add;
      else map.set(key, { yearMonth: key, label: m.label || key.slice(5), total: add });
    }
  }
  const series = [...map.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  if (series.length >= 2) return series.slice(-8);

  // Fallback: MTD comparable por empresa agregado (2 puntos)
  const cur = rows.reduce((s, r) => s + companyGeneratedMonth(r), 0);
  const prev = rows.reduce((s, r) => s + companyGeneratedPrevMonthComparable(r), 0);
  if (cur <= 0 && prev <= 0) return [];
  return [
    { yearMonth: 'prev', label: 'Tramo ant.', total: Math.round(prev) },
    { yearMonth: 'cur', label: 'Este tramo', total: Math.round(cur) },
  ];
}
