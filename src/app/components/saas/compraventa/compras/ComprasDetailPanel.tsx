import type { ReactNode } from 'react';
import {
  Building2,
  Calendar,
  Car,
  Clock,
  FileText,
  Receipt,
  ShoppingCart,
  User,
} from 'lucide-react';
import { VehicleShellBlock } from '../../vehicles/VehicleShellBlock';
import { ComprasDetailActionBar, type CompraActionId } from './ComprasDetailActionBar';
import {
  formatCompraDate,
  formatCompraPrice,
  PURCHASE_STATUS_TOKEN,
  purchaseSupplierLabel,
  type CompraListItem,
} from './comprasListData';

type ComprasDetailPanelProps = {
  purchase: CompraListItem | null;
  onAction?: (actionId: CompraActionId) => void;
  actionsDisabled?: boolean;
  hiddenActions?: CompraActionId[];
};

const DOCUMENT_SLOTS = [
  { id: 'contrato', label: 'Contrato', icon: FileText },
  { id: 'factura', label: 'Factura', icon: Receipt },
  { id: 'permiso', label: 'Permiso de circulación', icon: FileText },
  { id: 'ficha', label: 'Ficha técnica', icon: FileText },
] as const;

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <VehicleShellBlock className="p-5">
      <h3 className="vsaas-panel-head mb-4">{title}</h3>
      {children}
    </VehicleShellBlock>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: 'blue' | 'green' | 'neutral' }) {
  const accentClass =
    accent === 'blue'
      ? 'border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.06)]'
      : accent === 'green'
        ? 'border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)]'
        : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50';
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${accentClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1.5 text-lg font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

function PurchaseDetailContent({
  purchase,
  onAction,
}: {
  purchase: CompraListItem;
  onAction?: (actionId: CompraActionId) => void;
}) {
  const statusToken = PURCHASE_STATUS_TOKEN[purchase.status];
  const expenses = purchase.associatedExpenses ?? 0;
  const totalCost = purchase.purchasePrice + expenses;

  return (
    <div className="space-y-5">
      <DetailSection title="Información">
        <div className="space-y-0">
          <InfoRow label="Vehículo" value={purchase.vehicleLabel || '—'} />
          <InfoRow label="Estado" value={statusToken.label} />
          <InfoRow label="Fecha de compra" value={formatCompraDate(purchase.purchaseDate)} />
          <InfoRow
            label="Proveedor / Particular"
            value={
              purchase.supplierName
                ? `${purchaseSupplierLabel(purchase.supplierType)} · ${purchase.supplierName}`
                : '—'
            }
          />
          <InfoRow label="Precio de compra" value={formatCompraPrice(purchase.purchasePrice)} />
        </div>
      </DetailSection>

      <DetailSection title="Costes">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Precio compra" value={formatCompraPrice(purchase.purchasePrice)} accent="blue" />
          <MetricCard label="Gastos asociados" value={formatCompraPrice(expenses)} />
          <MetricCard label="Coste total" value={formatCompraPrice(totalCost)} accent="green" />
        </div>
      </DetailSection>

      <DetailSection title="Documentación">
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCUMENT_SLOTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onAction?.('document')}
              className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:border-blue-800"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-800">
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Abrir documentos del vehículo</p>
              </div>
            </button>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Historial">
        {purchase.statusHistory && purchase.statusHistory.length > 0 ? (
          <div className="space-y-3">
            {purchase.statusHistory.map((entry) => (
              <div
                key={entry.id}
                className="relative border-l-2 border-blue-200 pl-4 dark:border-blue-800"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.label}</p>
                <p className="text-xs text-slate-500">{formatCompraDate(entry.date)}</p>
                {entry.note ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/30 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/20">
            <Clock className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Sin movimientos</p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Aquí aparecerá la línea temporal de la compra y sus acciones relacionadas.
            </p>
          </div>
        )}
      </DetailSection>
    </div>
  );
}

export function ComprasDetailPanel({
  purchase,
  onAction,
  actionsDisabled = false,
  hiddenActions,
}: ComprasDetailPanelProps) {
  if (!purchase) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--v-surface,#f5f7fb)]/80 px-8 text-center dark:bg-slate-950/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-sm dark:border-blue-900 dark:bg-slate-900">
          <ShoppingCart className="h-8 w-8 text-[var(--v-blue,#2563eb)]" strokeWidth={1.5} />
        </div>
        <h2 className="vsaas-title text-lg">
          Selecciona una compra
        </h2>
        <p className="mt-2 max-w-sm vsaas-subtitle text-sm">
          Elige una compra de la lista para ver su ficha, costes, documentación e historial.
        </p>
      </section>
    );
  }

  const statusToken = PURCHASE_STATUS_TOKEN[purchase.status];
  const SupplierIcon = purchase.supplierType === 'particular' ? User : Building2;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <header className="shrink-0 border-b border-slate-200/80 bg-gradient-to-b from-white to-[var(--v-surface,#f5f7fb)]/80 px-6 py-5 dark:border-slate-800 dark:from-slate-950 dark:to-slate-950/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="vsaas-title text-xl">
                {purchase.vehicleLabel || 'Compra sin vehículo'}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusToken.badgeBg} ${statusToken.badgeText}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusToken.dot}`} />
                {statusToken.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatCompraDate(purchase.purchaseDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <SupplierIcon className="h-3.5 w-3.5" />
                {purchase.supplierName || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCompraPrice(purchase.purchasePrice)}
              </span>
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40">
            <Car className="h-6 w-6 text-[var(--v-blue,#2563eb)]" strokeWidth={1.5} />
          </div>
        </div>
      </header>

      <ComprasDetailActionBar
        showActions
        disabled={actionsDisabled}
        hiddenActions={hiddenActions}
        onAction={onAction}
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--v-surface,#f5f7fb)]/50 px-6 py-5 dark:bg-slate-950/50">
        <PurchaseDetailContent purchase={purchase} onAction={onAction} />
      </div>
    </section>
  );
}
