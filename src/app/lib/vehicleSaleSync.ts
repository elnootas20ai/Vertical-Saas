import type { Vehicle } from '../context/AppContext';
import { updateVehicleRequest } from './vehicleApi';
import type { SaleRecord, SaleStage } from './salesTypes';

const STAGE_TO_VEHICLE_STATUS: Partial<Record<SaleStage, Vehicle['status']>> = {
  reserved: 'reserved',
  documentation: 'reserved',
  sold: 'sold',
  delivered: 'sold',
};

export async function syncVehicleWithSale(userId: string, sale: SaleRecord): Promise<void> {
  if (!userId || !sale.vehicleId) return;
  const targetStatus = STAGE_TO_VEHICLE_STATUS[sale.stage];
  if (!targetStatus) return;

  const patch: Partial<Vehicle> = { status: targetStatus };
  if (targetStatus === 'sold' && sale.totalPrice > 0) {
    patch.salePrice = sale.totalPrice;
  }

  await updateVehicleRequest(userId, sale.vehicleId, patch);
}

export function isVehicleAvailableForSale(
  vehicle: Pick<Vehicle, 'id' | 'status'>,
  existingSales: SaleRecord[],
): { available: boolean; reason?: string; blockingSaleId?: string } {
  const st = String(vehicle.status || '');
  if (st === 'sold' || st === 'vendido') {
    return { available: false, reason: 'El vehículo ya está marcado como vendido' };
  }

  const activeSale = existingSales.find(
    (s) =>
      s.vehicleId === vehicle.id &&
      ['reserved', 'documentation', 'sold'].includes(s.stage),
  );

  if (activeSale) {
    return {
      available: false,
      reason: `Ya existe una operación activa (${activeSale.clientName})`,
      blockingSaleId: activeSale.id,
    };
  }

  return { available: true };
}
