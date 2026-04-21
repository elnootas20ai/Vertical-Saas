import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Loader2, AlertCircle, X, Maximize2, Minimize2, Sun, Moon, Globe, ChevronDown, Plus } from 'lucide-react';
import { usePlugin } from './hooks/usePlugin';
import { usePluginSettings, LOCALE_LABELS, LOCALE_FLAGS, type PluginLocale } from './PluginProvider';
import { AgentSidebar } from './components/AgentSidebar';
import { AgentChat } from './components/AgentChat';
import { AgentConversation } from './components/AgentConversation';
import { ComponentEditor } from './components/ComponentEditor';
import { CreateAgentDialog } from './components/CreateAgentDialog';
import { CreateAppDialog } from './components/CreateAppDialog';
import { ShortcutRecorder } from './components/ShortcutRecorder';
import { PositionSelector } from './components/PositionSelector';
import { cn } from '../app/components/ui/utils';
import type { BubblePosition, PopupPosition, ShortcutConfig } from './PluginPanel';
import type { SavedComponent } from './types';

interface PluginProps {
  onClose?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  bubblePosition?: BubblePosition;
  popupPosition?: PopupPosition;
  onChangeBubblePosition?: (pos: BubblePosition) => void;
  onChangePopupPosition?: (pos: PopupPosition) => void;
  roundedClass?: string;
  quickCommandTrigger?: number;
  elementPickerTrigger?: number;
  shortcut?: ShortcutConfig;
  onChangeShortcut?: (s: ShortcutConfig) => void;
  defaultCwd?: string;
}

const LOCALES: PluginLocale[] = ['en', 'es', 'fr', 'pt'];

