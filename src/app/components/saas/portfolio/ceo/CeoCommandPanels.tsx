import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Users,
} from 'lucide-react';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import { BUSINESS_TYPE_COLORS, BUSINESS_TYPE_LABELS } from '../../BusinessCarousel';
import type { BusinessType } from '../../../../lib/businessApi';
import { deliveryBrandSheet, deliveryChannelShares } from '../portfolioCompanyPulse';
import type { CeoCajaChannelMix } from '../../../../lib/cajaUrielClosingsExcelExport';
import {
  type AggregatedChannel,
  type CompanyGlance,
  type GroupFoodToday,
  type OpsChip,
  type PeopleGlance,
} from './ceoPortfolioMath';
import { CeoExpand, MomBadge, ShareBar } from './CeoGlanceRail';

const MIX_COLS: Array<{ key: keyof CeoCajaChannelMix; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'tpv', label: 'TPV' },
  { key: 'x', label: 'X' },
  { key: 'app', label: 'App' },
  { key: 'uber', label: 'Uber' },
  { key: 'justEat', label: 'Just Eat' },
  { key: 'glovo', label: 'Glovo' },
];

export function CeoCajaMixGlance({
  mix,
  onExport,
  canExport,
}: {
  mix: CeoCajaChannelMix | null;
  onExport?: () => void;
  canExport?: boolean;
}) {
  if (!mix || mix.total <= 0) return null;
  const top = MIX_COLS
    .map((c) => ({ ...c, amount: Number(mix[c.key]) || 0 }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Cierre por canales</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Mes · mismo criterio que el Excel CEO</p>
        </div>
        {canExport && onExport ? (
          <button type="button" onClick={onExport} className="vsaas-btn-ghost !min-h-9 !py-1.5 !text-[11px]">
            <Download className="h-3.5 w-3.5" />
            Descargar Excel
          </button>
        ) : null}
      </div>
      <div className="px-4 py-4 sm:px-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total mes</p>
        <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
          {formatMoneyEs(mix.total)}
        </p>
        <div className="mt-3 space-y-2">
          {top.slice(0, 4).map((c) => {
            const pct = mix.total > 0 ? (c.amount / mix.total) * 100 : 0;
            return (
              <div key={c.key}>
                <div className="mb-0.5 flex justify-between text-[12px]">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{c.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {formatNumberEs(pct, { maxFraction: 0 })}% · {formatMoneyEs(c.amount)}
                  </span>
                </div>
                <ShareBar percent={pct} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {mix.pizza > 0 ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-900">
              Pizzas <span className="tabular-nums">{formatNumberEs(mix.pizza, { maxFraction: 0 })}</span>
            </span>
          ) : null}
          {mix.burger > 0 ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-900">
              Burgers <span className="tabular-nums">{formatNumberEs(mix.burger, { maxFraction: 0 })}</span>
            </span>
          ) : null}
          {mix.taco > 0 ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-900">
              Tacos <span className="tabular-nums">{formatNumberEs(mix.taco, { maxFraction: 0 })}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        <CeoExpand title="Todas las columnas" subtitle="EFECTIVO · TPV · X · App · apps" defaultOpen={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wide text-slate-400">
                  {MIX_COLS.map((c) => (
                    <th key={c.key} className="pb-2 pr-2 text-right font-semibold">
                      {c.label}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  {MIX_COLS.map((c) => (
                    <td key={c.key} className="py-2 pr-2 text-right tabular-nums font-semibold">
                      {formatMoneyEs(Number(mix[c.key]) || 0)}
                    </td>
                  ))}
                  <td className="py-2 text-right tabular-nums font-extrabold">{formatMoneyEs(mix.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CeoExpand>
      </div>
    </section>
  );
}

export function CeoComparativaLite({
  months,
}: {
  months: Array<{ yearMonth: string; label: string; total: number }>;
}) {
  const withData = months.filter((m) => m.total > 0);
  if (withData.length < 2) return null;
  const max = Math.max(...months.map((m) => m.total), 1);

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Comparativa meses</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Totales de cierre · últimos meses</p>
      <div className="mt-3 flex items-end gap-1.5 sm:gap-2">
        {months.map((m) => {
          const h = Math.max(8, Math.round((m.total / max) * 72));
          return (
            <div key={m.yearMonth} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[9px] font-semibold tabular-nums text-slate-500">
                {m.total > 0 ? formatNumberEs(m.total, { maxFraction: 0 }) : '—'}
              </span>
              <div
                className="w-full max-w-[36px] rounded-t-md bg-[var(--v-blue,#2563eb)]/80"
                style={{ height: h }}
                title={`${m.label}: ${formatMoneyEs(m.total)}`}
              />
              <span className="text-[9px] font-bold uppercase text-slate-400">{m.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CeoPnLCompanyTable({
  glances,
  canViewEbitda,
}: {
  glances: CompanyGlance[];
  canViewEbitda: boolean;
}) {
  return (
    <CeoExpand
      title="Contribución por empresa"
      subtitle="% del grupo · finanzas del mes"
      defaultOpen={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-semibold">Empresa</th>
              <th className="pb-2 text-right font-semibold">Generado</th>
              <th className="pb-2 text-right font-semibold">% grupo</th>
              <th className="pb-2 text-right font-semibold">vs ant.</th>
              <th className="pb-2 text-right font-semibold">{canViewEbitda ? 'EBITDA' : 'Resultado'}</th>
            </tr>
          </thead>
          <tbody>
            {glances.map((g) => {
              const result = canViewEbitda ? g.row.finance.ebitdaMonth : g.row.finance.profitMonth;
              return (
                <tr key={g.row.businessId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-2 font-semibold text-slate-900 dark:text-slate-100">
                    {g.row.business.name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoneyEs(g.generated)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">
                    {g.shareOfGroup != null
                      ? `${formatNumberEs(g.shareOfGroup, { maxFraction: 0 })}%`
                      : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <MomBadge pct={g.mom} />
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${
                      result >= 0 ? 'text-[var(--v-green,#22c55e)]' : 'text-[var(--v-rose,#e11d48)]'
                    }`}
                  >
                    {formatMoneyEs(result)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CeoExpand>
  );
}

export function CeoChannelPanel({
  channels,
  food,
  brands,
}: {
  channels: AggregatedChannel[];
  food: GroupFoodToday;
  brands: { name: string; amount: number; color?: string; businessName: string }[];
}) {
  const top = channels.slice(0, 3);
  const foodTotal = food.pizzas + food.burgers + food.tacos + food.kebabs;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Canales e integradores</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Glance en % · detalle al abrir</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {top.length === 0 ? (
          <p className="text-xs text-slate-500">Sin facturación por canal este mes en delivery.</p>
        ) : (
          top.map((ch) => (
            <div key={ch.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{ch.label}</span>
                <span className="tabular-nums text-slate-500">
                  {formatNumberEs(ch.percent, { maxFraction: 0 })}% · {formatMoneyEs(ch.amount)}
                </span>
              </div>
              <ShareBar percent={ch.percent} />
            </div>
          ))
        )}

        {foodTotal > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <FoodPill label="Pizzas hoy" n={food.pizzas} />
            <FoodPill label="Burgers hoy" n={food.burgers} />
            <FoodPill label="Tacos hoy" n={food.tacos} />
            {food.kebabs > 0 ? <FoodPill label="Kebab hoy" n={food.kebabs} /> : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        <CeoExpand title="Todos los canales" subtitle="Mix completo del mes" defaultOpen={false}>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.label} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="font-medium text-slate-700 dark:text-slate-200">{ch.label}</span>
                <span className="tabular-nums text-slate-500">
                  {formatNumberEs(ch.percent, { maxFraction: 1 })}% · {formatMoneyEs(ch.amount)}
                </span>
              </div>
            ))}
          </div>
        </CeoExpand>

        {brands.length > 0 ? (
          <CeoExpand title="Top marcas" subtitle="€ mes · delivery" defaultOpen={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pb-2 text-left font-semibold">Marca</th>
                    <th className="pb-2 text-left font-semibold">Empresa</th>
                    <th className="pb-2 text-right font-semibold">Mes</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((b) => (
                    <tr
                      key={`${b.businessName}-${b.name}`}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: b.color || 'var(--v-blue,#2563eb)' }}
                          />
                          {b.name}
                        </span>
                      </td>
                      <td className="py-1.5 text-slate-500">{b.businessName}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoneyEs(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CeoExpand>
        ) : null}
      </div>
    </section>
  );
}

function FoodPill({ label, n }: { label: string; n: number }) {
  if (n <= 0) return null;
  return (
    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {label}{' '}
      <span className="tabular-nums text-slate-900 dark:text-white">
        {formatNumberEs(n, { maxFraction: 0 })}
      </span>
    </span>
  );
}

export function CeoOpsStrip({
  chips,
  onOpenOps,
}: {
  chips: OpsChip[];
  onOpenOps: (businessId: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Ops delivery</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Riesgo del día · toca una empresa</p>
      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {chips.map((c) => (
          <button
            key={c.businessId}
            type="button"
            onClick={() => onOpenOps(c.businessId)}
            className={`min-w-[148px] shrink-0 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
              c.tone === 'bad'
                ? 'border-[rgba(225,29,72,0.25)] bg-[rgba(225,29,72,0.06)]'
                : c.tone === 'warn'
                  ? 'border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.07)]'
                  : 'border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50'
            }`}
          >
            <p className="truncate text-[12px] font-bold text-slate-900 dark:text-white">
              {c.businessName}
            </p>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
              {c.activeOrders} activos · {c.openCajas} caja{c.openCajas !== 1 ? 's' : ''}
            </p>
            {c.cancelledMonth > 0 ? (
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--v-rose,#e11d48)]">
                {c.cancelledMonth} cancel. mes
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function CeoPeopleStrip({ people }: { people: PeopleGlance }) {
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Equipo del grupo</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Números rápidos de cobertura</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PeopleChip icon={<Clock3 className="h-3.5 w-3.5" />} label="Fichados" value={people.clockedInNow} />
        <PeopleChip
          icon={<Users className="h-3.5 w-3.5" />}
          label="Sin turno"
          value={people.noShiftToday}
          warn={people.noShiftToday > 0}
        />
        <PeopleChip
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Alertas horario"
          value={people.scheduleAlerts}
          warn={people.scheduleAlerts > 0}
        />
        <PeopleChip
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Vac. pendientes"
          value={people.pendingVacations}
          warn={people.pendingVacations > 0}
        />
      </div>
    </section>
  );
}

function PeopleChip({
  icon,
  label,
  value,
  warn,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-1 flex items-center gap-1 text-slate-500">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`text-xl font-extrabold tabular-nums ${
          warn ? 'text-[var(--v-amber,#d97706)]' : 'text-slate-900 dark:text-white'
        }`}
      >
        {formatNumberEs(value, { maxFraction: 0 })}
      </p>
    </div>
  );
}

export function CeoCompanyList({
  glances,
  canViewEbitda,
  onEnter,
  onOpenOps,
  onOpenCaja,
}: {
  glances: CompanyGlance[];
  canViewEbitda: boolean;
  onEnter: (businessId: string) => void;
  onOpenOps: (businessId: string) => void;
  onOpenCaja: (businessId: string, isRestaurant: boolean) => void;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between gap-2 px-0.5">
        <div>
          <h3 className="vsaas-title text-base">Empresas</h3>
          <p className="vsaas-subtitle text-xs">Fila = € mes · % · hoy · resultado</p>
        </div>
        <p className="hidden text-[11px] font-semibold tabular-nums text-slate-400 sm:block">
          {glances.length} empresa{glances.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="mb-1.5 hidden grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] gap-2 px-3 text-[9px] font-bold uppercase tracking-wide text-slate-400 lg:grid">
        <span>Empresa</span>
        <span className="text-right">Mes</span>
        <span className="text-right">vs ant.</span>
        <span className="text-right">% grupo</span>
        <span className="text-right">Hoy</span>
        <span className="text-right">{canViewEbitda ? 'EBITDA' : 'Resultado'}</span>
      </div>

      <div className="flex flex-col gap-2">
        {glances.map((g) => (
          <CeoCompanyRow
            key={g.row.businessId}
            glance={g}
            canViewEbitda={canViewEbitda}
            onEnter={() => onEnter(g.row.businessId)}
            onOpenOps={() => onOpenOps(g.row.businessId)}
            onOpenCaja={() => onOpenCaja(g.row.businessId, g.row.isRestaurant)}
          />
        ))}
      </div>
    </section>
  );
}

function CeoCompanyRow({
  glance,
  canViewEbitda,
  onEnter,
  onOpenOps,
  onOpenCaja,
}: {
  glance: CompanyGlance;
  canViewEbitda: boolean;
  onEnter: () => void;
  onOpenOps: () => void;
  onOpenCaja: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { row, generated, mom, shareOfGroup, kind } = glance;
  const b = row.business;
  const typeLabel = BUSINESS_TYPE_LABELS[b.businessType as BusinessType] || b.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[b.businessType] || 'bg-slate-100 text-slate-700';
  const channels = kind === 'delivery' ? deliveryChannelShares(row, 5) : [];
  const brands = kind === 'delivery' ? deliveryBrandSheet(row, 5) : [];
  const today =
    kind === 'delivery' || kind === 'restaurant'
      ? row.metrics.revenueToday
      : 0;
  const result = canViewEbitda ? row.finance.ebitdaMonth : row.finance.profitMonth;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-2 px-3.5 py-3 text-left sm:px-4 lg:grid lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] lg:items-center lg:gap-2"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 dark:bg-slate-800">
            {b.logo ? (
              <img src={b.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] font-black text-white">{b.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{b.name}</p>
              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${typeColor}`}>
                {typeLabel}
              </span>
            </div>
            {kind === 'delivery' && row.metrics.activeOrders > 0 ? (
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                {row.metrics.activeOrders} activos
                {row.metrics.openCashRegisters > 0
                  ? ` · ${row.metrics.openCashRegisters} caja${row.metrics.openCashRegisters !== 1 ? 's' : ''}`
                  : ''}
              </p>
            ) : null}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform lg:hidden ${open ? 'rotate-180' : ''}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[52px] lg:contents">
          <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white lg:text-right">
            {formatMoneyEs(generated)}
          </span>
          <span className="lg:flex lg:justify-end">
            <MomBadge pct={mom} />
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-slate-500 lg:text-right">
            {shareOfGroup != null
              ? `${formatNumberEs(shareOfGroup, { maxFraction: 0 })}%`
              : '—'}
            <span className="lg:hidden"> del grupo</span>
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300 lg:text-right">
            <span className="lg:hidden text-slate-400">Hoy </span>
            {kind === 'delivery' || kind === 'restaurant' ? formatMoneyEs(today) : '—'}
          </span>
          <span className="relative pr-5 text-[11px] font-bold tabular-nums text-slate-800 dark:text-slate-100 lg:text-right">
            <span className="lg:hidden text-slate-400">
              {canViewEbitda ? 'EBITDA ' : 'Res. '}
            </span>
            {formatMoneyEs(result)}
            <ChevronDown
              className={`absolute right-0 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform lg:block ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-slate-100 px-3.5 py-3 sm:px-4 dark:border-slate-800">
          {kind === 'delivery' ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Mini label="Activos" value={String(row.metrics.activeOrders)} />
                <Mini label="Cajas" value={String(row.metrics.openCashRegisters)} />
                <Mini label="Ticket" value={formatMoneyEs(row.metrics.avgTicketMonth)} />
              </div>
              {channels.length > 0 ? (
                <div className="space-y-1.5">
                  {channels.map((ch) => (
                    <div key={ch.key}>
                      <div className="mb-0.5 flex justify-between text-[11px]">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{ch.label}</span>
                        <span className="tabular-nums text-slate-500">
                          {formatNumberEs(ch.percent, { maxFraction: 0 })}%
                        </span>
                      </div>
                      <ShareBar percent={ch.percent} />
                    </div>
                  ))}
                </div>
              ) : null}
              {brands.length > 0 ? (
                <div className="rounded-xl border border-slate-100 dark:border-slate-800">
                  {brands.map((br) => (
                    <div
                      key={br.id}
                      className="flex items-center justify-between border-b border-slate-100 px-2.5 py-1.5 text-[11px] last:border-0 dark:border-slate-800"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{br.name}</span>
                      <span className="tabular-nums text-slate-500">
                        {formatMoneyEs(br.revenueMonth)} ·{' '}
                        {formatNumberEs(br.sharePercent, { maxFraction: 0 })}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {row.cajaMix && row.cajaMix.total > 0 ? (
                <div className="rounded-xl border border-slate-100 px-2.5 py-2 dark:border-slate-800">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Cierre por canales
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
                    {(
                      [
                        ['Efectivo', row.cajaMix.efectivo],
                        ['TPV', row.cajaMix.tpv],
                        ['X', row.cajaMix.x],
                        ['App', row.cajaMix.app],
                        ['Uber', row.cajaMix.uber],
                        ['Just Eat', row.cajaMix.justEat],
                        ['Glovo', row.cajaMix.glovo],
                      ] as const
                    )
                      .filter(([, v]) => v > 0)
                      .map(([label, amount]) => (
                        <div key={label} className="flex justify-between gap-1">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                            {formatMoneyEs(amount)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenOps}
                  className="vsaas-btn-ghost !min-h-9 !py-1.5 !text-[11px]"
                >
                  Centro ops
                </button>
                {row.metrics.openCashRegisters > 0 ? (
                  <button
                    type="button"
                    onClick={onOpenCaja}
                    className="vsaas-btn-ghost !min-h-9 !py-1.5 !text-[11px]"
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Caja
                  </button>
                ) : null}
              </div>
            </>
          ) : kind === 'restaurant' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">
                Pulso de sala completo llega en la siguiente fase. Ahora: finanzas honestas.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Ingresos fin." value={formatMoneyEs(row.finance.incomeMonth)} />
                <Mini
                  label={canViewEbitda ? 'EBITDA' : 'Resultado'}
                  value={formatMoneyEs(
                    canViewEbitda ? row.finance.ebitdaMonth : row.finance.profitMonth,
                  )}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Mini label="Gastos" value={formatMoneyEs(row.finance.expensesMonth)} />
              <Mini
                label={canViewEbitda ? 'EBITDA' : 'Resultado'}
                value={formatMoneyEs(
                  canViewEbitda ? row.finance.ebitdaMonth : row.finance.profitMonth,
                )}
              />
              <Mini label="Pendiente" value={formatMoneyEs(row.finance.pendingAmount)} />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-500">
              {row.clients.totalClients} clientes
              {row.team.clockedInNow > 0 ? ` · ${row.team.clockedInNow} fichados` : ''}
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="vsaas-btn-advance !min-h-9 !py-1.5 !text-[12px]"
            >
              Entrar
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
