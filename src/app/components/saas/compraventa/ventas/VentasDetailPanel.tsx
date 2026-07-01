import type { ReactNode } from 'react';
import {
  Calendar,
  Car,
  Clock,
  CreditCard,
  TrendingUp,
  User,
} from 'lucide-react';
import { VehicleShellBlock } from '../../vehicles/VehicleShellBlock';
import { VentasDetailActionBar } from './VentasDetailActionBar';
import {
  formatVentaDate,
  formatVentaPrice,
  SALE_STATUS_TOKEN,
  ventaEstimatedProfit,
  type VentaListItem,
} from './ventasListData';

type VentasDetailPanelProps = {
  sale: VentaListItem | null;
};

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <VehicleShellBlock className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {children}
    </VehicleShellBlock>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClassName = 'text-gray-900 dark:text-gray-100',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-gray-50/50 px-4 py-3.5 dark:border-gray-800 dark:bg-gray-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1.5 text-lg font-bold tabular-nums tracking-tight ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function SaleDetailContent({ sale }: { sale: VentaListItem }) {
  const profit = ventaEstimatedProfit(sale);
  const profitPositive = profit >= 0;

  return (
    <div className="space-y-5">
      <DetailSection title="Información">
        <div className="space-y-0">
          <InfoRow label="Vehículo" value={sale.vehicleLabel || '—'} />
          <InfoRow label="Cliente" value={sale.clientName || '—'} />
          <InfoRow label="Estado" value={SALE_STATUS_TOKEN[sale.status].label} />
          <InfoRow label="Fecha" value={formatVentaDate(sale.saleDate)} />
          <InfoRow label="Precio de venta" value={formatVentaPrice(sale.salePrice)} />
        </div>
      </DetailSection>

      <DetailSection title="Venta">
        <div className="space-y-0">
          <InfoRow
            label="Reserva"
            value={
              sale.reservationAmount != null && sale.reservationAmount > 0
                ? formatVentaPrice(sale.reservationAmount)
                : '—'
            }
          />
          <InfoRow
            label="Financiación"
            value={sale.financing == null ? '—' : sale.financing ? 'Sí' : 'No'}
          />
          <InfoRow label="Forma de pago" value={sale.paymentMethod || '—'} />
          <InfoRow label="Entrega prevista" value={formatVentaDate(sale.expectedDeliveryDate ?? '')} />
        </div>
      </DetailSection>

      <DetailSection title="Beneficio">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Precio compra"
            value={formatVentaPrice(sale.purchasePrice ?? 0)}
          />
          <MetricCard
            label="Gastos"
            value={formatVentaPrice(sale.expenses ?? 0)}
          />
          <MetricCard
            label="Precio venta"
            value={formatVentaPrice(sale.salePrice)}
          />
          <MetricCard
            label="Beneficio total"
            value={`${profitPositive ? '+' : ''}${formatVentaPrice(profit)}`}
            valueClassName={
              profitPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }
          />
        </div>
      </DetailSection>

      <DetailSection title="Historial">
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/30 px-4 py-8 text-center dark:border-gray-700 dark:bg-gray-900/20">
          <Clock className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sin movimientos</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">
            Aquí aparecerá la línea temporal de la venta y sus acciones relacionadas.
          </p>
        </div>
      </DetailSection>
    </div>
  );
}

export function VentasDetailPanel({ sale }: VentasDetailPanelProps) {
  if (!sale) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-gray-50/50 px-8 text-center dark:bg-gray-950/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-gray-900">
          <TrendingUp className="h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Selecciona una venta
        </h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Elige una venta de la lista para ver su ficha, condiciones y beneficio.
        </p>
      </section>
    );
  }

  const statusToken = SALE_STATUS_TOKEN[sale.status];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-950">
      <header className="shrink-0 border-b border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 px-6 py-5 dark:border-gray-800 dark:from-gray-950 dark:to-gray-950/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {sale.vehicleLabel || 'Venta sin vehículo'}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusToken.badgeBg} ${statusToken.badgeText}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusToken.dot}`} />
                {statusToken.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {sale.clientName || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatVentaDate(sale.saleDate)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                <CreditCard className="h-3.5 w-3.5" />
                {formatVentaPrice(sale.salePrice)}
              </span>
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <Car className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
          </div>
        </div>
      </header>

      <VentasDetailActionBar showActions />

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-6 py-5 dark:bg-gray-950/50">
        <SaleDetailContent sale={sale} />
      </div>
    </section>
  );
}
