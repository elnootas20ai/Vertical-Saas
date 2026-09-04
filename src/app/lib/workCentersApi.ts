import { v4 as uuidv4 } from 'uuid';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
import type { BusinessHoursConfig } from './settingsApi';
import type { EventsPdvLoadLine } from './eventsPdvLoad';
import { normalizeEventsPdvLoad } from './eventsPdvLoad';
import type { EventsFixedDayPlan, EventsFixedOpsDraft } from './eventsFixedDayPlan';
import { normalizeEventsFixedDayPlans, normalizeEventsFixedOpsDraft } from './eventsFixedDayPlan';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkCenterType = 'oficina' | 'punto_de_venta' | 'almacen' | 'custom';
export type OwnershipType = 'propiedad' | 'alquiler';
/** Eventos: PDV portátil fijo (kit permanente) o temporal (un evento / campaña). */
export type EventsPdvKind = 'fixed' | 'temporary';

/** PDV temporal de un evento: no debe listarse en tiendas/sidebar general. */
export function isTemporaryEventWorkCenter(wc: Pick<WorkCenter, 'eventsPdvKind' | 'name'> | null | undefined): boolean {
  if (!wc) return false;
  if (wc.eventsPdvKind === 'temporary') return true;
  // Fallback datos antiguos / producción sin eventsPdvKind persistido.
  return /^evento\s*·/i.test(String(wc.name || '').trim());
}

export const WORK_CENTER_TYPE_LABELS: Record<WorkCenterType, string> = {
  oficina: 'Centro de trabajo (Oficinas)',
  punto_de_venta: 'Punto de venta (Establecimientos)',
  almacen: 'Almacén',
  custom: 'Personalizado',
};

export const WORK_CENTER_TYPE_SHORT: Record<WorkCenterType, string> = {
  oficina: 'Oficinas',
  punto_de_venta: 'Establecimientos',
  almacen: 'Almacén',
  custom: 'Personalizado',
};

export const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  propiedad: 'Propiedad',
  alquiler: 'Alquiler',
};

export interface ContractInfo {
  startDate?: string;
  endDate?: string;
  monthlyPrice?: number;
  deposit?: number;
  landlord?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  contractNotes?: string;
}

