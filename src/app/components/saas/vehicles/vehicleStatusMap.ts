import type { VehicleStatus } from '../DesignTokens';

export const VEHICLE_STATUS_OPTIONS: { value: VehicleStatus; label: string; backend: string }[] = [
  { value: 'listo', label: 'Disponible', backend: 'available' },
  { value: 'entrada', label: 'Entrada', backend: 'received' },
  { value: 'preparacion', label: 'En preparación', backend: 'workshop' },
  { value: 'reservado', label: 'Reservado', backend: 'reserved' },
  { value: 'vendido', label: 'Vendido', backend: 'sold' },
];

export function uiStatusToBackend(status: VehicleStatus): string {
  return VEHICLE_STATUS_OPTIONS.find((o) => o.value === status)?.backend ?? 'available';
}

export function backendStatusToUi(status: string): VehicleStatus {
  const map: Record<string, VehicleStatus> = {
    available: 'listo',
    reserved: 'reservado',
    sold: 'vendido',
    workshop: 'preparacion',
    received: 'entrada',
    listo: 'listo',
    reservado: 'reservado',
    vendido: 'vendido',
    preparacion: 'preparacion',
    entrada: 'entrada',
  };
  return map[status] ?? 'listo';
}
