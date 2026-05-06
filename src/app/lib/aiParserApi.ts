import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

export interface AIParseResult {
  ok: boolean;
  entries: Record<string, unknown>[];
  summary?: string;
  error?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


export async function aiParseEntriesRequest(
  userId: string,
  module: string,
  text: string,
  fields: { key: string; label: string; type?: string }[],
): Promise<AIParseResult> {
  const res = await authFetch(`${getApiBase()}/api/ai/parse-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, module, text, fields }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Error al procesar con IA');
  }
  return res.json();
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatResult {
  ok: boolean;
  reply: string;
  error?: string;
}

export async function aiChatRequest(
  messages: AIChatMessage[],
  context?: string,
): Promise<AIChatResult> {
  const res = await authFetch(`${getApiBase()}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Error al procesar con IA');
  }
  return res.json();
}
