import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Minus } from 'lucide-react';
import type { PortfolioBusiness } from '../../hooks/usePortfolioOverview';
import {
  buildCompanyLeague,
  getLeagueMetrics,
  type CompanyLeagueEntry,
  type LeagueMetricDef,
  type LeagueMetricId,
} from '../../lib/portfolioLeague';
import { BUSINESS_TYPE_COLORS, BUSINESS_TYPE_LABELS } from './BusinessCarousel';
import type { BusinessType } from '../../lib/businessApi';

type Props = {
  rows: PortfolioBusiness[];
  onEnter: (businessId: string) => void;
};

const RANK_BAR: Record<number, { bg: string; text: string }> = {
  1: { bg: 'from-indigo-500 to-violet-600', text: 'text-white' },
  2: { bg: 'from-slate-400 to-slate-500', text: 'text-white' },
  3: { bg: 'from-slate-300 to-slate-400', text: 'text-slate-900' },
};

export function PortfolioCompanyLeague({ rows, onEnter }: Props) {
  const [metric, setMetric] = useState<LeagueMetricId>('revenue');

  const leagueMetrics = useMemo(() => getLeagueMetrics(rows), [rows]);
  const league = useMemo(() => buildCompanyLeague(rows, metric), [rows, metric]);
  const metricDef = leagueMetrics.find((m) => m.id === metric)!;
  const podium = league.slice(0, 3);
  const rest = league.slice(3);
  const groupAvgMom =
    league.length > 0
      ? Math.round(
          (league.reduce((s, e) => s + (e.momPct ?? 0), 0) / league.length) * 10,
        ) / 10
      : 0;

  if (rows.length === 0) return null;

  if (rows.length === 1) {
    const solo = league[0];
    if (!solo) return null;
    return (
      <section className="rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-gray-900 dark:to-violet-950/30 p-4 sm:p-5 overflow-hidden">
        <LeagueHeader metrics={leagueMetrics} metric={metric} onMetric={setMetric} subtitle="Tu empresa vs el mes anterior" />
        <SingleCompanyBoard entry={solo} row={rows[0]} onEnter={() => onEnter(solo.businessId)} />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-gray-900 dark:to-violet-950/30 p-4 sm:p-5 overflow-hidden shadow-sm">
      <LeagueHeader
        metrics={leagueMetrics}
        metric={metric}
        onMetric={setMetric}
        subtitle={`${metricDef.label} · media del grupo ${groupAvgMom >= 0 ? '+' : ''}${groupAvgMom}% vs mes ant.`}
      />

      {podium.length >= 2 && (
        <div className="mt-5 mb-6">
          <Podium podium={podium} metricLabel={metricDef.shortLabel} onEnter={onEnter} />
        </div>
      )}

      <div className="space-y-2">
        {(podium.length < 2 ? league : rest).map((entry) => (
          <LeagueRow key={entry.businessId} entry={entry} onEnter={() => onEnter(entry.businessId)} />
        ))}
      </div>

      <p className="mt-4 text-[10px] text-center text-indigo-600/70 dark:text-indigo-400/70">
        Comparativa por {metricDef.label.toLowerCase()} · pulsa una empresa para entrar
      </p>
    </section>
  );
}

function LeagueHeader({
  metrics,
  metric,
  onMetric,
  subtitle,
}: {
  metrics: LeagueMetricDef[];
  metric: LeagueMetricId;
  onMetric: (m: LeagueMetricId) => void;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 tracking-tight">
              Comparativa entre empresas
            </h3>
            <p className="text-[11px] text-indigo-600/90 dark:text-indigo-300/90">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white/80 dark:bg-gray-900/60 border border-indigo-100 dark:border-indigo-900/50">
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onMetric(m.id)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              metric === m.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
            }`}
          >
            {m.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function Podium({
  podium,
  metricLabel,
  onEnter,
}: {
  podium: CompanyLeagueEntry[];
  metricLabel: string;
  onEnter: (id: string) => void;
}) {
  const order = podium.length >= 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : podium;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 px-2 min-h-[148px]">
      {order.map((entry) => {
        const bar = RANK_BAR[entry.rank] ?? RANK_BAR[3];
        const height = entry.rank === 1 ? 'h-28 sm:h-32' : entry.rank === 2 ? 'h-20 sm:h-24' : 'h-16 sm:h-20';
        return (
          <button
            key={entry.businessId}
            type="button"
            onClick={() => onEnter(entry.businessId)}
            className="flex flex-col items-center flex-1 max-w-[120px] group"
          >
            <div className="relative mb-2 rounded-2xl p-0.5 bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 transition-transform group-hover:scale-105">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[14px] bg-gray-900 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                {entry.logo ? (
                  <img src={entry.logo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-white">{entry.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
            </div>
            <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 text-center line-clamp-2 leading-tight mb-1">
              {entry.name}
            </p>
            <p className="text-xs font-black text-indigo-700 dark:text-indigo-300 tabular-nums">{entry.scoreFormatted}</p>
            <TrendPill momPct={entry.momPct} compact />
            <div
              className={`mt-2 w-full ${height} rounded-t-xl bg-gradient-to-t ${bar.bg} opacity-95 flex items-end justify-center pb-2`}
            >
              <span className={`text-lg sm:text-xl font-black ${bar.text}`}>#{entry.rank}</span>
            </div>
            <span className="text-[9px] text-gray-500 mt-1">{metricLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function LeagueRow({
  entry,
  onEnter,
}: {
  entry: CompanyLeagueEntry;
  onEnter: () => void;
}) {
  const typeLabel = BUSINESS_TYPE_LABELS[entry.businessType as BusinessType] || entry.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[entry.businessType] || 'bg-gray-100 text-gray-700';

  return (
    <button
      type="button"
      onClick={onEnter}
      className="w-full text-left rounded-xl border border-gray-200/80 bg-white/90 dark:border-gray-700 dark:bg-gray-900/50 p-3 transition-all hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700"
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={entry.rank} />
        <div className="w-9 h-9 rounded-lg bg-gray-900 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
          {entry.logo ? (
            <img src={entry.logo} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-black text-white">{entry.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{entry.name}</span>
            <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded ${typeColor}`}>{typeLabel}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                style={{ width: `${Math.max(entry.progressPct, 4)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-500 tabular-nums w-10 text-right">
              {entry.shareOfGroup}%
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-gray-900 dark:text-gray-100 tabular-nums">{entry.scoreFormatted}</p>
          <TrendPill momPct={entry.momPct} />
          <p className="text-[9px] text-gray-500 mt-0.5 tabular-nums">
            {entry.vsGroupAvgPct >= 0 ? '+' : ''}{entry.vsGroupAvgPct}% vs media
          </p>
        </div>
      </div>
    </button>
  );
}

function SingleCompanyBoard({
  entry,
  row,
  onEnter,
}: {
  entry: CompanyLeagueEntry;
  row: PortfolioBusiness;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEnter}
      className="mt-4 w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white/90 dark:bg-gray-900/60 p-4 text-left hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center overflow-hidden">
          {entry.logo ? (
            <img src={entry.logo} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-black text-white">{entry.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900 dark:text-gray-100">{entry.name}</p>
          <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300 tabular-nums mt-1">{entry.scoreFormatted}</p>
          <TrendPill momPct={entry.momPct} />
        </div>
        <div className="text-right text-[11px] text-gray-500 space-y-1">
          <p>{row.clients.newClientsMonth} clientes nuevos</p>
          <p>{row.metrics.deliveredMonth} {row.isRestaurant ? 'cobradas' : 'entregados'}</p>
          <p className="text-indigo-600 font-semibold">Entrar →</p>
        </div>
      </div>
    </button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const top = RANK_BAR[rank];
  if (top && rank <= 3) {
    return (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${top.bg} ${top.text} text-sm font-black shadow-sm`}>
        {rank}
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-black text-gray-600 dark:text-gray-300">
      {rank}
    </span>
  );
}

function TrendPill({ momPct, compact = false }: { momPct: number | null; compact?: boolean }) {
  if (momPct === null) {
    return (
      <span className={`inline-flex items-center gap-0.5 font-semibold text-gray-400 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  const up = momPct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
      } ${compact ? 'text-[9px]' : 'text-[10px]'}`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? '+' : ''}{momPct}%
    </span>
  );
}
