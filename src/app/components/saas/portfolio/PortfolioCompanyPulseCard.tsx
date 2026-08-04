import type { ReactNode } from 'react';
import {
  ArrowRight,
  Banknote,
  MapPin,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  Truck,
} from 'lucide-react';
import type { PortfolioBusiness } from '../../../hooks/usePortfolioOverview';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { BUSINESS_TYPE_COLORS, BUSINESS_TYPE_LABELS } from '../BusinessCarousel';
import type { BusinessType } from '../../../lib/businessApi';
import {
  companyGeneratedMonth,
  companyGeneratedToday,
  companyMomPct,
  deliveryBrandSheet,
  deliveryChannelShares,
  portfolioVerticalKind,
} from './portfolioCompanyPulse';

type Props = {
  row: PortfolioBusiness;
  canViewEbitda: boolean;
  onEnter: () => void;
  onOpenOps?: () => void;
  onOpenCaja?: () => void;
};

export function PortfolioCompanyPulseCard({
  row,
  canViewEbitda,
  onEnter,
  onOpenOps,
  onOpenCaja,
}: Props) {
  const kind = portfolioVerticalKind(row);
  const b = row.business;
  const typeLabel = BUSINESS_TYPE_LABELS[b.businessType as BusinessType] || b.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[b.businessType] || 'bg-slate-100 text-slate-700';
  const generated = companyGeneratedMonth(row);
  const today = companyGeneratedToday(row);
  const mom = companyMomPct(row);
  const KindIcon = kind === 'delivery' ? Truck : kind === 'restaurant' ? UtensilsCrossed : Store;

  return (
    <article className="vsaas-card vsaas-card-interactive flex flex-col overflow-hidden rounded-3xl">
      <div className="vsaas-brand-bar rounded-none opacity-70" />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <header className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-800">
            {b.logo ? (
              <img src={b.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-black text-white">{b.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="vsaas-title truncate text-lg">{b.name}</h3>
              <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                {typeLabel}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <KindIcon className="h-3.5 w-3.5" />
                {kind === 'delivery'
                  ? 'Pulso delivery'
                  : kind === 'restaurant'
                    ? 'Pulso sala / bar'
                    : 'Pulso financiero'}
              </span>
              {b.city ? (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {b.city}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {kind === 'finance' ? 'Ingresos mes' : 'Generado mes'}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <p className="text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-white sm:text-[2.1rem]">
              {formatMoneyEs(generated)}
            </p>
            {mom != null ? (
              <span
                className={`mb-1 rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  mom >= 0
                    ? 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]'
                    : 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]'
                }`}
              >
                {mom >= 0 ? '+' : ''}
                {formatNumberEs(mom, { maxFraction: 1 })}% vs mes ant.
              </span>
            ) : null}
          </div>
          {(kind === 'delivery' || kind === 'restaurant') && (
            <p className="mt-1 text-sm text-slate-500">
              Hoy <span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoneyEs(today)}</span>
              {' · '}
              Finanzas {formatMoneyEs(row.finance.incomeMonth)}
            </p>
          )}
        </div>

        <div className="mt-5 flex-1 space-y-4">
          {kind === 'delivery' ? (
            <DeliveryPulse row={row} onOpenOps={onOpenOps} onOpenCaja={onOpenCaja} />
          ) : null}
          {kind === 'restaurant' ? (
            <RestaurantPulse row={row} onOpenCaja={onOpenCaja} />
          ) : null}
          {kind === 'finance' ? (
            <FinancePulse row={row} canViewEbitda={canViewEbitda} />
          ) : null}
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">
            {row.clients.totalClients} clientes
            {row.clients.newClientsMonth > 0 ? ` · ${row.clients.newClientsMonth} nuevos` : ''}
            {' · '}
            {row.storeCount} tienda{row.storeCount !== 1 ? 's' : ''}
          </p>
          <button type="button" onClick={onEnter} className="vsaas-btn-advance">
            Entrar
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    </article>
  );
}

function DeliveryPulse({
  row,
  onOpenOps,
  onOpenCaja,
}: {
  row: PortfolioBusiness;
  onOpenOps?: () => void;
  onOpenCaja?: () => void;
}) {
  const channels = deliveryChannelShares(row);
  const brands = deliveryBrandSheet(row);
  const m = row.metrics;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <MiniKpi label="Entregados" value={formatNumberEs(m.deliveredMonth, { maxFraction: 0 })} />
        <MiniKpi label="En curso" value={formatNumberEs(m.activeOrders, { maxFraction: 0 })} />
        <MiniKpi label="Ticket medio" value={formatMoneyEs(m.avgTicketMonth)} />
      </div>

      {channels.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Integradores / canales
          </p>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.key}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{ch.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {formatMoneyEs(ch.amount)} · {formatNumberEs(ch.percent, { maxFraction: 0 })}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[var(--v-blue,#2563eb)]"
                    style={{ width: `${Math.min(100, Math.max(2, ch.percent))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyHint>Sin facturación por canal este mes.</EmptyHint>
      )}

      {brands.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Marcas · mes
            </p>
            <p className="text-[10px] text-slate-400">vista tipo Excel</p>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 font-semibold">Marca</th>
                <th className="px-2 py-1.5 text-right font-semibold">Mes</th>
                <th className="px-2 py-1.5 text-right font-semibold">Hoy</th>
                <th className="px-3 py-1.5 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr
                  key={brand.id}
                  className="border-t border-slate-100 dark:border-slate-800/80"
                >
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: brand.color || 'var(--v-blue,#2563eb)' }}
                      />
                      <span className="truncate">{brand.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                    {formatMoneyEs(brand.revenueMonth)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {formatMoneyEs(brand.revenueToday)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                    {formatNumberEs(brand.sharePercent, { maxFraction: 0 })}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {onOpenOps ? (
          <GhostLink onClick={onOpenOps} icon={<ShoppingBag className="h-3.5 w-3.5" />}>
            Centro ops
            {m.activeOrders > 0 ? ` · ${m.activeOrders}` : ''}
          </GhostLink>
        ) : null}
        {onOpenCaja && m.openCashRegisters > 0 ? (
          <GhostLink onClick={onOpenCaja} icon={<Banknote className="h-3.5 w-3.5" />}>
            {`${m.openCashRegisters} caja${m.openCashRegisters !== 1 ? 's' : ''} abierta${m.openCashRegisters !== 1 ? 's' : ''}`}
          </GhostLink>
        ) : null}
      </div>
    </>
  );
}

function RestaurantPulse({
  row,
  onOpenCaja,
}: {
  row: PortfolioBusiness;
  onOpenCaja?: () => void;
}) {
  const m = row.metrics;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniKpi label="Cobradas mes" value={formatNumberEs(m.deliveredMonth, { maxFraction: 0 })} />
        <MiniKpi label="En sala" value={formatNumberEs(m.activeOrders, { maxFraction: 0 })} />
        <MiniKpi label="Ticket medio" value={formatMoneyEs(m.avgTicketMonth)} />
        <MiniKpi label="Cajas abiertas" value={formatNumberEs(m.openCashRegisters, { maxFraction: 0 })} />
      </div>
      {m.openCashRegisters > 0 ? (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            En cajón{' '}
            <span className="font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoneyEs(m.cashInRegisters)}
            </span>
            {' · '}fondo + cobros en efectivo
          </p>
          {onOpenCaja ? (
            <button
              type="button"
              onClick={onOpenCaja}
              className="mt-1.5 text-[11px] font-semibold text-[var(--v-blue,#2563eb)]"
            >
              Abrir panel de caja →
            </button>
          ) : null}
        </div>
      ) : (
        <EmptyHint>Sin caja abierta ahora mismo.</EmptyHint>
      )}
    </>
  );
}

function FinancePulse({
  row,
  canViewEbitda,
}: {
  row: PortfolioBusiness;
  canViewEbitda: boolean;
}) {
  const f = row.finance;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MiniKpi label="Gastos mes" value={formatMoneyEs(f.expensesMonth)} />
      <MiniKpi
        label={canViewEbitda ? 'EBITDA' : 'Resultado'}
        value={formatMoneyEs(canViewEbitda ? f.ebitdaMonth : f.profitMonth)}
        tone={(canViewEbitda ? f.ebitdaMonth : f.profitMonth) >= 0 ? 'ok' : 'bad'}
      />
      <MiniKpi label="Pendiente cobro" value={formatMoneyEs(f.pendingAmount)} />
    </div>
  );
}

function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-extrabold tabular-nums ${
          tone === 'ok'
            ? 'text-[var(--v-green,#22c55e)]'
            : tone === 'bad'
              ? 'text-[var(--v-rose,#e11d48)]'
              : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 dark:border-slate-700">
      {children}
    </p>
  );
}

function GhostLink({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="vsaas-btn-ghost !min-h-0 !py-1.5 !text-[11px]">
      {icon}
      {children}
    </button>
  );
}
