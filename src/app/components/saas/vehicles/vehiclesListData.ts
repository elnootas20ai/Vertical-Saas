import type { VehicleStatus } from '../DesignTokens';
import type { Vehicle, VehicleDocumentRecord } from '../../context/AppContext';

export type VehicleHistoryEntry = {
  id: string;
  date: Date;
  label: string;
  note?: string;
  userName?: string;
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

export type VehicleSortKey =
  | 'recent'
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'brand_asc'
  | 'brand_desc'
  | 'model_asc'
  | 'model_desc'
  | 'year_desc'
  | 'year_asc'
  | 'purchasePrice_desc'
  | 'purchasePrice_asc'
  | 'salePrice_desc'
  | 'salePrice_asc'
  | 'km_desc'
  | 'km_asc'
  | 'daysDesc'
  | 'daysAsc'
  | 'marginDesc';

export const VEHICLE_SORT_OPTIONS: { id: VehicleSortKey; label: string }[] = [
  { id: 'createdAt_desc', label: 'Fecha creación · reciente' },
  { id: 'createdAt_asc', label: 'Fecha creación · antigua' },
  { id: 'brand_asc', label: 'Marca · A-Z' },
  { id: 'brand_desc', label: 'Marca · Z-A' },
  { id: 'model_asc', label: 'Modelo · A-Z' },
  { id: 'model_desc', label: 'Modelo · Z-A' },
  { id: 'year_desc', label: 'Año · mayor' },
  { id: 'year_asc', label: 'Año · menor' },
  { id: 'purchasePrice_desc', label: 'Precio compra · mayor' },
  { id: 'purchasePrice_asc', label: 'Precio compra · menor' },
  { id: 'salePrice_desc', label: 'Precio venta · mayor' },
  { id: 'salePrice_asc', label: 'Precio venta · menor' },
  { id: 'km_desc', label: 'Kilómetros · mayor' },
  { id: 'km_asc', label: 'Kilómetros · menor' },
];

export function vehicleEstimatedMargin(item: VehicleListItem): number {
  return item.price - item.purchasePrice - item.expenses;
}

export function vehicleRoi(item: VehicleListItem): number {
  const invested = item.purchasePrice + item.expenses;
  if (invested <= 0) return 0;
  return (vehicleEstimatedMargin(item) / invested) * 100;
}

export function vehicleListStatusLabel(status: VehicleListItem['status'], archived?: boolean): string {
  if (archived) return 'Archivado';
  if (status === 'listo') return 'Disponible';
  return (
    {
      entrada: 'Entrada',
      preparacion: 'En preparación',
      reservado: 'Reservado',
      vendido: 'Vendido',
      entregado: 'Entregado',
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
    delivered: 'entregado',
    workshop: 'preparacion',
    received: 'entrada',
    entrada: 'entrada',
    preparacion: 'preparacion',
    listo: 'listo',
    reservado: 'reservado',
    vendido: 'vendido',
    entregado: 'entregado',
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
        note: entry.note || undefined,
        userName: entry.userName || undefined,
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
