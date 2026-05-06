import { authFetch } from './authApi';
import type { ScrapyardVehicle } from './scrapyardTypes';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en scrapyard API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartCategory =
  | 'motor' | 'caja_cambios' | 'puertas' | 'faros'
  | 'paragolpes' | 'llantas' | 'interior' | 'centralitas'
  | 'retrovisores' | 'radiadores' | 'transmision' | 'frenos'
  | 'suspension' | 'electricidad' | 'carroceria' | 'escape'
  | 'direccion' | 'climatizacion' | 'otra';

export type PartStatus = 'disponible' | 'reservada' | 'vendida' | 'defectuosa' | 'en_revision' | 'desmontando';

export interface PartCompatibility {
  marca: string;
  modelo: string;
  anioDesde: number | null;
  anioHasta: number | null;
  referenciasOEM: string[];
}

export interface ScrapyardPart {
  _id: string;
  _rev?: string;
  type: 'scrapyard_part';
  user_id: string;
  referencia: string;
  codigoInterno: string;
  nombre: string;
  categoria: PartCategory;
  subcategoria: string;
  vehiculoOrigenId: string;
  vehiculoOrigenLabel: string;
  vehiculoOrigenMatricula: string;
  estado: PartStatus;
  precioVenta: number;
  precioMinimo: number;
  ubicacion: string;
  zona: string;
  estanteria: string;
  compatibilidades: PartCompatibility[];
  fotos: string[];
  observaciones: string;
  peso: number | null;
  garantiaMeses: number;
  despieceId: string;
  desmontadoPor: string;
  fechaDesmontaje: string | null;
  ordenDesmontaje: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface DismantlingChecklistItem {
  categoria: PartCategory;
  nombre: string;
  extraida: boolean;
  partId: string;
  noAplica: boolean;
  motivoNoAplica: string;
}

export interface DismantlingHistoryEntry {
  action: 'start' | 'extract' | 'not_applicable' | 'add_custom' | 'pause' | 'resume' | 'complete';
  detail: string;
  partId?: string;
  timestamp: string;
  userId: string;
  userName: string;
}

export interface DismantlingSession {
  _id: string;
  _rev?: string;
  type: 'dismantling_session';
  user_id: string;
  vehicleId: string;
  vehicleLabel: string;
  vehicleMatricula: string;
  status: 'in_progress' | 'paused' | 'completed';
  piezasPrevistas: DismantlingChecklistItem[];
  historial: DismantlingHistoryEntry[];
  trabajadores: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  observaciones: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PART_CATEGORIES: { value: PartCategory; label: string; prefix: string }[] = [
  { value: 'motor', label: 'Motor', prefix: 'MOT' },
  { value: 'caja_cambios', label: 'Caja de cambios', prefix: 'CCM' },
  { value: 'puertas', label: 'Puertas', prefix: 'PTA' },
  { value: 'faros', label: 'Faros', prefix: 'FAR' },
  { value: 'paragolpes', label: 'Paragolpes', prefix: 'PAR' },
  { value: 'llantas', label: 'Llantas', prefix: 'LLA' },
  { value: 'interior', label: 'Interior', prefix: 'INT' },
  { value: 'centralitas', label: 'Centralitas', prefix: 'CEN' },
  { value: 'retrovisores', label: 'Retrovisores', prefix: 'RET' },
  { value: 'radiadores', label: 'Radiadores', prefix: 'RAD' },
  { value: 'transmision', label: 'Transmisión', prefix: 'TRN' },
  { value: 'frenos', label: 'Frenos', prefix: 'FRE' },
  { value: 'suspension', label: 'Suspensión', prefix: 'SUS' },
  { value: 'electricidad', label: 'Electricidad', prefix: 'ELE' },
  { value: 'carroceria', label: 'Carrocería', prefix: 'CAR' },
  { value: 'escape', label: 'Escape', prefix: 'ESC' },
  { value: 'direccion', label: 'Dirección', prefix: 'DIR' },
  { value: 'climatizacion', label: 'Climatización', prefix: 'CLI' },
  { value: 'otra', label: 'Otra', prefix: 'OTR' },
];

export const CATEGORY_GROUPS = [
  { label: 'Mecánica', categories: ['motor', 'caja_cambios', 'transmision', 'escape', 'direccion', 'suspension', 'frenos'] as PartCategory[] },
  { label: 'Carrocería', categories: ['puertas', 'paragolpes', 'retrovisores', 'carroceria', 'llantas'] as PartCategory[] },
  { label: 'Iluminación', categories: ['faros'] as PartCategory[] },
  { label: 'Interior', categories: ['interior'] as PartCategory[] },
  { label: 'Electrónica', categories: ['electricidad', 'centralitas'] as PartCategory[] },
  { label: 'Refrigeración', categories: ['radiadores', 'climatizacion'] as PartCategory[] },
  { label: 'Otras', categories: ['otra'] as PartCategory[] },
];

export const PART_STATUS_MAP: Record<PartStatus, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  reservada: { label: 'Reservada', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  vendida: { label: 'Vendida', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  defectuosa: { label: 'Defectuosa', color: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  en_revision: { label: 'En revisión', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
  desmontando: { label: 'Desmontando', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
};

export const SCRAPYARD_VEHICLE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  received: { label: 'Recibido', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  dismantling: { label: 'En despiece', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  partially_dismantled: { label: 'Despiece parcial', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  fully_dismantled: { label: 'Despiezado', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  compacted: { label: 'Compactado', color: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400' },
};

// ─── Parts API ────────────────────────────────────────────────────────────────

export async function listScrapyardParts(
  userId: string,
  filters?: { categoria?: string; estado?: string; vehiculoId?: string; search?: string },
): Promise<ScrapyardPart[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.categoria) params.set('categoria', filters.categoria);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.vehiculoId) params.set('vehiculoId', filters.vehiculoId);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; parts: ScrapyardPart[] }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}${qs}`,
  );
  return payload.parts || [];
}

export async function getScrapyardPart(userId: string, partId: string): Promise<ScrapyardPart> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; part: ScrapyardPart }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}/${encodeURIComponent(partId)}`,
  );
  if (!result.part) throw new Error('Respuesta inválida del servidor');
  return result.part;
}

export async function createScrapyardPart(userId: string, data: Partial<ScrapyardPart>): Promise<ScrapyardPart> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; part: ScrapyardPart }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ part: data }) },
  );
  if (!result.part) throw new Error('Respuesta inválida del servidor');
  return result.part;
}