export interface WorkCenter {
  _id: string;
  _rev?: string;
  type: 'sales_point';
  id: string;
  user_id: string;
  businessId?: string;
  name: string;
  centerType: WorkCenterType;
  customTypeName?: string;
  ownership: OwnershipType;
  contract?: ContractInfo;
  purchasePrice?: number;
  purchaseDate?: string;
  cadastralReference?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  phone?: string;
  email?: string;
  expectedStaffCount?: number;
  squareMeters?: number;
  notes?: string;
  /** Horario de apertura del local (delivery / PDV). */
  openingHours?: BusinessHoursConfig;
  /** Solo vertical eventos: fijo arriba / temporal abajo en TPV evento. */
  eventsPdvKind?: EventsPdvKind;
  /** Evento dueño del PDV temporal (carga TPV = productos de ese evento). */
  linkedEventId?: string;
  /**
   * Carga del PDV (fijo o temporal): qué se vende en tablet (producto, cantidad, precio).
   * Si hay `linkedEventId`, la carga del evento manda; si no, esta.
   */
  eventsTpvLoad?: EventsPdvLoadLine[];
  /**
   * Planes por día del evento fijo: productos a llevar (qty) + quién trabaja ese día.
   */
  eventsFixedDayPlans?: EventsFixedDayPlan[];
  /**
   * Secuencia ops a medias (día→horario→productos→ruta→equipo).
   * Si existe, ese evento bloquea abrir otro fijo hasta completar o seguir ese borrador.
   */
  eventsFixedOpsDraft?: EventsFixedOpsDraft | null;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateWorkCenterPayload = Omit<WorkCenter, '_id' | '_rev' | 'id' | 'type' | 'createdAt' | 'updatedAt'>;

// ── Helpers ───────────────────────────────────────────────────────────────────


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function couchDbPrefix(): string {
  return String(env.VITE_COUCHDB_DB || 'vertial').trim().toLowerCase();
}

export const WORK_CENTERS_DB = `${couchDbPrefix()}-sales-points`;

const LEGACY_WORK_CENTER_DB_PREFIXES = ['vertial', 'uriellsaas', 'bbddsaas', 'urielsaas'];

function legacyWorkCenterDbNames(): string[] {
  const primary = String(env.VITE_COUCHDB_DB || 'vertial').trim().toLowerCase();
  const names: string[] = [];
  for (const prefix of LEGACY_WORK_CENTER_DB_PREFIXES) {
    if (prefix.toLowerCase() === primary) continue;
    names.push(`${prefix}-sales-points`);
  }
  return names;
}

async function fetchWorkCenterDocs(dbName: string): Promise<unknown[]> {
  try {
    const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(dbName)}`);
    return payload.docs || [];
  } catch {
    return [];
  }
}

/**
 * Micro-caché de la lista completa de centros: al entrar al SaaS varios
 * consumidores (sidebar, checklist, página activa) piden lo mismo a la vez.
 * Se comparte la petición en vuelo y el resultado durante un TTL corto;
 * cualquier escritura de centros invalida la caché al momento.
 */
const WORK_CENTER_DOCS_TTL_MS = 15_000;
let workCenterDocsCache: { docs: unknown[]; savedAt: number } | null = null;
let workCenterDocsInflight: Promise<unknown[]> | null = null;

export function invalidateWorkCenterDocsCache(): void {
  workCenterDocsCache = null;
  workCenterDocsInflight = null;
}

async function fetchAllWorkCenterDocsUncached(): Promise<unknown[]> {
  await ensureDb();
  const merged = new Map<string, unknown>();
  const [primaryDocs, ...legacyResults] = await Promise.all([
    fetchWorkCenterDocs(WORK_CENTERS_DB),
    ...legacyWorkCenterDbNames().map((db) => fetchWorkCenterDocs(db)),
  ]);
  for (const doc of primaryDocs) {
    const id = String((doc as { _id?: string })._id || '').trim();
    if (id) merged.set(id, doc);
  }
  for (const legacyDocs of legacyResults) {
    for (const doc of legacyDocs) {
      const id = String((doc as { _id?: string })._id || '').trim();
      if (id && !merged.has(id)) merged.set(id, doc);
    }
  }
  return [...merged.values()];
}

async function listAllWorkCenterDocs(): Promise<unknown[]> {
  if (workCenterDocsCache && Date.now() - workCenterDocsCache.savedAt < WORK_CENTER_DOCS_TTL_MS) {
    return workCenterDocsCache.docs;
  }
  if (workCenterDocsInflight) return workCenterDocsInflight;

  const promise = (async () => {
    try {
      const docs = await fetchAllWorkCenterDocsUncached();
      workCenterDocsCache = { docs, savedAt: Date.now() };
      return docs;
    } finally {
      workCenterDocsInflight = null;
    }
  })();
  workCenterDocsInflight = promise;
  return promise;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutSignal =
    !init?.signal &&
    typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(15_000)
      : undefined;
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
    signal: init?.signal || timeoutSignal,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en centros de trabajo');
  return data;
}

async function ensureDb() {
  await ensureCouchDb(WORK_CENTERS_DB, () => req(`/api/couch/db/${encodeURIComponent(WORK_CENTERS_DB)}`, { method: 'PUT' }));
}

/** CouchDB legacy: algunos centros usan `account:{userId}` en lugar del UUID directo. */
function normalizeAccountUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function addAllowedUserId(allowed: Set<string>, userId: string): void {
  const id = String(userId || '').trim();
  if (!id) return;
  allowed.add(id);
  allowed.add(normalizeAccountUserId(id));
  if (!id.startsWith('account:')) allowed.add(`account:${id}`);
}

function isAllowedUserId(allowed: Set<string>, userId: string): boolean {
  const raw = String(userId || '').trim();
  if (!raw) return false;
  return allowed.has(raw) || allowed.has(normalizeAccountUserId(raw));
}

function normalizeWorkCenter(value: unknown): WorkCenter | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<WorkCenter> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'sales_point') return null;
  if ((doc as { deletedAt?: string | null }).deletedAt) return null;
  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  const contract = doc.contract && typeof doc.contract === 'object' ? {
    startDate: doc.contract.startDate || undefined,
    endDate: doc.contract.endDate || undefined,
    monthlyPrice: doc.contract.monthlyPrice != null ? Number(doc.contract.monthlyPrice) : undefined,
    deposit: doc.contract.deposit != null ? Number(doc.contract.deposit) : undefined,
    landlord: doc.contract.landlord || undefined,
    landlordPhone: doc.contract.landlordPhone || undefined,
    landlordEmail: doc.contract.landlordEmail || undefined,
    contractNotes: doc.contract.contractNotes || undefined,
  } : undefined;

  return {
    _id: String(doc._id || id),
    _rev: doc._rev,
    id,
    type: 'sales_point',
    user_id: String(doc.user_id || ''),
    businessId: (() => {
      const raw = doc as Record<string, unknown>;
      const bid = String(raw.businessId || raw.business_id || '').trim();
      return bid || undefined;
    })(),
    name: String(doc.name || ''),
    centerType: (['oficina', 'punto_de_venta', 'almacen', 'custom'].includes(doc.centerType as string)
      ? doc.centerType!
      : 'punto_de_venta'),
    customTypeName: doc.customTypeName ? String(doc.customTypeName) : undefined,
    ownership: doc.ownership === 'propiedad' ? 'propiedad' : doc.ownership === 'alquiler' ? 'alquiler' : 'propiedad',
    contract,
    purchasePrice: doc.purchasePrice != null ? Number(doc.purchasePrice) : undefined,
    purchaseDate: doc.purchaseDate ? String(doc.purchaseDate) : undefined,
    cadastralReference: doc.cadastralReference ? String(doc.cadastralReference) : undefined,
    address: doc.address ? String(doc.address) : undefined,
    city: doc.city ? String(doc.city) : undefined,
    postalCode: doc.postalCode ? String(doc.postalCode) : undefined,
    province: doc.province ? String(doc.province) : undefined,
    phone: doc.phone ? String(doc.phone) : undefined,
    email: doc.email ? String(doc.email) : undefined,
    expectedStaffCount: doc.expectedStaffCount != null ? Math.max(0, Math.floor(Number(doc.expectedStaffCount))) : 0,
    squareMeters: doc.squareMeters != null ? Number(doc.squareMeters) : undefined,
    notes: doc.notes ? String(doc.notes) : undefined,
    openingHours:
      doc.openingHours && typeof doc.openingHours === 'object'
        ? (doc.openingHours as BusinessHoursConfig)
        : undefined,
    eventsPdvKind: doc.eventsPdvKind === 'temporary' ? 'temporary' : doc.eventsPdvKind === 'fixed' ? 'fixed' : undefined,
    linkedEventId: (() => {
      const id = String((doc as { linkedEventId?: string }).linkedEventId || '').trim();
      return id || undefined;
    })(),
    eventsTpvLoad: (() => {
      if (!Object.prototype.hasOwnProperty.call(doc, 'eventsTpvLoad')) return undefined;
      if ((doc as { eventsTpvLoad?: unknown }).eventsTpvLoad == null) return undefined;
      return normalizeEventsPdvLoad((doc as { eventsTpvLoad?: unknown }).eventsTpvLoad);
    })(),
    eventsFixedDayPlans: (() => {
      if (!Object.prototype.hasOwnProperty.call(doc, 'eventsFixedDayPlans')) return undefined;
      if ((doc as { eventsFixedDayPlans?: unknown }).eventsFixedDayPlans == null) return undefined;
      return normalizeEventsFixedDayPlans((doc as { eventsFixedDayPlans?: unknown }).eventsFixedDayPlans);
    })(),
    eventsFixedOpsDraft: (() => {
      if (!Object.prototype.hasOwnProperty.call(doc, 'eventsFixedOpsDraft')) return undefined;
      const raw = (doc as { eventsFixedOpsDraft?: unknown }).eventsFixedOpsDraft;
      if (raw == null) return null;
      return normalizeEventsFixedOpsDraft(raw);
    })(),
    active: doc.active !== false,
    deletedAt: (doc as { deletedAt?: string | null }).deletedAt || null,
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || doc.createdAt || new Date().toISOString()),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listWorkCenters(userId: string): Promise<WorkCenter[]> {
  const docs = await listAllWorkCenterDocs();
  return docs
    .map(normalizeWorkCenter)
    .filter((wc): wc is WorkCenter => wc !== null && wc.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Misma DB que `listWorkCenters`, pero incluye documentos guardados bajo el `user_id` de
 * cualquier miembro del negocio. Así el TPV/delivery (datos bajo el titular) ve también
 * centros creados desde la cuenta de un encargado u otro miembro.
 */
export async function listWorkCentersForDelivery(
  dataUserId: string,
  business?: { owner_user_id?: string; members?: { user_id?: string }[] } | null,
): Promise<WorkCenter[]> {
  const id = String(dataUserId || '').trim();
  if (!id) return [];
  const allowed = new Set<string>();
  addAllowedUserId(allowed, id);
  addAllowedUserId(allowed, String(business?.owner_user_id || '').trim());
  for (const m of business?.members || []) {
    addAllowedUserId(allowed, String(m.user_id || '').trim());
  }
  return (await listAllWorkCenterDocs())
    .map(normalizeWorkCenter)
    .filter((wc): wc is WorkCenter => wc !== null && isAllowedUserId(allowed, wc.user_id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Lectura directa por id (útil si el listado filtrado no incluye la tienda asignada al trabajador). */
export async function getWorkCenterById(workCenterId: string): Promise<WorkCenter | null> {
  const raw = String(workCenterId || '').trim();
  if (!raw) return null;
  const id = raw.startsWith('wc:') ? raw.slice(3) : raw;
  try {
    const doc = await req<unknown>(
      `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(id)}`,
    );
    return normalizeWorkCenter(doc);
  } catch {
    // Fallback: buscar en el listado cacheado (legacy / otra DB).
    const docs = await listAllWorkCenterDocs();
    for (const d of docs) {
      const wc = normalizeWorkCenter(d);
      if (wc && (wc._id === id || wc.id === id || wc._id === raw || wc.id === raw)) {
        return wc;
      }
    }
    return null;
  }
}

export async function createWorkCenter(
  userId: string,
  payload: Omit<CreateWorkCenterPayload, 'user_id'>,
): Promise<WorkCenter> {
  await ensureDb();
  const now = new Date().toISOString();
  const id = `wc-${uuidv4()}`;
  const businessId = payload.businessId ? String(payload.businessId).trim() : '';
  const wc: WorkCenter & { business_id?: string } = {
    ...payload,
    _id: id,
    id,
    type: 'sales_point',
    user_id: userId,
    businessId: businessId || undefined,
    ...(businessId ? { business_id: businessId } : {}),
    active: payload.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(wc) },
  );
  invalidateWorkCenterDocsCache();
  return { ...wc, _rev: result.rev };
}

export async function updateWorkCenter(wc: WorkCenter): Promise<WorkCenter> {
  await ensureDb();
  const businessId = wc.businessId ? String(wc.businessId).trim() : '';
  const updated = {
    ...wc,
    updatedAt: new Date().toISOString(),
    ...(businessId ? { business_id: businessId } : {}),
  } as WorkCenter & { business_id?: string };
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wc._id)}`,
    { method: 'PUT', body: JSON.stringify(updated) },
  );
  invalidateWorkCenterDocsCache();
  return { ...updated, _rev: result.rev };
}

export async function deleteWorkCenter(wcId: string): Promise<void> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(WORK_CENTERS_DB)}`);
  const doc = (payload.docs as Array<WorkCenter & { _id?: string; _rev?: string; deletedAt?: string | null }>).find((d) => d._id === wcId);
  if (!doc) return;
  if (doc._rev) {
    try {
      await req(
        `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wcId)}?rev=${doc._rev}`,
        { method: 'DELETE' },
      );
      invalidateWorkCenterDocsCache();
      return;
    } catch {
      // fallback to soft-delete when rev mismatches
    }
  }
  await req(
    `/api/couch/doc/${encodeURIComponent(WORK_CENTERS_DB)}/${encodeURIComponent(wcId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...doc,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: false,
      }),
    },
  );
  invalidateWorkCenterDocsCache();
}

// ── Re-exports for backward compatibility ─────────────────────────────────────

export type SalesPoint = WorkCenter;
export const listSalesPoints = listWorkCenters;
export const createSalesPoint = createWorkCenter;
export const updateSalesPoint = updateWorkCenter;
export const deleteSalesPoint = deleteWorkCenter;
export const SALES_POINTS_DB = WORK_CENTERS_DB;
