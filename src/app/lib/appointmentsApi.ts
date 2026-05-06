import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppointmentType =
  | 'visit' | 'test_drive' | 'paperwork' | 'delivery'
  | 'sale' | 'purchase' | 'call' | 'meeting' | 'reminder'
  | 'consultation' | 'treatment' | 'checkup' | 'followup_appt'
  | 'trial_class' | 'enrollment' | 'personal_session'
  | 'reservation' | 'checkin' | 'tour'
  | 'service' | 'assessment' | 'class_session';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type AppointmentSource = 'internal' | 'booking';

export interface Appointment {
  id: string;
  _id?: string;
  _rev?: string;
  type?: 'appointment';
  user_id?: string;
  appointmentType: AppointmentType;
  date: string;
  time: string;
  location: string;
  notes: string;
  status: AppointmentStatus;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  leadId?: string;
  clientId?: string;
  assignedTo?: string;
  assignedName?: string;
  vehicleId?: string;
  vehicleName?: string;
  vehiclePlate?: string;
  source: AppointmentSource;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkingDay {
  enabled: boolean;
  start: string;
  end: string;
}

export interface BookingConfig {
  id?: string;
  userId?: string;
  enabled: boolean;
  displayName: string;
  slotDuration: number;
  bufferMinutes: number;
  maxDaysAhead: number;
  appointmentTypes: AppointmentType[];
  workingHours: {
    mon: WorkingDay;
    tue: WorkingDay;
    wed: WorkingDay;
    thu: WorkingDay;
    fri: WorkingDay;
    sat: WorkingDay;
    sun: WorkingDay;
  };
}

export interface PublicBookingInfo {
  dealer: {
    userId: string;
    displayName: string;
    companyName: string;
    logo: string | null;
    businessType?: string;
  };
  config: {
    slotDuration: number;
    bufferMinutes: number;
    maxDaysAhead: number;
    appointmentTypes: AppointmentType[];
    workingHours: BookingConfig['workingHours'];
  };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

interface ApiEnvelope {
  error?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? getAuthHeaders() : {}),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope;

  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en appointments');
  }

  return payload;
}

function normalizeAppointment(value: unknown): Appointment | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Record<string, unknown>;
  return {
    id: String(doc.id || doc._id || ''),
    _id: doc._id as string | undefined,
    _rev: doc._rev as string | undefined,
    type: 'appointment',
    user_id: doc.user_id as string | undefined,
    appointmentType: (doc.appointmentType as AppointmentType) || 'visit',
    date: String(doc.date || ''),
    time: String(doc.time || ''),
    location: String(doc.location || ''),
    notes: String(doc.notes || ''),
    status: (doc.status as AppointmentStatus) || 'pending',
    clientName: String(doc.clientName || ''),
    clientPhone: String(doc.clientPhone || ''),
    clientEmail: doc.clientEmail ? String(doc.clientEmail) : undefined,
    leadId: doc.leadId ? String(doc.leadId) : undefined,
    clientId: doc.clientId ? String(doc.clientId) : undefined,
    assignedTo: doc.assignedTo ? String(doc.assignedTo) : undefined,
    assignedName: doc.assignedName ? String(doc.assignedName) : undefined,
    vehicleId: doc.vehicleId ? String(doc.vehicleId) : undefined,
    vehicleName: doc.vehicleName ? String(doc.vehicleName) : undefined,
    vehiclePlate: doc.vehiclePlate ? String(doc.vehiclePlate) : undefined,
    source: (doc.source as AppointmentSource) || 'internal',
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt ? String(doc.updatedAt) : undefined,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listAppointmentsRequest(userId: string): Promise<Appointment[]> {
  const payload = await request<{ ok: boolean; appointments: unknown[] }>(`/api/appointments/${userId}`);
  return (payload.appointments || []).map(normalizeAppointment).filter(Boolean) as Appointment[];
}

export async function createAppointmentRequest(
  userId: string,
  appointment: Omit<Appointment, 'id' | 'createdAt' | 'source'>,
): Promise<Appointment | null> {
  const payload = await request<{ ok: boolean; appointment: unknown }>(`/api/appointments/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ appointment }),
  });
  return normalizeAppointment(payload.appointment);
}

export async function updateAppointmentRequest(
  userId: string,
  appointment: Partial<Appointment> & { id: string },
): Promise<Appointment | null> {
  const payload = await request<{ ok: boolean; appointment: unknown }>(
    `/api/appointments/${userId}/${encodeURIComponent(appointment.id)}`,
    { method: 'PUT', body: JSON.stringify({ appointment }) },
  );
  return normalizeAppointment(payload.appointment);
}

export async function deleteAppointmentRequest(userId: string, appointmentId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/appointments/${userId}/${encodeURIComponent(appointmentId)}`, {
    method: 'DELETE',
  });
}

// ─── Booking config ───────────────────────────────────────────────────────────

export async function getBookingConfigRequest(userId: string): Promise<BookingConfig> {
  const payload = await request<{ ok: boolean; config: BookingConfig }>(
    `/api/appointments/${userId}/booking-config`,
  );
  return payload.config;
}

export async function saveBookingConfigRequest(userId: string, config: Partial<BookingConfig>): Promise<BookingConfig> {
  const payload = await request<{ ok: boolean; config: BookingConfig }>(
    `/api/appointments/${userId}/booking-config`,
    { method: 'PUT', body: JSON.stringify({ config }) },
  );
  return payload.config;
}

// ─── Public booking (no auth) ─────────────────────────────────────────────────

export async function getPublicBookingInfoRequest(userId: string): Promise<PublicBookingInfo> {
  const payload = await request<{ ok: boolean } & PublicBookingInfo>(
    `/api/booking/${userId}/info`,
    undefined,
    false,
  );
  return { dealer: payload.dealer, config: payload.config };
}

export async function getAvailableSlotsRequest(userId: string, date: string): Promise<string[]> {
  const payload = await request<{ ok: boolean; slots: string[] }>(
    `/api/booking/${userId}/slots?date=${encodeURIComponent(date)}`,
    undefined,
    false,
  );
  return payload.slots || [];
}

export async function createPublicBookingRequest(
  userId: string,
  appointment: {
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    date: string;
    time: string;
    appointmentType: AppointmentType;
    notes?: string;
    vehicleId?: string;
    vehicleName?: string;
  },
): Promise<Appointment | null> {
  const payload = await request<{ ok: boolean; appointment: unknown }>(
    `/api/booking/${userId}/book`,
    { method: 'POST', body: JSON.stringify({ appointment }) },
    false,
  );
  return normalizeAppointment(payload.appointment);
}