export async function updateScrapyardPart(userId: string, partId: string, data: Partial<ScrapyardPart>): Promise<ScrapyardPart> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; part: ScrapyardPart }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}/${encodeURIComponent(partId)}`,
    { method: 'PUT', body: JSON.stringify({ part: data }) },
  );
  if (!result.part) throw new Error('Respuesta inválida del servidor');
  return result.part;
}

export async function deleteScrapyardPart(userId: string, partId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/scrapyard/parts/${encodeURIComponent(id)}/${encodeURIComponent(partId)}`,
    { method: 'DELETE' },
  );
}

export async function bulkCreateScrapyardParts(userId: string, parts: Partial<ScrapyardPart>[]): Promise<ScrapyardPart[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; parts: ScrapyardPart[] }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}/bulk`,
    { method: 'POST', body: JSON.stringify({ parts }) },
  );
  return payload.parts || [];
}

export async function searchCompatibleParts(
  userId: string,
  filters: { marca: string; modelo: string; anio?: number; categoria?: PartCategory },
): Promise<ScrapyardPart[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  params.set('marca', filters.marca);
  params.set('modelo', filters.modelo);
  if (filters.anio != null) params.set('anio', String(filters.anio));
  if (filters.categoria) params.set('categoria', filters.categoria);
  const payload = await request<{ ok: boolean; parts: ScrapyardPart[] }>(
    `/api/scrapyard/parts/${encodeURIComponent(id)}/compatible?${params.toString()}`,
  );
  return payload.parts || [];
}

// ─── Worker Types ────────────────────────────────────────────────────────────

export type WorkerShift = 'manana' | 'tarde' | 'completa' | 'rotativo';
export type WorkerContractType = 'full_time' | 'part_time' | 'temporary' | 'freelance';
export type WorkerStatus = 'active' | 'inactive' | 'vacation' | 'sick_leave';
export type WorkerDocStatus = 'valid' | 'pending' | 'expired';

export interface ScrapyardWorkerDoc {
  type: string;
  status: WorkerDocStatus;
  expiresAt?: string;
  fileUrl?: string;
  notes?: string;
}

export interface ScrapyardWorker {
  _id: string;
  _rev?: string;
  id: string;
  type: 'scrapyard_worker';
  user_id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  address: string;
  teamMemberId: string;
  role: string;
  zone: string;
  specializations: string[];
  documents: ScrapyardWorkerDoc[];
  contractType: WorkerContractType;
  hourlyCost: number;
  weeklyHours: number;
  startDate: string;
  endDate: string | null;
  shift: WorkerShift;
  schedule: string;
  scheduleDetails: Record<string, { start: string; end: string }> | null;
  permissions: string[];
  status: WorkerStatus;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Task Types ──────────────────────────────────────────────────────────────

export type ScrapyardTaskType = 'recepcion' | 'desmontaje' | 'catalogacion' | 'almacen' | 'venta' | 'expedicion';
export type ScrapyardTaskStatus = 'pending' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export type ScrapyardTaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskTimeEntry {
  action: 'start' | 'pause' | 'resume' | 'complete';
  timestamp: string;
  notes: string;
}

export interface TaskResult {
  partsExtracted?: number;
  partsCataloged?: number;
  partsStored?: number;
  saleAmount?: number;
  itemsShipped?: number;
  notes?: string;
}

export interface ScrapyardTask {
  _id: string;
  _rev?: string;
  id: string;
  type: 'scrapyard_task';
  user_id: string;
  taskType: ScrapyardTaskType;
  assignedWorkerId: string;
  assignedWorkerName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  partIds: string[];
  saleId: string;
  orderId: string;
  title: string;
  description: string;
  priority: ScrapyardTaskPriority;
  zone: string;
  status: ScrapyardTaskStatus;
  scheduledDate: string;
  scheduledStartTime: string;
  estimatedMinutes: number;
  timeEntries: TaskTimeEntry[];
  totalMinutes: number;
  result: TaskResult | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerProductivityReport {
  workerId: string;
  workerName: string;
  role: string;
  zone: string;
  hoursWorked: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksInProgress: number;
  partsExtracted: number;
  partsCataloged: number;
  totalPieces: number;
  salesAmount: number;
  productivityPerHour: number;
  laborCost: number;
}

// ─── Workers API ─────────────────────────────────────────────────────────────

export async function listScrapyardWorkers(
  userId: string,
  filters?: { status?: string; zone?: string; shift?: string; search?: string },
): Promise<ScrapyardWorker[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.zone) params.set('zone', filters.zone);
  if (filters?.shift) params.set('shift', filters.shift);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; workers: ScrapyardWorker[] }>(
    `/api/scrapyard/workers/${encodeURIComponent(id)}${qs}`,
  );
  return payload.workers || [];
}

export async function getScrapyardWorker(userId: string, workerId: string): Promise<ScrapyardWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: ScrapyardWorker }>(
    `/api/scrapyard/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`,
  );
  if (!result.worker) throw new Error('Respuesta inválida del servidor');
  return result.worker;
}

export async function createScrapyardWorker(userId: string, data: Partial<ScrapyardWorker>): Promise<ScrapyardWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: ScrapyardWorker }>(
    `/api/scrapyard/workers/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ worker: data }) },
  );
  if (!result.worker) throw new Error('Respuesta inválida del servidor');
  return result.worker;
}

