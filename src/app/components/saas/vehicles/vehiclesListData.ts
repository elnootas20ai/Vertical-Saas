import type { VehicleStatus } from '../DesignTokens';
import type { Vehicle, VehicleDocumentRecord } from '../../context/AppContext';

export type VehicleHistoryEntry = {
  id: string;
  date: Date;
  label: string;
  note?: string;
};

export type VehicleListItem = {
  id: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  km: number;
  plate: string;
  vin?: string;
  price: number;
  purchasePrice: number;
  expenses: number;
  daysInStock: number;
  status: VehicleStatus;
  location: string;
  photoUrl?: string;
  images: string[];
  documents: VehicleDocumentRecord[];
  fuelType?: string;
  transmission?: string;
  power?: number;
  color?: string;
  notes?: string;
  archived?: boolean;
  createdAt?: Date;
  historyEntries?: VehicleHistoryEntry[];
};

export type VehicleSortKey = 'recent' | 'priceAsc' | 'priceDesc' | 'daysAsc' | 'daysDesc' | 'marginDesc';

export const VEHICLE_SORT_OPTIONS: { id: VehicleSortKey; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'priceDesc', label: 'Precio · mayor' },
  { id: 'priceAsc', label: 'Precio · menor' },
  { id: 'daysDesc', label: 'Días en stock · más' },
  { id: 'daysAsc', label: 'Días en stock · menos' },
  { id: 'marginDesc', label: 'Margen · mayor' },
];

export function vehicleEstimatedMargin(item: VehicleListItem): number {
  return item.price - item.purchasePrice - item.expenses;
}

export function vehicleRoi(item: VehicleListItem): number {
  const invested = item.purchasePrice + item.expenses;
  if (invested <= 0) return 0;
  return (vehicleEstimatedMargin(item) / invested) * 100;
}

export function vehicleListStatusLabel(status: VehicleListItem['status']): string {
  if (status === 'listo') return 'Disponible';
  return (
    {
      entrada: 'Entrada',
      preparacion: 'En preparación',
      reservado: 'Reservado',
      vendido: 'Vendido',
    } as const
  )[status];
}

export function formatVehiclePrice(value: number): string {
  return value.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export function formatVehicleKm(value: number): string {
  return `${value.toLocaleString('es-ES')} km`;
}

export function normalizeVehicleListStatus(status: string): VehicleStatus {
  const map: Record<string, VehicleStatus> = {
    available: 'listo',
    reserved: 'reservado',
    sold: 'vendido',
    workshop: 'preparacion',
    received: 'entrada',
    entrada: 'entrada',
    preparacion: 'preparacion',
    listo: 'listo',
    reservado: 'reservado',
    vendido: 'vendido',
  };
  return map[status] ?? 'entrada';
}

function buildVehicleHistoryEntries(vehicle: Vehicle): VehicleHistoryEntry[] {
  if (vehicle.vehicleHistory?.length) {
    return [...vehicle.vehicleHistory]
      .map((entry) => ({
        id: entry.id,
        date: new Date(entry.date),
        label: entry.label,
        note: entry.note || entry.userName || undefined,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  const entries: VehicleHistoryEntry[] = [];

  if (vehicle.createdAt) {
    entries.push({
      id: 'created',
      date: vehicle.createdAt,
      label: 'Vehículo creado',
      note: `${vehicle.brand} ${vehicle.model}${vehicle.registrationPlate ? ` · ${vehicle.registrationPlate}` : ''}`,
    });
  }

  for (const entry of vehicle.commercialStatusHistory ?? []) {
    if (!entry?.date) continue;
    entries.push({
      id: entry.id || `commercial-${entry.date}`,
      date: new Date(entry.date),
      label: `Estado comercial: ${entry.fromStatus} → ${entry.toStatus}`,
      note: entry.reason || entry.userName || undefined,
    });
  }

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatVehicleHistoryDate(date: Date): string {
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function mapAppVehicleToListItem(vehicle: Vehicle): VehicleListItem {
  const expenses =
    vehicle.preparationCostTotal
    ?? vehicle.totalPreparationCost
    ?? vehicle.totalCosts
    ?? 0;

  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    year: vehicle.year,
    km: vehicle.mileage ?? 0,
    plate: vehicle.registrationPlate,
    vin: vehicle.vin,
    price: vehicle.salePrice ?? 0,
    purchasePrice: vehicle.purchasePrice,
    expenses,
    daysInStock: vehicle.daysInStock,
    status: normalizeVehicleListStatus(vehicle.status),
    location: vehicle.location ?? vehicle.workCenterName ?? '',
    photoUrl: vehicle.images?.[0],
    images: vehicle.images ?? [],
    documents: vehicle.documents ?? [],
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    power: vehicle.power,
    color: vehicle.color,
    notes: vehicle.notes,
    archived: vehicle.archived,
    createdAt: vehicle.createdAt,
    historyEntries: buildVehicleHistoryEntries(vehicle),
  };
}
