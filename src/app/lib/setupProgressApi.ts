import { authFetch } from './authApi';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SetupStep {
  key: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  skipped: boolean;
  skippedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface SetupProgress {
  id: string;
  user_id: string;
  business_id: string;
  businessType: string;
  requestedModules: Record<string, boolean>;
  steps: SetupStep[];
  overallCompleted: boolean;
  overallCompletedAt: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  welcomeEmailSent: boolean;
  skippedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StepDefinition {
  key: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  category: string;
  required: boolean;
  order: number;
}

export interface SetupStatus {
  percentComplete: number;
  completedCount: number;
  totalCount: number;
  pendingSteps: string[];
  trialDaysRemaining: number;
  overallCompleted: boolean;
  skippedAt: string | null;
}

interface ProgressResponse {
  ok: boolean;
  progress: SetupProgress;
  definitions: StepDefinition[];
  error?: string;
}

interface StatusResponse {
  ok: boolean;
  status: SetupStatus;
  error?: string;
}

interface VerifyResponse {
  ok: boolean;
  progress: SetupProgress;
  updated: boolean;
  error?: string;
}

// ─── API calls ───────────────────────────────────────────────────────────────

const BASE = '/api/setup-progress';

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Error de API');
  return data;
}

export async function getSetupProgressRequest(userId: string): Promise<ProgressResponse> {
  return jsonRequest<ProgressResponse>(`${BASE}/${encodeURIComponent(userId)}`);
}

export async function getSetupStatusRequest(userId: string): Promise<StatusResponse> {
  return jsonRequest<StatusResponse>(`${BASE}/${encodeURIComponent(userId)}/status`);
}

export async function completeStepRequest(
  userId: string,
  stepKey: string,
  metadata?: Record<string, unknown>,
): Promise<ProgressResponse> {
  return jsonRequest<ProgressResponse>(`${BASE}/${encodeURIComponent(userId)}/step/${encodeURIComponent(stepKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ metadata }),
  });
}

export async function skipStepRequest(userId: string, stepKey: string): Promise<ProgressResponse> {
  return jsonRequest<ProgressResponse>(`${BASE}/${encodeURIComponent(userId)}/step/${encodeURIComponent(stepKey)}/skip`, {
    method: 'PUT',
  });
}

export async function skipAllRequest(userId: string): Promise<ProgressResponse> {
  return jsonRequest<ProgressResponse>(`${BASE}/${encodeURIComponent(userId)}/skip-all`, {
    method: 'PUT',
  });
}

export async function resetSetupProgressRequest(userId: string): Promise<ProgressResponse> {
  return jsonRequest<ProgressResponse>(`${BASE}/${encodeURIComponent(userId)}/reset`, {
    method: 'PUT',
  });
}

export async function verifyAllStepsRequest(userId: string): Promise<VerifyResponse> {
  return jsonRequest<VerifyResponse>(`${BASE}/${encodeURIComponent(userId)}/verify-all`);
}
