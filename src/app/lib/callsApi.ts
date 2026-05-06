import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

interface CouchEnvelope {
  error?: string;
  details?: { reason?: string; error?: string };
  docs?: unknown[];
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

export type CallDirection = 'incoming' | 'outgoing';
export type CallStatus = 'completed' | 'missed' | 'scheduled';

export interface CallAiVariables {
  intent: string;
  sentiment: string;
  urgency: string;
  appointmentRequested: boolean;
  financingInterest: boolean;
  tradeInInterest: boolean;
  mentionedVehicles: string[];
  language: string;
}

export interface CallAiSummary {
  objective: string;
  summary: string;
  keyPoints: string[];
  nextSteps: string[];
  variables: CallAiVariables;
}

export interface CallAudio {
  attachmentName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface CallRecord {
  _rev?: string;
  type?: 'call';
  user_id?: string;
  id: string;
  clientName: string;
  clientPhone: string;
  direction: CallDirection;
  status: CallStatus;
  duration?: number;
  date: string;
  notes?: string;
  transcriptionText?: string;
  aiSummary?: CallAiSummary;
  aiVariables?: CallAiVariables;
  audio?: CallAudio;
  hasAudio?: boolean;
  hasTranscription?: boolean;
  hasAISummary?: boolean;
  transcriptionProvider?: string;
  summaryProvider?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProcessCallAudioPayload {
  userId: string;
  clientName: string;
  clientPhone: string;
  direction: CallDirection;
  notes?: string;
  provider: 'openai' | 'replicate';
  audioFileName: string;
  audioContentType: string;
  audioBase64: string;
  audioSize: number;
  duration?: number;
  language?: string;
}


function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as T & CouchEnvelope;

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.details?.reason ||
        payload?.details?.error ||
        'Error inesperado gestionando llamadas',
    );
  }

  return payload;
}

export const API_BASE = getApiBase();
export const CALLS_DB_NAME = normalizeDbName(
  env.VITE_CALLS_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-calls`,
);

export async function ensureCallsDatabase() {
  await request(`/api/couch/db/${encodeURIComponent(CALLS_DB_NAME)}`, {
    method: 'PUT',
  });
}

function normalizeCallDirection(value: unknown): CallDirection {
  return value === 'outgoing' ? 'outgoing' : 'incoming';
}

function normalizeCallStatus(value: unknown): CallStatus {
  if (value === 'missed' || value === 'scheduled') {
    return value;
  }
  return 'completed';
}

function normalizeAiVariables(value: unknown): CallAiVariables {
  const raw = value && typeof value === 'object' ? (value as Partial<CallAiVariables>) : {};
  return {
    intent: String(raw.intent || 'general'),
    sentiment: String(raw.sentiment || 'neutral'),
    urgency: String(raw.urgency || 'media'),
    appointmentRequested: Boolean(raw.appointmentRequested),
    financingInterest: Boolean(raw.financingInterest),
    tradeInInterest: Boolean(raw.tradeInInterest),
    mentionedVehicles: Array.isArray(raw.mentionedVehicles)
      ? raw.mentionedVehicles.map((item) => String(item || '')).filter(Boolean)
      : [],
    language: String(raw.language || 'es'),
  };
}

function normalizeAiSummary(value: unknown): CallAiSummary | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Partial<CallAiSummary> & { variables?: unknown };
  return {
    objective: String(raw.objective || ''),
    summary: String(raw.summary || ''),
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.map((item) => String(item || '')).filter(Boolean)
      : [],
    nextSteps: Array.isArray(raw.nextSteps)
      ? raw.nextSteps.map((item) => String(item || '')).filter(Boolean)
      : [],
    variables: normalizeAiVariables(raw.variables),
  };
}

export function normalizeCallRecord(value: unknown): CallRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const doc = value as Partial<CallRecord> & {
    _id?: string;
    type?: string;
    audio?: Partial<CallAudio>;
    aiSummary?: unknown;
    aiVariables?: unknown;
  };

  if (doc.type !== 'call') {
    return null;
  }

  const id = String(doc.id || doc._id || '');
  if (!id) {
    return null;
  }

  const normalizedSummary = normalizeAiSummary(doc.aiSummary);
  const normalizedVariables = normalizeAiVariables(doc.aiVariables || normalizedSummary?.variables);

  return {
    _rev: doc._rev,
    type: 'call',
    user_id: doc.user_id ? String(doc.user_id) : '',
    id,
    clientName: String(doc.clientName || 'Contacto sin identificar'),
    clientPhone: String(doc.clientPhone || ''),
    direction: normalizeCallDirection(doc.direction),
    status: normalizeCallStatus(doc.status),
    duration: typeof doc.duration === 'number' ? doc.duration : Number(doc.duration || 0),
    date: String(doc.date || doc.createdAt || new Date().toISOString()),
    notes: doc.notes ? String(doc.notes) : '',
    transcriptionText: doc.transcriptionText ? String(doc.transcriptionText) : '',
    aiSummary: normalizedSummary,
    aiVariables: normalizedVariables,
    audio:
      doc.audio && typeof doc.audio === 'object'
        ? {
            attachmentName: String(doc.audio.attachmentName || ''),
            contentType: String(doc.audio.contentType || 'audio/webm'),
            size: Number(doc.audio.size || 0),
            uploadedAt: String(doc.audio.uploadedAt || doc.updatedAt || doc.createdAt || new Date().toISOString()),
          }
        : undefined,
    hasAudio: Boolean(doc.hasAudio || doc.audio?.attachmentName),
    hasTranscription: Boolean(doc.hasTranscription || doc.transcriptionText),
    hasAISummary: Boolean(doc.hasAISummary || normalizedSummary?.summary || normalizedSummary?.keyPoints?.length),
    transcriptionProvider: doc.transcriptionProvider ? String(doc.transcriptionProvider) : '',
    summaryProvider: doc.summaryProvider ? String(doc.summaryProvider) : '',
    createdAt: String(doc.createdAt || doc.date || new Date().toISOString()),
    updatedAt: doc.updatedAt ? String(doc.updatedAt) : '',
  };
}

export async function listCallsRequest(userId: string) {
  await ensureCallsDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(CALLS_DB_NAME)}`,
  );

  return (payload.docs || [])
    .map(normalizeCallRecord)
    .filter((call): call is CallRecord => Boolean(call) && call.user_id === userId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getCallRequest(callId: string) {
  await ensureCallsDatabase();
  const payload = await request<unknown>(
    `/api/couch/doc/${encodeURIComponent(CALLS_DB_NAME)}/${encodeURIComponent(callId)}`,
  );
  return normalizeCallRecord(payload);
}

export async function processCallAudioRequest(callId: string, payload: ProcessCallAudioPayload) {
  await ensureCallsDatabase();
  const response = await request<{ call?: unknown }>(
    `/api/calls/process/${encodeURIComponent(callId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  return normalizeCallRecord(response.call);
}

export function getCallAudioUrl(callId: string, attachmentName?: string) {
  if (!attachmentName) {
    return '';
  }

  return `${API_BASE}/api/couch/attachment/${encodeURIComponent(CALLS_DB_NAME)}/${encodeURIComponent(callId)}/${encodeURIComponent(attachmentName)}`;
}
