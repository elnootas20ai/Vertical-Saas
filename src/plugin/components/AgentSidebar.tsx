import { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  Bot,
  Terminal,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Circle,
  Loader2,
  AlertCircle,
  Puzzle,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Tag,
  Check,
  X,
  Code2,
  Kanban,
  Settings,
  Database,
  Layers,
  Building2,
  Activity,
  Archive,
} from 'lucide-react';
import type { Agent, AgentCategory, SavedComponent } from '../types';
import type { BubblePosition, PopupPosition, ShortcutConfig } from '../PluginPanel';
import { cn } from '../../app/components/ui/utils';
import { QuickActions } from './QuickActions';
import { ComponentLibrary } from './ComponentLibrary';
import { CodeExplorer } from './CodeExplorer';
import { KanbanBoard } from './KanbanBoard';
import { AppSettings } from './AppSettings';
import { CouchDBManager } from './CouchDBManager';
import { AppBrowser } from './AppBrowser';
import { StopdownPlatform } from './StopdownPlatform';
import { ActivityLogs } from './ActivityLogs';
import { usePluginSettings } from '../PluginProvider';
import { agentApi } from '../lib/api';

type SidebarTabValue = 'agents' | 'apps' | 'components' | 'code' | 'kanban' | 'database' | 'logs' | 'empresas' | 'settings';

