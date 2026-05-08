import { getApiBase } from './apiBase';

export interface ClientPromotion {
  id: string;
  nombre: string;
  tipo: string;
  descuento: number | null;
  codigo: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  usosRestantes: number | null;
  descripcion: string;
  createdAt: string;
}

function getClientApiHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchClientPromotionsRequest(userId: string, clientId: string): Promise<ClientPromotion[]> {
  try {
    const apiBase = getApiBase();
    const res = await fetch(
      `${apiBase}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/promotions`,
      { headers: getClientApiHeaders() },
    );
    const data = await res.json().catch(() => ({} as any));
    return data?.ok ? (data.promotions || []) : [];
  } catch {
    return [];
  }
}

