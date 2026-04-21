import { authFetch } from './authApi';

export interface AIParseResult {
  ok: boolean;
  entries: Record<string, unknown>[];
  summary?: string;
  error?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const port = env.VITE_API_PORT || '3000';
  return `${protocol}://${browserHost}:${port}`;
}

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
