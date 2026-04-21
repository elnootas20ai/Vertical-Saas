/**
 * API para chat de ideas con agentes y progresos generales.
 * Persistencia en localStorage (por usuario).
 */

const STORAGE_KEY_MESSAGES = 'udar_agent_ideas_messages';
const STORAGE_KEY_PROGRESS = 'udar_agent_progress';

export interface ChatMessage {
  id: string;
  agentId: string;
  agentName: string;
  userId: string;
  role: 'user' | 'agent';
  text: string;
  createdAt: string;
  isIdea?: boolean;
  accepted?: boolean;
}

export interface ProgressItem {
  id: string;
  idea: string;
  agentId: string;
  agentName: string;
  userId: string;
  acceptedAt: string;
  messageId: string;
}

function getMessagesKey(userId: string) {
  return `${STORAGE_KEY_MESSAGES}_${userId}`;
}

function getProgressKey(userId: string) {
  return `${STORAGE_KEY_PROGRESS}_${userId}`;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function listAgentMessages(userId: string, agentId: string): ChatMessage[] {
  const key = getMessagesKey(userId);
  const all = loadJson<Record<string, ChatMessage[]>>(key, {});
  return (all[agentId] || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addAgentMessage(
  userId: string,
  agentId: string,
  agentName: string,
  role: 'user' | 'agent',
  text: string,
  isIdea?: boolean
): ChatMessage {
  const key = getMessagesKey(userId);
  const all = loadJson<Record<string, ChatMessage[]>>(key, {});
  if (!all[agentId]) all[agentId] = [];

  const msg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    agentId,
    agentName,
    userId,
    role,
    text,
    createdAt: new Date().toISOString(),
    isIdea: isIdea ?? role === 'user',
    accepted: false,
  };
  all[agentId].push(msg);
  saveJson(key, all);
  return msg;
}

export function acceptIdea(
  userId: string,
  messageId: string,
  agentId: string,
  agentName: string
): ProgressItem | null {
  const msgKey = getMessagesKey(userId);
  const all = loadJson<Record<string, ChatMessage[]>>(msgKey, {});
  const msgs = all[agentId] || [];
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg || msg.accepted) return null;

  msg.accepted = true;
  saveJson(msgKey, all);

  const progressKey = getProgressKey(userId);
  const progressList = loadJson<ProgressItem[]>(progressKey, []);

  const item: ProgressItem = {
    id: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    idea: msg.text,
    agentId,
    agentName,
    userId,
    acceptedAt: new Date().toISOString(),
    messageId,
  };
  progressList.unshift(item);
  saveJson(progressKey, progressList);
  return item;
}

export function listProgress(userId: string): ProgressItem[] {
  const key = getProgressKey(userId);
  return loadJson<ProgressItem[]>(key, []);
}
