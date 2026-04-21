import type { Vehicle, Warranty, AssociatedCost, CommercialStatus, PriceChangeReasonCategory } from '../context/AppContext';
import { authFetch, getAuthHeaders } from './authApi';

interface VehiclesEnvelope {
  ok: boolean;
  error?: string;
  vehicle?: Vehicle;
  vehicles?: Vehicle[];
  warranty?: Warranty;
  cost?: AssociatedCost;
  id?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) {
    return env.VITE_API_URL;
  }

  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';

  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');

  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';

  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<VehiclesEnvelope> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as VehiclesEnvelope;

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de vehículos');
  }

  return payload;
}

export async function listVehiclesRequest(userId: string, businessId?: string | null) {
  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
  return request(`/api/vehicles/${encodeURIComponent(userId)}${qs}`);
}

export async function createVehicleRequest(
  userId: string,
  vehicle: Partial<Vehicle>,
  businessId?: string | null,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ vehicle, businessId: businessId || undefined }),
  });
}

export async function bulkCreateVehiclesRequest(
  userId: string,
  vehicles: Partial<Vehicle>[],
  businessId?: string | null,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/bulk`, {
    method: 'POST',
    body: JSON.stringify({ vehicles, businessId: businessId || undefined }),
  });
}

export async function updateVehicleRequest(
  userId: string,
  vehicleId: string,
  vehicle: Partial<Vehicle>,
  priceChangeReason?: string,
  priceChangeReasonCategory?: PriceChangeReasonCategory,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}`, {
    method: 'PUT',
    body: JSON.stringify({ vehicle, priceChangeReason, priceChangeReasonCategory }),
  });
}

export async function updateCommercialStatusRequest(
  userId: string,
  vehicleId: string,
  newStatus: CommercialStatus,
  reason?: string,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/commercial-status`, {
    method: 'PUT',
    body: JSON.stringify({ newStatus, reason }),
  });
}

export async function deleteVehicleRequest(userId: string, vehicleId: string) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}`, {
    method: 'DELETE',
  });
}

// ─── Warranties ───────────────────────────────────────────────────────────────

export async function addWarrantyRequest(userId: string, vehicleId: string, warranty: Partial<Warranty>) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/warranties`, {
    method: 'POST',
    body: JSON.stringify({ warranty }),
  });
}

export async function updateWarrantyRequest(userId: string, vehicleId: string, warrantyId: string, warranty: Partial<Warranty>) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/warranties/${encodeURIComponent(warrantyId)}`, {
    method: 'PUT',
    body: JSON.stringify({ warranty }),
  });
}

export async function deleteWarrantyRequest(userId: string, vehicleId: string, warrantyId: string) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/warranties/${encodeURIComponent(warrantyId)}`, {
    method: 'DELETE',
  });
}

export async function addWarrantyClaimRequest(userId: string, vehicleId: string, warrantyId: string, claim: { date?: string; description: string }) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/warranties/${encodeURIComponent(warrantyId)}/claims`, {
    method: 'POST',
    body: JSON.stringify({ claim }),
  });
}

// ─── Associated Costs ─────────────────────────────────────────────────────────

export async function addAssociatedCostRequest(userId: string, vehicleId: string, cost: Partial<AssociatedCost>) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/costs`, {
    method: 'POST',
    body: JSON.stringify({ cost }),
  });
}

export async function deleteAssociatedCostRequest(userId: string, vehicleId: string, costId: string) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/costs/${encodeURIComponent(costId)}`, {
    method: 'DELETE',
  });
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export interface DuplicateInfo {
  vehicleId: string;
  brand: string;
  model: string;
  status: string;
  registrationPlate?: string;
}

export interface DuplicateCheckResult {
  ok: boolean;
  plate: DuplicateInfo | null;
  vin: DuplicateInfo | null;
}

export async function checkVehicleDuplicatesRequest(
  userId: string,
  data: { registrationPlate?: string; vin?: string },
): Promise<DuplicateCheckResult> {
  const res = await request(`/api/vehicles/${encodeURIComponent(userId)}/check-duplicates`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res as unknown as DuplicateCheckResult;
}

// ─── Vehicle Documents ────────────────────────────────────────────────────────

export type VehicleDocType =
  | 'ficha_tecnica'
  | 'permiso_circulacion'
  | 'itv'
  | 'seguro'
  | 'contrato_compraventa'
  | 'informe_historial'
  | 'factura_compra'
  | 'otro';

export interface VehicleDocument {
  id: string;
  name: string;
  documentType: VehicleDocType;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentName: string;
  notes: string;
  expiresAt: string | null;
  uploadedAt: string;
  uploadedBy: string;
}

export async function addVehicleDocumentRequest(
  userId: string,
  vehicleId: string,
  document: Partial<VehicleDocument>,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/documents`, {
    method: 'POST',
    body: JSON.stringify({ document }),
  });
}

export async function updateVehicleDocumentRequest(
  userId: string,
  vehicleId: string,
  documentId: string,
  document: Partial<VehicleDocument>,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/documents/${encodeURIComponent(documentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ document }),
  });
}

export async function removeVehicleDocumentRequest(
  userId: string,
  vehicleId: string,
  documentId: string,
) {
  return request(`/api/vehicles/${encodeURIComponent(userId)}/${encodeURIComponent(vehicleId)}/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  });
}

// ─── Public vehicle (no auth) ─────────────────────────────────────────────────

export async function getPublicVehicleRequest(vehicleId: string) {
  const response = await fetch(`${API_BASE}/api/public/vehicle/${encodeURIComponent(vehicleId)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Vehículo no disponible');
  }
  return payload;
}
