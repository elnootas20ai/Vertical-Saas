import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

export interface OrgChartNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    user_id?: string;
    label: string;
    role?: string;
    avatar?: string;
    email?: string;
  };
}

export interface OrgChartEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface OrgChart {
  _id?: string;
  _rev?: string;
  type: string;
  business_id: string;
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
  updatedAt: string;
}

interface OrgChartEnvelope {
  ok: boolean;
  error?: string;
  orgchart?: OrgChart;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<OrgChartEnvelope> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as OrgChartEnvelope;

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en la API de organigrama');
  }

  return payload;
}

export async function getOrgChartRequest(businessId: string) {
  return request(`/api/orgchart/${encodeURIComponent(businessId)}`);
}

export async function saveOrgChartRequest(
  businessId: string,
  nodes: OrgChartNode[],
  edges: OrgChartEdge[],
) {
  return request(`/api/orgchart/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    body: JSON.stringify({ nodes, edges }),
  });
}
