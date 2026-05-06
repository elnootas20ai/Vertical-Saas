import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

export interface ChatMessage {
  _id: string;
  messageId: string;
  type: 'chat_message';
  channelId?: string;
  businessId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  replyTo: string | null;
  reactions: Record<string, string[]>;
  edited?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  createdAt: string;
}

export interface ChatChannel {
  _id: string;
  channelId: string;
  type: 'chat_channel';
  businessId: string;
  name: string;
  description: string;
  channelType: 'general' | 'group' | 'direct';
  members: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  lastMessage: { text: string; userName: string } | null;
  lastMessageAt: string | null;
}

interface ChatEnvelope {
  ok: boolean;
  error?: string;
  message?: ChatMessage;
  messages?: ChatMessage[];
  reactions?: Record<string, string[]>;
  channel?: ChatChannel;
  channels?: ChatChannel[];
  existing?: boolean;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders() {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

const API_BASE = getApiBase();

async function request(path: string, init?: RequestInit): Promise<ChatEnvelope> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as ChatEnvelope;

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado en el chat');
  }

  return payload;
}

// ─── Channels ───────────────────────────────────────────────────────────────

export async function listChannels(businessId: string, userId?: string) {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  const qs = params.toString();
  return request(`/api/chat/channels/${enc(businessId)}${qs ? `?${qs}` : ''}`);
}

export async function createChannel(
  businessId: string,
  data: { name: string; channelType: 'group' | 'direct'; members: string[]; description?: string },
) {
  return request(`/api/chat/channels/${enc(businessId)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateChannel(
  businessId: string,
  channelId: string,
  data: { name?: string; description?: string; members?: string[] },
) {
  return request(`/api/chat/channels/${enc(businessId)}/${enc(channelId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteChannel(businessId: string, channelId: string) {
  return request(`/api/chat/channels/${enc(businessId)}/${enc(channelId)}`, {
    method: 'DELETE',
  });
}

export async function ensureGeneralChannel(businessId: string) {
  return request(`/api/chat/channels/${enc(businessId)}/ensure-general`, {
    method: 'POST',
  });
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function listChatMessages(businessId: string, channelId: string, limit = 50, before?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return request(`/api/chat/messages/${enc(businessId)}/${enc(channelId)}?${params.toString()}`);
}

export async function sendChatMessage(
  businessId: string,
  channelId: string,
  data: { text: string; userId: string; userName: string; userAvatar?: string; replyTo?: string },
) {
  return request(`/api/chat/messages/${enc(businessId)}/${enc(channelId)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function editChatMessage(
  businessId: string,
  messageId: string,
  data: { text: string; userId: string },
) {
  return request(`/api/chat/messages/${enc(businessId)}/${enc(messageId)}/edit`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteChatMessage(
  businessId: string,
  messageId: string,
  userId: string,
) {
  return request(`/api/chat/messages/${enc(businessId)}/${enc(messageId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

export async function toggleReaction(
  businessId: string,
  messageId: string,
  data: { emoji: string; userId: string },
) {
  return request(`/api/chat/messages/${enc(businessId)}/${enc(messageId)}/react`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

function enc(s: string) {
  return encodeURIComponent(s);
}
