import type { ReactNode } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import { formatMomLabel, type GroupPnLGlance } from './ceoPortfolioMath';

export function CeoExpand({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5 dark:border-slate-800">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MomBadge({ pct }: { pct: number | null }) {
  const label = formatMomLabel(pct);
  if (!label) return null;
  const up = (pct ?? 0) >= 0;
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums ${
        up
          ? 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]'
          : 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]'
      }`}
    >
      {label}
    </span>
  );
}

export function ShareBar({ percent, className = '' }: { percent: number; className?: string }) {
  const w = Math.min(100, Math.max(0, percent));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${className}`}>
      <div
        className="h-full rounded-full bg-[var(--v-blue,#2563eb)] transition-[width] duration-500 ease-out"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

type RailProps = {
  pnl: GroupPnLGlance;
  generatedMonth: number;
  generatedToday: number;
  generatedMom: number | null;
  companyCount: number;
  liveLabel?: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
};

export function CeoGlanceRail({
  pnl,
  generatedMonth,
  generatedToday,
  generatedMom,
  companyCount,
  liveLabel,
  refreshing,
  onRefresh,
}: RailProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[var(--v-mesh)] opacity-80" />
      <div className="vsaas-brand-bar absolute inset-x-0 top-0 rounded-none" />

      <div className="relative px-4 py-5 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="vsaas-brand-chip mb-2">Visión general</p>
            <h2 className="vsaas-title text-xl sm:text-2xl md:text-[1.75rem]">
              Pulso del grupo
            </h2>
            <p className="vsaas-subtitle mt-1 text-xs sm:text-sm">
              {companyCount} empresa{companyCount !== 1 ? 's' : ''}
              {liveLabel ? ` · ${liveLabel}` : ''}
            </p>
          </div>
          <button type="button" onClick={onRefresh} className="vsaas-btn-ghost !min-h-9 !py-1.5" aria-busy={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Glance: un héroe + chips */}
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Generado mes
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <p className="text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-white sm:text-4xl md:text-5xl">
                {formatMoneyEs(generatedMonth)}
              </p>
              <MomBadge pct={generatedMom} />
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              Hoy <span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoneyEs(generatedToday)}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <GlanceChip label="Ingresos fin." value={formatMoneyEs(pnl.incomeMonth)} sub={<MomBadge pct={pnl.incomeMom} />} />
            <GlanceChip
              label={pnl.resultLabel}
              value={formatMoneyEs(pnl.result)}
              tone={pnl.result >= 0 ? 'ok' : 'bad'}
              sub={
                pnl.resultLabel === 'EBITDA' ? (
                  <span className="text-[10px] text-slate-500">margen {formatNumberEs(pnl.ebitdaMarginMonth, { maxFraction: 1 })}%</span>
                ) : null
              }
            />
            <GlanceChip label="Pendiente" value={formatMoneyEs(pnl.pendingAmount)} />
            <GlanceChip label="Bancos" value={formatMoneyEs(pnl.cashBalance)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function GlanceChip({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="min-w-[7.5rem] rounded-2xl border border-slate-200/70 bg-white/85 px-3 py-2.5 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/75">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-extrabold tabular-nums sm:text-base ${
          tone === 'ok'
            ? 'text-[var(--v-green,#22c55e)]'
            : tone === 'bad'
              ? 'text-[var(--v-rose,#e11d48)]'
              : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
      {sub ? <div className="mt-1">{sub}</div> : null}
    </div>
  );
}
