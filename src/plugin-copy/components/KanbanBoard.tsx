import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Filter, GripVertical, Clock, MessageSquare,
  Paperclip, MoreHorizontal, Trash2, Pencil, ChevronDown,
  ChevronRight, Users, BarChart3, Sparkles, RotateCcw,
  ArrowUpDown, Tag, AlertCircle, X, Loader2, User,
  Image as ImageIcon, Send, Calendar, Eye,
  Columns3, Rows3, Table2, LayoutList,
  Download, Upload, Bot, Play,
  Bookmark, BookmarkCheck, Save, FolderOpen,
  Heading1, Heading2, Type, ListChecks, CheckSquare, Square, List,
  GanttChart, ChevronLeft, ZoomIn, ZoomOut, Check,
} from 'lucide-react';
import type {
  KanbanTicket, KanbanStatus, KanbanPriority,
  KanbanTeamMember, KanbanFilter, KanbanComment, KanbanTimeEntry,
  KanbanSavedView, KanbanSortBy, KanbanGroupBy,
} from '../types';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { agentApi } from '../lib/api';

const STATUSES: { key: KanbanStatus; color: string; bgLight: string; bgDark: string }[] = [
  { key: 'backlog', color: 'text-zinc-400', bgLight: 'bg-zinc-100', bgDark: 'bg-zinc-800/50' },
  { key: 'todo', color: 'text-blue-400', bgLight: 'bg-blue-50', bgDark: 'bg-blue-950/40' },
  { key: 'in_progress', color: 'text-amber-400', bgLight: 'bg-amber-50', bgDark: 'bg-amber-950/40' },
  { key: 'review', color: 'text-violet-400', bgLight: 'bg-violet-50', bgDark: 'bg-violet-950/40' },
  { key: 'done', color: 'text-emerald-400', bgLight: 'bg-emerald-50', bgDark: 'bg-emerald-950/40' },
];

const PRIORITIES: { key: KanbanPriority; label: string; color: string; dot: string }[] = [
  { key: 'critical', label: '🔴 Critical', color: 'text-red-400', dot: 'bg-red-500' },
  { key: 'high', label: '🟠 High', color: 'text-orange-400', dot: 'bg-orange-500' },
  { key: 'medium', label: '🟡 Medium', color: 'text-yellow-400', dot: 'bg-yellow-500' },
  { key: 'low', label: '🟢 Low', color: 'text-green-400', dot: 'bg-green-500' },
];

const STATUS_DOT: Record<KanbanStatus, string> = {
  backlog: 'bg-zinc-400',
  todo: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  review: 'bg-violet-400',
  done: 'bg-emerald-400',
};

type BoardMode = 'horizontal' | 'vertical' | 'table' | 'compact' | 'gantt';
type KanbanView = 'board' | 'team';

function calcAiReadiness(ticket: KanbanTicket): number {
  let score = 0;
  const title = ticket.title?.trim() || '';
  const desc = ticket.description?.trim() || '';
  if (title.length >= 5) score += 10;
  if (title.length >= 15) score += 5;
  if (desc.length >= 30) score += 10;
  if (desc.length >= 100) score += 15;
  if (desc.length >= 250) score += 10;
  if (ticket.priority && ticket.priority !== 'medium') score += 5;
  else if (ticket.priority) score += 3;
  if (ticket.group) score += 8;
  if (ticket.subgroup) score += 5;
  if (ticket.assignee) score += 5;
  if ((ticket.tags || []).length > 0) score += 7;
  if ((ticket.tags || []).length >= 3) score += 5;
  if ((ticket.comments || []).length > 0) score += 7;
  if ((ticket.attachments || []).length > 0) score += 5;
  return Math.min(score, 100);
}

function aiReadinessColor(score: number, isDark: boolean): { bar: string; text: string; glow: string } {
  if (score >= 75) return { bar: 'bg-emerald-500', text: isDark ? 'text-emerald-400' : 'text-emerald-600', glow: 'shadow-emerald-500/40' };
  if (score >= 50) return { bar: 'bg-violet-500', text: isDark ? 'text-violet-400' : 'text-violet-600', glow: 'shadow-violet-500/30' };
  if (score >= 25) return { bar: 'bg-amber-500', text: isDark ? 'text-amber-400' : 'text-amber-600', glow: 'shadow-amber-500/20' };
  return { bar: 'bg-zinc-500', text: isDark ? 'text-zinc-500' : 'text-gray-400', glow: '' };
}

function wasCompletedByAi(ticket: KanbanTicket): boolean {
  if (ticket.status !== 'done') return false;
  const hasAiComment = (ticket.comments || []).some((c) => c.author === 'AI Agent');
  const hasAiTimelog = (ticket.timelog || []).some((e) => e.userId === 'ai-agent');
  return hasAiComment || hasAiTimelog;
}

function AutoResizeTextarea({
  value, onChange, className, placeholder, onKeyDown,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={cn(className, 'resize-none overflow-hidden')}
      placeholder={placeholder}
      rows={1}
    />
  );
}

function RichDescription({ text, isDark, onToggleCheck }: {
  text: string;
  isDark: boolean;
  onToggleCheck?: (lineIndex: number) => void;
}) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('# ')) {
          return <p key={i} className={cn('text-[12px] font-bold', isDark ? 'text-zinc-100' : 'text-gray-900')}>{trimmed.slice(2)}</p>;
        }
        if (trimmed.startsWith('## ')) {
          return <p key={i} className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-300' : 'text-gray-700')}>{trimmed.slice(3)}</p>;
        }
        if (trimmed.startsWith('- [x] ')) {
          return (
            <label key={i} className={cn('flex items-start gap-1.5 cursor-pointer group', isDark ? 'text-zinc-500' : 'text-gray-400')} onClick={(e) => { e.stopPropagation(); onToggleCheck?.(i); }}>
              <CheckSquare className="size-3.5 mt-0.5 shrink-0 text-emerald-500" />
              <span className="text-[10px] line-through">{trimmed.slice(6)}</span>
            </label>
          );
        }
        if (trimmed.startsWith('- [ ] ')) {
          return (
            <label key={i} className={cn('flex items-start gap-1.5 cursor-pointer group', isDark ? 'text-zinc-300 hover:text-zinc-200' : 'text-gray-600 hover:text-gray-800')} onClick={(e) => { e.stopPropagation(); onToggleCheck?.(i); }}>
              <Square className="size-3.5 mt-0.5 shrink-0" />
              <span className="text-[10px]">{trimmed.slice(6)}</span>
            </label>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex items-start gap-1.5">
              <div className={cn('size-1 rounded-full mt-1.5 shrink-0', isDark ? 'bg-zinc-500' : 'bg-gray-400')} />
              <span className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-600')}>{trimmed.slice(2)}</span>
            </div>
          );
        }
        if (!trimmed) return <div key={i} className="h-1" />;
        return <p key={i} className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-600')}>{line}</p>;
      })}
    </div>
  );
}

