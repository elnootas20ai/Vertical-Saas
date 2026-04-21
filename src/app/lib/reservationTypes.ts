export type ReservationStatus = 'active' | 'expired' | 'cancelled' | 'converted';

export interface ReservationRecord {
  _id: string;
  _rev?: string;
  type: 'reservation';
  id: string;
  user_id: string;

  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientDni: string;

  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleYear?: number;

  status: ReservationStatus;
  depositAmount: number;
  depositPaid: boolean;
  paymentMethod: string;
  reservationDate: string;
  expirationDate: string;

  saleId: string;
  financeMovementId: string;
  contractGenerated: boolean;

  commercial: string;
  commercialId: string;
  observations: string;
  workCenterId?: string;
  workCenterName?: string;

  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelReason: string;
  convertedAt: string | null;
}

export interface CreateReservationPayload {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientDni: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleYear?: number;
  depositAmount: number;
  depositPaid: boolean;
  paymentMethod: string;
  reservationDate: string;
  expirationDate: string;
  commercial: string;
  commercialId: string;
  observations: string;
  workCenterId?: string;
  workCenterName?: string;
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  active: 'Activa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  converted: 'Convertida',
};

export const RESERVATION_STATUS_CONFIG: Record<ReservationStatus, { bg: string; text: string; dot: string }> = {
  active:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  expired:   { bg: 'bg-red-100 dark:bg-red-900/40',        text: 'text-red-700 dark:text-red-300',        dot: 'bg-red-500' },
  cancelled: { bg: 'bg-gray-100 dark:bg-gray-700/40',      text: 'text-gray-600 dark:text-gray-400',      dot: 'bg-gray-400' },
  converted: { bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-500' },
};

export const PAYMENT_METHODS = [
  'Efectivo',
  'Transferencia',
  'Tarjeta',
  'Bizum',
  'Financiación',
  'Otro',
] as const;

export function normalizeReservationRecord(value: unknown): ReservationRecord | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<ReservationRecord> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'reservation') return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    type: 'reservation',
    id,
    user_id: String(doc.user_id || ''),
    clientId: String(doc.clientId || ''),
    clientName: String(doc.clientName || ''),
    clientPhone: String(doc.clientPhone || ''),
    clientEmail: String(doc.clientEmail || ''),
    clientDni: String(doc.clientDni || ''),
    vehicleId: String(doc.vehicleId || ''),
    vehicleName: String(doc.vehicleName || ''),
    vehiclePlate: String(doc.vehiclePlate || ''),
    vehicleYear: doc.vehicleYear ? Number(doc.vehicleYear) : undefined,
    status: (['active', 'expired', 'cancelled', 'converted'].includes(doc.status || '') ? doc.status : 'active') as ReservationStatus,
    depositAmount: Number(doc.depositAmount || 0),
    depositPaid: Boolean(doc.depositPaid),
    paymentMethod: String(doc.paymentMethod || ''),
    reservationDate: String(doc.reservationDate || ''),
    expirationDate: String(doc.expirationDate || ''),
    saleId: String(doc.saleId || ''),
    financeMovementId: String(doc.financeMovementId || ''),
    contractGenerated: Boolean(doc.contractGenerated),
    commercial: String(doc.commercial || 'Sin asignar'),
    commercialId: String(doc.commercialId || ''),
    observations: String(doc.observations || ''),
    workCenterId: doc.workCenterId ? String(doc.workCenterId) : undefined,
    workCenterName: doc.workCenterName ? String(doc.workCenterName) : undefined,
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
    cancelledAt: doc.cancelledAt ? String(doc.cancelledAt) : null,
    cancelReason: String(doc.cancelReason || ''),
    convertedAt: doc.convertedAt ? String(doc.convertedAt) : null,
  };
}

export function isReservationExpired(r: ReservationRecord): boolean {
  if (r.status !== 'active') return r.status === 'expired';
  if (!r.expirationDate) return false;
  return new Date(r.expirationDate).getTime() < Date.now();
}

export function daysUntilExpiration(r: ReservationRecord): number {
  if (!r.expirationDate) return Infinity;
  const diff = new Date(r.expirationDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function daysSinceReservation(r: ReservationRecord): number {
  if (!r.reservationDate) return 0;
  const diff = Date.now() - new Date(r.reservationDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