export function Plugin({
  onClose, expanded, onToggleExpand,
  bubblePosition, popupPosition, onChangeBubblePosition, onChangePopupPosition,
  roundedClass, quickCommandTrigger, elementPickerTrigger, shortcut, onChangeShortcut,
  defaultCwd,
}: PluginProps) {
  const {
    agents, agentCategories, activeAgent, activeAgentId, terminalOutput,
    loading, error, selectAgent, deselectAgent, createAgent,
    renameAgent, updateModel, removeAgent, updateAgentCategory, reorderAgentList,
    addAgentCategory, removeAgentCategory, sendCommand, sendSignal, restartTerminal,
    setError, queue, addToQueue, removeFromQueue, clearQueueItems,
    reorderQueueItem, messages, isStreaming, isThinking, sendMessage, clearMessages,
  } = usePlugin();

  const { isDark, toggleTheme, locale, setLocale, t } = usePluginSettings();
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [showAgentList, setShowAgentList] = useState(true);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SavedComponent | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'agents' | 'components' | 'code' | 'kanban' | 'database' | 'settings'>('agents');
  const quickCmdHandled = useRef(0);
  const elementPickerHandled = useRef(0);
  const [autoElementPicker, setAutoElementPicker] = useState(false);
  const [agentTicketLinks, setAgentTicketLinks] = useState<Record<string, { ticketId: string; ticketTitle: string }>>({});
  const [pendingKanbanTicketId, setPendingKanbanTicketId] = useState<string | null>(null);

  const handleOpenComponent = async (comp: SavedComponent) => {
    const agentName = `✏️ ${comp.name}`;
    const existing = agents.find((a) => a.name === agentName && a.type === 'cursor');
    if (existing) {
      selectAgent(existing.id);
      setEditingComponent(comp);
      setSidebarTab('components');
      setShowAgentList(false);
      return;
    }
    const filePath = `src/app/components/saved/${comp.fileName}`;
    await createAgent(
      agentName,
      'cursor',
      undefined,
      undefined,
      `Edita el componente React en el archivo ${filePath}. Es un componente con React + Tailwind CSS. Cuando te pida cambios, edita directamente el archivo.`,
    );
    setEditingComponent(comp);
    setSidebarTab('components');
    setShowAgentList(false);
  };

  const handleAppCreated = async (appName: string, port: number, prompt: string, cwd: string) => {
    await createAgent(`App: ${appName}`, 'cursor', cwd, 'claude-4.6-sonnet-medium-thinking', prompt);
    setShowAgentList(false);

    const host = window.location.hostname;
    const onDone = () => {
      window.removeEventListener('plugin:message_done', onDone);
      setTimeout(() => {
        window.open(`http://${host}:${port}`, '_blank');
      }, 3000);
    };
    window.addEventListener('plugin:message_done', onDone);
  };

  const handleBackFromEditor = () => {
    setEditingComponent(null);
    deselectAgent();
    setSidebarTab('components');
    setShowAgentList(true);
  };

  useEffect(() => {
    if (!quickCommandTrigger || quickCommandTrigger === quickCmdHandled.current) return;
    quickCmdHandled.current = quickCommandTrigger;

    const agentNum = agents.length + 1;
    createAgent(`${t('conversation')} ${agentNum}`, 'conversation', defaultCwd).then(() => {
      setShowAgentList(false);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-plugin-chat-input]');
        input?.focus();
      }, 100);
    });
  }, [quickCommandTrigger, agents.length, createAgent, t, defaultCwd]);

  useEffect(() => {
    if (!elementPickerTrigger || elementPickerTrigger === elementPickerHandled.current) return;
    elementPickerHandled.current = elementPickerTrigger;

    if (!activeAgent) {
      const agentNum = agents.length + 1;
      createAgent(`${t('conversation')} ${agentNum}`, 'conversation', defaultCwd).then(() => {
        setShowAgentList(false);
        setAutoElementPicker(true);
      });
    }
  }, [elementPickerTrigger, activeAgent, agents.length, createAgent, t, defaultCwd]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyE' || e.key.toLowerCase() === 'e')) {
        if (!activeAgent) {
          e.preventDefault();
          e.stopPropagation();
          const agentNum = agents.length + 1;
          createAgent(`${t('conversation')} ${agentNum}`, 'conversation', defaultCwd).then(() => {
            setShowAgentList(false);
            setAutoElementPicker(true);
          });
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeAgent, agents.length, createAgent, t]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, ticketId, ticketTitle } = (e as CustomEvent).detail || {};
      if (agentId && ticketId) {
        setAgentTicketLinks((prev) => ({ ...prev, [agentId]: { ticketId, ticketTitle } }));
      }
    };
    window.addEventListener('kanban:agent-linked', handler);
    return () => window.removeEventListener('kanban:agent-linked', handler);
  }, []);

  const handleGoToTicket = useCallback((ticketId: string) => {
    setPendingKanbanTicketId(ticketId);
    deselectAgent();
    setShowAgentList(true);
    setSidebarTab('kanban');
  }, [deselectAgent]);

  const handleGoToAgent = useCallback((agentId: string) => {
    selectAgent(agentId);
    setShowAgentList(false);
    setSidebarTab('agents');
  }, [selectAgent]);

  return (
    <div className={cn(
      'flex flex-col h-full overflow-hidden',
      isDark ? 'bg-zinc-950 text-zinc-100 border-zinc-800' : 'bg-white text-gray-900 border-gray-200',
      roundedClass || 'rounded-l-xl border-l',
    )}>
      {/* Panel header */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b shrink-0 backdrop-blur-sm',
        isDark ? 'border-zinc-800 bg-zinc-950/95' : 'border-gray-200 bg-white/95',
      )}>
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-violet-600/20 flex items-center justify-center">
            <Bot className="size-3.5 text-violet-400" />
          </div>
          <span className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>
            {t('assistant')}
          </span>
          {agents.length > 0 && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full',
              isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500',
            )}>
              {agents.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Create new app */}
          <button
            onClick={() => setShowCreateApp(true)}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-all',
              isDark
                ? 'hover:bg-emerald-900/40 text-emerald-500 hover:text-emerald-400'
                : 'hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700',
            )}
            title={t('newApp')}
          >
            <Plus className="size-3.5" />
          </button>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className={cn(
                'flex items-center gap-0.5 h-6 px-1.5 rounded-md text-[10px] font-bold transition-colors',
                showLangMenu
                  ? (isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800')
                  : (isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'),
              )}
              title={t('language')}
            >
              <Globe className="size-3" />
              <span>{LOCALE_FLAGS[locale]}</span>
            </button>

            {showLangMenu && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setShowLangMenu(false)} />
                <div className={cn(
                  'absolute right-0 top-8 z-[110] rounded-lg shadow-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100',
                  isDark ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200',
                )}>
                  {LOCALES.map((l) => (
                    <button
                      key={l}
                      onClick={() => { setLocale(l); setShowLangMenu(false); }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                        locale === l
                          ? (isDark ? 'bg-zinc-800 text-violet-300' : 'bg-gray-100 text-violet-600')
                          : (isDark ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'),
                      )}
                    >
                      <span className="font-bold text-[10px] w-5">{LOCALE_FLAGS[l]}</span>
                      <span>{LOCALE_LABELS[l]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
            )}
            title={isDark ? t('lightMode') : t('darkMode')}
          >
            {isDark ? <Sun className="size-3" /> : <Moon className="size-3" />}
          </button>

          {shortcut && onChangeShortcut && (
            <ShortcutRecorder current={shortcut} onChange={onChangeShortcut} />
          )}
          {bubblePosition && popupPosition && onChangeBubblePosition && onChangePopupPosition && (
            <PositionSelector
              bubblePosition={bubblePosition}
              popupPosition={popupPosition}
              onChangeBubblePosition={onChangeBubblePosition}
              onChangePopupPosition={onChangePopupPosition}
            />
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className={cn(
                'size-6 rounded-md flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
              )}
              title={expanded ? t('reduce') : t('expand')}
            >
              {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className={cn(
                'size-6 rounded-md flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
              )}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Default cwd indicator */}
      {defaultCwd && (
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1 border-b shrink-0 text-[10px] font-mono',
          isDark ? 'border-zinc-800/60 bg-zinc-900/50 text-emerald-500' : 'border-gray-100 bg-gray-50 text-emerald-600',
        )}>
          <span className="opacity-60">cwd:</span>
          <span className="truncate">{defaultCwd}</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className={cn(
          'flex items-center gap-2 mx-2 mt-2 rounded-lg px-3 py-2 animate-in slide-in-from-top-1 duration-150',
          isDark ? 'bg-red-950/80 border border-red-900/60' : 'bg-red-50 border border-red-200',
        )}>
          <AlertCircle className={cn('size-3.5 shrink-0', isDark ? 'text-red-400' : 'text-red-500')} />
          <p className={cn('text-[10px] flex-1 truncate', isDark ? 'text-red-300' : 'text-red-600')}>{error}</p>
          <button onClick={() => setError(null)} className={cn('text-xs', isDark ? 'text-red-500 hover:text-red-300' : 'text-red-400 hover:text-red-600')}>&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-5 text-emerald-400 animate-spin" />
          <p className={cn('text-[10px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('loading')}</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden w-full">
          {showAgentList && !activeAgent && (
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <AgentSidebar
                agents={agents}
                agentCategories={agentCategories}
                activeAgentId={activeAgentId}
                onSelect={(id) => { selectAgent(id); setShowAgentList(false); }}
                onCreate={() => setShowCreate(true)}
                onRename={renameAgent}
                onDelete={removeAgent}
                onChangeCategory={updateAgentCategory}
                onReorder={reorderAgentList}
                onAddCategory={addAgentCategory}
                onDeleteCategory={removeAgentCategory}
                onClearChat={() => {}}
                onSettings={() => {}}
                onOpenComponent={handleOpenComponent}
                activeTab={sidebarTab}
                onTabChange={setSidebarTab}
                onCreateAgent={createAgent}
                onGoToAgent={handleGoToAgent}
                expanded={expanded}
                pendingKanbanTicketId={pendingKanbanTicketId}
                onPendingKanbanTicketHandled={() => setPendingKanbanTicketId(null)}
              />
            </div>
          )}

          {activeAgent && editingComponent && (activeAgent.type === 'cursor') && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              <ComponentEditor
                component={editingComponent}
                agent={activeAgent}
                messages={messages}
                isStreaming={isStreaming}
                isThinking={isThinking}
                onSend={sendMessage}
                onClear={clearMessages}
                onBack={handleBackFromEditor}
                agents={agents}
                onSelectAgent={(id) => { setEditingComponent(null); selectAgent(id); }}
                onNewAgent={() => setShowCreate(true)}
              />
            </div>
          )}

          {activeAgent && !editingComponent && (activeAgent.type === 'conversation' || activeAgent.type === 'cursor') && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              <AgentConversation
                agent={activeAgent}
                messages={messages}
                isStreaming={isStreaming}
                isThinking={isThinking}
                onSend={sendMessage}
                onClear={clearMessages}
                onBack={() => { deselectAgent(); setShowAgentList(true); }}
                agents={agents}
                onSelectAgent={(id) => selectAgent(id)}
                onNewAgent={() => setShowCreate(true)}
                autoPickElement={autoElementPicker}
                onAutoPickHandled={() => setAutoElementPicker(false)}
                onModelChange={(model) => updateModel(activeAgent.id, model)}
                ticketLink={agentTicketLinks[activeAgent.id] || null}
                onGoToTicket={handleGoToTicket}
              />
            </div>
          )}

          {activeAgent && activeAgent.type !== 'conversation' && activeAgent.type !== 'cursor' && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              <AgentChat
                agent={activeAgent}
                terminalOutput={terminalOutput}
                onSend={sendCommand}
                onSignal={sendSignal}
                onRestart={restartTerminal}
                onBack={() => { deselectAgent(); setShowAgentList(true); }}
                agents={agents}
                onSelectAgent={(id) => selectAgent(id)}
                onNewAgent={() => setShowCreate(true)}
                queue={queue}
                onAddToQueue={addToQueue}
                onRemoveFromQueue={removeFromQueue}
                onClearQueue={clearQueueItems}
                onReorderQueue={reorderQueueItem}
              />
            </div>
          )}

          {!activeAgent && !showAgentList && (
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <Bot className={cn('size-8 mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
              <p className={cn('text-xs text-center', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('selectOrCreate')}
              </p>
              <button
                onClick={() => setShowAgentList(true)}
                className="mt-2 text-[10px] text-violet-400 hover:text-violet-300"
              >
                {t('viewConversations')}
              </button>
            </div>
          )}
        </div>
      )}

      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(name, type, cwd, model, prompt) => {
          createAgent(name, type, cwd || defaultCwd, model, prompt);
          setShowAgentList(false);
        }}
      />

      <CreateAppDialog
        open={showCreateApp}
        onClose={() => setShowCreateApp(false)}
        onCreated={handleAppCreated}
      />
    </div>
  );
}
