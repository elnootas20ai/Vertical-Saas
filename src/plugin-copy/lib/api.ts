import type { Agent, AgentCreatePayload, AgentUpdatePayload, AgentCategory, QueueItem, ChatMessage, CursorCliStatus, AgentVersion, SavedComponent, ComponentCategory, ComponentVersion } from '../types';

const BASE = '/api/plugin';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const agentApi = {
  list: () => request<{ agents: Agent[]; categories: AgentCategory[] }>('/agents'),

  create: (data: AgentCreatePayload) =>
    request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),

  get: (id: string) => request<Agent>(`/agents/${id}`),

  update: (id: string, data: AgentUpdatePayload) =>
    request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) =>
    request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),

  getArchivedAgents: () =>
    request<Array<{ id: string; name: string; type: string; archivedAt: string }>>('/agents-archived'),

  restoreAgent: (id: string) =>
    request<Agent>(`/agents-archived/${id}/restore`, { method: 'POST' }),

  reorderAgents: (orderedIds: string[]) =>
    request<{ ok: boolean; agents: Agent[] }>('/agents/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  getAgentCategories: () => request<AgentCategory[]>('/agents/categories'),

  createAgentCategory: (name: string) =>
    request<AgentCategory>('/agents/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateAgentCategory: (id: string, name: string) =>
    request<AgentCategory>(`/agents/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteAgentCategory: (id: string) =>
    request<{ ok: boolean }>(`/agents/categories/${id}`, { method: 'DELETE' }),

  // Terminal
  exec: (id: string, command: string) =>
    request<{ ok: boolean }>(`/agents/${id}/exec`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  sendInput: (id: string, data: string) =>
    request<{ ok: boolean }>(`/agents/${id}/input`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  sendSignal: (id: string, signal: string) =>
    request<{ ok: boolean }>(`/agents/${id}/signal`, {
      method: 'POST',
      body: JSON.stringify({ signal }),
    }),

  resize: (id: string, cols: number, rows: number) =>
    request<{ ok: boolean }>(`/agents/${id}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols, rows }),
    }),

  restart: (id: string) =>
    request<{ ok: boolean }>(`/agents/${id}/restart`, { method: 'POST' }),

  watchTerminal: (
    id: string,
    onData: (event: { type: string; content: string }) => void,
  ): (() => void) => {
    const es = new EventSource(`${BASE}/agents/${id}/terminal`);
    es.onmessage = (e) => {
      try { onData(JSON.parse(e.data)); } catch { /* skip */ }
    };
    return () => es.close();
  },

  // Queue
  getQueue: (agentId: string) => request<QueueItem[]>(`/agents/${agentId}/queue`),

  addToQueue: (agentId: string, message: string, priority: 'normal' | 'high' = 'normal') =>
    request<QueueItem>(`/agents/${agentId}/queue`, {
      method: 'POST',
      body: JSON.stringify({ message, priority }),
    }),

  removeFromQueue: (agentId: string, itemId: string) =>
    request<{ ok: boolean }>(`/agents/${agentId}/queue/${itemId}`, { method: 'DELETE' }),

  clearQueue: (agentId: string) =>
    request<{ ok: boolean }>(`/agents/${agentId}/queue`, { method: 'DELETE' }),

  reorderQueue: (agentId: string, itemId: string, direction: 'up' | 'down') =>
    request<{ ok: boolean; queue: QueueItem[] }>(`/agents/${agentId}/queue/${itemId}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ direction }),
    }),

  watchQueue: (
    agentId: string,
    onEvent: (event: { type: string; queue?: QueueItem[]; itemId?: string; error?: string; item?: QueueItem }) => void,
  ): (() => void) => {
    const es = new EventSource(`${BASE}/agents/${agentId}/queue/watch`);
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* skip */ }
    };
    return () => es.close();
  },

  // Chat / Conversation
  getMessages: (agentId: string) => request<ChatMessage[]>(`/agents/${agentId}/messages`),

  sendMessage: (agentId: string, message: string, attachedFiles?: string[]) =>
    request<ChatMessage>(`/agents/${agentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, files: attachedFiles }),
    }),

  clearMessages: (agentId: string) =>
    request<{ ok: boolean }>(`/agents/${agentId}/messages`, { method: 'DELETE' }),

  watchChat: (
    agentId: string,
    onEvent: (event: {
      type: string;
      messages?: ChatMessage[];
      message?: ChatMessage;
      messageId?: string;
      delta?: string;
      error?: string;
    }) => void,
  ): (() => void) => {
    const es = new EventSource(`${BASE}/agents/${agentId}/chat/stream`);
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* skip */ }
    };
    return () => es.close();
  },

  // Files
  searchFiles: (query: string) =>
    request<string[]>(`/files?q=${encodeURIComponent(query)}`),

  readFile: (filePath: string) =>
    request<{ path: string; content: string; lines?: number; truncated?: boolean }>(
      `/files/read?path=${encodeURIComponent(filePath)}`,
    ),

  // Versions (auto-created per message, rewindable)
  getVersions: (agentId: string) => request<AgentVersion[]>(`/agents/${agentId}/versions`),

  rewindToVersion: (agentId: string, versionId: string) =>
    request<{ version: AgentVersion; messages: ChatMessage[] }>(
      `/agents/${agentId}/versions/${versionId}/rewind`,
      { method: 'POST' },
    ),

  deleteVersion: (agentId: string, versionId: string) =>
    request<{ ok: boolean }>(`/agents/${agentId}/versions/${versionId}`, { method: 'DELETE' }),

  // Git Blame
  gitBlame: (file: string, line: number) =>
    request<{
      author: string;
      email: string | null;
      date: string | null;
      commitHash: string | null;
      summary: string | null;
      githubUser: string | null;
      avatarUrl: string | null;
    }>('/git/blame', {
      method: 'POST',
      body: JSON.stringify({ file, line }),
    }),

  // Cursor CLI
  cursorStatus: () => request<CursorCliStatus>('/cursor/status'),
  cursorInstall: () => request<{ installed: boolean; path?: string; error?: string }>('/cursor/install', { method: 'POST' }),

  // Saved Components
  getComponents: () =>
    request<{ components: SavedComponent[]; categories: ComponentCategory[] }>('/components'),

  createComponent: (name: string, category?: string) =>
    request<SavedComponent>('/components', {
      method: 'POST',
      body: JSON.stringify({ name, category }),
    }),

  updateComponent: (id: string, data: { name?: string; category?: string }) =>
    request<SavedComponent>(`/components/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteComponent: (id: string) =>
    request<{ ok: boolean }>(`/components/${id}`, { method: 'DELETE' }),

  duplicateComponent: (id: string) =>
    request<SavedComponent>(`/components/${id}/duplicate`, { method: 'POST' }),

  getComponentContent: (id: string) =>
    request<SavedComponent & { content: string; path: string }>(`/components/${id}/content`),

  reorderComponents: (orderedIds: string[]) =>
    request<{ ok: boolean; components: SavedComponent[] }>('/components/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  createCategory: (name: string) =>
    request<ComponentCategory>('/components/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateCategory: (id: string, name: string) =>
    request<ComponentCategory>(`/components/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (id: string) =>
    request<{ ok: boolean }>(`/components/categories/${id}`, { method: 'DELETE' }),

  // Component Versions
  getComponentVersions: (componentId: string) =>
    request<ComponentVersion[]>(`/components/${componentId}/versions`),

  getComponentVersionContent: (componentId: string, versionId: string) =>
    request<ComponentVersion & { content: string }>(`/components/${componentId}/versions/${versionId}/content`),

  restoreComponentVersion: (componentId: string, versionId: string) =>
    request<{ ok: boolean; restoredVersion: ComponentVersion; component: SavedComponent }>(
      `/components/${componentId}/versions/${versionId}/restore`,
      { method: 'POST' },
    ),

  deleteComponentVersion: (componentId: string, versionId: string) =>
    request<{ ok: boolean }>(`/components/${componentId}/versions/${versionId}`, { method: 'DELETE' }),

  clearComponentVersions: (componentId: string) =>
    request<{ ok: boolean }>(`/components/${componentId}/versions`, { method: 'DELETE' }),

  // Apps
  validateApp: (data: {
    name: string;
    description: string;
    port: number;
    backendStack: string;
    frontendStack: string;
  }) =>
    request<{ prompt: string; cwd: string }>('/apps/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  enhanceDescription: (description: string, appName: string) =>
    request<{ enhanced: string }>('/apps/enhance-description', {
      method: 'POST',
      body: JSON.stringify({ description, appName }),
    }),

  // ── Kanban ──

  kanbanGetTickets: () =>
    request<{ tickets: import('../types').KanbanTicket[] }>('/kanban/tickets'),

  kanbanGetTicket: (id: string) =>
    request<import('../types').KanbanTicket>(`/kanban/tickets/${id}`),

  kanbanCreateTicket: (data: Partial<import('../types').KanbanTicket>) =>
    request<import('../types').KanbanTicket>('/kanban/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanUpdateTicket: (id: string, data: Partial<import('../types').KanbanTicket>) =>
    request<import('../types').KanbanTicket>(`/kanban/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  kanbanDeleteTicket: (id: string) =>
    request<{ ok: boolean }>(`/kanban/tickets/${id}`, { method: 'DELETE' }),

  kanbanMoveTicket: (id: string, status: string, order: number) =>
    request<import('../types').KanbanTicket>(`/kanban/tickets/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ status, order }),
    }),

  kanbanReorderTickets: (orders: { id: string; order: number; status?: string }[]) =>
    request<{ ok: boolean }>('/kanban/tickets/reorder', {
      method: 'POST',
      body: JSON.stringify({ orders }),
    }),

  kanbanAddComment: (ticketId: string, data: { author: string; content: string; attachments?: unknown[] }) =>
    request<import('../types').KanbanComment>(`/kanban/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanDeleteComment: (ticketId: string, commentId: string) =>
    request<{ ok: boolean }>(`/kanban/tickets/${ticketId}/comments/${commentId}`, { method: 'DELETE' }),

  kanbanAddTimeEntry: (ticketId: string, data: { userId: string; userName: string; hours: number; description: string; date: string }) =>
    request<import('../types').KanbanTimeEntry>(`/kanban/tickets/${ticketId}/timelog`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanUpdateTimeEntry: (ticketId: string, entryId: string, data: Partial<import('../types').KanbanTimeEntry>) =>
    request<import('../types').KanbanTimeEntry>(`/kanban/tickets/${ticketId}/timelog/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  kanbanDeleteTimeEntry: (ticketId: string, entryId: string) =>
    request<{ ok: boolean }>(`/kanban/tickets/${ticketId}/timelog/${entryId}`, { method: 'DELETE' }),

  kanbanAddAttachment: (ticketId: string, data: { name: string; url: string; type: string; size: number }) =>
    request<import('../types').KanbanAttachment>(`/kanban/tickets/${ticketId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanDeleteAttachment: (ticketId: string, attId: string) =>
    request<{ ok: boolean }>(`/kanban/tickets/${ticketId}/attachments/${attId}`, { method: 'DELETE' }),

  kanbanGetMembers: () =>
    request<{ members: import('../types').KanbanTeamMember[] }>('/kanban/members'),

  kanbanCreateMember: (data: { name: string; role?: string; email?: string; avatar?: string }) =>
    request<import('../types').KanbanTeamMember>('/kanban/members', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanUpdateMember: (id: string, data: Partial<import('../types').KanbanTeamMember>) =>
    request<import('../types').KanbanTeamMember>(`/kanban/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  kanbanDeleteMember: (id: string) =>
    request<{ ok: boolean }>(`/kanban/members/${id}`, { method: 'DELETE' }),

  kanbanGetStats: () =>
    request<{ tickets: number; members: number; ticketsByStatus: Record<string, number>; ticketsByAssignee: Record<string, number>; totalHours: Record<string, number> }>('/kanban/stats'),

  kanbanAiGenerateTicket: (prompt: string, prePrompt?: string) =>
    request<{ ticket: Partial<import('../types').KanbanTicket>; rawResponse: string }>('/kanban/ai/generate-ticket', {
      method: 'POST',
      body: JSON.stringify({ prompt, prePrompt }),
    }),

  kanbanAiSummarize: (ticket: Partial<import('../types').KanbanTicket>) =>
    request<{ description: string }>('/kanban/ai/summarize-ticket', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    }),

  // Saved views
  kanbanGetViews: () =>
    request<import('../types').KanbanSavedView[]>('/kanban/views'),

  kanbanCreateView: (data: Partial<import('../types').KanbanSavedView>) =>
    request<import('../types').KanbanSavedView>('/kanban/views', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  kanbanUpdateView: (id: string, data: Partial<import('../types').KanbanSavedView>) =>
    request<import('../types').KanbanSavedView>(`/kanban/views/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  kanbanDeleteView: (id: string) =>
    request<{ ok: boolean }>(`/kanban/views/${id}`, { method: 'DELETE' }),
};

// ── CouchDB Manager API ──

const COUCH_BASE = '/api/couch';

async function couchRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${COUCH_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface CouchDBInfo {
  db_name: string;
  doc_count: number;
  doc_del_count: number;
  update_seq: string;
  purge_seq: string;
  disk_size: number;
  data_size: number;
  sizes?: { file: number; external: number; active: number };
  instance_start_time: string;
}

export interface CouchDoc {
  _id: string;
  _rev: string;
  [key: string]: unknown;
}

export const couchApi = {
  listDbs: () => couchRequest<string[]>('/dbs'),

  getDbInfo: (dbName: string) =>
    couchRequest<CouchDBInfo>(`/db/${encodeURIComponent(dbName)}/info`),

  createDb: (dbName: string) =>
    couchRequest<{ ok: boolean; dbName: string }>(`/db/${encodeURIComponent(dbName)}`, { method: 'PUT' }),

  deleteDb: (dbName: string) =>
    couchRequest<{ ok: boolean }>(`/db/${encodeURIComponent(dbName)}`, { method: 'DELETE' }),

  getPaginatedDocs: (dbName: string, limit = 25, skip = 0) =>
    couchRequest<{ docs: CouchDoc[]; total_rows: number; offset: number }>(
      `/docs-paginated/${encodeURIComponent(dbName)}?limit=${limit}&skip=${skip}`,
    ),

  getDoc: (dbName: string, docId: string) =>
    couchRequest<CouchDoc>(`/doc/${encodeURIComponent(dbName)}/${encodeURIComponent(docId)}`),

  createDoc: (dbName: string, doc: Record<string, unknown>) =>
    couchRequest<{ ok: boolean; id: string; rev: string }>(`/doc/${encodeURIComponent(dbName)}`, {
      method: 'POST',
      body: JSON.stringify(doc),
    }),

  updateDoc: (dbName: string, docId: string, doc: Record<string, unknown>) =>
    couchRequest<{ ok: boolean; id: string; rev: string }>(
      `/doc/${encodeURIComponent(dbName)}/${encodeURIComponent(docId)}`,
      { method: 'PUT', body: JSON.stringify(doc) },
    ),

  hardDeleteDoc: (dbName: string, docId: string, rev: string) =>
    couchRequest<{ ok: boolean }>(
      `/doc-hard/${encodeURIComponent(dbName)}/${encodeURIComponent(docId)}?rev=${encodeURIComponent(rev)}`,
      { method: 'POST' },
    ),

  bulkDelete: (dbName: string, docs: { _id: string; _rev: string }[]) =>
    couchRequest<{ ok: boolean; results: unknown[] }>(
      `/db/${encodeURIComponent(dbName)}/bulk-delete`,
      { method: 'POST', body: JSON.stringify({ docs }) },
    ),
};
