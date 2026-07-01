import type { ReactNode } from 'react';
import {
  Calendar,
  Clock,
  ImagePlus,
  Mail,
  Phone,
  Scale,
  User,
} from 'lucide-react';
import { VehicleShellBlock } from '../../vehicles/VehicleShellBlock';
import { TasacionesDetailActionBar } from './TasacionesDetailActionBar';
import {
  formatTasacionDate,
  formatTasacionMileage,
  formatTasacionPrice,
  formatTasacionYear,
  TASACION_STATUS_TOKEN,
  type TasacionListItem,
} from './tasacionesListData';

type TasacionesDetailPanelProps = {
  tasacion: TasacionListItem | null;
  onAccept?: () => void;
  onReject?: () => void;
  actionsDisabled?: boolean;
};

const PHOTO_SLOTS = 6;

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

function TasacionDetailContent({ tasacion }: { tasacion: TasacionListItem }) {
  return (
    <div className="space-y-5">
      <DetailSection title="Información">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div className="space-y-0">
            <InfoRow label="Marca" value={tasacion.make || '—'} />
            <InfoRow label="Modelo" value={tasacion.model || '—'} />
            <InfoRow label="Año" value={formatTasacionYear(tasacion.year)} />
            <InfoRow label="Kilómetros" value={formatTasacionMileage(tasacion.mileage)} />
            <InfoRow label="Matrícula" value={tasacion.licensePlate || '—'} />
          </div>
          <div className="space-y-0 sm:border-l sm:border-gray-100 sm:pl-6 dark:sm:border-gray-800">
            <InfoRow label="VIN / Bastidor" value={tasacion.vin || '—'} />
            <InfoRow label="Combustible" value={tasacion.fuel || '—'} />
            <InfoRow label="Cambio" value={tasacion.transmission || '—'} />
            <InfoRow label="Color" value={tasacion.color || '—'} />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Propietario">
        <div className="space-y-0">
          <InfoRow label="Nombre" value={tasacion.ownerName || '—'} />
          <InfoRow label="Teléfono" value={tasacion.ownerPhone || '—'} />
          <InfoRow label="Email" value={tasacion.ownerEmail || '—'} />
        </div>
      </DetailSection>

      <DetailSection title="Tasación">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Precio solicitado"
            value={formatTasacionPrice(tasacion.requestedPrice)}
          />
          <MetricCard
            label="Precio recomendado"
            value={
              tasacion.recommendedPrice != null && tasacion.recommendedPrice > 0
                ? formatTasacionPrice(tasacion.recommendedPrice)
                : '—'
            }
            valueClassName="text-violet-700 dark:text-violet-400"
          />
        </div>
        <div className="mt-4 rounded-xl border border-gray-200/80 bg-gray-50/30 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/20">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Observaciones
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {tasacion.observations?.trim() || 'Sin observaciones'}
          </p>
        </div>
      </DetailSection>

      <DetailSection title="Fotografías">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: PHOTO_SLOTS }, (_, index) => (
            <div
              key={index}
              className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30"
            >
              <ImagePlus className="h-6 w-6 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
              <span className="mt-1.5 text-[10px] font-medium text-gray-400">Sin foto</span>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Historial">
        {tasacion.statusHistory && tasacion.statusHistory.length > 0 ? (
          <div className="space-y-3">
            {tasacion.statusHistory.map((entry) => (
              <div
                key={entry.id}
                className="relative border-l-2 border-gray-200 pl-4 dark:border-gray-700"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.label}</p>
                <p className="text-xs text-gray-500">{formatTasacionDate(entry.date)}</p>
                {entry.note ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/30 px-4 py-8 text-center dark:border-gray-700 dark:bg-gray-900/20">
            <Clock className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sin movimientos</p>
            <p className="mt-1 max-w-xs text-xs text-gray-400">
              Aquí aparecerá la línea temporal de acciones sobre esta oportunidad de compra.
            </p>
          </div>
        )}
      </DetailSection>
    </div>
  );
}

export function TasacionesDetailPanel({
  tasacion,
  onAccept,
  onReject,
  actionsDisabled = false,
}: TasacionesDetailPanelProps) {
  if (!tasacion) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-gray-50/50 px-8 text-center dark:bg-gray-950/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-gray-900">
          <Scale className="h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Selecciona una tasación
        </h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Elige una oportunidad de compra para ver sus datos, valoración y propietario.
        </p>
        <p className="mt-3 max-w-sm text-xs text-gray-400">
          Una tasación no es un vehículo del inventario. Al aceptarla podrá convertirse en compra.
        </p>
      </section>
    );
  }

  const statusToken = TASACION_STATUS_TOKEN[tasacion.status];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-950">
      <header className="shrink-0 border-b border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 px-6 py-5 dark:border-gray-800 dark:from-gray-950 dark:to-gray-950/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {tasacion.vehicleLabel || 'Tasación sin vehículo'}
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
                {tasacion.ownerName || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatTasacionDate(tasacion.appraisalDate)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatTasacionPrice(tasacion.requestedPrice)}
              </span>
            </div>
            {tasacion.ownerPhone || tasacion.ownerEmail ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                {tasacion.ownerPhone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {tasacion.ownerPhone}
                  </span>
                ) : null}
                {tasacion.ownerEmail ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {tasacion.ownerEmail}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/40">
            <Scale className="h-6 w-6 text-violet-400" strokeWidth={1.5} />
          </div>
        </div>
      </header>

      <TasacionesDetailActionBar
        showActions
        disabled={actionsDisabled}
        onAction={(actionId) => {
          if (actionId === 'accept') onAccept?.();
          if (actionId === 'reject') onReject?.();
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-6 py-5 dark:bg-gray-950/50">
        <TasacionDetailContent tasacion={tasacion} />
      </div>
    </section>
  );
}
