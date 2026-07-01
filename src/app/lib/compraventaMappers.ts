import type { TradeIn } from '../context/AppContext';
import type { VehicleAcquisition } from './vehicleAcquisitionApi';
import type { TasacionListItem, TasacionStatus } from '../components/saas/compraventa/tasaciones/tasacionesListData';
import type { CompraListItem, PurchaseStatus, PurchaseSupplierType } from '../components/saas/compraventa/compras/comprasListData';

export type FlowHistoryEntry = {
  id: string;
  date: string;
  label: string;
  note?: string;
};

const TRADE_IN_TO_TASACION_STATUS: Record<string, TasacionStatus> = {
  pending: 'pendiente',
  negotiation: 'negociacion',
  accepted: 'aceptada',
  rejected: 'rechazada',
};

const ACQUISITION_TO_COMPRA_STATUS: Record<string, PurchaseStatus> = {
  borrador: 'pendiente',
  pendiente_aprobacion: 'pendiente',
  aprobada: 'confirmada',
  en_transito: 'confirmada',
  recibida: 'completada',
  documentada: 'completada',
  cerrada: 'completada',
  rechazada: 'cancelada',
  cancelada: 'cancelada',
};

export function mapTradeInStatus(status?: string): TasacionStatus {
  return TRADE_IN_TO_TASACION_STATUS[status || ''] || 'pendiente';
}

export function mapAcquisitionStatus(status?: string): PurchaseStatus {
  return ACQUISITION_TO_COMPRA_STATUS[status || ''] || 'pendiente';
}

export function buildVehicleLabel(parts: { brand?: string; model?: string; year?: number; registrationPlate?: string }) {
  const base = [parts.brand, parts.model, parts.year ? String(parts.year) : ''].filter(Boolean).join(' ');
  if (parts.registrationPlate) return `${base} · ${parts.registrationPlate}`.trim();
  return base.trim() || 'Vehículo sin identificar';
}

export function mapTradeInToTasacion(item: TradeIn): TasacionListItem {
  return {
    id: item.id,
    vehicleLabel: buildVehicleLabel(item),
    status: mapTradeInStatus(item.status),
    ownerName: item.ownerName || '',
    appraisalDate: item.createdAt?.slice(0, 10) || '',
    requestedPrice: item.estimatedValue || 0,
    make: item.brand,
    model: item.model,
    year: item.year,
    mileage: item.mileage,
    licensePlate: item.registrationPlate,
    vin: item.vin,
    fuel: item.fuelType,
    transmission: item.transmission,
    color: item.color,
    ownerPhone: item.ownerPhone,
    ownerEmail: item.ownerEmail,
    recommendedPrice: item.recommendedPrice,
    observations: item.notes,
    linkedVehicleId: item.linkedVehicleId,
    linkedAcquisitionId: item.linkedAcquisitionId,
    clientId: item.clientId,
    statusHistory: mapTradeInHistory(item),
  };
}

export function mapTradeInHistory(item: TradeIn): FlowHistoryEntry[] {
  const entries = Array.isArray(item.statusHistory) ? item.statusHistory : [];
  return entries.map((entry, index) => ({
    id: entry.id || `${item.id}-hist-${index}`,
    date: entry.date || item.updatedAt || item.createdAt,
    label: historyLabelForTradeIn(entry),
    note: entry.note,
  }));
}

function historyLabelForTradeIn(entry: { action?: string; status?: string; note?: string }) {
  if (entry.action === 'accepted' || entry.status === 'accepted') return 'Tasación aceptada';
  if (entry.action === 'rejected' || entry.status === 'rejected') return 'Tasación rechazada';
  if (entry.action === 'created') return 'Tasación registrada';
  if (entry.status === 'negotiation') return 'En negociación';
  return entry.note || 'Actualización';
}

export function mapAcquisitionToCompra(
  item: VehicleAcquisition,
  vehicleLabelById?: Record<string, string>,
): CompraListItem {
  const associatedExpenses = Math.max(0, (item.costTotal || 0) - (item.costCompra || 0));
  const supplierType: PurchaseSupplierType = item.sellerType === 'empresa' ? 'proveedor' : 'particular';
  const vehicleLabel = vehicleLabelById?.[item.vehicleId]
    || (item.registrationPlate ? `Mat. ${item.registrationPlate}` : 'Compra sin vehículo');

  return {
    id: item.id,
    vehicleLabel,
    status: mapAcquisitionStatus(item.status),
    purchaseDate: item.acquisitionDate || item.createdAt?.slice(0, 10) || '',
    purchasePrice: item.costCompra || 0,
    supplierName: item.sellerName || '',
    supplierType,
    associatedExpenses,
    vehicleId: item.vehicleId,
    tradeInId: item.tradeInId,
    statusHistory: mapAcquisitionHistory(item),
  };
}

export function mapAcquisitionHistory(item: VehicleAcquisition): FlowHistoryEntry[] {
  const entries = Array.isArray(item.statusHistory) ? item.statusHistory : [];
  return entries.map((entry, index) => ({
    id: `${item.id}-hist-${index}`,
    date: entry.date,
    label: `Estado: ${entry.status}`,
    note: entry.note,
  }));
}

export function tasacionToTradeInPayload(item: Partial<TasacionListItem>): Partial<TradeIn> {
  const statusMap: Record<TasacionStatus, TradeIn['status']> = {
    pendiente: 'pending',
    negociacion: 'negotiation',
    aceptada: 'accepted',
    rechazada: 'rejected',
  };

  return {
    brand: item.make || '',
    model: item.model || '',
    year: item.year || new Date().getFullYear(),
    mileage: item.mileage,
    color: item.color || '',
    fuelType: item.fuel,
    transmission: item.transmission,
    registrationPlate: item.licensePlate,
    vin: item.vin,
    estimatedValue: item.requestedPrice || 0,
    recommendedPrice: item.recommendedPrice,
    ownerName: item.ownerName,
    ownerPhone: item.ownerPhone,
    ownerEmail: item.ownerEmail,
    notes: item.observations,
    status: item.status ? statusMap[item.status] : 'pending',
  };
}
