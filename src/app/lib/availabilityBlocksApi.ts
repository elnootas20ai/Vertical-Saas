import type { Weekday } from './schedulesApi';

const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const host =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
}

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('udar_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

const DB = (env.VITE_COUCHDB_DB || 'udar') + '-schedules';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en bloqueos');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'training'
  | 'medical'
  | 'personal'
  | 'guard'
  | 'project'
  | 'maternity'
  | 'union'
  | 'other';

export interface AvailabilityBlock {
  _id: string;
  _rev?: string;
  type: 'availability_block';
  business_id: string;
  member_id: string;
  member_name: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  reason: BlockReason;
  notes: string;
  recurring: boolean;
  recurringDays?: Weekday[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const BLOCK_REASON_LABELS: Record<string, Record<BlockReason, string>> = {
  es: {
    training: 'Formación',
    medical: 'Médico',
    personal: 'Personal',
    guard: 'Guardia',
    project: 'Proyecto',
    maternity: 'Maternidad/Paternidad',
    union: 'Sindical',
    other: 'Otro',
  },
  en: {
    training: 'Training',
    medical: 'Medical',
    personal: 'Personal',
    guard: 'On-call',
    project: 'Project',
    maternity: 'Maternity/Paternity',
    union: 'Union',
    other: 'Other',
  },
  pt: {
    training: 'Formação',
    medical: 'Médico',
    personal: 'Pessoal',
    guard: 'Guarda',
    project: 'Projeto',
    maternity: 'Maternidade/Paternidade',
    union: 'Sindical',
    other: 'Outro',
  },
  fr: {
    training: 'Formation',
    medical: 'Médical',
    personal: 'Personnel',
    guard: 'Garde',
    project: 'Projet',
    maternity: 'Maternité/Paternité',
    union: 'Syndical',
    other: 'Autre',
  },
};

export const BLOCK_REASON_COLORS: Record<BlockReason, string> = {
  training: '#3b82f6',
  medical: '#ef4444',
  personal: '#8b5cf6',
  guard: '#f59e0b',
  project: '#06b6d4',
  maternity: '#ec4899',
  union: '#84cc16',
  other: '#6b7280',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

function dateToWeekday(date: string): Weekday {
  const d = new Date(date + 'T00:00:00');
  const idx = (d.getDay() + 6) % 7;
  const days: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days[idx];
}

export function isMemberBlocked(
  blocks: AvailabilityBlock[],
  memberId: string,
  date: string,
  time?: string,
): boolean {
  return blocks.some(b => {
    if (b.member_id !== memberId) return false;
    return isBlockActiveOnDate(b, date, time);
  });
}

export function isBlockActiveOnDate(
  block: AvailabilityBlock,
  date: string,
  time?: string,
): boolean {
  if (block.recurring && block.recurringDays?.length) {
    const weekday = dateToWeekday(date);
    if (!block.recurringDays.includes(weekday)) return false;
    if (date < block.startDate) return false;
    if (block.endDate && date > block.endDate) return false;
  } else {
    if (date < block.startDate || date > block.endDate) return false;
  }

  if (!block.allDay && time && block.startTime && block.endTime) {
    return time >= block.startTime && time <= block.endTime;
  }
  return true;
}

export function getMemberBlocksForDate(
  blocks: AvailabilityBlock[],
  memberId: string,
  date: string,
): AvailabilityBlock[] {
  return blocks.filter(b => b.member_id === memberId && isBlockActiveOnDate(b, date));
}

export function getBlocksInRange(
  blocks: AvailabilityBlock[],
  memberId: string,
  start: string,
  end: string,
): { date: string; block: AvailabilityBlock }[] {
  const results: { date: string; block: AvailabilityBlock }[] = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const dateStr = cur.toISOString().slice(0, 10);
    const active = getMemberBlocksForDate(blocks, memberId, dateStr);
    for (const block of active) {
      results.push({ date: dateStr, block });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listBlocks(
  businessId: string,
  filters?: { memberId?: string; reason?: BlockReason; from?: string; to?: string },
): Promise<AvailabilityBlock[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  let records = ((payload.docs || []) as AvailabilityBlock[]).filter(
    d => d?.type === 'availability_block' && d?.business_id === businessId && !((d as any).deletedAt),
  );
  if (filters?.memberId) records = records.filter(r => r.member_id === filters.memberId);
  if (filters?.reason) records = records.filter(r => r.reason === filters.reason);
  if (filters?.from) records = records.filter(r => r.endDate >= filters.from! || r.recurring);
  if (filters?.to) records = records.filter(r => r.startDate <= filters.to! || r.recurring);
  return records.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function saveBlock(
  businessId: string,
  data: {
    member_id: string;
    member_name: string;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
    allDay: boolean;
    reason: BlockReason;
    notes: string;
    recurring: boolean;
    recurringDays?: Weekday[];
    createdBy: string;
  },
  existing?: AvailabilityBlock | null,
): Promise<AvailabilityBlock> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = existing?._id || `block:${businessId}:${data.member_id}:${Date.now()}`;
  const doc: AvailabilityBlock = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'availability_block',
    business_id: businessId,
    member_id: data.member_id,
    member_name: data.member_name,
    startDate: data.startDate,
    endDate: data.endDate,
    allDay: data.allDay,
    ...(!data.allDay && data.startTime ? { startTime: data.startTime } : {}),
    ...(!data.allDay && data.endTime ? { endTime: data.endTime } : {}),
    reason: data.reason,
    notes: data.notes,
    recurring: data.recurring,
    ...(data.recurring && data.recurringDays?.length ? { recurringDays: data.recurringDays } : {}),
    createdBy: data.createdBy,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function deleteBlock(block: AvailabilityBlock): Promise<void> {
  if (!block._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(block._id)}?rev=${block._rev}`,
    { method: 'DELETE' },
  );
}
