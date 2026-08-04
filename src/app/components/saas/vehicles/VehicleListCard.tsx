import { useState } from 'react';
import { Car } from 'lucide-react';
import { VEHICLE_STATUS_TOKEN, daysColor, type VehicleStatus } from '../DesignTokens';
import {
  formatVehicleKm,
  formatVehiclePrice,
  vehicleEstimatedMargin,
  vehicleListStatusLabel,
  type VehicleListItem,
} from './vehiclesListData';

type VehicleListCardProps = {
  vehicle: VehicleListItem;
  selected: boolean;
  onSelect: () => void;
};

function statusBadgeClasses(status: VehicleStatus, archived?: boolean): string {
  if (archived) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  const token = VEHICLE_STATUS_TOKEN[status];
  if (!token) return 'bg-gray-100 text-gray-600';
  return `${token.badgeBg} ${token.badgeText} dark:bg-opacity-20`;
}

function VehiclePhoto({ vehicle }: { vehicle: VehicleListItem }) {
  const [failed, setFailed] = useState(false);

  if (!vehicle.photoUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
        <Car className="h-6 w-6 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={vehicle.photoUrl}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function VehicleListCard({ vehicle, selected, onSelect }: VehicleListCardProps) {
  const margin = vehicleEstimatedMargin(vehicle);
  const marginPositive = margin >= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-2xl border p-3 text-left transition-all duration-150 ${
        selected
          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 shadow-md ring-1 ring-blue-500/20 dark:border-blue-500/60 dark:bg-blue-950/30'
          : 'border-slate-200/90 bg-white hover:border-blue-200 hover:shadow-sm dark:border-slate-700/90 dark:bg-slate-900 dark:hover:border-blue-800'
      }`}
    >
      <div className="flex gap-3">
        <div className="h-[72px] w-[96px] shrink-0 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
          <VehiclePhoto vehicle={vehicle} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {vehicle.brand} {vehicle.model}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {vehicle.year}
                <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                {formatVehicleKm(vehicle.km)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClasses(vehicle.status, vehicle.archived)}`}
            >
              {vehicleListStatusLabel(vehicle.status, vehicle.archived)}
            </span>
          </div>

          <div className="mt-2.5 flex items-end justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Margen{' '}
                <span className={`font-semibold tabular-nums ${marginPositive ? 'text-[var(--v-green,#22c55e)]' : 'text-[var(--v-rose,#e11d48)]'}`}>
                  {marginPositive ? '+' : ''}
                  {formatVehiclePrice(margin)}
                </span>
              </p>
              <p className={`text-[11px] font-medium tabular-nums ${daysColor(vehicle.daysInStock)}`}>
                {vehicle.daysInStock} días en stock
              </p>
            </div>
            <p className="shrink-0 text-base font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
              {formatVehiclePrice(vehicle.price)}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
