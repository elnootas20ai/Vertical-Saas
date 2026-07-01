import type { ReactNode } from 'react';
import {
  Calendar,
  Car,
  Clock,
  Truck,
  User,
  UserCircle,
} from 'lucide-react';
import { VehicleShellBlock } from '../../vehicles/VehicleShellBlock';
import {
  ENTREGA_CHECKLIST_ITEMS,
  ENTREGA_STATUS_TOKEN,
  entregaChecklistProgress,
  formatEntregaDate,
  type EntregaListItem,
} from './entregasListData';

type EntregasDetailPanelProps = {
  entrega: EntregaListItem | null;
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

function ChecklistItem({
  label,
  checked,
}: {
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-default items-center gap-3 rounded-xl border border-gray-200/80 bg-gray-50/40 px-4 py-3 transition-colors dark:border-gray-700 dark:bg-gray-900/30">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          checked
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-950'
        }`}
        aria-hidden
      >
        {checked ? (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <span className={`text-sm ${checked ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
        {label}
      </span>
    </label>
  );
}

function EntregaDetailContent({ entrega }: { entrega: EntregaListItem }) {
  const { done, total } = entregaChecklistProgress(entrega);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <DetailSection title="Información">
        <div className="space-y-0">
          <InfoRow label="Vehículo" value={entrega.vehicleLabel || '—'} />
          <InfoRow label="Cliente" value={entrega.clientName || '—'} />
          <InfoRow label="Comercial responsable" value={entrega.salesPerson || '—'} />
          <InfoRow label="Fecha prevista" value={formatEntregaDate(entrega.expectedDate)} />
          <InfoRow label="Estado" value={ENTREGA_STATUS_TOKEN[entrega.status].label} />
        </div>
      </DetailSection>

      <DetailSection title="Checklist de entrega">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              Progreso del checklist
            </span>
            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {done}/{total} · {progressPct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ENTREGA_CHECKLIST_ITEMS.map(({ id, label }) => (
            <ChecklistItem
              key={id}
              label={label}
              checked={entrega.checklist?.[id] === true}
            />
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Observaciones">
        <div className="rounded-xl border border-gray-200/80 bg-gray-50/30 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/20">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {entrega.observations?.trim() || 'Sin observaciones'}
          </p>
        </div>
      </DetailSection>

      <DetailSection title="Historial">
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/30 px-4 py-8 text-center dark:border-gray-700 dark:bg-gray-900/20">
          <Clock className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sin movimientos</p>
          <p className="mt-1 max-w-xs text-xs text-gray-400">
            Aquí aparecerá la línea temporal de acciones durante la preparación y entrega del vehículo.
          </p>
        </div>
      </DetailSection>
    </div>
  );
}

export function EntregasDetailPanel({ entrega }: EntregasDetailPanelProps) {
  if (!entrega) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-gray-50/50 px-8 text-center dark:bg-gray-950/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-gray-900">
          <Truck className="h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Selecciona una entrega
        </h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Elige una entrega de la lista para ver su checklist, observaciones e historial.
        </p>
        <p className="mt-3 max-w-sm text-xs text-gray-400">
          La entrega es el último paso del ciclo del vehículo. Al marcarla como entregada se cerrará la operación.
        </p>
      </section>
    );
  }

  const statusToken = ENTREGA_STATUS_TOKEN[entrega.status];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-950">
      <header className="shrink-0 border-b border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 px-6 py-5 dark:border-gray-800 dark:from-gray-950 dark:to-gray-950/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {entrega.vehicleLabel || 'Entrega sin vehículo'}
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
                {entrega.clientName || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatEntregaDate(entrega.expectedDate)}
              </span>
              {entrega.salesPerson ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserCircle className="h-3.5 w-3.5" />
                  {entrega.salesPerson}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
            <Car className="h-6 w-6 text-emerald-500" strokeWidth={1.5} />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-6 py-5 dark:bg-gray-950/50">
        <EntregaDetailContent entrega={entrega} />
      </div>
    </section>
  );
}
