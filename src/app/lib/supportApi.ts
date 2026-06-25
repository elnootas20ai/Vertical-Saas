import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

export type BugReportCategory = 'bug' | 'error' | 'suggestion';

export interface SubmitBugReportPayload {
  description: string;
  category?: BugReportCategory;
  pageUrl?: string;
  userAgent?: string;
  businessId?: string;
  businessName?: string;
  stepsToReproduce?: string;
  screenshotBase64?: string | null;
}

export async function submitBugReportRequest(
  payload: SubmitBugReportPayload,
): Promise<{ ok: boolean; reportId?: string; error?: string }> {
  const response = await authFetch(`${API_BASE}/api/support/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    reportId?: string;
    error?: string;
  };
  if (!response.ok) {
    return { ok: false, error: data.error || 'No se pudo enviar el reporte' };
  }
  return { ok: true, reportId: data.reportId };
}