export async function updateScrapyardWorker(userId: string, workerId: string, data: Partial<ScrapyardWorker>): Promise<ScrapyardWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: ScrapyardWorker }>(
    `/api/scrapyard/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`,
    { method: 'PUT', body: JSON.stringify({ worker: data }) },
  );
  if (!result.worker) throw new Error('Respuesta inválida del servidor');
  return result.worker;
}

export async function deleteScrapyardWorker(userId: string, workerId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/scrapyard/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`,
    { method: 'DELETE' },
  );
}

// ─── Tasks API ───────────────────────────────────────────────────────────────

export async function listScrapyardTasks(
  userId: string,
  filters?: { taskType?: string; status?: string; assignedWorkerId?: string; scheduledDate?: string },
): Promise<ScrapyardTask[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.taskType) params.set('taskType', filters.taskType);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.assignedWorkerId) params.set('assignedWorkerId', filters.assignedWorkerId);
  if (filters?.scheduledDate) params.set('scheduledDate', filters.scheduledDate);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; tasks: ScrapyardTask[] }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}${qs}`,
  );
  return payload.tasks || [];
}

export async function getScrapyardTask(userId: string, taskId: string): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}`,
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function createScrapyardTask(userId: string, data: Partial<ScrapyardTask>): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ task: data }) },
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function updateScrapyardTask(userId: string, taskId: string, data: Partial<ScrapyardTask>): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}`,
    { method: 'PUT', body: JSON.stringify({ task: data }) },
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function deleteScrapyardTask(userId: string, taskId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
  );
}