interface Props {
  agents: Agent[];
  agentCategories: AgentCategory[];
  activeAgentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onChangeCategory: (agentId: string, category: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddCategory: (name: string) => Promise<AgentCategory>;
  onDeleteCategory: (catId: string) => void;
  onClearChat: (id: string) => void;
  onSettings: (id: string) => void;
  onOpenComponent?: (comp: SavedComponent) => void;
  activeTab?: SidebarTabValue;
  onTabChange?: (tab: SidebarTabValue) => void;
  onCreateAgent?: (name: string, type: string, cwd?: string, model?: string, prompt?: string) => Promise<unknown>;
  onGoToAgent?: (agentId: string) => void;
  expanded?: boolean;
  pendingKanbanTicketId?: string | null;
  onPendingKanbanTicketHandled?: () => void;
  shortcut?: ShortcutConfig;
  onChangeShortcut?: (s: ShortcutConfig) => void;
  bubblePosition?: BubblePosition;
  popupPosition?: PopupPosition;
  onChangeBubblePosition?: (pos: BubblePosition) => void;
  onChangePopupPosition?: (pos: PopupPosition) => void;
}

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const statusConfig: Record<string, { icon: typeof Circle; color: string }> = {
  idle: { icon: Circle, color: 'text-emerald-400' },
  running: { icon: Loader2, color: 'text-blue-400' },
  stopped: { icon: Circle, color: 'text-amber-400' },
  error: { icon: AlertCircle, color: 'text-red-400' },
};

export function AgentSidebar({
  agents, agentCategories, activeAgentId,
  onSelect, onCreate, onRename, onDelete,
  onChangeCategory, onReorder, onAddCategory, onDeleteCategory,
  onOpenComponent,
  activeTab, onTabChange,
  onCreateAgent,
  onGoToAgent,
  expanded,
  pendingKanbanTicketId,
  onPendingKanbanTicketHandled,
  shortcut,
  onChangeShortcut,
  bubblePosition,
  popupPosition,
  onChangeBubblePosition,
  onChangePopupPosition,
}: Props) {
  const { isDark, t } = usePluginSettings();
  const [localTab, setLocalTab] = useState<SidebarTabValue>(activeTab || 'agents');
  const tab = activeTab ?? localTab;
  const setTab = (val: SidebarTabValue) => { onTabChange ? onTabChange(val) : setLocalTab(val); };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedAgents, setArchivedAgents] = useState<Array<{ id: string; name: string; type: string; archivedAt: string }>>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [mountedTabs, setMountedTabs] = useState<Set<SidebarTabValue>>(() => new Set([tab]));
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<'archive' | 'delete' | null>(null);
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(new Set());
  const [bulkArchivedConfirm, setBulkArchivedConfirm] = useState<'delete' | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'running': return t('responding');
      case 'stopped': return t('stopped');
      case 'error': return t('error');
      default: return t('available');
    }
  };

  const startRename = (agent: Agent) => {
    setEditingId(agent.id);
    setEditName(agent.name);
    setMenuOpenId(null);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };
  const handleDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const items = [...agents];
      const fromIdx = items.findIndex((a) => a.id === dragId);
      const toIdx = items.findIndex((a) => a.id === dragOverId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, moved);
        onReorder(items.map((a) => a.id));
      }
    }
    setDragId(null);
    setDragOverId(null);
  };

  const toggleCatCollapse = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await onAddCategory(newCategoryName.trim());
      setNewCategoryName('');
      setShowAddCategory(false);
    } catch { /* ignore */ }
  };

  const loadArchived = async () => {
    try {
      const list = await agentApi.getArchivedAgents();
      setArchivedAgents(list);
    } catch { setArchivedAgents([]); }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await agentApi.restoreAgent(id);
      setArchivedAgents((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
    setRestoringId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkConfirm(null);
  };

  const toggleSelectAll = () => {
    if (selectedAgents.size === agents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agents.map((a) => a.id)));
    }
    setBulkConfirm(null);
  };

  const handleBulkArchive = async () => {
    const ids = [...selectedAgents];
    for (const id of ids) {
      try { await onDelete(id); } catch { /* */ }
    }
    setSelectedAgents(new Set());
    setBulkConfirm(null);
  };

  const handleBulkDeletePermanent = async () => {
    const ids = [...selectedAgents];
    for (const id of ids) {
      try { await onDelete(id); } catch { /* */ }
    }
    setSelectedAgents(new Set());
    setBulkConfirm(null);
  };

  const toggleSelectArchived = (id: string) => {
    setSelectedArchived((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setBulkArchivedConfirm(null);
  };

  const toggleSelectAllArchived = () => {
    if (selectedArchived.size === archivedAgents.length) {
      setSelectedArchived(new Set());
    } else {
      setSelectedArchived(new Set(archivedAgents.map((a) => a.id)));
    }
    setBulkArchivedConfirm(null);
  };

  const handleBulkDeleteArchived = async () => {
    const ids = [...selectedArchived];
    for (const id of ids) {
      try { await agentApi.permanentDeleteArchived(id); } catch { /* */ }
    }
    setArchivedAgents((prev) => prev.filter((a) => !ids.includes(a.id)));
    setSelectedArchived(new Set());
    setBulkArchivedConfirm(null);
  };

  const selectionMode = selectedAgents.size > 0;
  const allSelected = agents.length > 0 && selectedAgents.size === agents.length;
  const archivedSelectionMode = selectedArchived.size > 0;
  const allArchivedSelected = archivedAgents.length > 0 && selectedArchived.size === archivedAgents.length;

  const anyAgentRunning = agents.some((a) => a.status === 'running');

  const allCats: AgentCategory[] = agentCategories.length > 0
    ? agentCategories
    : [{ id: 'general', name: 'General', order: 0 }];

  const filtered = activeCategory
    ? agents.filter((a) => (a.category || 'general') === activeCategory)
    : agents;

  const grouped = new Map<string, Agent[]>();
  for (const agent of filtered) {
    const cat = agent.category || 'general';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(agent);
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full overflow-hidden border-r',
        isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200',
      )}
    >
      {/* Tab selector */}
      <div className={cn('flex border-b shrink-0 relative z-[90]', isDark ? 'border-zinc-800 bg-zinc-950' : 'border-gray-200 bg-white')}>
        {([
          { key: 'empresas' as const, icon: Building2, label: t('empresasLabel'), activeColor: 'pink' },
          { key: 'agents' as const, icon: MessageSquare, label: t('agents'), activeColor: 'violet', badge: agents.length || undefined, loading: anyAgentRunning },
          { key: 'apps' as const, icon: Layers, label: 'Apps', activeColor: 'sky' },
          { key: 'components' as const, icon: Puzzle, label: t('components'), activeColor: 'cyan' },
          { key: 'code' as const, icon: Code2, label: t('codeLabel'), activeColor: 'emerald' },
          { key: 'kanban' as const, icon: Kanban, label: t('kanbanLabel'), activeColor: 'amber' },
          { key: 'database' as const, icon: Database, label: t('dbLabel'), activeColor: 'orange' },
          { key: 'logs' as const, icon: Activity, label: t('logsLabel'), activeColor: 'indigo' },
          { key: 'settings' as const, icon: Settings, label: t('settingsLabel'), activeColor: 'rose' },
        ] as const).map((tabItem) => {
          const { key, icon: Icon, label, activeColor } = tabItem;
          const badge = 'badge' in tabItem ? tabItem.badge : undefined;
          const isLoading = 'loading' in tabItem ? (tabItem as any).loading : false;
          const isActive = tab === key;
          const colorMap: Record<string, { active: string; activeDark: string; bar: string; barDark: string; badgeActive: string; badgeActiveDark: string }> = {
            violet:  { active: 'text-violet-600',  activeDark: 'text-violet-300',  bar: 'bg-violet-600',  barDark: 'bg-violet-500',  badgeActive: 'bg-violet-100 text-violet-600',  badgeActiveDark: 'bg-violet-600/20 text-violet-400' },
            sky:     { active: 'text-sky-600',     activeDark: 'text-sky-300',     bar: 'bg-sky-600',     barDark: 'bg-sky-500',     badgeActive: 'bg-sky-100 text-sky-600',     badgeActiveDark: 'bg-sky-600/20 text-sky-400' },
            cyan:    { active: 'text-cyan-600',    activeDark: 'text-cyan-300',    bar: 'bg-cyan-600',    barDark: 'bg-cyan-500',    badgeActive: 'bg-cyan-100 text-cyan-600',    badgeActiveDark: 'bg-cyan-600/20 text-cyan-400' },
            emerald: { active: 'text-emerald-600', activeDark: 'text-emerald-300', bar: 'bg-emerald-600', barDark: 'bg-emerald-500', badgeActive: 'bg-emerald-100 text-emerald-600', badgeActiveDark: 'bg-emerald-600/20 text-emerald-400' },
            amber:   { active: 'text-amber-600',   activeDark: 'text-amber-300',   bar: 'bg-amber-600',   barDark: 'bg-amber-500',   badgeActive: 'bg-amber-100 text-amber-600',   badgeActiveDark: 'bg-amber-600/20 text-amber-400' },
            orange:  { active: 'text-orange-600',  activeDark: 'text-orange-300',  bar: 'bg-orange-600',  barDark: 'bg-orange-500',  badgeActive: 'bg-orange-100 text-orange-600',  badgeActiveDark: 'bg-orange-600/20 text-orange-400' },
            indigo:  { active: 'text-indigo-600',  activeDark: 'text-indigo-300',  bar: 'bg-indigo-600',  barDark: 'bg-indigo-500',  badgeActive: 'bg-indigo-100 text-indigo-600',  badgeActiveDark: 'bg-indigo-600/20 text-indigo-400' },
            pink:    { active: 'text-pink-600',    activeDark: 'text-pink-300',    bar: 'bg-pink-600',    barDark: 'bg-pink-500',    badgeActive: 'bg-pink-100 text-pink-600',    badgeActiveDark: 'bg-pink-600/20 text-pink-400' },
            rose:    { active: 'text-rose-600',    activeDark: 'text-rose-300',    bar: 'bg-rose-600',    barDark: 'bg-rose-500',    badgeActive: 'bg-rose-100 text-rose-600',    badgeActiveDark: 'bg-rose-600/20 text-rose-400' },
          };
          const c = colorMap[activeColor];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative',
                isActive
                  ? isDark ? c.activeDark : c.active
                  : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
              )}
              title={!expanded ? label : undefined}
            >
              {isLoading ? (
                <Loader2 className={cn('size-3.5 animate-spin', isDark ? 'text-violet-400' : 'text-violet-500')} />
              ) : (
                <Icon className="size-3.5" />
              )}
              {expanded && label}
              {badge != null && badge > 0 && (
                <span className={cn(
                  'text-[9px] min-w-[14px] text-center px-1 py-0 rounded-full leading-[14px]',
                  isLoading && !isActive
                    ? isDark ? 'bg-violet-600/20 text-violet-400' : 'bg-violet-100 text-violet-600'
                    : isActive
                      ? isDark ? c.badgeActiveDark : c.badgeActive
                      : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500',
                )}>
                  {badge}
                </span>
              )}
              {isActive && (
                <div className={cn(
                  'absolute bottom-0 left-2 right-2 h-0.5 rounded-full',
                  isDark ? c.barDark : c.bar,
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content — all tabs stay mounted once visited (keep-alive) */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Agents */}
        <div className={cn('absolute inset-0 flex flex-col overflow-hidden', tab !== 'agents' && 'invisible pointer-events-none')}>
          {/* Category filter tabs */}
          <div className={cn(
            'flex items-center gap-1 px-3 py-2 border-b overflow-x-auto scrollbar-none',
            isDark ? 'border-zinc-800' : 'border-gray-200',
          )}>
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                !activeCategory
                  ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-700'
                  : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              {t('allCategories')}
            </button>
            {allCats.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
                className={cn(
                  'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                  cat.id === activeCategory
                    ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-700'
                    : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                )}
              >
                {cat.name}
              </button>
            ))}
            <button
              onClick={() => setShowAddCategory(true)}
              className={cn(
                'shrink-0 size-5 rounded-md flex items-center justify-center transition-colors',
                isDark ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100',
              )}
              title={t('addCategory')}
            >
              <Plus className="size-3" />
            </button>
          </div>

          {/* Add category inline */}
          {showAddCategory && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 border-b',
              isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
            )}>
              <Tag className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input
                className={cn(
                  'flex-1 text-xs bg-transparent outline-none',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
                )}
                placeholder={t('categoryName')}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowAddCategory(false); }}
                autoFocus
              />
              <button onClick={handleAddCategory} className="text-emerald-400 hover:text-emerald-300">
                <Check className="size-3.5" />
              </button>
              <button onClick={() => setShowAddCategory(false)} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Header */}
          <div className={cn('flex items-center justify-between px-4 py-2.5 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
            <div className="flex items-center gap-2">
              {agents.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    'size-4 rounded border flex items-center justify-center transition-colors shrink-0',
                    allSelected
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : selectedAgents.size > 0
                        ? 'bg-violet-600/30 border-violet-500 text-white'
                        : isDark
                          ? 'border-zinc-600 hover:border-zinc-400'
                          : 'border-gray-300 hover:border-gray-500',
                  )}
                  title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                >
                  {allSelected ? (
                    <Check className="size-2.5" />
                  ) : selectedAgents.size > 0 ? (
                    <span className="block size-1.5 bg-white rounded-sm" />
                  ) : null}
                </button>
              )}
              <MessageSquare className="size-4 text-violet-400" />
              <span className={cn('font-semibold text-xs', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                {t('conversations')}
              </span>
            </div>
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              <Plus className="size-3.5" />
              {t('new')}
            </button>
          </div>

          {/* Bulk actions bar */}
          {selectionMode && (
            <div className={cn(
              'flex items-center justify-between gap-2 px-3 py-2 border-b',
              isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-gray-50 border-gray-200',
            )}>
              <span className={cn('text-[11px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                {selectedAgents.size} seleccionado{selectedAgents.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setBulkConfirm('archive')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                    isDark ? 'text-amber-400 hover:bg-zinc-800 border border-amber-800/40' : 'text-amber-600 hover:bg-amber-50 border border-amber-200',
                  )}
                >
                  <Archive className="size-3" />
                  Archivar
                </button>
                <button
                  onClick={() => setBulkConfirm('delete')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                    isDark ? 'text-red-400 hover:bg-zinc-800 border border-red-800/40' : 'text-red-500 hover:bg-red-50 border border-red-200',
                  )}
                >
                  <Trash2 className="size-3" />
                  Borrar
                </button>
                <button
                  onClick={() => { setSelectedAgents(new Set()); setBulkConfirm(null); }}
                  className={cn(
                    'size-6 rounded-md flex items-center justify-center transition-colors',
                    isDark ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
                  )}
                  title="Cancelar selección"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          )}

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto py-1">
            {agents.length === 0 && (
              <div className="text-center py-12 px-4">
                <Bot className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('noConversations')}</p>
                <p className={cn('text-xs mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                  {t('startConversation')}
                </p>
              </div>
            )}

            {activeCategory ? (
              <div className="px-2 space-y-0.5">
                {filtered.map((agent) => (
                  <AgentItem
                    key={agent.id}
                    agent={agent}
                    isDark={isDark}
                    t={t}
                    isActive={agent.id === activeAgentId}
                    editingId={editingId}
                    editName={editName}
                    menuOpenId={menuOpenId}
                    dragOverId={dragOverId}
                    categories={allCats}
                    isChecked={selectedAgents.has(agent.id)}
                    selectionActive={selectionMode}
                    onToggleCheck={toggleSelect}
                    onSelect={onSelect}
                    onStartEdit={startRename}
                    onEditNameChange={setEditName}
                    onCommitRename={commitRename}
                    onCancelEdit={() => setEditingId(null)}
                    onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                    onCloseMenu={() => setMenuOpenId(null)}
                    onDelete={(id) => { onDelete(id); setMenuOpenId(null); }}
                    onChangeCategory={(agentId, catId) => { onChangeCategory(agentId, catId); setMenuOpenId(null); }}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    getStatusLabel={getStatusLabel}
                  />
                ))}
              </div>
            ) : grouped.size > 0 ? (
              [...grouped.entries()].map(([catId, catAgents]) => {
                const cat = allCats.find((c) => c.id === catId);
                const isCollapsed = collapsedCats.has(catId);

                return (
                  <div key={catId} className="mb-1">
                    <div className={cn(
                      'flex items-center justify-between px-3 py-1.5 group',
                      isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-gray-50',
                    )}>
                      <button
                        onClick={() => toggleCatCollapse(catId)}
                        className="flex items-center gap-1.5 flex-1"
                      >
                        {isCollapsed
                          ? <ChevronRight className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                          : <ChevronDown className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                        }
                        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                          {cat?.name || catId}
                        </span>
                        <span className={cn('text-[9px] px-1 rounded', isDark ? 'text-zinc-600 bg-zinc-800/50' : 'text-gray-400 bg-gray-100')}>
                          {catAgents.length}
                        </span>
                      </button>
                      {catId !== 'general' && (
                        <button
                          onClick={() => onDeleteCategory(catId)}
                          className={cn(
                            'size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
                            isDark ? 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100',
                          )}
                          title={t('deleteCategory')}
                        >
                          <Trash2 className="size-2.5" />
                        </button>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="px-2 space-y-0.5">
                        {catAgents.map((agent) => (
                          <AgentItem
                            key={agent.id}
                            agent={agent}
                            isDark={isDark}
                            t={t}
                            isActive={agent.id === activeAgentId}
                            editingId={editingId}
                            editName={editName}
                            menuOpenId={menuOpenId}
                            dragOverId={dragOverId}
                            categories={allCats}
                            isChecked={selectedAgents.has(agent.id)}
                            selectionActive={selectionMode}
                            onToggleCheck={toggleSelect}
                            onSelect={onSelect}
                            onStartEdit={startRename}
                            onEditNameChange={setEditName}
                            onCommitRename={commitRename}
                            onCancelEdit={() => setEditingId(null)}
                            onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                            onCloseMenu={() => setMenuOpenId(null)}
                            onDelete={(id) => { onDelete(id); setMenuOpenId(null); }}
                            onChangeCategory={(agentId, catId2) => { onChangeCategory(agentId, catId2); setMenuOpenId(null); }}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={handleDragEnd}
                            getStatusLabel={getStatusLabel}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : null}
          </div>

          {/* Archived agents section */}
          <div className={cn('border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
            <button
              onClick={() => { setShowArchived(!showArchived); if (!showArchived) { loadArchived(); setSelectedArchived(new Set()); setBulkArchivedConfirm(null); } }}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-medium transition-colors w-full px-3 py-2',
                isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              {showArchived ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              <Archive className="size-3" />
              Archivados
              {archivedAgents.length > 0 && (
                <span className={cn('text-[9px] px-1 rounded', isDark ? 'text-zinc-600 bg-zinc-800/50' : 'text-gray-400 bg-gray-100')}>
                  {archivedAgents.length}
                </span>
              )}
            </button>
            {showArchived && (
              <div className="flex flex-col">
                {/* Archived header with select all */}
                {archivedAgents.length > 0 && (
                  <div className={cn('flex items-center justify-between gap-2 px-3 py-1.5 border-b',
                    isDark ? 'border-zinc-800/60' : 'border-gray-100')}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleSelectAllArchived}
                        className={cn(
                          'size-3.5 rounded border flex items-center justify-center transition-colors shrink-0',
                          allArchivedSelected
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : selectedArchived.size > 0
                              ? 'bg-violet-600/30 border-violet-500 text-white'
                              : isDark ? 'border-zinc-600 hover:border-zinc-400' : 'border-gray-300 hover:border-gray-500',
                        )}
                      >
                        {allArchivedSelected ? <Check className="size-2" /> : selectedArchived.size > 0 ? <span className="block size-1 bg-white rounded-sm" /> : null}
                      </button>
                      <span className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                        {archivedSelectionMode ? `${selectedArchived.size} sel.` : 'Seleccionar'}
                      </span>
                    </div>
                    {archivedSelectionMode && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setBulkArchivedConfirm('delete')}
                          className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors',
                            isDark ? 'text-red-400 hover:bg-zinc-800 border border-red-800/40' : 'text-red-500 hover:bg-red-50 border border-red-200')}
                        >
                          <Trash2 className="size-2.5" />
                          Borrar
                        </button>
                        <button
                          onClick={() => { setSelectedArchived(new Set()); setBulkArchivedConfirm(null); }}
                          className={cn('size-5 rounded flex items-center justify-center transition-colors',
                            isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100')}
                        >
                          <X className="size-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Archived list with scroll */}
                <div className="max-h-[200px] overflow-y-auto px-2 py-1 space-y-0.5">
                  {archivedAgents.length === 0 ? (
                    <p className={cn('text-[10px] pl-3 py-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                      No hay agentes archivados
                    </p>
                  ) : archivedAgents.map((a) => (
                    <div key={a.id} className={cn(
                      'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
                      selectedArchived.has(a.id)
                        ? isDark ? 'bg-violet-900/20' : 'bg-violet-50'
                        : isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-gray-50',
                    )}>
                      <button
                        onClick={() => toggleSelectArchived(a.id)}
                        className={cn(
                          'size-3.5 rounded border flex items-center justify-center transition-all shrink-0',
                          selectedArchived.has(a.id)
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : archivedSelectionMode
                              ? isDark ? 'border-zinc-600 hover:border-zinc-400' : 'border-gray-300 hover:border-gray-500'
                              : isDark
                                ? 'border-zinc-700 opacity-0 group-hover:opacity-100 hover:border-zinc-400'
                                : 'border-gray-300 opacity-0 group-hover:opacity-100 hover:border-gray-500',
                        )}
                      >
                        {selectedArchived.has(a.id) && <Check className="size-2" />}
                      </button>
                      <Bot className={cn('size-3 shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                      <div className="flex-1 min-w-0">
                        <span className={cn('text-[10px] truncate block', isDark ? 'text-zinc-400' : 'text-gray-500')}>{a.name}</span>
                        {a.archivedAt && (
                          <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                            {new Date(a.archivedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRestore(a.id)}
                        disabled={restoringId === a.id}
                        className={cn(
                          'shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors',
                          restoringId === a.id
                            ? isDark ? 'text-zinc-600' : 'text-gray-400'
                            : isDark ? 'text-emerald-400 hover:bg-emerald-900/30' : 'text-emerald-600 hover:bg-emerald-50',
                        )}
                      >
                        {restoringId === a.id ? <Loader2 className="size-3 animate-spin" /> : 'Restaurar'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <QuickActions />

          {/* Bulk confirm overlay - fixed on top */}
          {bulkConfirm && (
            <>
              <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setBulkConfirm(null)} />
              <div className={cn(
                'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-72 rounded-xl shadow-2xl p-4 border animate-in fade-in zoom-in-95 duration-150',
                isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
              )}>
                <div className="flex items-center gap-2 mb-3">
                  {bulkConfirm === 'archive'
                    ? <Archive className="size-5 text-amber-400" />
                    : <Trash2 className="size-5 text-red-400" />
                  }
                  <span className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                    {bulkConfirm === 'archive' ? 'Archivar agentes' : 'Borrar agentes'}
                  </span>
                </div>
                <p className={cn('text-xs mb-1', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  {bulkConfirm === 'archive'
                    ? `¿Archivar ${selectedAgents.size} agente${selectedAgents.size > 1 ? 's' : ''}?`
                    : `¿Borrar permanentemente ${selectedAgents.size} agente${selectedAgents.size > 1 ? 's' : ''}?`
                  }
                </p>
                <p className={cn('text-[10px] mb-4', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                  {bulkConfirm === 'archive'
                    ? 'Podrás restaurarlos desde "Archivados".'
                    : 'Se archivarán y no aparecerán en la lista activa.'
                  }
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={bulkConfirm === 'archive' ? handleBulkArchive : handleBulkDeletePermanent}
                    className={cn(
                      'flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      bulkConfirm === 'archive'
                        ? isDark ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-500 text-white hover:bg-amber-400'
                        : isDark ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-red-500 text-white hover:bg-red-400',
                    )}
                  >
                    {bulkConfirm === 'archive' ? 'Archivar' : 'Borrar'}
                  </button>
                  <button
                    onClick={() => setBulkConfirm(null)}
                    className={cn(
                      'flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    )}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Bulk archived confirm overlay */}
          {bulkArchivedConfirm && (
            <>
              <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setBulkArchivedConfirm(null)} />
              <div className={cn(
                'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-72 rounded-xl shadow-2xl p-4 border animate-in fade-in zoom-in-95 duration-150',
                isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
              )}>
                <div className="flex items-center gap-2 mb-3">
                  <Trash2 className="size-5 text-red-400" />
                  <span className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                    Borrar permanentemente
                  </span>
                </div>
                <p className={cn('text-xs mb-1', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  ¿Eliminar {selectedArchived.size} agente{selectedArchived.size > 1 ? 's' : ''} archivado{selectedArchived.size > 1 ? 's' : ''}?
                </p>
                <p className={cn('text-[10px] mb-4', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                  Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkDeleteArchived}
                    className={cn('flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      isDark ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-red-500 text-white hover:bg-red-400')}
                  >
                    Borrar
                  </button>
                  <button
                    onClick={() => setBulkArchivedConfirm(null)}
                    className={cn('flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Apps */}
        {mountedTabs.has('apps') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'apps' && 'invisible pointer-events-none')}>
            <AppBrowser onOpenApp={(app) => {
              if (onCreateAgent) {
                onCreateAgent(
                  app.name,
                  'cursor',
                  app.path,
                  undefined,
                  `Estás trabajando en el proyecto "${app.name}" ubicado en ${app.path}. ${app.framework ? `Es un proyecto ${app.framework}.` : ''} Ayuda al usuario con lo que necesite.`,
                ).catch(() => {});
              }
            }} />
          </div>
        )}

        {/* Components */}
        {mountedTabs.has('components') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'components' && 'invisible pointer-events-none')}>
            <ComponentLibrary onOpen={onOpenComponent} />
          </div>
        )}

        {/* Code */}
        {mountedTabs.has('code') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'code' && 'invisible pointer-events-none')}>
            <CodeExplorer />
          </div>
        )}

        {/* Kanban */}
        {mountedTabs.has('kanban') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'kanban' && 'invisible pointer-events-none')}>
            <KanbanBoard onCreateAgent={onCreateAgent} onGoToAgent={onGoToAgent} initialTicketId={pendingKanbanTicketId} onInitialTicketHandled={onPendingKanbanTicketHandled} />
          </div>
        )}

        {/* Database */}
        {mountedTabs.has('database') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'database' && 'invisible pointer-events-none')}>
            <CouchDBManager />
          </div>
        )}

        {/* Logs */}
        {mountedTabs.has('logs') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'logs' && 'invisible pointer-events-none')}>
            <ActivityLogs onCreateAgent={onCreateAgent} />
          </div>
        )}

        {/* Empresas */}
        {mountedTabs.has('empresas') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'empresas' && 'invisible pointer-events-none')}>
            <StopdownPlatform />
          </div>
        )}

        {/* Settings */}
        {mountedTabs.has('settings') && (
          <div className={cn('absolute inset-0 overflow-hidden', tab !== 'settings' && 'invisible pointer-events-none')}>
            <AppSettings
              shortcut={shortcut}
              onChangeShortcut={onChangeShortcut}
              bubblePosition={bubblePosition}
              popupPosition={popupPosition}
              onChangeBubblePosition={onChangeBubblePosition}
              onChangePopupPosition={onChangePopupPosition}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface AgentItemProps {
  agent: Agent;
  isDark: boolean;
  t: (key: string) => string;
  isActive: boolean;
  editingId: string | null;
  editName: string;
  menuOpenId: string | null;
  dragOverId: string | null;
  categories: AgentCategory[];
  isChecked: boolean;
  selectionActive: boolean;
  onToggleCheck: (id: string) => void;
  onSelect: (id: string) => void;
  onStartEdit: (agent: Agent) => void;
  onEditNameChange: (name: string) => void;
  onCommitRename: () => void;
  onCancelEdit: () => void;
  onMenuToggle: (id: string) => void;
  onCloseMenu: () => void;
  onDelete: (id: string) => void;
  onChangeCategory: (agentId: string, catId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  getStatusLabel: (status: string) => string;
}

function AgentItem({
  agent, isDark, t, isActive,
  editingId, editName, menuOpenId, dragOverId, categories,
  isChecked, selectionActive, onToggleCheck,
  onSelect, onStartEdit, onEditNameChange, onCommitRename, onCancelEdit,
  onMenuToggle, onCloseMenu, onDelete, onChangeCategory,
  onDragStart, onDragOver, onDragEnd, getStatusLabel,
}: AgentItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const st = statusConfig[agent.status] || statusConfig.idle;
  const StatusIcon = st.icon;
  const isConversation = agent.type === 'conversation';
  const statusLabel = getStatusLabel(agent.status);
  const isEditing = editingId === agent.id;
  const isMenuOpen = menuOpenId === agent.id;
  const isDragOver = dragOverId === agent.id;

  useEffect(() => {
    if (!isMenuOpen) setConfirmDelete(false);
  }, [isMenuOpen]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(agent.id)}
      onDragOver={(e) => onDragOver(e, agent.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-2 py-2.5 cursor-pointer transition-all',
        isDragOver
          ? isDark ? 'bg-violet-900/20 border border-violet-500/30' : 'bg-violet-50 border border-violet-300'
          : isActive
            ? isDark
              ? 'bg-zinc-800/80 text-zinc-100 border border-transparent'
              : 'bg-gray-100 text-gray-900 border border-transparent'
            : isDark
              ? 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border border-transparent',
      )}
      onClick={() => onSelect(agent.id)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleCheck(agent.id); }}
        className={cn(
          'size-4 rounded border flex items-center justify-center transition-all shrink-0',
          isChecked
            ? 'bg-violet-600 border-violet-600 text-white'
            : selectionActive
              ? isDark ? 'border-zinc-600 hover:border-zinc-400' : 'border-gray-300 hover:border-gray-500'
              : isDark
                ? 'border-zinc-700 opacity-0 group-hover:opacity-100 hover:border-zinc-400'
                : 'border-gray-300 opacity-0 group-hover:opacity-100 hover:border-gray-500',
        )}
      >
        {isChecked && <Check className="size-2.5" />}
      </button>

      <div className="relative shrink-0">
        <div
          className={cn(
            'size-8 rounded-lg flex items-center justify-center',
            isConversation
              ? isActive
                ? 'bg-violet-600/30 text-violet-300'
                : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400'
              : isActive
                ? 'bg-emerald-600/30 text-emerald-300'
                : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400',
          )}
        >
          {isConversation ? <Bot className="size-4" /> : <Terminal className="size-4" />}
        </div>
        <StatusIcon
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-3',
            st.color,
            agent.status === 'running' && 'animate-spin',
          )}
          title={statusLabel}
          aria-label={statusLabel}
        />
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            className={cn(
              'w-full border rounded px-2 py-0.5 text-sm outline-none focus:border-violet-500',
              isDark ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900',
            )}
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p className="text-sm font-medium truncate">{agent.name}</p>
            <p className={cn('text-[10px] truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {isConversation ? (
                <span className="text-violet-500/70">{agent.model || 'gpt-4o-mini'}</span>
              ) : (
                <span className="font-mono">{agent.cwd}</span>
              )}
            </p>
          </>
        )}
      </div>

      {agent.status !== 'running' && agent.updatedAt && (
        <span className={cn(
          'shrink-0 flex items-center gap-0.5 text-[9px] tabular-nums',
          isDark ? 'text-zinc-600' : 'text-gray-400',
        )} title={new Date(agent.updatedAt).toLocaleString()}>
          <Clock className="size-2.5" />
          {timeAgo(agent.updatedAt)}
        </span>
      )}

      <div className="relative shrink-0">
        <button
          className={cn(
            'size-6 flex items-center justify-center rounded-md transition-colors',
            isMenuOpen
              ? isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800'
              : isDark
                ? 'opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-400'
                : 'opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-500',
          )}
          onClick={(e) => { e.stopPropagation(); onMenuToggle(agent.id); }}
        >
          <MoreHorizontal className="size-3.5" />
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={onCloseMenu} />
            <div className={cn(
              'absolute right-0 top-7 z-[110] w-44 rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100 border',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}>
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                  isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50',
                )}
                onClick={(e) => { e.stopPropagation(); onStartEdit(agent); }}
              >
                <Pencil className="size-3" /> {t('rename')}
              </button>

              {/* Category submenu */}
              <div className={cn('border-t my-1', isDark ? 'border-zinc-800' : 'border-gray-200')} />
              <div className={cn('px-3 py-1 text-[10px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('categoryLabel')}
              </div>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1 text-[11px] transition-colors',
                    (agent.category || 'general') === cat.id
                      ? isDark ? 'text-violet-400 bg-violet-900/20' : 'text-violet-600 bg-violet-50'
                      : isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-50',
                  )}
                  onClick={(e) => { e.stopPropagation(); onChangeCategory(agent.id, cat.id); }}
                >
                  <Tag className="size-2.5" />
                  {cat.name}
                  {(agent.category || 'general') === cat.id && <Check className="size-2.5 ml-auto" />}
                </button>
              ))}

              <div className={cn('border-t my-1', isDark ? 'border-zinc-800' : 'border-gray-200')} />
              {!confirmDelete ? (
                <button
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                    isDark ? 'text-amber-400 hover:bg-zinc-800' : 'text-amber-600 hover:bg-gray-50',
                  )}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                >
                  <Archive className="size-3" /> Archivar
                </button>
              ) : (
                <div className="px-2 py-1.5">
                  <p className={cn('text-[10px] font-medium mb-1.5', isDark ? 'text-amber-400' : 'text-amber-600')}>
                    ¿Archivar este agente?
                  </p>
                  <p className={cn('text-[9px] mb-2', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                    Podrás restaurarlo después desde "Archivados"
                  </p>
                  <div className="flex gap-1">
                    <button
                      className={cn(
                        'flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                        isDark ? 'bg-amber-900/50 text-amber-300 hover:bg-amber-900' : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                      )}
                      onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
                    >
                      Sí, archivar
                    </button>
                    <button
                      className={cn(
                        'flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                        isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      )}
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
