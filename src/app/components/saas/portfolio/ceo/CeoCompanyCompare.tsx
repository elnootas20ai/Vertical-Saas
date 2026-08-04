import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import {
  comparableMonthThroughDay,
  prevCalendarMonthKey,
} from '../../../../lib/portfolioMetrics';
import { localCalendarDayKey } from '../../../../lib/tpvCajaScope';
import { MomBadge } from './CeoGlanceRail';
import type { CeoCompanyVision } from './ceoVisionModel';

function momRankList(visions: CeoCompanyVision[]) {
  // Solo empresas con MoM comparable (actividad real en ambos periodos MTD)
  return visions
    .filter((v) => v.mom != null && Number.isFinite(v.mom) && (v.incomePrev || 0) > 0 && (v.income || 0) > 0)
    .map((v) => ({ vision: v, mom: v.mom as number }))
    .sort((a, b) => b.mom - a.mom);
}

function momComparableCaption(now = new Date()): { title: string; detail: string } {
  const todayKey = localCalendarDayKey(now);
  const monthKey = todayKey.slice(0, 7);
  const prevKey = prevCalendarMonthKey(monthKey);
  const throughDay = comparableMonthThroughDay(todayKey, prevKey);
  const curLabel = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const prevEnd = new Date(Number(prevKey.slice(0, 4)), Number(prevKey.slice(5, 7)) - 1, throughDay);
  const prevStart = new Date(Number(prevKey.slice(0, 4)), Number(prevKey.slice(5, 7)) - 1, 1);
  const prevRange = `${prevStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}–${prevEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  return {
    title: 'Ritmo del mes',
    detail: `Mismo tramo: 1–${curLabel} vs ${prevRange} (no el mes anterior entero)`,
  };
}

/**
 * A) Top que suben / top que bajan (MoM MTD vs MTD).
 * Sin baseline comparable del mismo tramo → no aparecen.
 */
export function CeoMomWinnersLosers({
  visions,
  onOpen,
  limit = 3,
}: {
  visions: CeoCompanyVision[];
  onOpen: (businessId: string) => void;
  limit?: number;
}) {
  const ranked = momRankList(visions);
  const winners = ranked.filter((r) => r.mom > 0).slice(0, limit);
  const losers = [...ranked].filter((r) => r.mom < 0).sort((a, b) => a.mom - b.mom).slice(0, limit);
  const skipped = visions.length - ranked.length;
  const caption = momComparableCaption();

  if (ranked.length === 0) {
    return (
      <section className="space-y-1.5">
        <MomSectionHeader title={caption.title} detail={caption.detail} />
        <div className="rounded-2xl border border-dashed border-stone-200 px-3 py-4 text-center text-[12px] text-stone-400 dark:border-stone-700">
          Sin comparativa todavía · hace falta facturación en este tramo y en el mismo del mes anterior
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-1.5">
      <MomSectionHeader title={caption.title} detail={caption.detail} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <RankCard
          title="Suben"
          tone="up"
          empty="Nadie sube en este tramo"
          rows={winners}
          onOpen={onOpen}
        />
        <RankCard
          title="Bajan"
          tone="down"
          empty="Nadie baja en este tramo"
          rows={losers}
          onOpen={onOpen}
        />
      </div>
      {skipped > 0 ? (
        <p className="px-0.5 text-[10px] text-stone-400">
          {skipped} empresa{skipped !== 1 ? 's' : ''} sin comparar (sin datos en uno de los dos tramos)
        </p>
      ) : null}
    </section>
  );
}

function MomSectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-0.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">{title}</p>
      <p className="text-[11px] text-stone-500">{detail}</p>
    </div>
  );
}

function RankCard({
  title,
  tone,
  empty,
  rows,
  onOpen,
}: {
  title: string;
  tone: 'up' | 'down';
  empty: string;
  rows: Array<{ vision: CeoCompanyVision; mom: number }>;
  onOpen: (businessId: string) => void;
}) {
  const Icon = tone === 'up' ? ArrowUpRight : ArrowDownRight;
  const toneCls =
    tone === 'up'
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center gap-1.5 border-b border-stone-100 px-3 py-2 dark:border-stone-800">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        <p className={`text-[12px] font-bold ${toneCls}`}>{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-[11px] text-stone-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {rows.map((r, i) => (
            <li key={r.vision.businessId}>
              <button
                type="button"
                onClick={() => onOpen(r.vision.businessId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-50/80 dark:hover:bg-stone-900/40"
              >
                <span className="w-4 shrink-0 text-[10px] font-bold tabular-nums text-stone-300">
                  {i + 1}
                </span>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.vision.brandColor }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100">
                  {r.vision.name}
                </span>
                <span className="hidden shrink-0 text-[10px] tabular-nums text-stone-400 sm:inline">
                  {formatMoneyEs(r.vision.incomePrev)} → {formatMoneyEs(r.vision.income)}
                </span>
                <MomBadge pct={r.mom} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function groupSharePercent(income: number, groupTotal: number): number | null {
  if (!(groupTotal > 0) || !(income >= 0)) return null;
  return (income / groupTotal) * 100;
}

export function formatSharePct(pct: number | null): string {
  if (pct == null) return '—';
  return `${formatNumberEs(pct, { maxFraction: 0 })}%`;
}

/** Mini barra de aportación al grupo. */
export function SharePctCell({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-stone-300">—</span>;
  }
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="min-w-[64px]">
      <p className="text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
        {formatSharePct(pct)}
      </p>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div
          className="h-full rounded-full bg-[var(--v-blue,#2563eb)]"
          style={{ width: `${Math.max(w > 0 ? 4 : 0, w)}%` }}
        />
      </div>
    </div>
  );
}

export function FlatMom({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-stone-400">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  return <MomBadge pct={pct} />;
}
