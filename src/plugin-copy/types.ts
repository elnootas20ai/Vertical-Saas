export type AgentType = 'conversation' | 'cursor' | 'terminal';
export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  cwd: string;
  model: string | null;
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  pid: number | null;
}

export interface AgentCategory {
  id: string;
  name: string;
  order: number;
}

export interface AgentCreatePayload {
  name: string;
  cwd?: string;
  type?: AgentType;
  model?: string;
  prompt?: string;
}

export interface AgentUpdatePayload {
  name?: string;
  status?: AgentStatus;
  category?: string;
  order?: number;
  model?: string;
}

export type QueueItemStatus = 'pending' | 'processing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  agentId: string;
  message: string;
  priority: 'normal' | 'high';
  status: QueueItemStatus;
  createdAt: string;
  finishedAt?: string;
}

export interface ToolCallInfo {
  type: 'read' | 'edit' | 'shell' | 'grep' | 'list' | 'tool';
  path?: string;
  command?: string;
  pattern?: string;
  done: boolean;
}

export interface ElementReference {
  jsPath: string;
  cssSelector: string;
  suggestedFiles: string[];
  componentName: string | null;
  tag: string;
  displayLabel: string;
  fullInfo: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  files?: string[];
  elementRefs?: ElementReference[];
  createdAt: string;
}

export interface CursorCliStatus {
  available: boolean;
  path: string | null;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  messageIndex: number;
  messageId: string;
  userMessage: string;
  messageCount: number;
  createdAt: string;
  isCurrent: boolean;
}

export interface ComponentCategory {
  id: string;
  name: string;
  order: number;
}

export interface SavedComponent {
  id: string;
  name: string;
  fileName: string;
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComponentVersion {
  id: string;
  componentId: string;
  file: string;
  hash: string;
  source: 'auto' | 'pre-restore' | 'manual';
  size: number;
  createdAt: string;
  content?: string;
}

// ── Kanban ──

export type KanbanStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type KanbanPriority = 'low' | 'medium' | 'high' | 'critical';

export interface KanbanAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface KanbanComment {
  id: string;
  author: string;
  content: string;
  attachments: KanbanAttachment[];
  createdAt: string;
}

export interface KanbanTimeEntry {
  id: string;
  userId: string;
  userName: string;
  hours: number;
  description: string;
  date: string;
  createdAt: string;
}

export interface KanbanHistoryEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  createdAt: string;
}

export interface KanbanTicket {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  assignee?: string;
  assigneeAvatar?: string;
  group: string;
  subgroup: string;
  tags: string[];
  attachments: KanbanAttachment[];
  comments: KanbanComment[];
  timelog: KanbanTimeEntry[];
  history: KanbanHistoryEntry[];
  startDate?: string;
  endDate?: string;
  aiPrompt?: string;
  aiPrePrompt?: string;
  aiStudy?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanTeamMember {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  email?: string;
}

export interface KanbanFilter {
  search?: string;
  status?: KanbanStatus[];
  priority?: KanbanPriority[];
  assignee?: string[];
  group?: string;
  subgroup?: string;
  tags?: string[];
}

export type KanbanSortBy = 'order' | 'priority' | 'created' | 'updated' | 'group' | 'subgroup';
export type KanbanGroupBy = 'none' | 'group' | 'subgroup' | 'assignee' | 'priority';

export interface KanbanSavedView {
  id: string;
  name: string;
  filter: KanbanFilter;
  sortBy: KanbanSortBy;
  groupBy: KanbanGroupBy;
  boardMode?: string;
  createdAt: string;
  updatedAt: string;
}
