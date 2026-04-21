import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

const API_BASE = getApiBase();

export interface ApiToken {
  id: string;
  name: string;
  description: string;
  userId: string;
  permissions: string[];
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  active: boolean;
  token?: string;
}

export interface CreateTokenPayload {
  name: string;
  description?: string;
  userId: string;
  permissions: string[];
  expiresInDays?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error((payload as { error?: string }).error || 'Error inesperado en API de tokens');
  }
  return payload;
}

export async function createApiToken(data: CreateTokenPayload): Promise<{ ok: true; token: ApiToken }> {
  return request('/api/tokens', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listApiTokens(userId: string): Promise<{ ok: true; tokens: ApiToken[] }> {
  return request(`/api/tokens/${encodeURIComponent(userId)}`);
}

export async function revokeApiToken(tokenId: string): Promise<{ ok: true; id: string }> {
  return request(`/api/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
}

export const API_MODULES = [
  {
    id: 'vehicles',
    label: 'Vehículos',
    description: 'Gestión del inventario de vehículos',
    endpoints: [
      { method: 'GET', path: '/api/v1/vehicles', summary: 'Listar todos los vehículos', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/vehicles/:id', summary: 'Obtener un vehículo por ID', pathParams: ['id'] },
      { method: 'POST', path: '/api/v1/vehicles', summary: 'Crear nuevo vehículo', bodyExample: { brand: 'Toyota', model: 'Corolla', year: 2023, status: 'available', purchasePrice: 18000, salePrice: 22000 } },
      { method: 'PUT', path: '/api/v1/vehicles/:id', summary: 'Actualizar un vehículo', pathParams: ['id'], bodyExample: { status: 'sold', salePrice: 21500 } },
    ],
  },
  {
    id: 'sales',
    label: 'Ventas',
    description: 'Registro de ventas y transacciones',
    endpoints: [
      { method: 'GET', path: '/api/v1/sales', summary: 'Listar todas las ventas', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/sales/:id', summary: 'Obtener una venta por ID', pathParams: ['id'] },
      { method: 'POST', path: '/api/v1/sales', summary: 'Registrar nueva venta', bodyExample: { vehicleId: 'abc123', clientId: 'xyz456', totalAmount: 21500, status: 'pending' } },
    ],
  },
  {
    id: 'clients',
    label: 'Clientes',
    description: 'Base de datos de clientes',
    endpoints: [
      { method: 'GET', path: '/api/v1/clients', summary: 'Listar todos los clientes', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/clients/:id', summary: 'Obtener un cliente por ID', pathParams: ['id'] },
      { method: 'POST', path: '/api/v1/clients', summary: 'Crear nuevo cliente', bodyExample: { firstName: 'Juan', lastName: 'García', email: 'juan@ejemplo.com', phone: '600000000' } },
    ],
  },
  {
    id: 'pipeline',
    label: 'Pipeline (CRM)',
    description: 'Oportunidades y leads del CRM',
    endpoints: [
      { method: 'GET', path: '/api/v1/pipeline', summary: 'Listar todos los leads', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/pipeline/:id', summary: 'Obtener un lead por ID', pathParams: ['id'] },
      { method: 'POST', path: '/api/v1/pipeline', summary: 'Crear nuevo lead', bodyExample: { title: 'Interesado en Corolla', status: 'new', contactName: 'María López' } },
      { method: 'PUT', path: '/api/v1/pipeline/:id', summary: 'Actualizar estado de lead', pathParams: ['id'], bodyExample: { status: 'contacted', notes: 'Llamado el lunes' } },
    ],
  },
  {
    id: 'documents',
    label: 'Documentos',
    description: 'Documentos y contratos',
    endpoints: [
      { method: 'GET', path: '/api/v1/documents', summary: 'Listar todos los documentos', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/documents/:id', summary: 'Obtener un documento por ID', pathParams: ['id'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas',
    description: 'Movimientos financieros e ingresos',
    endpoints: [
      { method: 'GET', path: '/api/v1/finance', summary: 'Listar movimientos financieros con resumen', queryParams: ['page', 'limit'] },
    ],
  },
  {
    id: 'team',
    label: 'Equipo',
    description: 'Usuarios y miembros del equipo',
    endpoints: [
      { method: 'GET', path: '/api/v1/team', summary: 'Listar miembros del equipo', queryParams: ['page', 'limit'] },
    ],
  },
  {
    id: 'calls',
    label: 'Llamadas IA',
    description: 'Llamadas grabadas con transcripción IA',
    endpoints: [
      { method: 'GET', path: '/api/v1/calls', summary: 'Listar todas las llamadas', queryParams: ['page', 'limit'] },
      { method: 'GET', path: '/api/v1/calls/:id', summary: 'Obtener una llamada por ID', pathParams: ['id'] },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'KPIs y métricas en tiempo real',
    endpoints: [
      { method: 'GET', path: '/api/v1/dashboard/kpis', summary: 'Obtener KPIs del dashboard' },
    ],
  },
] as const;

export type ApiModuleId = typeof API_MODULES[number]['id'];
