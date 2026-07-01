import type { VehicleStatus } from '../DesignTokens';

/** Estados operativos del módulo Vehículos (compraventa). */
export const VEHICLE_MODULE_STATUS_OPTIONS: { value: VehicleStatus; label: string; backend: string }[] = [
  { value: 'listo', label: 'Disponible', backend: 'available' },
  { value: 'reservado', label: 'Reservado', backend: 'reserved' },
  { value: 'vendido', label: 'Vendido', backend: 'sold' },
  { value: 'entregado', label: 'Entregado', backend: 'delivered' },
];

/** Opciones ampliadas (incluye flujo de taller/entrada). */
export const VEHICLE_STATUS_OPTIONS: { value: VehicleStatus; label: string; backend: string }[] = [
  ...VEHICLE_MODULE_STATUS_OPTIONS,
  { value: 'entrada', label: 'Entrada', backend: 'received' },
  { value: 'preparacion', label: 'En preparación', backend: 'workshop' },
];

export function uiStatusToBackend(status: VehicleStatus): string {
  return VEHICLE_STATUS_OPTIONS.find((o) => o.value === status)?.backend ?? 'available';
}

export function backendStatusToUi(status: string): VehicleStatus {
  const map: Record<string, VehicleStatus> = {
    available: 'listo',
    reserved: 'reservado',
    sold: 'vendido',
    delivered: 'entregado',
    workshop: 'preparacion',
    received: 'entrada',
    listo: 'listo',
    reservado: 'reservado',
    vendido: 'vendido',
    entregado: 'entregado',
    preparacion: 'preparacion',
    entrada: 'entrada',
  };
  return map[status] ?? 'listo';
}

export function vehicleStatusLabel(status: VehicleStatus): string {
  return VEHICLE_MODULE_STATUS_OPTIONS.find((o) => o.value === status)?.label
    ?? VEHICLE_STATUS_OPTIONS.find((o) => o.value === status)?.label
    ?? status;
}