export async function startScrapyardTask(userId: string, taskId: string, notes?: string): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}/start`,
    { method: 'PATCH', body: JSON.stringify({ notes }) },
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function pauseScrapyardTask(userId: string, taskId: string, notes?: string): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}/pause`,
    { method: 'PATCH', body: JSON.stringify({ notes }) },
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function resumeScrapyardTask(userId: string, taskId: string, notes?: string): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}/resume`,
    { method: 'PATCH', body: JSON.stringify({ notes }) },
  );
  if (!result.task) throw new Error('Respuesta inválida del servidor');
  return result.task;
}

export async function completeScrapyardTask(userId: string, taskId: string, result?: TaskResult, notes?: string): Promise<ScrapyardTask> {
  const id = normalizeUserId(userId);
  const res = await request<{ ok: boolean; task: ScrapyardTask }>(
    `/api/scrapyard/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}/complete`,
    { method: 'PATCH', body: JSON.stringify({ result, notes }) },
  );
  if (!res.task) throw new Error('Respuesta inválida del servidor');
  return res.task;
}

export async function getScrapyardWorkerProductivity(userId: string): Promise<WorkerProductivityReport[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; report: WorkerProductivityReport[] }>(
    `/api/scrapyard/workers/${encodeURIComponent(id)}/productivity/report`,
  );
  return payload.report || [];
}

// ─── Dismantling API ──────────────────────────────────────────────────────────

export async function startDismantling(userId: string, vehicleId: string): Promise<DismantlingSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/start`,
    { method: 'POST' },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function getDismantlingSession(userId: string, vehicleId: string): Promise<DismantlingSession | null> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession | null }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}`,
  );
  return result.session || null;
}

export async function extractPartFromVehicle(
  userId: string,
  vehicleId: string,
  data: { checklistIndex: number; partData: Partial<ScrapyardPart> },
): Promise<ScrapyardPart> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; part: ScrapyardPart }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/extract`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!result.part) throw new Error('Respuesta inválida del servidor');
  return result.part;
}

export async function markPartNotApplicable(
  userId: string,
  vehicleId: string,
  data: { checklistIndex: number; motivo: string },
): Promise<DismantlingSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/not-applicable`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function addCustomPartToDismantling(
  userId: string,
  vehicleId: string,
  data: Partial<ScrapyardPart>,
): Promise<ScrapyardPart> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; part: ScrapyardPart }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/add-custom`,
    { method: 'POST', body: JSON.stringify({ part: data }) },
  );
  if (!result.part) throw new Error('Respuesta inválida del servidor');
  return result.part;
}

export async function pauseDismantlingSession(userId: string, vehicleId: string): Promise<DismantlingSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/pause`,
    { method: 'PUT' },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function resumeDismantlingSession(userId: string, vehicleId: string): Promise<DismantlingSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/resume`,
    { method: 'PUT' },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function completeDismantlingSession(userId: string, vehicleId: string): Promise<DismantlingSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DismantlingSession }>(
    `/api/scrapyard/dismantling/${encodeURIComponent(id)}/${encodeURIComponent(vehicleId)}/complete`,
    { method: 'PUT' },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

// ─── Vehículos de desguace (Couch / API dedicada pendiente) ───────────────────
// Stubs: el estado vive en ScrapyardContext (optimistic). Cuando exista endpoint,
// sustituir por llamadas HTTP reales.

export async function listScrapyardVehicles(
  _userId: string,
  _businessId?: string,
): Promise<{ vehicles: ScrapyardVehicle[] }> {
  return { vehicles: [] };
}

export async function createScrapyardVehicle(
  _userId: string,
  vehicle: ScrapyardVehicle,
  _businessId?: string,
): Promise<ScrapyardVehicle> {
  return vehicle;
}

export async function updateScrapyardVehicle(
  _userId: string,
  _vehicleId: string,
  _data: Partial<ScrapyardVehicle>,
): Promise<void> {
  return undefined;
}

export async function deleteScrapyardVehicle(_userId: string, _vehicleId: string): Promise<void> {
  return undefined;
}
