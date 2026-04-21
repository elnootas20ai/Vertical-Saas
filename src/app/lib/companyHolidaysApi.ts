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
  if (!res.ok) throw new Error(data?.error || 'Error en festivos');
  return data;
}

async function ensureDb() {
  await req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type HolidayScope = 'all' | 'work_center' | 'department';

export interface CompanyHoliday {
  _id: string;
  _rev?: string;
  type: 'company_holiday';
  business_id: string;
  date: string;
  name: string;
  recurring: boolean;
  scope: HolidayScope;
  scope_value?: string;
  halfDay: boolean;
  halfDayPeriod?: 'morning' | 'afternoon';
  createdAt: string;
  updatedAt: string;
}

// ─── Preset festivos nacionales España ───────────────────────────────────────

export interface HolidayPreset {
  monthDay: string;
  name: string;
}

export const PRESET_HOLIDAYS_ES: HolidayPreset[] = [
  { monthDay: '01-01', name: 'Año Nuevo' },
  { monthDay: '01-06', name: 'Día de Reyes' },
  { monthDay: '05-01', name: 'Día del Trabajo' },
  { monthDay: '08-15', name: 'Asunción de la Virgen' },
  { monthDay: '10-12', name: 'Fiesta Nacional de España' },
  { monthDay: '11-01', name: 'Día de Todos los Santos' },
  { monthDay: '12-06', name: 'Día de la Constitución' },
  { monthDay: '12-08', name: 'Inmaculada Concepción' },
  { monthDay: '12-25', name: 'Navidad' },
];

// ─── Labels ──────────────────────────────────────────────────────────────────

export const SCOPE_LABELS: Record<string, Record<HolidayScope, string>> = {
  es: { all: 'Toda la empresa', work_center: 'Centro de trabajo', department: 'Departamento' },
  en: { all: 'Whole company', work_center: 'Work center', department: 'Department' },
  pt: { all: 'Toda a empresa', work_center: 'Centro de trabalho', department: 'Departamento' },
  fr: { all: 'Toute l\'entreprise', work_center: 'Centre de travail', department: 'Département' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isHoliday(
  date: string,
  holidays: CompanyHoliday[],
  workCenterId?: string,
  department?: string,
): boolean {
  const monthDay = date.slice(5);
  return holidays.some(h => {
    const dateMatch = h.recurring ? h.date.slice(5) === monthDay : h.date === date;
    if (!dateMatch) return false;
    if (h.scope === 'all') return true;
    if (h.scope === 'work_center' && workCenterId) return h.scope_value === workCenterId;
    if (h.scope === 'department' && department) return h.scope_value === department;
    return h.scope === 'all';
  });
}

export function getHolidayForDate(
  date: string,
  holidays: CompanyHoliday[],
  workCenterId?: string,
  department?: string,
): CompanyHoliday | null {
  const monthDay = date.slice(5);
  return holidays.find(h => {
    const dateMatch = h.recurring ? h.date.slice(5) === monthDay : h.date === date;
    if (!dateMatch) return false;
    if (h.scope === 'all') return true;
    if (h.scope === 'work_center' && workCenterId) return h.scope_value === workCenterId;
    if (h.scope === 'department' && department) return h.scope_value === department;
    return h.scope === 'all';
  }) || null;
}

export function getHolidaysInRange(
  start: string,
  end: string,
  holidays: CompanyHoliday[],
  workCenterId?: string,
  department?: string,
): { date: string; holiday: CompanyHoliday }[] {
  const results: { date: string; holiday: CompanyHoliday }[] = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const dateStr = cur.toISOString().slice(0, 10);
    const h = getHolidayForDate(dateStr, holidays, workCenterId, department);
    if (h) results.push({ date: dateStr, holiday: h });
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listCompanyHolidays(
  businessId: string,
  year?: number,
): Promise<CompanyHoliday[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  let records = ((payload.docs || []) as CompanyHoliday[]).filter(
    d => d?.type === 'company_holiday' && d?.business_id === businessId && !((d as any).deletedAt),
  );
  if (year) {
    records = records.filter(h => h.recurring || h.date.startsWith(String(year)));
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveCompanyHoliday(
  businessId: string,
  data: {
    date: string;
    name: string;
    recurring: boolean;
    scope: HolidayScope;
    scope_value?: string;
    halfDay: boolean;
    halfDayPeriod?: 'morning' | 'afternoon';
  },
  existing?: CompanyHoliday | null,
): Promise<CompanyHoliday> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = existing?._id || `company_holiday:${businessId}:${Date.now()}`;
  const doc: CompanyHoliday = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'company_holiday',
    business_id: businessId,
    date: data.date,
    name: data.name.trim(),
    recurring: data.recurring,
    scope: data.scope,
    ...(data.scope !== 'all' && data.scope_value ? { scope_value: data.scope_value } : {}),
    halfDay: data.halfDay,
    ...(data.halfDay && data.halfDayPeriod ? { halfDayPeriod: data.halfDayPeriod } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(doc) },
  );
  return { ...doc, _rev: result.rev };
}

export async function deleteCompanyHoliday(holiday: CompanyHoliday): Promise<void> {
  if (!holiday._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(holiday._id)}?rev=${holiday._rev}`,
    { method: 'DELETE' },
  );
}

export async function importPresetHolidays(
  businessId: string,
  year: number,
  existing: CompanyHoliday[],
): Promise<CompanyHoliday[]> {
  const created: CompanyHoliday[] = [];
  for (const preset of PRESET_HOLIDAYS_ES) {
    const date = `${year}-${preset.monthDay}`;
    const alreadyExists = existing.some(h =>
      (h.recurring && h.date.slice(5) === preset.monthDay) || h.date === date,
    );
    if (alreadyExists) continue;
    const saved = await saveCompanyHoliday(businessId, {
      date,
      name: preset.name,
      recurring: true,
      scope: 'all',
      halfDay: false,
    });
    created.push(saved);
  }
  return created;
}