function RichDescriptionEditor({ value, onChange, isDark, inputClass, placeholder }: {
  value: string;
  onChange: (val: string) => void;
  isDark: boolean;
  inputClass: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  const insertBlock = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const needsNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const newText = `${before}${needsNewline}${prefix}${selected}${after}`;
    onChange(newText);
    requestAnimationFrame(() => {
      const pos = before.length + needsNewline.length + prefix.length + selected.length;
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
    });
  };

  const btnClass = cn(
    'size-6 rounded flex items-center justify-center transition-colors',
    isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
  );

  return (
    <div className={cn('rounded-lg border overflow-hidden', isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-300 bg-white')}>
      <div className={cn('flex items-center gap-0.5 px-1.5 py-1 border-b', isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-gray-200 bg-gray-50')}>
        <button type="button" onClick={() => insertBlock('# ')} className={btnClass} title="Título">
          <Heading1 className="size-3" />
        </button>
        <button type="button" onClick={() => insertBlock('## ')} className={btnClass} title="Subtítulo">
          <Heading2 className="size-3" />
        </button>
        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-zinc-700' : 'bg-gray-200')} />
        <button type="button" onClick={() => insertBlock('- ')} className={btnClass} title="Lista">
          <List className="size-3" />
        </button>
        <button type="button" onClick={() => insertBlock('- [ ] ')} className={btnClass} title="Checklist">
          <ListChecks className="size-3" />
        </button>
        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-zinc-700' : 'bg-gray-200')} />
        <button type="button" onClick={() => insertBlock('')} className={btnClass} title="Texto">
          <Type className="size-3" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full px-2.5 py-2 text-[11px] outline-none resize-none overflow-hidden bg-transparent',
          isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-800 placeholder:text-gray-400',
        )}
        placeholder={placeholder || '# Título\n## Subtítulo\n- [ ] Tarea\nDescripción...'}
        rows={3}
      />
    </div>
  );
}

function TimeEntryRow({
  entry, ticketId, isDark, inputClass, onUpdate,
}: {
  entry: KanbanTimeEntry;
  ticketId: string;
  isDark: boolean;
  inputClass: string;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(String(entry.hours));
  const [desc, setDesc] = useState(entry.description || '');
  const [date, setDate] = useState(entry.date || '');

  const handleSave = async () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0) return;
    await agentApi.kanbanUpdateTimeEntry(ticketId, entry.id, {
      hours: h,
      description: desc,
      date,
    });
    setEditing(false);
    onUpdate();
  };

  const handleDelete = async () => {
    await agentApi.kanbanDeleteTimeEntry(ticketId, entry.id);
    onUpdate();
  };

  if (editing) {
    return (
      <div className={cn('rounded-lg border p-2 space-y-1.5', isDark ? 'border-violet-700/50 bg-zinc-900' : 'border-violet-200 bg-gray-50')}>
        <div className="flex gap-1.5">
          <input
            className={cn(inputClass, 'w-16')}
            type="number"
            step="0.5"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            autoFocus
          />
          <input
            className={cn(inputClass, 'w-24')}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <AutoResizeTextarea
          className={cn(inputClass, 'w-full')}
          placeholder="Descripción..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex gap-1.5">
          <button onClick={handleSave} className="px-2 py-1 rounded text-[10px] bg-violet-600 text-white">
            <Send className="size-3" />
          </button>
          <button onClick={() => { setEditing(false); setHours(String(entry.hours)); setDesc(entry.description || ''); setDate(entry.date || ''); }} className={cn('px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>
            <X className="size-3" />
          </button>
          <div className="flex-1" />
          <button onClick={handleDelete} className={cn('px-2 py-1 rounded text-[10px]', isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50')}>
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 border cursor-pointer transition-colors', isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-gray-50 border-gray-200 hover:border-gray-300')}
    >
      <Clock className={cn('size-3 mt-0.5 shrink-0', isDark ? 'text-amber-400' : 'text-amber-500')} />
      <span className={cn('text-[10px] font-mono font-bold shrink-0', isDark ? 'text-zinc-200' : 'text-gray-800')}>{entry.hours}h</span>
      <span className={cn('text-[10px] flex-1 whitespace-pre-wrap break-words', isDark ? 'text-zinc-400' : 'text-gray-600')}>{entry.description || entry.userName}</span>
      <span className={cn('text-[9px] shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')}>{entry.date}</span>
      <Pencil className={cn('size-3 shrink-0 opacity-0 group-hover:opacity-50', isDark ? 'text-zinc-500' : 'text-gray-400')} />
    </div>
  );
}

function escapeCSV(val: string) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function exportTicketsCSV(tickets: KanbanTicket[], t: (k: string) => string) {
  const headers = ['ID', 'Title', 'Description', 'Status', 'Priority', 'Assignee', 'Group', 'Subgroup', 'Tags', 'Created', 'Updated'];
  const rows = tickets.map((tk) => [
    tk.id, escapeCSV(tk.title), escapeCSV(tk.description || ''),
    tk.status, tk.priority, tk.assignee || '', tk.group || '', tk.subgroup || '',
    (tk.tags || []).join(';'), tk.createdAt || '', tk.updatedAt || '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kanban-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function handleImportCSV(
  setTickets: React.Dispatch<React.SetStateAction<KanbanTicket[]>>,
  loadData: () => void,
  setError: (e: string | null) => void,
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.xlsx,.xls';
  input.onchange = async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) { setError('CSV vacío o sin datos'); return; }
      const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
      const titleIdx = headers.findIndex((h) => h === 'title' || h === 'título' || h === 'titulo');
      if (titleIdx < 0) { setError('Columna "Title" no encontrada'); return; }
      const descIdx = headers.findIndex((h) => h === 'description' || h === 'descripción' || h === 'descripcion');
      const statusIdx = headers.findIndex((h) => h === 'status' || h === 'estado');
      const priorityIdx = headers.findIndex((h) => h === 'priority' || h === 'prioridad');
      const assigneeIdx = headers.findIndex((h) => h === 'assignee' || h === 'asignado');
      const groupIdx = headers.findIndex((h) => h === 'group' || h === 'grupo');
      const subgroupIdx = headers.findIndex((h) => h === 'subgroup' || h === 'subgrupo');
      const tagsIdx = headers.findIndex((h) => h === 'tags' || h === 'etiquetas');

      const validStatuses = ['backlog', 'todo', 'in_progress', 'review', 'done'];
      const validPriorities = ['critical', 'high', 'medium', 'low'];

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const title = cols[titleIdx]?.trim();
        if (!title) continue;
        const data: Partial<KanbanTicket> = {
          title,
          description: descIdx >= 0 ? cols[descIdx]?.trim() || '' : '',
          status: statusIdx >= 0 && validStatuses.includes(cols[statusIdx]?.trim()) ? cols[statusIdx].trim() as KanbanStatus : 'backlog',
          priority: priorityIdx >= 0 && validPriorities.includes(cols[priorityIdx]?.trim()) ? cols[priorityIdx].trim() as KanbanPriority : 'medium',
          assignee: assigneeIdx >= 0 ? cols[assigneeIdx]?.trim() || '' : '',
          group: groupIdx >= 0 ? cols[groupIdx]?.trim() || '' : '',
          subgroup: subgroupIdx >= 0 ? cols[subgroupIdx]?.trim() || '' : '',
          tags: tagsIdx >= 0 ? (cols[tagsIdx] || '').split(';').map((s) => s.trim()).filter(Boolean) : [],
        };
        await agentApi.kanbanCreateTicket(data);
        imported++;
      }
      loadData();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error importando CSV');
    }
  };
  input.click();
}

interface KanbanBoardProps {
  onCreateAgent?: (name: string, type: string, cwd?: string, model?: string, prompt?: string) => Promise<unknown>;
  onGoToAgent?: (agentId: string) => void;
  initialTicketId?: string | null;
  onInitialTicketHandled?: () => void;
}

export function KanbanBoard({ onCreateAgent, onGoToAgent, initialTicketId, onInitialTicketHandled }: KanbanBoardProps) {
  const { isDark, t } = usePluginSettings();
  const [tickets, setTickets] = useState<KanbanTicket[]>([]);
  const [members, setMembers] = useState<KanbanTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<KanbanView>('board');
  const [boardMode, setBoardMode] = useState<BoardMode>('horizontal');
  const [filter, setFilter] = useState<KanbanFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<KanbanSortBy>('order');
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>('none');
  const [selectedTicket, setSelectedTicket] = useState<KanbanTicket | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragTicketId, setDragTicketId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [savedViews, setSavedViews] = useState<KanbanSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [viewNameInput, setViewNameInput] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [agentRunningTickets, setAgentRunningTickets] = useState<Record<string, string>>({});
  const agentWatcherCleanups = useRef<Record<string, () => void>>({});

  const loadData = useCallback(async () => {
    try {
      const [ticketRes, memberRes, viewsRes] = await Promise.all([
        agentApi.kanbanGetTickets(),
        agentApi.kanbanGetMembers(),
        agentApi.kanbanGetViews(),
      ]);
      setTickets(ticketRes.tickets);
      setMembers(memberRes.members);
      if (Array.isArray(viewsRes)) setSavedViews(viewsRes);
    } catch (err) {
      console.error('[kanban] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (initialTicketId && tickets.length > 0) {
      const ticket = tickets.find((t) => t.id === initialTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        onInitialTicketHandled?.();
      }
    }
  }, [initialTicketId, tickets, onInitialTicketHandled]);

  const filteredTickets = useMemo(() => {
    let result = [...tickets];
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags?.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (filter.status?.length) result = result.filter((t) => filter.status!.includes(t.status));
    if (filter.priority?.length) result = result.filter((t) => filter.priority!.includes(t.priority));
    if (filter.assignee?.length) result = result.filter((t) => t.assignee && filter.assignee!.includes(t.assignee));
    if (filter.group) result = result.filter((t) => t.group === filter.group);
    if (filter.subgroup) result = result.filter((t) => t.subgroup === filter.subgroup);
    if (filter.tags?.length) result = result.filter((t) => t.tags?.some((tag) => filter.tags!.includes(tag)));

    result.sort((a, b) => {
      if (sortBy === 'priority') {
        const pi = ['critical', 'high', 'medium', 'low'];
        return pi.indexOf(a.priority) - pi.indexOf(b.priority);
      }
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'updated') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'group') return (a.group || '').localeCompare(b.group || '') || (a.subgroup || '').localeCompare(b.subgroup || '');
      if (sortBy === 'subgroup') return (a.subgroup || '').localeCompare(b.subgroup || '') || (a.group || '').localeCompare(b.group || '');
      return (a.order || 0) - (b.order || 0);
    });
    return result;
  }, [tickets, filter, sortBy]);

  const groupedTickets = useMemo(() => {
    if (groupBy === 'none') return null;
    const map: Record<string, KanbanTicket[]> = {};
    for (const tk of filteredTickets) {
      let key = '';
      if (groupBy === 'group') key = tk.group || t('kanbanNoGroup');
      else if (groupBy === 'subgroup') key = tk.subgroup || t('kanbanNoSubgroup');
      else if (groupBy === 'assignee') key = tk.assignee || t('kanbanUnassigned');
      else if (groupBy === 'priority') key = tk.priority;
      if (!map[key]) map[key] = [];
      map[key].push(tk);
    }
    return map;
  }, [filteredTickets, groupBy, t]);

  const groups = useMemo(() => {
    const g = new Set<string>();
    const sg = new Set<string>();
    tickets.forEach((t) => { if (t.group) g.add(t.group); if (t.subgroup) sg.add(t.subgroup); });
    return { groups: Array.from(g), subgroups: Array.from(sg) };
  }, [tickets]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    tickets.forEach((t) => t.tags?.forEach((tag) => s.add(tag)));
    return Array.from(s);
  }, [tickets]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false);
        setShowSaveView(false);
      }
    };
    if (showViewMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showViewMenu]);

  const handleSaveView = async () => {
    const name = viewNameInput.trim();
    if (!name) return;
    try {
      const v = await agentApi.kanbanCreateView({ name, filter, sortBy, groupBy, boardMode });
      setSavedViews((prev) => [...prev, v]);
      setActiveViewId(v.id);
      setViewNameInput('');
      setShowSaveView(false);
    } catch { /* ignore */ }
  };

  const handleLoadView = (v: KanbanSavedView) => {
    setFilter(v.filter || {});
    setSortBy((v.sortBy as KanbanSortBy) || 'order');
    setGroupBy((v.groupBy as KanbanGroupBy) || 'none');
    if (v.boardMode) setBoardMode(v.boardMode as BoardMode);
    setActiveViewId(v.id);
    setShowViewMenu(false);
  };

  const handleDeleteView = async (id: string) => {
    try {
      await agentApi.kanbanDeleteView(id);
      setSavedViews((prev) => prev.filter((v) => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
    } catch { /* ignore */ }
  };

  const handleDragStart = (ticketId: string) => setDragTicketId(ticketId);
  const handleDragOver = (e: React.DragEvent, status: KanbanStatus) => {
    e.preventDefault();
    setDragOverCol(status);
  };
  const handleDragLeave = () => setDragOverCol(null);
  const handleDrop = async (status: KanbanStatus) => {
    if (!dragTicketId) return;
    setDragOverCol(null);
    const colTickets = filteredTickets.filter((t) => t.status === status);
    const order = colTickets.length > 0 ? Math.max(...colTickets.map((t) => t.order)) + 1 : 0;
    try {
      const updated = await agentApi.kanbanMoveTicket(dragTicketId, status, order);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch { /* ignore */ }
    setDragTicketId(null);
  };

  const handleDeleteTicket = async (id: string) => {
    try {
      await agentApi.kanbanDeleteTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
      if (selectedTicket?.id === id) setSelectedTicket(null);
    } catch { /* ignore */ }
  };

  const handleCreateTicket = async (data: Partial<KanbanTicket>) => {
    try {
      const ticket = await agentApi.kanbanCreateTicket(data);
      setTickets((prev) => [...prev, ticket]);
      setShowCreate(false);
    } catch { /* ignore */ }
  };

  const handleUpdateTicket = async (id: string, changes: Partial<KanbanTicket>) => {
    try {
      const updated = await agentApi.kanbanUpdateTicket(id, changes);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (selectedTicket?.id === id) setSelectedTicket(updated);
    } catch { /* ignore */ }
  };

  const handleAgentStarted = useCallback((ticketId: string, agentId: string) => {
    setAgentRunningTickets((prev) => ({ ...prev, [ticketId]: agentId }));

    const ticketTitle = tickets.find((t) => t.id === ticketId)?.title || ticketId;
    window.dispatchEvent(new CustomEvent('kanban:agent-linked', {
      detail: { agentId, ticketId, ticketTitle },
    }));

    const cleanup = agentApi.watchChat(agentId, async (event) => {
      if (event.type === 'message_done' || event.type === 'message_error') {
        try {
          await agentApi.kanbanAddComment(ticketId, {
            author: 'AI Agent',
            content: event.type === 'message_done'
              ? 'El agente ha terminado de implementar este ticket. Movido a revisión.'
              : 'El agente encontró un error durante la implementación. Revisa los detalles.',
          });
          const targetStatus: KanbanStatus = event.type === 'message_done' ? 'review' : 'review';
          const updated = await agentApi.kanbanUpdateTicket(ticketId, { status: targetStatus });
          setTickets((prev) => prev.map((tk) => (tk.id === updated.id ? updated : tk)));
          setSelectedTicket((prev) => prev?.id === ticketId ? updated : prev);
        } catch { /* ignore */ }
        cleanup();
        delete agentWatcherCleanups.current[ticketId];
        setAgentRunningTickets((prev) => {
          const next = { ...prev };
          delete next[ticketId];
          return next;
        });
      }
    });

    agentWatcherCleanups.current[ticketId] = cleanup;
  }, []);

  useEffect(() => {
    return () => {
      Object.values(agentWatcherCleanups.current).forEach((fn) => fn());
      agentWatcherCleanups.current = {};
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-violet-400" />
      </div>
    );
  }

  const VIEW_MODES: { k: BoardMode; icon: React.ReactNode; tip: string }[] = [
    { k: 'horizontal', icon: <Columns3 className="size-3" />, tip: t('kanbanViewHorizontal') },
    { k: 'vertical', icon: <Rows3 className="size-3" />, tip: t('kanbanViewVertical') },
    { k: 'table', icon: <Table2 className="size-3" />, tip: t('kanbanViewTable') },
    { k: 'compact', icon: <LayoutList className="size-3" />, tip: t('kanbanViewCompact') },
    { k: 'gantt', icon: <GanttChart className="size-3" />, tip: t('kanbanViewGantt') },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar — view mode tabs */}
      <div className={cn(
        'flex items-center gap-0.5 px-2 py-1 border-b shrink-0',
        isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50/80',
      )}>
        {/* Board / Team toggle */}
        <button
          onClick={() => setView('board')}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
            view === 'board'
              ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-600'
              : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <BarChart3 className="size-3" />
          {t('kanbanBoard')}
        </button>
        <button
          onClick={() => setView('team')}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
            view === 'team'
              ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-600'
              : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <Users className="size-3" />
          {t('kanbanTeam')}
        </button>

        {/* Saved views dropdown */}
        <div className="relative ml-1" ref={viewMenuRef}>
          <button
            onClick={() => setShowViewMenu(!showViewMenu)}
            className={cn(
              'flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors',
              activeViewId
                ? isDark ? 'bg-amber-600/20 text-amber-300' : 'bg-amber-100 text-amber-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
            )}
            title={t('kanbanViews')}
          >
            {activeViewId ? <BookmarkCheck className="size-3" /> : <Bookmark className="size-3" />}
            <span className="max-w-[60px] truncate">
              {activeViewId ? savedViews.find((v) => v.id === activeViewId)?.name || t('kanbanViews') : t('kanbanViews')}
            </span>
            <ChevronDown className="size-2.5" />
          </button>

          {showViewMenu && (
            <div className={cn(
              'absolute top-full left-0 mt-1 w-52 rounded-lg border shadow-lg z-50 overflow-hidden',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}>
              {/* Save current state as new view */}
              {!showSaveView ? (
                <button
                  onClick={() => setShowSaveView(true)}
                  className={cn('w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium border-b', isDark ? 'border-zinc-800 text-violet-400 hover:bg-zinc-800' : 'border-gray-100 text-violet-600 hover:bg-gray-50')}
                >
                  <Save className="size-3" /> {t('kanbanSaveCurrentView')}
                </button>
              ) : (
                <div className={cn('flex items-center gap-1 px-2 py-1.5 border-b', isDark ? 'border-zinc-800' : 'border-gray-100')}>
                  <input
                    autoFocus
                    className={cn('flex-1 text-[10px] px-1.5 py-1 rounded border outline-none', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-300 text-gray-800')}
                    placeholder={t('kanbanViewName')}
                    value={viewNameInput}
                    onChange={(e) => setViewNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') setShowSaveView(false); }}
                  />
                  <button onClick={handleSaveView} disabled={!viewNameInput.trim()} className="px-1.5 py-1 rounded text-[10px] bg-violet-600 text-white disabled:opacity-50">
                    <Save className="size-3" />
                  </button>
                </div>
              )}

              {/* Clear active view */}
              {activeViewId && (
                <button
                  onClick={() => { setActiveViewId(null); setShowViewMenu(false); }}
                  className={cn('w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] border-b', isDark ? 'border-zinc-800 text-zinc-400 hover:bg-zinc-800' : 'border-gray-100 text-gray-500 hover:bg-gray-50')}
                >
                  <X className="size-3" /> {t('kanbanClearView')}
                </button>
              )}

              {/* List saved views */}
              <div className="max-h-40 overflow-y-auto">
                {savedViews.length === 0 && (
                  <p className={cn('text-[10px] text-center py-3', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('kanbanNoViews')}</p>
                )}
                {savedViews.map((v) => (
                  <div key={v.id} className={cn('flex items-center group', isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-50')}>
                    <button
                      onClick={() => handleLoadView(v)}
                      className={cn(
                        'flex-1 flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-left min-w-0',
                        v.id === activeViewId
                          ? isDark ? 'text-amber-300 font-medium' : 'text-amber-700 font-medium'
                          : isDark ? 'text-zinc-300' : 'text-gray-700',
                      )}
                    >
                      <FolderOpen className="size-3 shrink-0" />
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteView(v.id); }}
                      className={cn('size-5 mr-1 rounded items-center justify-center opacity-0 group-hover:opacity-100 flex', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Board mode switcher (only when view=board) */}
        {view === 'board' && (
          <div className={cn('flex items-center gap-0.5 rounded-md p-0.5', isDark ? 'bg-zinc-800' : 'bg-gray-100')}>
            {VIEW_MODES.map(({ k, icon, tip }) => (
              <button
                key={k}
                onClick={() => setBoardMode(k)}
                title={tip}
                className={cn(
                  'size-6 rounded flex items-center justify-center transition-colors',
                  boardMode === k
                    ? isDark ? 'bg-zinc-700 text-violet-300 shadow-sm' : 'bg-white text-violet-600 shadow-sm'
                    : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar — search, filter, sort, create */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0',
        isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-gray-200 bg-gray-50',
      )}>
        {/* Search */}
        <div className="relative flex-1">
          <Search className={cn('absolute left-1.5 top-1/2 -translate-y-1/2 size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            className={cn(
              'w-full pl-6 pr-2 py-1 text-[10px] rounded border outline-none',
              isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-gray-300 text-gray-800 placeholder:text-gray-400',
            )}
            placeholder={t('kanbanSearch')}
            value={filter.search || ''}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'size-6 rounded flex items-center justify-center transition-colors',
            showFilters
              ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-600'
              : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
          )}
          title={t('kanbanFilter')}
        >
          <Filter className="size-3" />
        </button>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as KanbanSortBy); setActiveViewId(null); }}
          className={cn(
            'text-[10px] px-1 py-1 rounded border outline-none',
            isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-300 text-gray-600',
          )}
        >
          <option value="order">Manual</option>
          <option value="priority">{t('kanbanPriority')}</option>
          <option value="created">{t('kanbanCreated')}</option>
          <option value="updated">{t('kanbanUpdated')}</option>
          <option value="group">{t('kanbanGroup')}</option>
          <option value="subgroup">{t('kanbanSubgroup')}</option>
        </select>

        {/* Group by */}
        <select
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as KanbanGroupBy); setActiveViewId(null); }}
          className={cn(
            'text-[10px] px-1 py-1 rounded border outline-none',
            groupBy !== 'none'
              ? isDark ? 'bg-violet-600/20 border-violet-700/50 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-600'
              : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-300 text-gray-600',
          )}
        >
          <option value="none">{t('kanbanGroupByNone')}</option>
          <option value="group">{t('kanbanGroupByGroup')}</option>
          <option value="subgroup">{t('kanbanGroupBySubgroup')}</option>
          <option value="assignee">{t('kanbanGroupByAssignee')}</option>
          <option value="priority">{t('kanbanGroupByPriority')}</option>
        </select>

        {/* Export */}
        <button
          onClick={() => exportTicketsCSV(tickets, t)}
          className={cn(
            'size-6 rounded flex items-center justify-center transition-colors',
            isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
          )}
          title={t('kanbanExport')}
        >
          <Download className="size-3" />
        </button>

        {/* Import */}
        <button
          onClick={() => handleImportCSV(setTickets, loadData, setImportError)}
          className={cn(
            'size-6 rounded flex items-center justify-center transition-colors',
            isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
          )}
          title={t('kanbanImport')}
        >
          <Upload className="size-3" />
        </button>

        {/* Create */}
        <button
          onClick={() => setShowCreate(true)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
            isDark ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
          )}
        >
          <Plus className="size-3" />
          {t('kanbanNew')}
        </button>
      </div>

      {/* Filter bar (expandable) */}
      {showFilters && (
        <FilterBar
          filter={filter}
          setFilter={setFilter}
          groups={groups}
          allTags={allTags}
          members={members}
          isDark={isDark}
          t={t}
        />
      )}

      {/* Main content area */}
      {view === 'board' ? (
        groupedTickets ? (
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {Object.entries(groupedTickets).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, gTickets]) => (
              <div key={groupName}>
                <div className={cn('flex items-center gap-1.5 px-1 py-1 mb-1', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                  <Tag className="size-3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{groupName}</span>
                  <span className={cn('text-[9px] px-1.5 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400')}>{gTickets.length}</span>
                </div>
                {boardMode === 'table' ? (
                  <TableView tickets={gTickets} isDark={isDark} t={t} onSelect={setSelectedTicket} onDelete={handleDeleteTicket} />
                ) : boardMode === 'compact' ? (
                  <CompactView tickets={gTickets} isDark={isDark} t={t} onSelect={setSelectedTicket} onDelete={handleDeleteTicket} />
                ) : boardMode === 'gantt' ? (
                  <GanttView tickets={gTickets} isDark={isDark} t={t} onSelect={setSelectedTicket} onUpdate={handleUpdateTicket} />
                ) : (
                  <div className="space-y-1">
                    {gTickets.map((tk) => (
                      <TicketCard key={tk.id} ticket={tk} isDark={isDark} onSelect={() => setSelectedTicket(tk)} onDelete={() => handleDeleteTicket(tk.id)} agentWorking={!!agentRunningTickets[tk.id]} agentId={agentRunningTickets[tk.id]} onGoToAgent={onGoToAgent} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : boardMode === 'horizontal' ? (
          <HorizontalBoard
            tickets={filteredTickets}
            isDark={isDark}
            t={t}
            dragTicketId={dragTicketId}
            dragOverCol={dragOverCol}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onSelect={setSelectedTicket}
            onDelete={handleDeleteTicket}
            agentRunningTickets={agentRunningTickets}
            onGoToAgent={onGoToAgent}
          />
        ) : boardMode === 'vertical' ? (
          <VerticalBoard
            tickets={filteredTickets}
            isDark={isDark}
            t={t}
            dragTicketId={dragTicketId}
            dragOverCol={dragOverCol}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onSelect={setSelectedTicket}
            onDelete={handleDeleteTicket}
            agentRunningTickets={agentRunningTickets}
            onGoToAgent={onGoToAgent}
          />
        ) : boardMode === 'table' ? (
          <TableView
            tickets={filteredTickets}
            isDark={isDark}
            t={t}
            onSelect={setSelectedTicket}
            onDelete={handleDeleteTicket}
          />
        ) : boardMode === 'gantt' ? (
          <GanttView
            tickets={filteredTickets}
            isDark={isDark}
            t={t}
            onSelect={setSelectedTicket}
            onUpdate={handleUpdateTicket}
          />
        ) : (
          <CompactView
            tickets={filteredTickets}
            isDark={isDark}
            t={t}
            onSelect={setSelectedTicket}
            onDelete={handleDeleteTicket}
          />
        )
      ) : (
        <TeamView
          members={members}
          tickets={tickets}
          isDark={isDark}
          t={t}
          onRefresh={loadData}
        />
      )}

      {/* Import error toast */}
      {importError && (
        <div className={cn('absolute bottom-2 left-2 right-2 z-50 flex items-center gap-2 rounded-lg px-3 py-2', isDark ? 'bg-red-950/90 border border-red-900/60' : 'bg-red-50 border border-red-200')}>
          <AlertCircle className="size-3 text-red-400 shrink-0" />
          <p className={cn('text-[10px] flex-1', isDark ? 'text-red-300' : 'text-red-600')}>{importError}</p>
          <button onClick={() => setImportError(null)} className="text-red-400 text-xs">&times;</button>
        </div>
      )}

      {/* Overlays */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          members={members}
          isDark={isDark}
          t={t}
          onClose={() => setSelectedTicket(null)}
          onUpdate={(changes) => handleUpdateTicket(selectedTicket.id, changes)}
          onDelete={() => handleDeleteTicket(selectedTicket.id)}
          onCreateAgent={onCreateAgent}
          agentRunning={!!agentRunningTickets[selectedTicket.id]}
          agentId={agentRunningTickets[selectedTicket.id]}
          onAgentStarted={handleAgentStarted}
          onGoToAgent={onGoToAgent}
        />
      )}
      {showCreate && (
        <CreateTicketDialog
          isDark={isDark}
          t={t}
          members={members}
          groups={groups}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateTicket}
        />
      )}
    </div>
  );
}

// ── Board Views ──

interface BoardViewProps {
  tickets: KanbanTicket[];
  isDark: boolean;
  t: (key: string) => string;
  dragTicketId: string | null;
  dragOverCol: KanbanStatus | null;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, status: KanbanStatus) => void;
  onDragLeave: () => void;
  onDrop: (status: KanbanStatus) => void;
  onSelect: (ticket: KanbanTicket) => void;
  onDelete: (id: string) => void;
  agentRunningTickets?: Record<string, string>;
  onGoToAgent?: (agentId: string) => void;
}

function HorizontalBoard({ tickets, isDark, t, dragTicketId, dragOverCol, onDragStart, onDragOver, onDragLeave, onDrop, onSelect, onDelete, agentRunningTickets, onGoToAgent }: BoardViewProps) {
  return (
    <div className="flex-1 flex overflow-x-auto overflow-y-hidden min-h-0">
      {STATUSES.map((col) => {
        const colTickets = tickets.filter((tt) => tt.status === col.key);
        return (
          <div
            key={col.key}
            className={cn(
              'flex flex-col min-w-[200px] w-[200px] border-r last:border-r-0 shrink-0',
              isDark ? 'border-zinc-800' : 'border-gray-200',
              dragOverCol === col.key && (isDark ? 'bg-zinc-800/30' : 'bg-blue-50/50'),
            )}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={onDragLeave}
            onDrop={() => onDrop(col.key)}
          >
            <div className={cn('flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
              <div className={cn('size-2 rounded-full', STATUS_DOT[col.key])} />
              <span className={cn('text-[10px] font-semibold uppercase tracking-wide', col.color)}>{t(`kanbanStatus_${col.key}`)}</span>
              <span className={cn('text-[9px] px-1 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500')}>{colTickets.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
              {colTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} isDark={isDark} onSelect={() => onSelect(ticket)} onDelete={() => onDelete(ticket.id)} onDragStart={() => onDragStart(ticket.id)} dragging={dragTicketId === ticket.id} agentWorking={!!agentRunningTickets?.[ticket.id]} agentId={agentRunningTickets?.[ticket.id]} onGoToAgent={onGoToAgent} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerticalBoard({ tickets, isDark, t, dragTicketId, dragOverCol, onDragStart, onDragOver, onDragLeave, onDrop, onSelect, onDelete, agentRunningTickets, onGoToAgent }: BoardViewProps) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {STATUSES.map((col) => {
        const colTickets = tickets.filter((tt) => tt.status === col.key);
        return (
          <div
            key={col.key}
            className={cn(
              'border-b',
              isDark ? 'border-zinc-800' : 'border-gray-200',
              dragOverCol === col.key && (isDark ? 'bg-zinc-800/20' : 'bg-blue-50/30'),
            )}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={onDragLeave}
            onDrop={() => onDrop(col.key)}
          >
            <div className={cn('flex items-center gap-1.5 px-2 py-1 sticky top-0 z-10', isDark ? 'bg-zinc-900/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
              <div className={cn('size-2 rounded-full', STATUS_DOT[col.key])} />
              <span className={cn('text-[10px] font-semibold uppercase tracking-wide', col.color)}>{t(`kanbanStatus_${col.key}`)}</span>
              <span className={cn('text-[9px] px-1 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500')}>{colTickets.length}</span>
            </div>
            {colTickets.length > 0 && (
              <div className="px-1.5 pb-1.5 space-y-1">
                {colTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} isDark={isDark} onSelect={() => onSelect(ticket)} onDelete={() => onDelete(ticket.id)} onDragStart={() => onDragStart(ticket.id)} dragging={dragTicketId === ticket.id} agentWorking={!!agentRunningTickets?.[ticket.id]} agentId={agentRunningTickets?.[ticket.id]} onGoToAgent={onGoToAgent} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ tickets, isDark, t, onSelect, onDelete }: { tickets: KanbanTicket[]; isDark: boolean; t: (key: string) => string; onSelect: (t: KanbanTicket) => void; onDelete: (id: string) => void }) {
  const hdrCls = cn('text-[9px] font-semibold uppercase tracking-wide px-2 py-1.5 text-left', isDark ? 'text-zinc-500' : 'text-gray-500');
  const cellCls = cn('px-2 py-1.5 text-[10px]', isDark ? 'text-zinc-300' : 'text-gray-700');
  const rowCls = cn('border-b cursor-pointer transition-colors', isDark ? 'border-zinc-800/60 hover:bg-zinc-800/30' : 'border-gray-100 hover:bg-gray-50');

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <table className="w-full min-w-[500px]">
        <thead className={cn('sticky top-0 z-10', isDark ? 'bg-zinc-900' : 'bg-gray-50')}>
          <tr className={cn('border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
            <th className={hdrCls}>{t('kanbanTitle')}</th>
            <th className={cn(hdrCls, 'w-20')}>{t('kanbanStatus')}</th>
            <th className={cn(hdrCls, 'w-16')}>{t('kanbanPriority')}</th>
            <th className={cn(hdrCls, 'w-20')}>{t('kanbanAssignee')}</th>
            <th className={cn(hdrCls, 'w-16')}>{t('kanbanGroup')}</th>
            <th className={cn(hdrCls, 'w-8')} />
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const prio = PRIORITIES.find((p) => p.key === ticket.priority);
            return (
              <tr key={ticket.id} className={rowCls} onClick={() => onSelect(ticket)}>
                <td className={cellCls}>
                  <div className="flex items-center gap-1.5">
                    <div className={cn('size-1.5 rounded-full shrink-0', prio?.dot || 'bg-gray-400')} />
                    <span className="font-medium truncate max-w-[150px]">{ticket.title}</span>
                    {(ticket.comments?.length || 0) > 0 && <MessageSquare className={cn('size-2.5 shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')} />}
                    {(ticket.attachments?.length || 0) > 0 && <Paperclip className={cn('size-2.5 shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')} />}
                  </div>
                </td>
                <td className={cellCls}>
                  <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full', isDark ? 'bg-zinc-800' : 'bg-gray-100')}>
                    <span className={cn('size-1.5 rounded-full', STATUS_DOT[ticket.status])} />
                    {t(`kanbanStatus_${ticket.status}`)}
                  </span>
                </td>
                <td className={cellCls}>
                  <span className={cn('text-[9px]', prio?.color)}>{prio?.label.split(' ')[0]}</span>
                </td>
                <td className={cellCls}>
                  {ticket.assignee ? (
                    <span className="flex items-center gap-1">
                      <span className={cn('size-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0', isDark ? 'bg-violet-600/30 text-violet-300' : 'bg-violet-100 text-violet-600')}>
                        {ticket.assignee.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-[9px]">{ticket.assignee}</span>
                    </span>
                  ) : <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>—</span>}
                </td>
                <td className={cn(cellCls, 'text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>{ticket.group || '—'}</td>
                <td className={cellCls}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(ticket.id); }}
                    className={cn('size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100', isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50')}
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tickets.length === 0 && (
        <p className={cn('text-center py-8 text-[10px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
          {t('kanbanNoTickets')}
        </p>
      )}
    </div>
  );
}

function CompactView({ tickets, isDark, t, onSelect, onDelete }: { tickets: KanbanTicket[]; isDark: boolean; t: (key: string) => string; onSelect: (t: KanbanTicket) => void; onDelete: (id: string) => void }) {
  const grouped = useMemo(() => {
    const map: Record<KanbanStatus, KanbanTicket[]> = { backlog: [], todo: [], in_progress: [], review: [], done: [] };
    tickets.forEach((t) => map[t.status]?.push(t));
    return map;
  }, [tickets]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-1">
      {STATUSES.map((col) => {
        const items = grouped[col.key];
        if (!items.length) return null;
        return (
          <div key={col.key}>
            <div className="flex items-center gap-1 px-1 mb-0.5">
              <div className={cn('size-1.5 rounded-full', STATUS_DOT[col.key])} />
              <span className={cn('text-[9px] font-semibold uppercase tracking-wide', col.color)}>{t(`kanbanStatus_${col.key}`)}</span>
              <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{items.length}</span>
            </div>
            {items.map((ticket) => {
              const prio = PRIORITIES.find((p) => p.key === ticket.priority);
              return (
                <div
                  key={ticket.id}
                  onClick={() => onSelect(ticket)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer group transition-colors',
                    isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-gray-50',
                  )}
                >
                  <div className={cn('size-1.5 rounded-full shrink-0', prio?.dot || 'bg-gray-400')} />
                  <span className={cn('text-[10px] flex-1 truncate', isDark ? 'text-zinc-300' : 'text-gray-700')}>{ticket.title}</span>
                  {ticket.assignee && (
                    <span className={cn('size-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0', isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600')}>
                      {ticket.assignee.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {(ticket.comments?.length || 0) > 0 && (
                    <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{ticket.comments.length}<MessageSquare className="size-2 inline ml-0.5" /></span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(ticket.id); }}
                    className={cn('size-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity', isDark ? 'text-red-400' : 'text-red-500')}
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      {tickets.length === 0 && (
        <p className={cn('text-center py-8 text-[10px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('kanbanNoTickets')}</p>
      )}
    </div>
  );
}

// ── Gantt View ──

type GanttZoom = 'day' | 'week' | 'month';

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function GanttView({
  tickets, isDark, t, onSelect, onUpdate,
}: {
  tickets: KanbanTicket[];
  isDark: boolean;
  t: (key: string) => string;
  onSelect: (ticket: KanbanTicket) => void;
  onUpdate: (id: string, changes: Partial<KanbanTicket>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<GanttZoom>('day');
  const [editingDate, setEditingDate] = useState<{ id: string; field: 'startDate' | 'endDate'; x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{
    id: string; mode: 'move' | 'resize-start' | 'resize-end'; startX: number;
    origStart: string; origEnd: string;
  } | null>(null);

  const cellW = zoom === 'day' ? 32 : zoom === 'week' ? 22 : 16;
  const rowH = 32;
  const labelW = 140;

  const ganttTickets = useMemo(() => {
    const today = toDateStr(new Date());
    return tickets.map((tk) => ({
      ...tk,
      startDate: tk.startDate || today,
      endDate: tk.endDate || toDateStr(addDays(new Date(tk.startDate || today), 3)),
    }));
  }, [tickets]);

  const { timelineStart, totalDays, cols } = useMemo(() => {
    if (!ganttTickets.length) {
      const now = new Date();
      const start = addDays(now, -7);
      return { timelineStart: start, totalDays: 30, cols: buildCols(start, 30, zoom) };
    }
    const allDates = ganttTickets.flatMap((t) => [new Date(t.startDate), new Date(t.endDate)]);
    let minD = new Date(Math.min(...allDates.map((d) => d.getTime())));
    let maxD = new Date(Math.max(...allDates.map((d) => d.getTime())));
    minD = addDays(minD, -3);
    maxD = addDays(maxD, 7);
    const total = Math.max(daysBetween(minD, maxD), 14);
    return { timelineStart: minD, totalDays: total, cols: buildCols(minD, total, zoom) };
  }, [ganttTickets, zoom]);

  function buildCols(start: Date, total: number, z: GanttZoom) {
    const result: { label: string; subLabel: string; span: number; date: Date }[] = [];
    if (z === 'day') {
      for (let i = 0; i < total; i++) {
        const d = addDays(start, i);
        result.push({ label: d.getDate().toString(), subLabel: d.toLocaleDateString('es', { weekday: 'narrow' }), span: 1, date: d });
      }
    } else if (z === 'week') {
      for (let i = 0; i < total; i += 7) {
        const d = addDays(start, i);
        const span = Math.min(7, total - i);
        result.push({ label: `S${Math.ceil((i + 1) / 7)}`, subLabel: `${d.getDate()}/${d.getMonth() + 1}`, span, date: d });
      }
    } else {
      let cursor = new Date(start);
      while (daysBetween(start, cursor) < total) {
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const end = daysBetween(start, monthEnd) < total ? monthEnd : addDays(start, total);
        const span = daysBetween(cursor, end) + 1;
        result.push({ label: cursor.toLocaleDateString('es', { month: 'short' }), subLabel: cursor.getFullYear().toString(), span, date: new Date(cursor) });
        cursor = addDays(monthEnd, 1);
      }
    }
    return result;
  }

  const getBarStyle = useCallback((tk: { startDate: string; endDate: string }) => {
    const s = daysBetween(timelineStart, new Date(tk.startDate));
    const dur = Math.max(daysBetween(new Date(tk.startDate), new Date(tk.endDate)), 1);
    return { left: s * cellW, width: dur * cellW };
  }, [timelineStart, cellW]);

  const todayOffset = useMemo(() => {
    const d = daysBetween(timelineStart, new Date());
    return d >= 0 && d <= totalDays ? d * cellW : -1;
  }, [timelineStart, totalDays, cellW]);

  const handleBarMouseDown = useCallback((e: React.MouseEvent, tk: (typeof ganttTickets)[0], mode: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({ id: tk.id, mode, startX: e.clientX, origStart: tk.startDate, origEnd: tk.endDate });
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const dayDelta = Math.round(dx / cellW);
      if (dayDelta === 0) return;
      const origS = new Date(dragState.origStart);
      const origE = new Date(dragState.origEnd);
      let newStart: Date, newEnd: Date;
      if (dragState.mode === 'move') {
        newStart = addDays(origS, dayDelta);
        newEnd = addDays(origE, dayDelta);
      } else if (dragState.mode === 'resize-start') {
        newStart = addDays(origS, dayDelta);
        newEnd = origE;
        if (newStart >= newEnd) newStart = addDays(newEnd, -1);
      } else {
        newStart = origS;
        newEnd = addDays(origE, dayDelta);
        if (newEnd <= newStart) newEnd = addDays(newStart, 1);
      }
      onUpdate(dragState.id, { startDate: toDateStr(newStart), endDate: toDateStr(newEnd) });
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragState, cellW, onUpdate]);

  const handleDoubleClick = useCallback((e: React.MouseEvent, tkId: string, field: 'startDate' | 'endDate') => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setEditingDate({ id: tkId, field, x: rect.left, y: rect.bottom });
  }, []);

  const handleDateChange = useCallback((value: string) => {
    if (editingDate && value) {
      onUpdate(editingDate.id, { [editingDate.field]: value });
    }
    setEditingDate(null);
  }, [editingDate, onUpdate]);

  const STATUS_BAR_COLORS: Record<KanbanStatus, { bar: string; border: string }> = {
    backlog: { bar: isDark ? 'bg-zinc-600' : 'bg-zinc-300', border: isDark ? 'border-zinc-500' : 'border-zinc-400' },
    todo: { bar: isDark ? 'bg-blue-600/70' : 'bg-blue-400', border: isDark ? 'border-blue-500' : 'border-blue-500' },
    in_progress: { bar: isDark ? 'bg-amber-600/70' : 'bg-amber-400', border: isDark ? 'border-amber-500' : 'border-amber-500' },
    review: { bar: isDark ? 'bg-violet-600/70' : 'bg-violet-400', border: isDark ? 'border-violet-500' : 'border-violet-500' },
    done: { bar: isDark ? 'bg-emerald-600/70' : 'bg-emerald-400', border: isDark ? 'border-emerald-500' : 'border-emerald-500' },
  };

  const totalW = cols.reduce((s, c) => s + c.span * cellW, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Zoom toolbar */}
      <div className={cn('flex items-center gap-1 px-2 py-1 border-b shrink-0', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50/50')}>
        <span className={cn('text-[9px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('kanbanGanttZoom')}</span>
        {(['day', 'week', 'month'] as GanttZoom[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors',
              zoom === z
                ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-600'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            {t(`kanbanGantt_${z}`)}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => {
          if (containerRef.current && todayOffset >= 0) {
            containerRef.current.scrollLeft = todayOffset - containerRef.current.clientWidth / 2 + labelW;
          }
        }} className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium', isDark ? 'text-violet-400 hover:bg-zinc-800' : 'text-violet-600 hover:bg-gray-100')}>
          {t('kanbanGanttToday')}
        </button>
      </div>

      {/* Gantt grid */}
      <div ref={containerRef} className="flex-1 overflow-auto min-h-0" style={{ scrollBehavior: 'smooth' }}>
        <div className="inline-flex min-w-full" style={{ minWidth: labelW + totalW }}>
          {/* Left labels */}
          <div className={cn('shrink-0 sticky left-0 z-20', isDark ? 'bg-zinc-950' : 'bg-white')} style={{ width: labelW }}>
            {/* Header spacer */}
            <div className={cn('h-10 border-b border-r flex items-end px-2 pb-1', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
              <span className={cn('text-[9px] font-semibold uppercase tracking-wide', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('kanbanTitle')}</span>
            </div>
            {/* Ticket rows */}
            {ganttTickets.map((tk) => {
              const prio = PRIORITIES.find((p) => p.key === tk.priority);
              return (
                <div
                  key={tk.id}
                  onClick={() => onSelect(tk)}
                  className={cn('flex items-center gap-1.5 px-2 border-b border-r cursor-pointer transition-colors group', isDark ? 'border-zinc-800/60 hover:bg-zinc-800/30' : 'border-gray-100 hover:bg-gray-50')}
                  style={{ height: rowH }}
                >
                  <div className={cn('size-1.5 rounded-full shrink-0', prio?.dot || 'bg-gray-400')} />
                  <span className={cn('text-[10px] truncate flex-1 font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>{tk.title}</span>
                  {tk.assignee && (
                    <span className={cn('size-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0', isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-50 text-violet-600')}>
                      {tk.assignee.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right timeline */}
          <div className="flex-1" style={{ width: totalW }}>
            {/* Column headers */}
            <div className={cn('flex h-10 border-b sticky top-0 z-10', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
              {cols.map((col, ci) => {
                const w = col.span * cellW;
                const isToday = zoom === 'day' && toDateStr(col.date) === toDateStr(new Date());
                return (
                  <div key={ci} className={cn('shrink-0 flex flex-col items-center justify-end pb-0.5 border-r', isDark ? 'border-zinc-800/40' : 'border-gray-100')} style={{ width: w }}>
                    <span className={cn(
                      'text-[9px] font-semibold leading-none',
                      isToday ? 'text-violet-400' : isDark ? 'text-zinc-400' : 'text-gray-600',
                    )}>{col.label}</span>
                    <span className={cn(
                      'text-[7px] leading-none mt-0.5',
                      isToday ? 'text-violet-400' : isDark ? 'text-zinc-600' : 'text-gray-400',
                    )}>{col.subLabel}</span>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            <div className="relative">
              {/* Grid lines */}
              {cols.map((col, ci) => {
                const offset = cols.slice(0, ci).reduce((s, c) => s + c.span * cellW, 0);
                const isToday = zoom === 'day' && toDateStr(col.date) === toDateStr(new Date());
                return (
                  <div
                    key={ci}
                    className={cn(
                      'absolute top-0 border-r',
                      isToday ? (isDark ? 'border-violet-600/40' : 'border-violet-300/60') : (isDark ? 'border-zinc-800/30' : 'border-gray-100'),
                    )}
                    style={{ left: offset + col.span * cellW - 1, height: ganttTickets.length * rowH }}
                  />
                );
              })}

              {/* Today marker */}
              {todayOffset >= 0 && (
                <div
                  className={cn('absolute top-0 w-0.5 z-10', isDark ? 'bg-violet-500/60' : 'bg-violet-400/50')}
                  style={{ left: todayOffset + cellW / 2, height: ganttTickets.length * rowH }}
                />
              )}

              {/* Ticket bars */}
              {ganttTickets.map((tk, ri) => {
                const { left, width } = getBarStyle(tk);
                const barColors = STATUS_BAR_COLORS[tk.status];
                const pct = tk.status === 'done' ? 100 : tk.status === 'review' ? 75 : tk.status === 'in_progress' ? 50 : tk.status === 'todo' ? 10 : 0;
                return (
                  <div key={tk.id} className={cn('border-b', isDark ? 'border-zinc-800/20' : 'border-gray-50')} style={{ height: rowH }}>
                    <div
                      className={cn(
                        'absolute rounded-md border cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md group/bar',
                        barColors.bar, barColors.border,
                        dragState?.id === tk.id ? 'opacity-80 shadow-lg' : '',
                      )}
                      style={{ left, width: Math.max(width, cellW), top: ri * rowH + 6, height: rowH - 12 }}
                      onMouseDown={(e) => handleBarMouseDown(e, tk, 'move')}
                      onClick={(e) => { e.stopPropagation(); onSelect(tk); }}
                    >
                      {/* Resize handle left */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-white/20 rounded-l-md"
                        onMouseDown={(e) => handleBarMouseDown(e, tk, 'resize-start')}
                        onDoubleClick={(e) => handleDoubleClick(e, tk.id, 'startDate')}
                      />
                      {/* Bar content */}
                      <div className="flex items-center h-full px-2 overflow-hidden">
                        <span className={cn('text-[8px] font-medium truncate', isDark ? 'text-white/90' : 'text-white')}>{tk.title}</span>
                      </div>
                      {/* Progress fill */}
                      {pct > 0 && pct < 100 && (
                        <div
                          className="absolute top-0 left-0 bottom-0 rounded-l-md bg-white/15 pointer-events-none"
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      {/* Resize handle right */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-white/20 rounded-r-md"
                        onMouseDown={(e) => handleBarMouseDown(e, tk, 'resize-end')}
                        onDoubleClick={(e) => handleDoubleClick(e, tk.id, 'endDate')}
                      />
                      {/* Tooltip on hover */}
                      <div className={cn(
                        'absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[8px] whitespace-nowrap pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity z-30 shadow-md',
                        isDark ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' : 'bg-gray-800 text-white',
                      )}>
                        {tk.startDate} → {tk.endDate}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Date picker popup */}
      {editingDate && (
        <div className="fixed inset-0 z-[100]" onClick={() => setEditingDate(null)}>
          <div
            className={cn('absolute rounded-lg border shadow-lg p-2', isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200')}
            style={{ left: Math.min(editingDate.x, window.innerWidth - 200), top: editingDate.y + 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <label className={cn('text-[9px] font-medium block mb-1', isDark ? 'text-zinc-400' : 'text-gray-500')}>
              {editingDate.field === 'startDate' ? t('kanbanGanttStart') : t('kanbanGanttEnd')}
            </label>
            <input
              type="date"
              autoFocus
              className={cn(
                'text-[11px] px-2 py-1 rounded border outline-none w-40',
                isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-300 text-gray-800',
              )}
              defaultValue={(() => {
                const tk = ganttTickets.find((t) => t.id === editingDate.id);
                return tk ? tk[editingDate.field] : '';
              })()}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {ganttTickets.length === 0 && (
        <div className={cn('flex-1 flex items-center justify-center', isDark ? 'text-zinc-600' : 'text-gray-400')}>
          <p className="text-[10px]">{t('kanbanNoTickets')}</p>
        </div>
      )}
    </div>
  );
}

// ── Ticket Card ──

function TicketCard({
  ticket, isDark, onSelect, onDelete, onDragStart, dragging, agentWorking, agentId, onGoToAgent,
}: {
  ticket: KanbanTicket;
  isDark: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  dragging?: boolean;
  agentWorking?: boolean;
  agentId?: string;
  onGoToAgent?: (agentId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const prio = PRIORITIES.find((p) => p.key === ticket.priority);
  const aiScore = calcAiReadiness(ticket);
  const aiColors = aiReadinessColor(aiScore, isDark);
  const doneByAi = wasCompletedByAi(ticket);

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={cn(
        'group rounded-lg border p-2 cursor-pointer transition-all relative overflow-hidden',
        dragging ? 'opacity-40 scale-95' : 'hover:shadow-md',
        agentWorking
          ? isDark ? 'bg-violet-950/30 border-violet-600/50 shadow-violet-900/20 shadow-md' : 'bg-violet-50/60 border-violet-300 shadow-violet-200/40 shadow-md'
          : doneByAi
            ? isDark ? 'bg-emerald-950/20 border-emerald-800/40 hover:border-emerald-700/60' : 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300'
            : isDark ? 'bg-zinc-900 border-zinc-700/50 hover:border-zinc-600' : 'bg-white border-gray-200 hover:border-gray-300',
      )}
    >
      {agentWorking && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden">
          <div className={cn('h-full w-1/3 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]', isDark ? 'bg-violet-500' : 'bg-violet-400')}
            style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
          <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
        </div>
      )}
      <div className="flex items-start gap-1.5">
        <GripVertical className={cn('size-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-50 cursor-grab', isDark ? 'text-zinc-500' : 'text-gray-400')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <div className={cn('size-1.5 rounded-full shrink-0', prio?.dot || 'bg-gray-400')} />
            <p className={cn('text-[11px] font-medium truncate flex-1', isDark ? 'text-zinc-200' : 'text-gray-800')}>
              {ticket.title}
            </p>
            {agentWorking && (
              <button
                onClick={(e) => { e.stopPropagation(); if (agentId && onGoToAgent) onGoToAgent(agentId); }}
                className={cn(
                  'flex items-center gap-0.5 text-[7px] font-bold px-1.5 py-0.5 rounded transition-colors',
                  isDark ? 'bg-violet-600/40 text-violet-300 hover:bg-violet-600/60' : 'bg-violet-200 text-violet-700 hover:bg-violet-300',
                  agentId && onGoToAgent ? 'cursor-pointer' : 'cursor-default',
                )}
                title={agentId && onGoToAgent ? 'Ir al agente' : undefined}
              >
                <Loader2 className="size-2.5 animate-spin" />
                Creando con IA
                {agentId && onGoToAgent && <span className="ml-0.5">→</span>}
              </button>
            )}
            {doneByAi && !agentWorking && (
              <span className={cn('flex items-center gap-0.5 text-[7px] font-bold px-1 py-0.5 rounded', isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-600')}>
                <Bot className="size-2.5" /> IA
              </span>
            )}
          </div>
          {ticket.description && (
            <div className="mb-1 line-clamp-3 overflow-hidden">
              <RichDescription text={ticket.description} isDark={isDark} />
            </div>
          )}

          {/* AI readiness bar */}
          <div className="flex items-center gap-1.5 mb-1">
            <div className={cn('flex-1 h-1 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-100')}>
              <div className={cn('h-full rounded-full transition-all duration-500', aiColors.bar)} style={{ width: `${aiScore}%` }} />
            </div>
            <div className={cn(
              'size-4 rounded flex items-center justify-center transition-all',
              aiScore >= 75
                ? cn('shadow-md', aiColors.glow, isDark ? 'bg-emerald-600/30' : 'bg-emerald-100')
                : aiScore >= 50
                  ? cn(isDark ? 'bg-violet-600/20' : 'bg-violet-50')
                  : isDark ? 'bg-zinc-800/50' : 'bg-gray-50',
            )}>
              <Sparkles className={cn('size-2.5 transition-all', aiColors.text, aiScore >= 75 && 'animate-pulse')} />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {ticket.tags?.slice(0, 2).map((tag) => (
              <span key={tag} className={cn('text-[8px] px-1 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}>
                {tag}
              </span>
            ))}
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
              {(ticket.comments?.length || 0) > 0 && (
                <span className={cn('flex items-center gap-0.5 text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                  <MessageSquare className="size-2.5" />
                  {ticket.comments.length}
                </span>
              )}
              {(ticket.attachments?.length || 0) > 0 && (
                <span className={cn('flex items-center gap-0.5 text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                  <Paperclip className="size-2.5" />
                  {ticket.attachments.length}
                </span>
              )}
              {ticket.assignee && (
                <div className={cn('size-4 rounded-full flex items-center justify-center text-[7px] font-bold', isDark ? 'bg-violet-600/30 text-violet-300' : 'bg-violet-100 text-violet-600')}>
                  {ticket.assignee.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className={cn('size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity', isDark ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}
          >
            <MoreHorizontal className="size-3" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)} />
              <div className={cn('absolute right-0 top-6 z-50 rounded-lg shadow-xl py-1 min-w-[100px]', isDark ? 'bg-zinc-800 border border-zinc-700' : 'bg-white border border-gray-200')}>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                  className={cn('flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10')}
                >
                  <Trash2 className="size-3" /> {('Eliminar')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter Bar ──

function FilterBar({
  filter, setFilter, groups, allTags, members, isDark, t,
}: {
  filter: KanbanFilter;
  setFilter: React.Dispatch<React.SetStateAction<KanbanFilter>>;
  groups: { groups: string[]; subgroups: string[] };
  allTags: string[];
  members: KanbanTeamMember[];
  isDark: boolean;
  t: (key: string) => string;
}) {
  const selClass = cn(
    'text-[10px] px-1.5 py-1 rounded border outline-none',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-300 text-gray-600',
  );

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1.5 border-b flex-wrap',
      isDark ? 'border-zinc-800 bg-zinc-900/30' : 'border-gray-100 bg-gray-50/50',
    )}>
      <select
        value={filter.priority?.join(',') || ''}
        onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value ? e.target.value.split(',') as KanbanPriority[] : undefined }))}
        className={selClass}
      >
        <option value="">{t('kanbanPriority')}</option>
        {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>

      <select
        value={filter.assignee?.join(',') || ''}
        onChange={(e) => setFilter((f) => ({ ...f, assignee: e.target.value ? [e.target.value] : undefined }))}
        className={selClass}
      >
        <option value="">{t('kanbanAssignee')}</option>
        {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
      </select>

      {groups.groups.length > 0 && (
        <select
          value={filter.group || ''}
          onChange={(e) => setFilter((f) => ({ ...f, group: e.target.value || undefined }))}
          className={selClass}
        >
          <option value="">{t('kanbanGroup')}</option>
          {groups.groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      )}

      {groups.subgroups.length > 0 && (
        <select
          value={filter.subgroup || ''}
          onChange={(e) => setFilter((f) => ({ ...f, subgroup: e.target.value || undefined }))}
          className={selClass}
        >
          <option value="">{t('kanbanSubgroup')}</option>
          {groups.subgroups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      )}

      {(filter.search || filter.priority || filter.assignee || filter.group || filter.subgroup) && (
        <button
          onClick={() => setFilter({})}
          className={cn('text-[10px] px-1.5 py-1 rounded', isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50')}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ── Create Ticket Dialog ──

function CreateTicketDialog({
  isDark, t, members, groups, onClose, onCreate,
}: {
  isDark: boolean;
  t: (key: string) => string;
  members: KanbanTeamMember[];
  groups: { groups: string[]; subgroups: string[] };
  onClose: () => void;
  onCreate: (data: Partial<KanbanTicket>) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<KanbanStatus>('backlog');
  const [priority, setPriority] = useState<KanbanPriority>('medium');
  const [assignee, setAssignee] = useState('');
  const [group, setGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [tags, setTags] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const inputClass = cn(
    'w-full border rounded px-2 py-1.5 text-[11px] outline-none focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-gray-300 text-gray-800 placeholder:text-gray-400',
  );

  return (
    <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
      <div className={cn('flex items-center justify-between px-3 py-2 border-b shrink-0', isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200')}>
        <span className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>{t('kanbanNewTicket')}</span>
        <button onClick={onClose} className={cn('size-6 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className={cn('flex-1 overflow-y-auto p-3 space-y-3', isDark ? 'bg-zinc-950' : 'bg-white')}>
        <input className={inputClass} placeholder={t('kanbanTitle')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <RichDescriptionEditor
          value={description}
          onChange={setDescription}
          isDark={isDark}
          inputClass={inputClass}
          placeholder={t('kanbanDescPlaceholder') || '# Título\n## Subtítulo\n- [ ] Tarea\nDescripción...'}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanStatus')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as KanbanStatus)} className={inputClass}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(`kanbanStatus_${s.key}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanPriority')}</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as KanbanPriority)} className={inputClass}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanAssignee')}</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGroup')}</label>
            <input className={inputClass} placeholder="Frontend, Backend..." value={group} onChange={(e) => setGroup(e.target.value)} list="groups-list" />
            <datalist id="groups-list">{groups.groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGanttStart')}</label>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGanttEnd')}</label>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={cn('text-[9px] font-medium mb-0.5 block', isDark ? 'text-zinc-500' : 'text-gray-500')}>Tags</label>
          <input className={inputClass} placeholder="tag1, tag2..." value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </div>

      <div className={cn('px-3 py-2 border-t flex justify-end gap-2 shrink-0', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
        <button onClick={onClose} className={cn('px-3 py-1.5 rounded text-[11px] font-medium', isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100')}>
          {t('cancel')}
        </button>
        <button
          onClick={() => {
            if (!title.trim()) return;
            onCreate({
              title: title.trim(),
              description,
              status,
              priority,
              assignee: assignee || undefined,
              group,
              subgroup,
              tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            });
          }}
          disabled={!title.trim()}
          className={cn(
            'px-3 py-1.5 rounded text-[11px] font-medium transition-colors',
            title.trim()
              ? 'bg-violet-600 text-white hover:bg-violet-500'
              : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
          )}
        >
          {t('kanbanCreate')}
        </button>
      </div>
    </div>
  );
}

// ── AI Create Dialog ──

function AiCreateDialog({
  isDark, t, onClose, onCreate,
}: {
  isDark: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onCreate: (data: Partial<KanbanTicket>) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [prePrompt, setPrePrompt] = useState('');
  const [showPrePrompt, setShowPrePrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Partial<KanbanTicket> | null>(null);
  const [error, setError] = useState('');

  const inputClass = cn(
    'w-full border rounded px-2 py-1.5 text-[11px] outline-none focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-gray-300 text-gray-800 placeholder:text-gray-400',
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await agentApi.kanbanAiGenerateTicket(prompt.trim(), showPrePrompt ? prePrompt.trim() : undefined);
      setGenerated(res.ticket);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRetry = () => {
    setGenerated(null);
    handleGenerate();
  };

  const handleReset = () => {
    setGenerated(null);
    setPrompt('');
    setPrePrompt('');
    setError('');
  };

  return (
    <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
      <div className={cn('flex items-center justify-between px-3 py-2 border-b shrink-0', isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200')}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-violet-400" />
          <span className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>{t('kanbanAiCreate')}</span>
        </div>
        <button onClick={onClose} className={cn('size-6 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
          <X className="size-3.5" />
        </button>
      </div>

      <div className={cn('flex-1 overflow-y-auto p-3 space-y-3', isDark ? 'bg-zinc-950' : 'bg-white')}>
        {/* Pre-prompt toggle */}
        <button
          onClick={() => setShowPrePrompt(!showPrePrompt)}
          className={cn('flex items-center gap-1 text-[10px] font-medium', isDark ? 'text-violet-400' : 'text-violet-600')}
        >
          {showPrePrompt ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {t('kanbanPrePrompt')}
        </button>

        {showPrePrompt && (
          <textarea
            className={cn(inputClass, 'resize-none min-h-[50px]')}
            rows={2}
            placeholder={t('kanbanPrePromptPlaceholder')}
            value={prePrompt}
            onChange={(e) => setPrePrompt(e.target.value)}
          />
        )}

        {/* Main prompt */}
        <textarea
          className={cn(inputClass, 'resize-none min-h-[60px]')}
          rows={3}
          placeholder={t('kanbanAiPrompt')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoFocus
        />

        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors',
              prompt.trim() && !generating
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
            )}
          >
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            {generating ? t('kanbanGenerating') : t('kanbanGenerate')}
          </button>
        </div>

        {error && (
          <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px]', isDark ? 'bg-red-950/50 text-red-400' : 'bg-red-50 text-red-600')}>
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </div>
        )}

        {/* Preview generated ticket */}
        {generated && (
          <div className={cn('rounded-lg border p-3 space-y-2', isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
            <p className={cn('text-[10px] font-medium uppercase tracking-wide', isDark ? 'text-violet-400' : 'text-violet-600')}>{t('kanbanPreview')}</p>
            <p className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>{generated.title}</p>
            <p className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-600')}>{generated.description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {generated.priority && (
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600')}>
                  {generated.priority}
                </span>
              )}
              {generated.group && (
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600')}>
                  {generated.group}
                </span>
              )}
              {(generated.tags as string[] | undefined)?.map((tag) => (
                <span key={tag} className={cn('text-[9px] px-1.5 py-0.5 rounded', isDark ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600')}>
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleRetry}
                className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
              >
                <RotateCcw className="size-3" />
                {t('kanbanRetry')}
              </button>
              <button
                onClick={handleReset}
                className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
              >
                {t('kanbanReset')}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => { onCreate({ ...generated, aiPrompt: prompt, aiPrePrompt: prePrompt || undefined }); onClose(); }}
                className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {t('kanbanCreate')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ticket Detail Panel ──

function TicketDetailPanel({
  ticket, members, isDark, t, onClose, onUpdate, onDelete, onCreateAgent,
  agentRunning, agentId, onAgentStarted, onGoToAgent,
}: {
  ticket: KanbanTicket;
  members: KanbanTeamMember[];
  isDark: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onUpdate: (changes: Partial<KanbanTicket>) => void;
  onDelete: () => void;
  onCreateAgent?: (name: string, type: string, cwd?: string, model?: string, prompt?: string) => Promise<unknown>;
  agentRunning?: boolean;
  agentId?: string;
  onAgentStarted?: (ticketId: string, agentId: string) => void;
  onGoToAgent?: (agentId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'detail' | 'comments' | 'timelog' | 'history' | 'ai'>('detail');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(ticket.title);
  const [editDesc, setEditDesc] = useState(ticket.description);
  const [comment, setComment] = useState('');
  const [timeHours, setTimeHours] = useState('');
  const [timeDesc, setTimeDesc] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStudy, setAiStudy] = useState<string | null>(ticket.aiStudy || null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiError, setAiError] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [agentMessages, setAgentMessages] = useState<{ id: string; role: string; content: string; toolCalls?: { name: string; done: boolean }[] }[]>([]);
  const [agentThinking, setAgentThinking] = useState(false);
  const [agentStreaming, setAgentStreaming] = useState(false);
  const agentMsgEndRef = useRef<HTMLDivElement>(null);

  const isAgentWorking = aiApplying || !!agentRunning;

  useEffect(() => {
    if (!agentRunning && aiApplying) setAiApplying(false);
  }, [agentRunning, aiApplying]);

  useEffect(() => {
    agentMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages, agentThinking]);

  useEffect(() => {
    if (!agentId || !isAgentWorking) {
      setAgentMessages([]);
      setAgentThinking(false);
      setAgentStreaming(false);
      return;
    }
    const cleanup = agentApi.watchChat(agentId, (event) => {
      if (event.type === 'init' && event.messages) {
        setAgentMessages(event.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, toolCalls: (m as any).toolCalls })));
      } else if (event.type === 'thinking_start') {
        setAgentThinking(true);
      } else if (event.type === 'thinking_done') {
        setAgentThinking(false);
      } else if (event.type === 'message_start' && event.message) {
        setAgentMessages((prev) => {
          if (prev.some((m) => m.id === event.message!.id)) return prev;
          return [...prev, { id: event.message!.id, role: event.message!.role, content: event.message!.content, toolCalls: [] }];
        });
        setAgentStreaming(true);
      } else if (event.type === 'chunk' && event.messageId && event.delta) {
        setAgentMessages((prev) => prev.map((m) => m.id === event.messageId ? { ...m, content: m.content + event.delta } : m));
      } else if (event.type === 'tool_call' && event.messageId) {
        const tc = (event as any).toolCall;
        if ((event as any).subtype === 'started' && tc) {
          setAgentMessages((prev) => prev.map((m) => m.id === event.messageId ? { ...m, toolCalls: [...(m.toolCalls || []), { name: tc.name, done: false }] } : m));
        } else if ((event as any).subtype === 'completed') {
          setAgentMessages((prev) => prev.map((m) => {
            if (m.id !== event.messageId) return m;
            const tcs = [...(m.toolCalls || [])];
            if (tcs.length > 0) tcs[tcs.length - 1] = { ...tcs[tcs.length - 1], done: true };
            return { ...m, toolCalls: tcs };
          }));
        }
      } else if (event.type === 'message_done' || event.type === 'message_error') {
        setAgentStreaming(false);
        setAgentThinking(false);
        if (event.message) {
          setAgentMessages((prev) => prev.map((m) => m.id === event.message!.id ? { ...m, content: event.message!.content } : m));
        }
      }
    });
    return cleanup;
  }, [agentId, isAgentWorking]);

  useEffect(() => {
    setEditTitle(ticket.title);
    setEditDesc(ticket.description);
    setAiStudy(ticket.aiStudy || null);
    setEditing(false);
  }, [ticket.id]);

  const inputClass = cn(
    'w-full border rounded px-2 py-1 text-[11px] outline-none focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-300 text-gray-800',
  );

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    try {
      await agentApi.kanbanAddComment(ticket.id, { author: 'User', content: comment.trim() });
      const updated = await agentApi.kanbanGetTicket(ticket.id);
      if (updated) onUpdate({ comments: updated.comments });
      setComment('');
    } catch { /* ignore */ }
  };

  const handleAddTime = async () => {
    const h = parseFloat(timeHours);
    if (isNaN(h) || h <= 0) return;
    try {
      await agentApi.kanbanAddTimeEntry(ticket.id, {
        userId: 'user',
        userName: 'User',
        hours: h,
        description: timeDesc.trim(),
        date: new Date().toISOString().split('T')[0],
      });
      const updated = await agentApi.kanbanGetTicket(ticket.id);
      if (updated) onUpdate({ timelog: updated.timelog });
      setTimeHours('');
      setTimeDesc('');
    } catch { /* ignore */ }
  };

  const handleUploadImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await agentApi.kanbanAddAttachment(ticket.id, {
            name: file.name,
            url: reader.result as string,
            type: file.type,
            size: file.size,
          });
          const updated = await agentApi.kanbanGetTicket(ticket.id);
          if (updated) onUpdate({ attachments: updated.attachments });
        } catch { /* ignore */ }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const totalHours = (ticket.timelog || []).reduce((sum, e) => sum + e.hours, 0);
  const aiScore = calcAiReadiness(ticket);
  const aiColors = aiReadinessColor(aiScore, isDark);
  const doneByAi = wasCompletedByAi(ticket);

  const tabs = [
    { k: 'detail' as const, label: t('kanbanDetail'), icon: <Eye className="size-3" /> },
    { k: 'comments' as const, label: `${t('kanbanComments')} (${ticket.comments?.length || 0})`, icon: <MessageSquare className="size-3" /> },
    { k: 'timelog' as const, label: `${t('kanbanTimelog')} (${totalHours.toFixed(1)}h)`, icon: <Clock className="size-3" /> },
    { k: 'ai' as const, label: isAgentWorking ? 'IA ⚡' : 'IA', icon: isAgentWorking ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" /> },
    { k: 'history' as const, label: t('kanbanHistory'), icon: <RotateCcw className="size-3" /> },
  ];

  const handleAiStudy = async () => {
    setAiGenerating(true);
    setAiError('');
    setAiStudy(null);
    const context = `Ticket: ${ticket.title}\nDescripción: ${ticket.description}\nPrioridad: ${ticket.priority}\nEstado: ${ticket.status}\nGrupo: ${ticket.group || 'N/A'}\nTags: ${(ticket.tags || []).join(', ') || 'N/A'}`;
    const fullPrompt = aiPrompt.trim()
      ? `${context}\n\nInstrucciones del usuario: ${aiPrompt.trim()}`
      : context;
    try {
      const res = await agentApi.kanbanAiGenerateTicket(
        fullPrompt,
        `Eres un analista técnico senior. Haz un estudio detallado de implementación para este ticket. Incluye:\n1. Análisis técnico\n2. Pasos de implementación\n3. Archivos a modificar/crear\n4. Estimación de tiempo\n5. Riesgos y consideraciones\n\nResponde SOLO con JSON: {"study": "tu estudio completo en texto"}`,
      );
      const parsed = res.ticket as unknown as Record<string, string>;
      const study = parsed.study || res.rawResponse || JSON.stringify(parsed);
      setAiStudy(study);
      onUpdate({ aiStudy: study });
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Error');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyWithAgent = async () => {
    if (!aiStudy || !onCreateAgent) return;
    setAiApplying(true);
    try {
      const agentPrompt = `## Ticket: ${ticket.title}\n\n${ticket.description}\n\n## Estudio de implementación:\n\n${aiStudy}\n\n## Instrucciones:\nImplementa todo lo descrito en el estudio anterior. Sigue los pasos indicados y crea/modifica los archivos necesarios.`;
      const agent = await onCreateAgent(
        `🎫 ${ticket.title}`,
        'cursor',
        undefined,
        'claude-4.6-sonnet-medium-thinking',
        agentPrompt,
      ) as { id: string } | undefined;

      await Promise.all([
        agentApi.kanbanAddTimeEntry(ticket.id, {
          userId: 'ai-agent',
          userName: 'AI Agent',
          hours: 0,
          description: `Estudio IA aplicado — agente creado para implementar ticket`,
          date: new Date().toISOString().split('T')[0],
        }),
        agentApi.kanbanAddComment(ticket.id, {
          author: 'AI Agent',
          content: `Se creó un agente para implementar este ticket basado en el estudio IA.\n\nEstudio:\n${aiStudy.substring(0, 300)}...`,
        }),
      ]);

      const updated = await agentApi.kanbanGetTicket(ticket.id);
      if (updated) {
        onUpdate({ timelog: updated.timelog, comments: updated.comments, status: 'in_progress' as KanbanStatus });
      }

      if (agent?.id && onAgentStarted) {
        onAgentStarted(ticket.id, agent.id);
      }
    } catch {
      setAiApplying(false);
    }
  };

  const handleAiSummarize = async () => {
    setSummarizing(true);
    setSummaryError('');
    setSummaryPreview(null);
    try {
      const res = await agentApi.kanbanAiSummarize(ticket);
      if (res.description) {
        setSummaryPreview(res.description);
      }
    } catch (err: unknown) {
      setSummaryError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleApplySummary = () => {
    if (!summaryPreview) return;
    onUpdate({ description: summaryPreview });
    setEditDesc(summaryPreview);
    setSummaryPreview(null);
  };

  return (
    <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
      <div className={cn('flex items-center justify-between px-3 py-2 border-b shrink-0', isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200')}>
        <span className={cn('text-xs font-semibold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{ticket.title}</span>
        <div className="flex items-center gap-1">
          <button onClick={onDelete} className={cn('size-6 rounded flex items-center justify-center', isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500')}>
            <Trash2 className="size-3" />
          </button>
          <button onClick={onClose} className={cn('size-6 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* AI Readiness bar */}
      <div className={cn('px-3 py-1.5 border-b shrink-0 flex items-center gap-2', isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-100 bg-gray-50/50')}>
        <div className={cn(
          'size-5 rounded-md flex items-center justify-center transition-all',
          aiScore >= 75
            ? cn('shadow-md', aiColors.glow, isDark ? 'bg-emerald-600/30' : 'bg-emerald-100')
            : aiScore >= 50
              ? cn(isDark ? 'bg-violet-600/20' : 'bg-violet-50')
              : aiScore >= 25
                ? cn(isDark ? 'bg-amber-900/20' : 'bg-amber-50')
                : cn(isDark ? 'bg-zinc-800' : 'bg-gray-100'),
        )}>
          <Sparkles className={cn('size-3 transition-all', aiColors.text, aiScore >= 75 && 'animate-pulse')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={cn('text-[9px] font-medium', aiColors.text)}>
              {aiScore >= 75 ? t('kanbanAiReady') : aiScore >= 50 ? t('kanbanAiAlmost') : aiScore >= 25 ? t('kanbanAiPartial') : t('kanbanAiLow')}
            </span>
            <span className={cn('text-[9px] font-mono', aiColors.text)}>{aiScore}%</span>
          </div>
          <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
            <div className={cn('h-full rounded-full transition-all duration-700 ease-out', aiColors.bar)} style={{ width: `${aiScore}%` }} />
          </div>
        </div>
        {doneByAi && (
          <span className={cn('flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0', isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-600')}>
            <Bot className="size-3" /> {t('kanbanAiCompleted')}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={cn('flex border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        {tabs.map(({ k, label, icon }) => {
          const isAiActive = k === 'ai' && isAgentWorking;
          return (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium transition-colors relative',
                isAiActive && activeTab !== k
                  ? isDark ? 'text-violet-400 animate-pulse' : 'text-violet-500 animate-pulse'
                  : activeTab === k
                    ? isDark ? 'text-violet-300' : 'text-violet-600'
                    : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
              )}
            >
              {icon} {label}
              {activeTab === k && <div className={cn('absolute bottom-0 left-1 right-1 h-0.5 rounded-full', isDark ? 'bg-violet-500' : 'bg-violet-600')} />}
              {isAiActive && activeTab !== k && <div className={cn('absolute bottom-0 left-1 right-1 h-0.5 rounded-full animate-pulse', isDark ? 'bg-violet-500' : 'bg-violet-400')} />}
            </button>
          );
        })}
      </div>

      <div className={cn('flex-1 overflow-y-auto p-3 space-y-3', isDark ? 'bg-zinc-950' : 'bg-white')}>
        {activeTab === 'detail' && (
          <>
            {editing ? (
              <>
                <input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('kanbanTicketTitle') || 'Título'} />
                <RichDescriptionEditor
                  value={editDesc}
                  onChange={setEditDesc}
                  isDark={isDark}
                  inputClass={inputClass}
                  placeholder={t('kanbanDescPlaceholder') || '# Título\n## Subtítulo\n- [ ] Tarea\nDescripción...'}
                />
                <div className="flex gap-2">
                  <button onClick={() => { onUpdate({ title: editTitle, description: editDesc }); setEditing(false); }} className="px-2 py-1 rounded text-[10px] bg-violet-600 text-white">{t('save')}</button>
                  <button onClick={() => setEditing(false)} className={cn('px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('cancel')}</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className={cn('text-xs font-semibold flex-1', isDark ? 'text-zinc-200' : 'text-gray-800')}>{ticket.title}</p>
                  <button
                    onClick={handleAiSummarize}
                    disabled={summarizing}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all',
                      summarizing
                        ? isDark ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-500'
                        : isDark ? 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30' : 'bg-violet-50 text-violet-600 hover:bg-violet-100',
                    )}
                  >
                    {summarizing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    {summarizing ? t('kanbanAiSummarizing') : t('kanbanAiSummarize')}
                  </button>
                  <button onClick={() => setEditing(true)} className={cn('size-5 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}>
                    <Pencil className="size-3" />
                  </button>
                </div>

                {summaryError && (
                  <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px]', isDark ? 'bg-red-950/50 text-red-400' : 'bg-red-50 text-red-600')}>
                    <AlertCircle className="size-3 shrink-0" /> {summaryError}
                  </div>
                )}

                {summaryPreview && (
                  <div className={cn('rounded-lg border p-3 space-y-2', isDark ? 'border-violet-800/40 bg-violet-950/20' : 'border-violet-200 bg-violet-50/50')}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className={cn('size-3', isDark ? 'text-violet-400' : 'text-violet-600')} />
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide flex-1', isDark ? 'text-violet-400' : 'text-violet-600')}>
                        {t('kanbanAiSummarizePreview')}
                      </span>
                    </div>
                    <div className={cn('max-h-[200px] overflow-y-auto rounded p-2', isDark ? 'bg-zinc-900/50' : 'bg-white/80')}>
                      <RichDescription text={summaryPreview} isDark={isDark} />
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-dashed" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
                      <button
                        onClick={handleApplySummary}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-violet-600 text-white hover:bg-violet-500"
                      >
                        <Save className="size-3" /> {t('kanbanAiSummarizeApply')}
                      </button>
                      <button
                        onClick={() => {
                          setEditDesc(summaryPreview);
                          setSummaryPreview(null);
                          setEditing(true);
                        }}
                        className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      >
                        <Pencil className="size-3" /> {t('kanbanEdit') || 'Editar'}
                      </button>
                      <button
                        onClick={() => handleAiSummarize()}
                        className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      >
                        <RotateCcw className="size-3" /> {t('kanbanRetry')}
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={() => setSummaryPreview(null)}
                        className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                      >
                        <X className="size-3" /> {t('kanbanAiSummarizeDiscard')}
                      </button>
                    </div>
                  </div>
                )}

                {ticket.description && (
                  <RichDescription
                    text={ticket.description}
                    isDark={isDark}
                    onToggleCheck={(lineIdx) => {
                      const lines = ticket.description.split('\n');
                      if (lines[lineIdx]?.trimStart().startsWith('- [x] ')) {
                        lines[lineIdx] = lines[lineIdx].replace('- [x] ', '- [ ] ');
                      } else if (lines[lineIdx]?.trimStart().startsWith('- [ ] ')) {
                        lines[lineIdx] = lines[lineIdx].replace('- [ ] ', '- [x] ');
                      }
                      onUpdate({ description: lines.join('\n') });
                    }}
                  />
                )}
              </>
            )}

            {/* Fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanStatus')}</label>
                <select value={ticket.status} onChange={(e) => onUpdate({ status: e.target.value as KanbanStatus })} className={inputClass}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(`kanbanStatus_${s.key}`)}</option>)}
                </select>
              </div>
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanPriority')}</label>
                <select value={ticket.priority} onChange={(e) => onUpdate({ priority: e.target.value as KanbanPriority })} className={inputClass}>
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanAssignee')}</label>
                <select value={ticket.assignee || ''} onChange={(e) => onUpdate({ assignee: e.target.value || undefined })} className={inputClass}>
                  <option value="">—</option>
                  {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGroup')}</label>
                <input className={inputClass} value={ticket.group || ''} onChange={(e) => onUpdate({ group: e.target.value })} />
              </div>
            </div>

            {/* Dates for Gantt */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGanttStart')}</label>
                <input type="date" className={inputClass} value={ticket.startDate || ''} onChange={(e) => onUpdate({ startDate: e.target.value })} />
              </div>
              <div>
                <label className={cn('text-[9px] font-medium block mb-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanGanttEnd')}</label>
                <input type="date" className={inputClass} value={ticket.endDate || ''} onChange={(e) => onUpdate({ endDate: e.target.value })} />
              </div>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[9px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-500')}>{t('kanbanAttachments')}</span>
                <button onClick={handleUploadImage} className={cn('flex items-center gap-1 text-[9px]', isDark ? 'text-violet-400' : 'text-violet-600')}>
                  <ImageIcon className="size-3" /> {t('kanbanAddPhoto')}
                </button>
              </div>
              {(ticket.attachments || []).length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {ticket.attachments.map((att) => (
                    <div key={att.id} className={cn('relative group rounded overflow-hidden', isDark ? 'border border-zinc-700' : 'border border-gray-200')}>
                      {att.type?.startsWith('image/') ? (
                        <img src={att.url} alt={att.name} className="size-16 object-cover" />
                      ) : (
                        <div className={cn('size-16 flex items-center justify-center text-[8px]', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}>{att.name}</div>
                      )}
                      <button
                        onClick={async () => {
                          await agentApi.kanbanDeleteAttachment(ticket.id, att.id);
                          const updated = await agentApi.kanbanGetTicket(ticket.id);
                          if (updated) onUpdate({ attachments: updated.attachments });
                        }}
                        className="absolute top-0.5 right-0.5 size-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'comments' && (
          <>
            <div className="space-y-2">
              {(ticket.comments || []).map((c) => (
                <div key={c.id} className={cn('rounded-lg p-2 border', isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-50 border-gray-200')}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={cn('size-4 rounded-full flex items-center justify-center text-[7px] font-bold', isDark ? 'bg-violet-600/30 text-violet-300' : 'bg-violet-100 text-violet-600')}>
                      {c.author.charAt(0).toUpperCase()}
                    </div>
                    <span className={cn('text-[10px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>{c.author}</span>
                    <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{new Date(c.createdAt).toLocaleString()}</span>
                    <div className="flex-1" />
                    <button
                      onClick={async () => {
                        await agentApi.kanbanDeleteComment(ticket.id, c.id);
                        const updated = await agentApi.kanbanGetTicket(ticket.id);
                        if (updated) onUpdate({ comments: updated.comments });
                      }}
                      className={cn('size-4 rounded flex items-center justify-center opacity-0 hover:opacity-100', isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50')}
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                  <p className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-600')}>{c.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input className={cn(inputClass, 'flex-1')} placeholder={t('kanbanAddComment')} value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} />
              <button onClick={handleAddComment} disabled={!comment.trim()} className={cn('px-2 rounded', comment.trim() ? 'bg-violet-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400')}>
                <Send className="size-3" />
              </button>
            </div>
          </>
        )}

        {activeTab === 'timelog' && (
          <>
            <div className="space-y-1.5">
              {(ticket.timelog || []).map((entry) => (
                <TimeEntryRow
                  key={entry.id}
                  entry={entry}
                  ticketId={ticket.id}
                  isDark={isDark}
                  inputClass={inputClass}
                  onUpdate={async () => {
                    const updated = await agentApi.kanbanGetTicket(ticket.id);
                    if (updated) onUpdate({ timelog: updated.timelog });
                  }}
                />
              ))}
            </div>

            <div className={cn('rounded-lg p-2 border space-y-1.5', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
              <div className="flex gap-1.5">
                <input className={cn(inputClass, 'w-16')} type="number" step="0.5" min="0" placeholder="h" value={timeHours} onChange={(e) => setTimeHours(e.target.value)} />
                <AutoResizeTextarea className={cn(inputClass, 'flex-1')} placeholder={t('kanbanTimeDesc')} value={timeDesc} onChange={(e) => setTimeDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddTime()} />
                <button onClick={handleAddTime} disabled={!timeHours} className={cn('px-2 rounded self-end', timeHours ? 'bg-amber-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400')}>
                  <Plus className="size-3" />
                </button>
              </div>
              <p className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                Total: <span className="font-mono font-bold">{totalHours.toFixed(1)}h</span>
              </p>
            </div>
          </>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-3">
            {isAgentWorking ? (
              <>
                {/* Header con estado y botón */}
                <div className={cn(
                  'rounded-xl border-2 overflow-hidden',
                  isDark ? 'border-violet-600/50 bg-violet-950/40' : 'border-violet-300 bg-violet-50',
                )}>
                  <div className="relative h-1 overflow-hidden">
                    <div className={cn('absolute inset-0', isDark ? 'bg-violet-900/50' : 'bg-violet-100')} />
                    <div className={cn('h-full w-1/3 rounded-full', isDark ? 'bg-violet-500' : 'bg-violet-400')}
                      style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
                    <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
                  </div>
                  <div className="px-3 py-2.5 flex items-center gap-3">
                    <div className="relative flex items-center justify-center shrink-0">
                      <div className={cn('absolute size-7 rounded-full animate-ping opacity-20', isDark ? 'bg-violet-500' : 'bg-violet-400')} />
                      <div className={cn('relative size-7 rounded-full flex items-center justify-center', isDark ? 'bg-violet-600/40' : 'bg-violet-200')}>
                        <Bot className={cn('size-3.5 animate-pulse', isDark ? 'text-violet-300' : 'text-violet-600')} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[11px] font-bold', isDark ? 'text-violet-300' : 'text-violet-700')}>
                        Agente implementando...
                      </p>
                      <p className={cn('text-[9px]', isDark ? 'text-violet-400/70' : 'text-violet-500')}>
                        Se moverá a revisión al terminar
                      </p>
                    </div>
                    {agentId && onGoToAgent && (
                      <button
                        onClick={() => onGoToAgent(agentId)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all shrink-0',
                          isDark
                            ? 'bg-violet-600/30 text-violet-200 hover:bg-violet-600/50 border border-violet-500/30'
                            : 'bg-violet-200 text-violet-800 hover:bg-violet-300 border border-violet-300',
                        )}
                      >
                        Abrir agente →
                      </button>
                    )}
                  </div>
                </div>

                {/* Live feed de mensajes del agente */}
                <div className={cn(
                  'rounded-lg border overflow-hidden flex flex-col',
                  isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
                )} style={{ maxHeight: '400px' }}>
                  <div className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 border-b text-[9px] font-semibold uppercase tracking-wider',
                    isDark ? 'border-zinc-800 text-zinc-500 bg-zinc-900' : 'border-gray-200 text-gray-400 bg-gray-100',
                  )}>
                    <MessageSquare className="size-2.5" />
                    Actividad del agente
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {agentMessages.length === 0 && !agentThinking && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className={cn('size-4 animate-spin', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                        <span className={cn('text-[10px] ml-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>Conectando con el agente...</span>
                      </div>
                    )}
                    {agentMessages.map((msg) => (
                      <div key={msg.id} className={cn(
                        'rounded-lg px-2.5 py-2 text-[10px]',
                        msg.role === 'user'
                          ? isDark ? 'bg-violet-900/20 border border-violet-800/30' : 'bg-violet-50 border border-violet-200'
                          : isDark ? 'bg-zinc-800/50 border border-zinc-700/50' : 'bg-white border border-gray-200',
                      )}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.role === 'assistant' ? (
                            <Bot className={cn('size-3', isDark ? 'text-violet-400' : 'text-violet-600')} />
                          ) : (
                            <Users className={cn('size-3', isDark ? 'text-zinc-400' : 'text-gray-500')} />
                          )}
                          <span className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                            {msg.role === 'assistant' ? 'Agente IA' : 'Prompt'}
                          </span>
                        </div>
                        {msg.content && (
                          <p className={cn(
                            'whitespace-pre-wrap leading-relaxed line-clamp-6',
                            isDark ? 'text-zinc-300' : 'text-gray-700',
                          )}>
                            {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                          </p>
                        )}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {msg.toolCalls.map((tc, i) => (
                              <div key={i} className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono',
                                tc.done
                                  ? isDark ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                  : isDark ? 'bg-amber-950/30 text-amber-400 border border-amber-800/30' : 'bg-amber-50 text-amber-600 border border-amber-200',
                              )}>
                                {tc.done ? (
                                  <Check className="size-2.5 shrink-0" />
                                ) : (
                                  <Loader2 className="size-2.5 shrink-0 animate-spin" />
                                )}
                                {tc.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {agentThinking && (
                      <div className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg', isDark ? 'bg-violet-950/20' : 'bg-violet-50')}>
                        <div className="flex gap-0.5">
                          <div className={cn('size-1.5 rounded-full animate-bounce', isDark ? 'bg-violet-400' : 'bg-violet-500')} style={{ animationDelay: '0ms' }} />
                          <div className={cn('size-1.5 rounded-full animate-bounce', isDark ? 'bg-violet-400' : 'bg-violet-500')} style={{ animationDelay: '150ms' }} />
                          <div className={cn('size-1.5 rounded-full animate-bounce', isDark ? 'bg-violet-400' : 'bg-violet-500')} style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className={cn('text-[9px]', isDark ? 'text-violet-400' : 'text-violet-500')}>Pensando...</span>
                      </div>
                    )}
                    <div ref={agentMsgEndRef} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>
                  {t('kanbanAiStudyDesc')}
                </p>

                <textarea
                  className={cn(inputClass, 'resize-none min-h-[50px]')}
                  rows={2}
                  placeholder={t('kanbanAiStudyPrompt')}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                />

                <button
                  onClick={handleAiStudy}
                  disabled={aiGenerating}
                  className={cn(
                    'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors',
                    !aiGenerating
                      ? 'bg-violet-600 text-white hover:bg-violet-500'
                      : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400',
                  )}
                >
                  {aiGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {aiGenerating ? t('kanbanGenerating') : t('kanbanAiRunStudy')}
                </button>

                {aiError && (
                  <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px]', isDark ? 'bg-red-950/50 text-red-400' : 'bg-red-50 text-red-600')}>
                    <AlertCircle className="size-3 shrink-0" /> {aiError}
                  </div>
                )}

                {aiStudy && (
                  <div className={cn('rounded-lg border p-3 space-y-2', isDark ? 'border-violet-800/40 bg-violet-950/20' : 'border-violet-200 bg-violet-50/50')}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className={cn('size-3', isDark ? 'text-violet-400' : 'text-violet-600')} />
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isDark ? 'text-violet-400' : 'text-violet-600')}>
                        {t('kanbanAiStudyResult')}
                      </span>
                    </div>
                    <div className={cn('text-[10px] whitespace-pre-wrap leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                      {aiStudy}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-dashed" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
                      <button
                        onClick={handleAiStudy}
                        className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px]', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      >
                        <RotateCcw className="size-3" /> {t('kanbanRetry')}
                      </button>
                      <div className="flex-1" />
                      {onCreateAgent && (
                        <button
                          onClick={handleApplyWithAgent}
                          className={cn(
                            'flex items-center gap-1 px-3 py-1 rounded text-[10px] font-medium transition-colors',
                            'bg-emerald-600 text-white hover:bg-emerald-500',
                          )}
                        >
                          <Play className="size-3" />
                          {t('kanbanAiApply')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-1">
            {(ticket.history || []).length === 0 && (
              <p className={cn('text-[10px] text-center py-4', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('kanbanNoHistory')}</p>
            )}
            {(ticket.history || []).slice().reverse().map((h) => (
              <div key={h.id} className={cn('flex items-start gap-2 px-2 py-1.5 rounded', isDark ? 'bg-zinc-900/50' : 'bg-gray-50')}>
                <div className={cn('size-1.5 rounded-full mt-1.5 shrink-0', isDark ? 'bg-violet-500' : 'bg-violet-400')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[10px]', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                    <span className="font-medium">{h.field}</span>
                    {' '}<span className={cn(isDark ? 'text-red-400' : 'text-red-500')}>{h.oldValue || '—'}</span>
                    {' → '}<span className={cn(isDark ? 'text-emerald-400' : 'text-emerald-600')}>{h.newValue || '—'}</span>
                  </p>
                  <p className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                    {h.changedBy} · {new Date(h.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team View ──

function MemberCard({
  member, tickets, isDark, t, onRefresh,
}: {
  member: KanbanTeamMember;
  tickets: KanbanTicket[];
  isDark: boolean;
  t: (key: string) => string;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const [editRole, setEditRole] = useState(member.role || '');
  const [editEmail, setEditEmail] = useState(member.email || '');

  const inputClass = cn(
    'w-full border rounded px-2 py-1 text-[11px] outline-none focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-300 text-gray-800',
  );

  const memberTickets = tickets.filter((tk) => tk.assignee === member.name);
  const memberHours = memberTickets.reduce((sum, tk) => sum + (tk.timelog || []).reduce((s, e) => s + e.hours, 0), 0);
  const byStatus: Record<string, number> = {};
  memberTickets.forEach((tk) => { byStatus[tk.status] = (byStatus[tk.status] || 0) + 1; });

  const handleSave = async () => {
    if (!editName.trim()) return;
    await agentApi.kanbanUpdateMember(member.id, {
      name: editName.trim(),
      role: editRole.trim(),
      email: editEmail.trim(),
    });
    setEditing(false);
    onRefresh();
  };

  const handleCancel = () => {
    setEditName(member.name);
    setEditRole(member.role || '');
    setEditEmail(member.email || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn('rounded-lg border p-2 space-y-1.5', isDark ? 'border-violet-700/50 bg-zinc-900' : 'border-violet-200 bg-gray-50')}>
        <input className={inputClass} placeholder={t('kanbanMemberName')} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
        <input className={inputClass} placeholder={t('kanbanMemberRole')} value={editRole} onChange={(e) => setEditRole(e.target.value)} />
        <input className={inputClass} placeholder="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!editName.trim()} className="px-2 py-1 rounded text-[10px] bg-violet-600 text-white disabled:opacity-50">
            {t('kanbanSave')}
          </button>
          <button onClick={handleCancel} className={cn('px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>
            {t('cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-2', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('size-7 rounded-full flex items-center justify-center text-xs font-bold', isDark ? 'bg-violet-600/30 text-violet-300' : 'bg-violet-100 text-violet-600')}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[11px] font-semibold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{member.name}</p>
          {member.role && <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>{member.role}</p>}
          {member.email && <p className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{member.email}</p>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className={cn('size-5 rounded flex items-center justify-center', isDark ? 'text-zinc-600 hover:text-violet-400' : 'text-gray-400 hover:text-violet-500')}
          title={t('kanbanEditMember')}
        >
          <Pencil className="size-3" />
        </button>
        <button
          onClick={async () => { await agentApi.kanbanDeleteMember(member.id); onRefresh(); }}
          className={cn('size-5 rounded flex items-center justify-center', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}>
          {memberTickets.length} tickets
        </span>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-mono', isDark ? 'bg-amber-900/20 text-amber-400' : 'bg-amber-50 text-amber-600')}>
          {memberHours.toFixed(1)}h
        </span>
        {Object.entries(byStatus).map(([status, count]) => (
          <span key={status} className={cn('text-[8px] px-1 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400')}>
            {status}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamView({
  members, tickets, isDark, t, onRefresh,
}: {
  members: KanbanTeamMember[];
  tickets: KanbanTicket[];
  isDark: boolean;
  t: (key: string) => string;
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');

  const inputClass = cn(
    'w-full border rounded px-2 py-1 text-[11px] outline-none focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-300 text-gray-800',
  );

  const handleAdd = async () => {
    if (!name.trim()) return;
    await agentApi.kanbanCreateMember({ name: name.trim(), role, email });
    setName('');
    setRole('');
    setEmail('');
    setShowAdd(false);
    onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isDark ? 'text-zinc-500' : 'text-gray-500')}>
          {t('kanbanTeam')} ({members.length})
        </span>
        <button onClick={() => setShowAdd(!showAdd)} className={cn('flex items-center gap-1 text-[10px]', isDark ? 'text-violet-400' : 'text-violet-600')}>
          <Plus className="size-3" /> {t('kanbanAddMember')}
        </button>
      </div>

      {showAdd && (
        <div className={cn('rounded-lg border p-2 space-y-1.5', isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
          <input className={inputClass} placeholder={t('kanbanMemberName')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className={inputClass} placeholder={t('kanbanMemberRole')} value={role} onChange={(e) => setRole(e.target.value)} />
          <input className={inputClass} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!name.trim()} className="px-2 py-1 rounded text-[10px] bg-violet-600 text-white disabled:opacity-50">{t('kanbanCreate')}</button>
            <button onClick={() => setShowAdd(false)} className={cn('px-2 py-1 rounded text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {members.map((m) => (
        <MemberCard key={m.id} member={m} tickets={tickets} isDark={isDark} t={t} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
