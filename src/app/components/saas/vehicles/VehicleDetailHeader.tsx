import {
  Calendar,
  Gauge,
  Hash,
  MapPin,
  Share2,
  Printer,
  LoaderCircle,
} from 'lucide-react';
import { VEHICLE_STATUS_TOKEN, daysColor, type VehicleStatus } from '../DesignTokens';
import {
  formatVehicleKm,
  formatVehiclePrice,
  vehicleEstimatedMargin,
  vehicleListStatusLabel,
  vehicleRoi,
  type VehicleListItem,
} from './vehiclesListData';
import { VEHICLE_STATUS_OPTIONS } from './vehicleStatusMap';

type VehicleDetailHeaderProps = {
  vehicle: VehicleListItem;
  onStatusChange?: (status: VehicleStatus) => void;
  statusChanging?: boolean;
};

function MetricCard({
  label,
  value,
  valueClassName = 'text-gray-900 dark:text-gray-100',
  hint,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className={`mt-1.5 text-lg font-bold tabular-nums tracking-tight ${valueClassName}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function VehicleDetailHeader({ vehicle, onStatusChange, statusChanging = false }: VehicleDetailHeaderProps) {
  const margin = vehicleEstimatedMargin(vehicle);
  const roi = vehicleRoi(vehicle);
  const statusToken = VEHICLE_STATUS_TOKEN[vehicle.status] ?? VEHICLE_STATUS_TOKEN.entrada;
  const marginPositive = margin >= 0;
  const roiPositive = roi >= 0;

  return (
    <header className="shrink-0 border-b border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 px-6 py-5 dark:border-gray-800 dark:from-gray-950 dark:to-gray-950/80">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {vehicle.brand} {vehicle.model}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusToken.badgeBg} ${statusToken.badgeText}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusToken.dot}`} />
              {vehicleListStatusLabel(vehicle.status)}
            </span>
            {onStatusChange ? (
              <div className="relative">
                <select
                  value={vehicle.status}
                  disabled={statusChanging}
                  onChange={(e) => onStatusChange(e.target.value as VehicleStatus)}
                  className="h-9 appearance-none rounded-xl border border-gray-200 bg-white py-0 pl-3 pr-8 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                >
                  {VEHICLE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {statusChanging ? (
                  <LoaderCircle className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {vehicle.year}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {formatVehicleKm(vehicle.km)}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
              <Hash className="h-3.5 w-3.5" />
              {vehicle.plate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {vehicle.location}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Printer className="h-4 w-4" />
            Imprimir ficha
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Share2 className="h-4 w-4" />
            Compartir
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Precio venta" value={formatVehiclePrice(vehicle.price)} />
        <MetricCard label="Precio compra" value={formatVehiclePrice(vehicle.purchasePrice)} />
        <MetricCard
          label="Beneficio"
          value={`${marginPositive ? '+' : ''}${formatVehiclePrice(margin)}`}
          valueClassName={marginPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
          hint={`Gastos ${formatVehiclePrice(vehicle.expenses)}`}
        />
        <MetricCard
          label="ROI"
          value={`${roiPositive ? '+' : ''}${roi.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}
          valueClassName={roiPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
        />
        <MetricCard
          label="Días en stock"
          value={`${vehicle.daysInStock} días`}
          valueClassName={daysColor(vehicle.daysInStock)}
        />
        <MetricCard
          label="Estado"
          value={vehicleListStatusLabel(vehicle.status)}
          valueClassName={`text-sm font-semibold ${statusToken.badgeText}`}
        />
      </div>
    </header>
  );
}
