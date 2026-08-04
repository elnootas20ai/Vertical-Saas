import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
const env = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};


function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const DB = (env.VITE_COUCHDB_DB || 'vertial') + '-worker-tasks';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || 'Error en tareas');
  return data;
}

async function ensureDb() {
  await ensureCouchDb(DB, () => req(`/api/couch/db/${encodeURIComponent(DB)}`, { method: 'PUT' }));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TimeEntry {
  start: string;
  end: string | null;
}

export interface WorkerTask {
  _id: string;
  _rev?: string;
  type: 'worker_task';
  business_id: string;
  member_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  category: string;
  /** Clave de plantilla de rol (si viene del onboarding). */
  templateKey?: string;
  roleId?: string;
  timeEntries: TimeEntry[];
  totalSeconds: number;
  timerRunning: boolean;
  timerStartedAt: string | null;
  autoStopAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_CONTINUOUS_SECONDS = 4 * 60 * 60; // 4 horas

function computeTotalSeconds(entries: TimeEntry[]): number {
  let total = 0;
  for (const e of entries) {
    const start = new Date(e.start).getTime();
    const end = e.end ? new Date(e.end).getTime() : Date.now();
    total += Math.max(0, Math.floor((end - start) / 1000));
  }
  return total;
}

export function formatTaskTimer(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function checkAutoStop(task: WorkerTask): WorkerTask {
  if (!task.timerRunning || !task.timerStartedAt) return task;
  const startedAt = new Date(task.timerStartedAt).getTime();
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed >= MAX_CONTINUOUS_SECONDS) {
    const autoEndTime = new Date(startedAt + MAX_CONTINUOUS_SECONDS * 1000).toISOString();
    const entries = task.timeEntries.map((e, i) =>
      i === task.timeEntries.length - 1 && !e.end ? { ...e, end: autoEndTime } : e,
    );
    return {
      ...task,
      timeEntries: entries,
      totalSeconds: computeTotalSeconds(entries),
      timerRunning: false,
      timerStartedAt: null,
      autoStopAt: null,
      updatedAt: autoEndTime,
    };
  }
  return task;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listWorkerTasks(businessId: string, memberId: string): Promise<WorkerTask[]> {
  await ensureDb();
  const payload = await req<{ docs: unknown[] }>(`/api/couch/docs/${encodeURIComponent(DB)}`);
  const tasks = ((payload.docs || []) as WorkerTask[]).filter(
    (d) =>
      d?.type === 'worker_task' &&
      d?.business_id === businessId &&
      d?.member_id === memberId &&
      !((d as any).deletedAt),
  );

  const needsUpdate: WorkerTask[] = [];
  const result = tasks.map((t) => {
    const checked = checkAutoStop(t);
    if (checked !== t) needsUpdate.push(checked);
    return checked;
  });

  for (const t of needsUpdate) {
    try {
      await saveTask(t);
    } catch { /* conflict ok, will sync next load */ }
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveTask(task: WorkerTask): Promise<WorkerTask> {
  const result = await req<{ rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(task._id)}`,
    { method: 'PUT', body: JSON.stringify(task) },
  );
  return { ...task, _rev: result.rev };
}

export async function createWorkerTask(
  businessId: string,
  memberId: string,
  title: string,
  priority: TaskPriority = 'medium',
  options?: {
    description?: string;
    category?: string;
    templateKey?: string;
    roleId?: string;
    dueDate?: string;
    id?: string;
  },
): Promise<WorkerTask> {
  await ensureDb();
  const now = new Date().toISOString();
  const templateKey = String(options?.templateKey || '').trim();
  const id =
    options?.id
    || (templateKey
      ? `wtask:${businessId}:${memberId}:tpl:${templateKey}`
      : `wtask:${businessId}:${memberId}:${Date.now()}`);
  const task: WorkerTask = {
    _id: id,
    type: 'worker_task',
    business_id: businessId,
    member_id: memberId,
    title,
    description: String(options?.description || ''),
    status: 'pending',
    priority,
    dueDate: options?.dueDate || new Date().toISOString().slice(0, 10),
    category: options?.category || 'general',
    ...(templateKey ? { templateKey } : {}),
    ...(options?.roleId ? { roleId: options.roleId } : {}),
    timeEntries: [],
    totalSeconds: 0,
    timerRunning: false,
    timerStartedAt: null,
    autoStopAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return saveTask(task);
}

/**
 * Si faltan tareas de onboarding del rol (invites antiguos), las crea en cliente.
 * Idempotente por templateKey.
 */
export async function ensureRoleOnboardingTasks(
  businessId: string,
  memberId: string,
  roleId: string | null | undefined,
  businessType?: string | null,
): Promise<{ created: number; tasks: WorkerTask[] }> {
  const { getRoleTaskTemplates } = await import('./roleTaskTemplates');
  const templates = getRoleTaskTemplates(roleId, businessType);
  if (!templates.length || !businessId || !memberId) {
    return { created: 0, tasks: await listWorkerTasks(businessId, memberId) };
  }

  const existing = await listWorkerTasks(businessId, memberId);
  const have = new Set(
    existing
      .map((t) => String(t.templateKey || ''))
      .filter(Boolean)
      .concat(
        existing
          .filter((t) => String(t._id || '').includes(':tpl:'))
          .map((t) => String(t._id).split(':tpl:').pop() || ''),
      ),
  );

  let created = 0;
  for (const tpl of templates) {
    if (have.has(tpl.key)) continue;
    try {
      await createWorkerTask(businessId, memberId, tpl.title, tpl.priority, {
        description: tpl.description,
        category: 'role_onboarding',
        templateKey: tpl.key,
        roleId: String(roleId || ''),
      });
      created += 1;
    } catch {
      /* conflicto / red: se reintenta en la próxima carga */
    }
  }

  const tasks = created > 0 ? await listWorkerTasks(businessId, memberId) : existing;
  return { created, tasks };
}

export async function startTaskTimer(task: WorkerTask): Promise<WorkerTask> {
  if (task.timerRunning) return task;
  const now = new Date().toISOString();
  const autoStop = new Date(Date.now() + MAX_CONTINUOUS_SECONDS * 1000).toISOString();
  const updated: WorkerTask = {
    ...task,
    status: 'in_progress',
    timerRunning: true,
    timerStartedAt: now,
    autoStopAt: autoStop,
    timeEntries: [...task.timeEntries, { start: now, end: null }],
    updatedAt: now,
  };
  return saveTask(updated);
}

export async function stopTaskTimer(task: WorkerTask): Promise<WorkerTask> {
  if (!task.timerRunning) return task;
  const now = new Date().toISOString();
  const entries = task.timeEntries.map((e, i) =>
    i === task.timeEntries.length - 1 && !e.end ? { ...e, end: now } : e,
  );
  const updated: WorkerTask = {
    ...task,
    timeEntries: entries,
    totalSeconds: computeTotalSeconds(entries),
    timerRunning: false,
    timerStartedAt: null,
    autoStopAt: null,
    updatedAt: now,
  };
  return saveTask(updated);
}

export async function completeTask(task: WorkerTask): Promise<WorkerTask> {
  let t = task;
  if (t.timerRunning) t = await stopTaskTimer(t);
  const now = new Date().toISOString();
  return saveTask({ ...t, status: 'completed', updatedAt: now });
}

export async function reopenTask(task: WorkerTask): Promise<WorkerTask> {
  const now = new Date().toISOString();
  return saveTask({ ...task, status: 'pending', updatedAt: now });
}

export async function updateTaskTitle(task: WorkerTask, title: string): Promise<WorkerTask> {
  const now = new Date().toISOString();
  return saveTask({ ...task, title, updatedAt: now });
}

export async function deleteWorkerTask(task: WorkerTask): Promise<void> {
  if (!task._rev) return;
  await req(
    `/api/couch/doc/${encodeURIComponent(DB)}/${encodeURIComponent(task._id)}?rev=${task._rev}`,
    { method: 'DELETE' },
  );
}

export function getLiveSeconds(task: WorkerTask): number {
  if (!task.timerRunning || !task.timerStartedAt) return task.totalSeconds;
  const lastEntry = task.timeEntries[task.timeEntries.length - 1];
  if (!lastEntry || lastEntry.end) return task.totalSeconds;
  const elapsed = Math.floor((Date.now() - new Date(lastEntry.start).getTime()) / 1000);
  const capped = Math.min(elapsed, MAX_CONTINUOUS_SECONDS);
  const previousSeconds = computeTotalSeconds(task.timeEntries.slice(0, -1));
  return previousSeconds + capped;
}

export function getTimerStartedSecondsAgo(task: WorkerTask): number {
  if (!task.timerStartedAt) return 0;
  return Math.floor((Date.now() - new Date(task.timerStartedAt).getTime()) / 1000);
}

export function getRemainingAutoStop(task: WorkerTask): number {
  if (!task.timerRunning || !task.timerStartedAt) return 0;
  const elapsed = (Date.now() - new Date(task.timerStartedAt).getTime()) / 1000;
  return Math.max(0, MAX_CONTINUOUS_SECONDS - elapsed);
}
