import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { ...getHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error en workflows API');
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowTriggerType = 'no_contact_days' | 'status_is' | 'created_days_ago';
export type WorkflowActionType = 'send_email' | 'add_task' | 'change_status' | 'add_tag';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  days?: number;
  status?: string;
}

export interface WorkflowAction {
  id: string;
  order: number;
  type: WorkflowActionType;
  delayDays: number;
  emailTemplate?: string;
  emailSubject?: string;
  taskTitle?: string;
  taskAssignTo?: string;
  changeStatus?: string;
  addTag?: string;
}

export interface Workflow {
  id: string;
  _rev?: string;
  user_id: string;
  name: string;
  description: string;
  enabled: boolean;
  entityType: 'lead' | 'client';
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listWorkflowsRequest(userId: string): Promise<Workflow[]> {
  const result = await req<{ ok: boolean; workflows: Workflow[] }>(`/api/workflows/${encodeURIComponent(userId)}`);
  return result.workflows || [];
}

export async function createWorkflowRequest(userId: string, workflow: Partial<Workflow>): Promise<Workflow> {
  const result = await req<{ ok: boolean; workflow: Workflow }>(`/api/workflows/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ workflow }),
  });
  return result.workflow;
}

export async function updateWorkflowRequest(userId: string, workflowId: string, workflow: Partial<Workflow>): Promise<Workflow> {
  const result = await req<{ ok: boolean; workflow: Workflow }>(
    `/api/workflows/${encodeURIComponent(userId)}/${encodeURIComponent(workflowId)}`,
    { method: 'PUT', body: JSON.stringify({ workflow }) },
  );
  return result.workflow;
}

export async function deleteWorkflowRequest(userId: string, workflowId: string): Promise<void> {
  await req(`/api/workflows/${encodeURIComponent(userId)}/${encodeURIComponent(workflowId)}`, { method: 'DELETE' });
}

export async function triggerWorkflowRunRequest(userId: string): Promise<void> {
  await req(`/api/workflows/${encodeURIComponent(userId)}/run`, { method: 'POST' });
}
