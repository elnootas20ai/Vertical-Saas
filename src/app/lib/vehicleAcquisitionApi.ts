export type AcquisitionType = 'compra_particular' | 'compra_empresa' | 'subasta' | 'retirada' | 'grua_externa';
export type AcquisitionStatus = 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'en_transito' | 'recibida' | 'documentada' | 'cerrada' | 'cancelada';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'aplazado' | 'compensacion' | 'otro';
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado';

export interface StatusHistoryEntry {
  status: string;
  date: string;
  userId: string;
  note: string;
}

export interface RequiredDocCheck {
  docType: string;
  present: boolean;
  documentId: string | null;
}

export interface VehicleAcquisition {
  id: string;
  _rev?: string;
  vehicleId: string;
  registrationPlate: string;
  acquisitionType: AcquisitionType;
  sellerType: string;
  sellerName: string;
  sellerNif: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerAddress: string;
  supplierId: string;
  costCompra: number;
  costTransporte: number;
  costGestoria: number;
  costDocumentacion: number;
  costDescontaminacion: number;
  costOtros: number;
  costOtrosDetalle: string;
  costTotal: number;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentDate: string;
  paymentStatus: PaymentStatus;
  paymentNotes: string;
  status: AcquisitionStatus;
  statusHistory: StatusHistoryEntry[];
  approvedBy: string;
  approvedAt: string;
  linkedDocumentIds: string[];
  linkedInvoiceIds: string[];
  hasRequiredDocs: boolean;
  requiredDocsChecklist: RequiredDocCheck[];
  ocrData: unknown;
  acquisitionDate: string;
  receptionDate: string;
  closedAt: string;
  notes: string;
  internalNotes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcquisitionStats {
  totalMonth: number;
  totalCostMonth: number;
  avgCost: number;
  pendingCount: number;
  byType: Record<string, number>;
}

export interface EconomicHistoryEntry {
  id: string;
  date: string;
  type: string;
  category: string;
  concept: string;
  amount: number;
  balance: number;
  sourceType: string;
  sourceId: string;
}

export interface EconomicHistorySummary {
  totalInvested: number;
  totalRevenue: number;
  balance: number;
  roi: number;
}

const BASE = '/api/vehicle-acquisitions';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Error de red');
  return json as T;
}

export async function listAcquisitionsRequest(userId: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {});
  const qs = params.toString() ? `?${params}` : '';
  return request<{ ok: true; items: VehicleAcquisition[] }>(`${BASE}/${userId}${qs}`);
}

export async function getAcquisitionRequest(userId: string, id: string) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}/${id}`);
}

export async function createAcquisitionRequest(userId: string, data: Partial<VehicleAcquisition>) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAcquisitionRequest(userId: string, id: string, data: Partial<VehicleAcquisition>) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function changeStatusRequest(userId: string, id: string, newStatus: string, note?: string) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ newStatus, note }),
  });
}

export async function approveAcquisitionRequest(userId: string, id: string, note?: string) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function rejectAcquisitionRequest(userId: string, id: string, note: string) {
  return request<{ ok: true; item: VehicleAcquisition }>(`${BASE}/${userId}/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function deleteAcquisitionRequest(userId: string, id: string) {
  return request<{ ok: true }>(`${BASE}/${userId}/${id}`, { method: 'DELETE' });
}

export async function getAcquisitionsByVehicleRequest(userId: string, vehicleId: string) {
  return request<{ ok: true; items: VehicleAcquisition[] }>(`${BASE}/${userId}/vehicle/${vehicleId}`);
}

export async function getAcquisitionStatsRequest(userId: string) {
  return request<{ ok: true; stats: AcquisitionStats }>(`${BASE}/${userId}/stats`);
}

export async function getEconomicHistoryRequest(userId: string, vehicleId: string) {
  return request<{ ok: true; entries: EconomicHistoryEntry[]; summary: EconomicHistorySummary }>(
    `${BASE}/${userId}/vehicle/${vehicleId}/economic-history`,
  );
}

export const ACQUISITION_TYPE_LABELS: Record<AcquisitionType, string> = {
  compra_particular: 'Compra a particular',
  compra_empresa: 'Compra a empresa',
  subasta: 'Subasta',
  retirada: 'Retirada',
  grua_externa: 'Grúa externa',
};

export const ACQUISITION_STATUS_LABELS: Record<AcquisitionStatus, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pend. aprobación',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  en_transito: 'En tránsito',
  recibida: 'Recibida',
  documentada: 'Documentada',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  aplazado: 'Aplazado',
  compensacion: 'Compensación',
  otro: 'Otro',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
};
