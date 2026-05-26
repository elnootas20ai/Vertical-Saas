import { v4 as uuidv4 } from 'uuid';
import type { ParkingZone, CreateParkingZoneInput } from './parkingZones';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCouchHeaders() {
  const headers: Record<string, string> = {};
  return headers;
}

const API_BASE = getApiBase();
export const LOCATIONS_DB_NAME = normalizeDbName(
  env.VITE_LOCATIONS_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-locations`,
);

interface ParkingZoneRecord extends ParkingZone {
  _id: string;
  _rev?: string;
  type: 'parking_zone';
  user_id: string;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: { reason?: string; error?: string };
  };
  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        (payload?.details as { reason?: string } | undefined)?.reason ||
        (payload?.details as { error?: string } | undefined)?.error ||
        'Error inesperado en locations API',
    );
  }
  return payload;
}

async function ensureLocationsDatabase() {
  await ensureCouchDb(LOCATIONS_DB_NAME, () => request(`/api/couch/db/${encodeURIComponent(LOCATIONS_DB_NAME)}`, { method: 'PUT' }));
}

export async function listParkingZonesRequest(userId: string): Promise<ParkingZone[]> {
  await ensureLocationsDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(LOCATIONS_DB_NAME)}`,
  );
  const zones = (payload.docs || []).filter((d): d is ParkingZoneRecord => {
    const doc = d as Partial<ParkingZoneRecord>;
    return doc.type === 'parking_zone' && (!userId || doc.user_id === userId);
  });
  if (zones.length === 0) {
    return [];
  }
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    description: z.description,
    color: z.color,
    capacity: z.capacity,
    spots: z.spots || [],
    _id: z._id,
    _rev: z._rev,
  }));
}

export async function saveParkingZoneRequest(
  userId: string,
  zone: ParkingZone,
): Promise<ParkingZone> {
  await ensureLocationsDatabase();
  const now = new Date().toISOString();
  const existing = zone as unknown as Partial<ParkingZoneRecord>;
  const record: ParkingZoneRecord = {
    ...zone,
    _id: existing._id || `parking-zone-${zone.id}`,
    _rev: existing._rev,
    type: 'parking_zone',
    user_id: userId,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(LOCATIONS_DB_NAME)}/${encodeURIComponent(record._id)}`,
    { method: 'PUT', body: JSON.stringify(record) },
  );
  return { ...zone, _id: record._id, _rev: result.rev } as ParkingZone;
}

export async function deleteParkingZoneRequest(zone: ParkingZone): Promise<void> {
  const record = zone as unknown as Partial<ParkingZoneRecord>;
  const docId = record._id || `parking-zone-${zone.id}`;
  if (!record._rev) return;
  const rev = encodeURIComponent(record._rev);
  await request(
    `/api/couch/doc/${encodeURIComponent(LOCATIONS_DB_NAME)}/${encodeURIComponent(docId)}?rev=${rev}`,
    { method: 'DELETE' },
  );
}

export async function createParkingZoneRequest(
  userId: string,
  input: CreateParkingZoneInput,
): Promise<ParkingZone> {
  const id = `zone-${uuidv4()}`;
  const spots = Array.from({ length: input.capacity }, (_, i) => ({
    id: `spot-${id}-${i + 1}`,
    number: String(i + 1).padStart(2, '0'),
  }));
  const zone: ParkingZone = {
    id,
    name: input.name,
    description: input.description || '',
    color: input.color,
    capacity: input.capacity,
    spots,
  };
  return saveParkingZoneRequest(userId, zone);
}
