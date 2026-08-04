import type { ReactNode } from 'react';
import { Building2, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { fmtPercent } from '../../../lib/portfolioMetrics';

type Props = {
  companyCount: number;
  generatedMonth: number;
  generatedToday: number;
  opsMonth: number;
  financeMonth: number;
  ebitdaMonth?: number;
  ebitdaMargin?: number;
  canViewEbitda: boolean;
  profitMonth: number;
  liveLabel?: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
};

export function PortfolioMvpHero({
  companyCount,
  generatedMonth,
  generatedToday,
  opsMonth,
  financeMonth,
  ebitdaMonth = 0,
  ebitdaMargin = 0,
  canViewEbitda,
  profitMonth,
  liveLabel,
  refreshing,
  onRefresh,
}: Props) {
  const result = canViewEbitda ? ebitdaMonth : profitMonth;
  const resultLabel = canViewEbitda ? 'EBITDA mes' : 'Resultado mes';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[var(--v-mesh)] opacity-90" />
      <div className="vsaas-brand-bar absolute inset-x-0 top-0 rounded-none" />

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="vsaas-brand-chip mb-3">Portfolio</p>
            <h2 className="vsaas-title text-2xl sm:text-3xl md:text-[2.1rem]">
              Visión general del grupo
            </h2>
            <p className="vsaas-subtitle mt-1.5 max-w-xl">
              {companyCount} empresa{companyCount !== 1 ? 's' : ''} · lo que generan este mes, cada una con su pulso.
              {liveLabel ? ` · ${liveLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="vsaas-btn-ghost shrink-0"
            aria-busy={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Generado este mes
            </p>
            <p className="mt-1 font-['Plus_Jakarta_Sans',ui-sans-serif,system-ui,sans-serif] text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-5xl dark:text-white">
              {formatMoneyEs(generatedMonth)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Hoy{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatMoneyEs(generatedToday)}
              </span>
              {opsMonth > 0 && financeMonth > 0 && Math.abs(opsMonth - financeMonth) > 1 ? (
                <span className="text-slate-400">
                  {' '}
                  · operativa {formatMoneyEs(opsMonth)} · finanzas {formatMoneyEs(financeMonth)}
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            <HeroStat
              icon={<Building2 className="h-4 w-4" />}
              label="Empresas"
              value={String(companyCount)}
            />
            <HeroStat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Operativa retail"
              value={formatMoneyEs(opsMonth)}
            />
            <HeroStat
              icon={<Wallet className="h-4 w-4" />}
              label={resultLabel}
              value={formatMoneyEs(result)}
              hint={canViewEbitda ? fmtPercent(ebitdaMargin) : undefined}
              tone={result >= 0 ? 'ok' : 'bad'}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3.5 py-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="mb-1.5 flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`text-lg font-extrabold tabular-nums tracking-tight ${
          tone === 'ok'
            ? 'text-[var(--v-green,#22c55e)]'
            : tone === 'bad'
              ? 'text-[var(--v-rose,#e11d48)]'
              : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">margen {hint}</p> : null}
    </div>
  );
}
