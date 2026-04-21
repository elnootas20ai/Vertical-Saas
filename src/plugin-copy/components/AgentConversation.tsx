import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Trash2,
  ArrowDown,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  Brain,
  Sparkles,
  FileText,
  Pencil,
  Terminal,
  Search,
  FolderOpen,
  Wrench,
  Check,
  X,
  AtSign,
  File,
  Code,
  Image as ImageIcon,
  FileJson,
  FileCode,
  MousePointerClick,
  Bookmark,
} from 'lucide-react';
import type { Agent, ChatMessage, ToolCallInfo, ElementReference } from '../types';
import { agentApi } from '../lib/api';
import { cn } from '../../app/components/ui/utils';
import { ElementPicker } from './ElementPicker';
import { usePluginSettings } from '../PluginProvider';
import { AgentVersions } from './AgentVersions';
import { getModelsForType } from '../models';

interface Props {
  agent: Agent;
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  onSend: (message: string, attachedFiles?: string[]) => void;
  onClear: () => void;
  onBack?: () => void;
  agents?: Agent[];
  onSelectAgent?: (id: string) => void;
  onNewAgent?: () => void;
  autoPickElement?: boolean;
  onAutoPickHandled?: () => void;
  onModelChange?: (model: string) => void;
  ticketLink?: { ticketId: string; ticketTitle: string } | null;
  onGoToTicket?: (ticketId: string) => void;
}

const FILE_ICON_MAP: Record<string, typeof File> = {
  tsx: FileCode, ts: FileCode, jsx: FileCode, js: FileCode,
  json: FileJson, css: FileCode, html: FileCode, md: FileText,
  png: ImageIcon, jpg: ImageIcon, svg: ImageIcon, gif: ImageIcon,
};

function getFileIcon(filepath: string) {
  const ext = filepath.split('.').pop()?.toLowerCase() || '';
  return FILE_ICON_MAP[ext] || File;
}

function FilePicker({
  query,
  onSelect,
  onClose,
  selectedFiles,
  highlightIndex,
  resultsRef,
}: {
  query: string;
  onSelect: (file: string) => void;
  onClose: () => void;
  selectedFiles: string[];
  highlightIndex: number;
  resultsRef: React.MutableRefObject<string[]>;
}) {
  const { isDark, t } = usePluginSettings();
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      agentApi.searchFiles(query).then((files) => {
        const filtered = files.filter((f) => !selectedFiles.includes(f));
        setResults(filtered);
        resultsRef.current = filtered;
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, selectedFiles, resultsRef]);

  useEffect(() => {
    if (listRef.current && highlightIndex >= 0) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-[110] animate-in fade-in slide-in-from-bottom-2 duration-100">
      <div
        className={cn(
          'border rounded-lg shadow-2xl overflow-hidden max-h-[240px] flex flex-col',
          isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 border-b shrink-0',
            isDark ? 'border-zinc-800' : 'border-gray-200',
          )}
        >
          <AtSign className="size-3 text-violet-400" />
          <span className={cn('text-[10px] font-medium', isDark ? 'text-zinc-400' : 'text-gray-600')}>
            {query ? `${t('searching')} "${query}"` : t('projectFiles')}
          </span>
          {loading && <Loader2 className="size-3 text-violet-400 animate-spin ml-auto" />}
          <button
            onClick={onClose}
            className={cn(
              'ml-auto size-4 rounded flex items-center justify-center',
              isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100',
            )}
          >
            <X className={cn('size-2.5', isDark ? 'text-zinc-500' : 'text-gray-500')} />
          </button>
        </div>
        <div ref={listRef} className="overflow-y-auto flex-1 py-1">
          {results.length === 0 && !loading ? (
            <p
              className={cn(
                'text-[10px] px-3 py-2 text-center',
                isDark ? 'text-zinc-600' : 'text-gray-500',
              )}
            >
              {query ? t('fileSearchNoResults') : t('fileSearchPlaceholder')}
            </p>
          ) : (
            results.map((file, i) => {
              const Icon = getFileIcon(file);
              const parts = file.split('/');
              const name = parts.pop() || '';
              const dir = parts.join('/');
              return (
                <button
                  key={file}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors',
                    i === highlightIndex
                      ? 'bg-violet-600/20 text-violet-200'
                      : isDark
                        ? 'text-zinc-300 hover:bg-zinc-800/60'
                        : 'text-gray-800 hover:bg-gray-50',
                  )}
                  onClick={() => onSelect(file)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Icon className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-500')} />
                  <span className="text-[11px] truncate">
                    <span className="font-medium">{name}</span>
                    {dir && (
                      <span className={cn('ml-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                        {dir}/
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function FileChip({ file, onRemove }: { file: string; onRemove: () => void }) {
  const Icon = getFileIcon(file);
  const name = file.split('/').pop() || file;

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-600/15 border border-violet-700/30 rounded-md text-[10px] text-violet-300 group animate-in fade-in zoom-in-95 duration-100">
      <Icon className="size-2.5 shrink-0 text-violet-400/70" />
      <span className="truncate max-w-[120px]" title={file}>{name}</span>
      <button
        onClick={onRemove}
        className="size-3 rounded-sm hover:bg-violet-600/30 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
      >
        <X className="size-2" />
      </button>
    </span>
  );
}

function ElementRefChip({ content }: { content: string }) {
  const { isDark } = usePluginSettings();
  const lines = content.split('\n');
  const componentLine = lines.find((l) => l.startsWith('Component:'));
  const tagLine = lines.find((l) => l.startsWith('Tag:'));
  const label = componentLine?.replace('Component: ', '') || tagLine?.replace('Tag: ', '') || 'Element';

  const elementMatch = content.match(/\[Element: (.+?)\]/);
  const displayLabel = elementMatch ? elementMatch[1] : label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border',
        isDark
          ? 'bg-emerald-600/15 border-emerald-700/30 text-emerald-300'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700',
      )}
    >
      <MousePointerClick className={cn('size-2.5 shrink-0', isDark ? 'text-emerald-400/70' : 'text-emerald-600/70')} />
      <span className="font-mono font-semibold truncate max-w-[160px]">{displayLabel}</span>
    </span>
  );
}

function parseMessageContent(content: string): { elements: string[]; text: string } {
  const elements: string[] = [];
  let remaining = content;

  const newPattern = /\[Element: .+?\](?:\s*\|[^\n]*)*/g;
  let match;
  while ((match = newPattern.exec(content)) !== null) {
    elements.push(match[0]);
  }

  const legacyPattern = /\[Selected UI element\]\n([\s\S]*?)(?=\n\n\[Selected UI element\]|\n\n(?!\s))/g;
  while ((match = legacyPattern.exec(content)) !== null) {
    elements.push(`[Selected UI element]\n${match[1]}`);
  }

  if (elements.length > 0) {
    for (const el of elements) {
      remaining = remaining.replace(el, '').trim();
    }
  }

  return { elements, text: remaining };
}

function UserBubble({ message }: { message: ChatMessage }) {
  const { isDark } = usePluginSettings();
  const { elements, text } = parseMessageContent(message.content);

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
      <div className="max-w-[85%] flex items-start gap-2.5 flex-row-reverse min-w-0">
        <div className="size-7 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
          <User className="size-3.5 text-blue-400" />
        </div>
        <div className="bg-blue-600/15 border border-blue-700/30 rounded-2xl rounded-br-sm px-3.5 py-2.5 min-w-0 overflow-hidden">
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {message.files.map((f) => {
                const Icon = getFileIcon(f);
                const name = f.split('/').pop() || f;
                return (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-600/20 border border-blue-700/30 rounded text-[9px] text-blue-300"
                    title={f}
                  >
                    <Icon className="size-2.5" />
                    {name}
                  </span>
                );
              })}
            </div>
          )}
          {elements.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {elements.map((el, i) => (
                <ElementRefChip key={i} content={el} />
              ))}
            </div>
          )}
          {text && (
            <p
              className={cn(
                'text-[13px] leading-relaxed whitespace-pre-wrap break-words',
                isDark ? 'text-blue-100' : 'text-blue-800',
              )}
            >
              {text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator({ elapsed }: { elapsed: number }) {
  const { t } = usePluginSettings();

  return (
    <div className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
      <div className="size-7 rounded-full bg-violet-600/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="size-3.5 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="relative size-4 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
          </div>
          <span className="text-[11px] font-medium text-violet-300/80">{t('reasoningActive')}</span>
          {elapsed > 0 && (
            <span className="text-[9px] text-violet-500/60 tabular-nums">{elapsed}s</span>
          )}
        </div>
        <div className="ml-6 flex items-center gap-1.5">
          <div className="size-1.5 rounded-full bg-violet-400/40 animate-pulse" />
          <div className="size-1.5 rounded-full bg-violet-400/30 animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="size-1.5 rounded-full bg-violet-400/20 animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}

function ThinkingBlock({ thinking, defaultCollapsed }: { thinking: string; defaultCollapsed: boolean }) {
  const { isDark, t } = usePluginSettings();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!thinking) return null;

  return (
    <div className="mb-2 animate-in fade-in duration-200">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 group"
      >
        <Brain className="size-3.5 text-violet-400/70 shrink-0" />
        <span className="text-[10px] font-medium text-violet-400/60">{t('reasoning')}</span>
        {collapsed
          ? <ChevronRight className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />
          : <ChevronDown className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />}
      </button>
      {!collapsed && (
        <div className="mt-1 ml-5 pl-3 border-l-2 border-violet-800/30">
          <p
            className={cn(
              'text-[11px] leading-relaxed whitespace-pre-wrap italic',
              isDark ? 'text-zinc-500' : 'text-gray-600',
            )}
          >
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
}

const toolIcons: Record<string, typeof FileText> = {
  read: FileText,
  edit: Pencil,
  shell: Terminal,
  grep: Search,
  list: FolderOpen,
  tool: Wrench,
};

function ToolCallBadge({ tc }: { tc: ToolCallInfo }) {
  const { t } = usePluginSettings();
  const Icon = toolIcons[tc.type] || Wrench;
  const label =
    tc.type === 'read' ? tc.path?.split('/').pop() || t('reading')
    : tc.type === 'edit' ? tc.path?.split('/').pop() || t('editing')
    : tc.type === 'shell' ? (tc.command?.slice(0, 40) || t('running'))
    : tc.type === 'grep' ? `${t('searching')} ${tc.pattern || '...'}`
    : tc.type === 'list' ? tc.path?.split('/').pop() || t('listing')
    : t('tool');

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-all',
      tc.done
        ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-300/80'
        : 'bg-amber-900/20 border-amber-700/30 text-amber-300/80 animate-pulse',
    )}>
      {tc.done
        ? <Check className="size-2.5 shrink-0" />
        : <Loader2 className="size-2.5 animate-spin shrink-0" />}
      <Icon className="size-2.5 shrink-0" />
      <span className="truncate max-w-[180px]">{label}</span>
    </div>
  );
}

function ToolCallsBlock({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1 animate-in fade-in duration-200">
      {toolCalls.map((tc, i) => (
        <ToolCallBadge key={i} tc={tc} />
      ))}
    </div>
  );
}

function AssistantMessage({ message, isStreaming, isLast }: { message: ChatMessage; isStreaming: boolean; isLast: boolean }) {
  const { isDark } = usePluginSettings();
  const showCursor = isStreaming && isLast;

  return (
    <div className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
      <div className="size-7 rounded-full bg-violet-600/20 flex items-center justify-center shrink-0 mt-0.5">
        {showCursor
          ? <Sparkles className="size-3.5 text-violet-400 animate-pulse" />
          : <Bot className="size-3.5 text-violet-400" />}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {message.thinking && (
          <ThinkingBlock thinking={message.thinking} defaultCollapsed={!isLast} />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallsBlock toolCalls={message.toolCalls} />
        )}
        <div
          className={cn(
            'rounded-2xl rounded-bl-sm px-3.5 py-2.5 border',
            isDark ? 'bg-zinc-800/50 border-zinc-700/30' : 'bg-gray-50 border-gray-200',
          )}
        >
          <p
            className={cn(
              'text-[13px] leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere',
              isDark ? 'text-zinc-200' : 'text-gray-800',
            )}
            style={{ overflowWrap: 'anywhere' }}
          >
            {message.content}
            {showCursor && (
              <span className="inline-block w-[6px] h-[15px] bg-violet-400/70 ml-0.5 animate-pulse align-middle rounded-sm" />
            )}
          </p>
          {!showCursor && message.content && (
            <p className={cn('text-[9px] mt-1.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {new Date(message.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelDropdown({
  currentModel,
  agentType,
  onChange,
  open,
  onToggle,
  onClose,
}: {
  currentModel: string | null;
  agentType: 'conversation' | 'cursor';
  onChange: (model: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { isDark, t } = usePluginSettings();
  const models = getModelsForType(agentType);
  const current = models.find((m) => m.id === currentModel) || models[0];
  const isCursor = agentType === 'cursor';

  return (
    <div className="relative mt-1">
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-[10px] transition-colors',
          isDark
            ? 'hover:bg-zinc-800/60 text-zinc-500 hover:text-zinc-300'
            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700',
        )}
      >
        <span className={cn(
          'size-1.5 rounded-full shrink-0',
          isCursor ? 'bg-blue-400' : 'bg-violet-400',
        )} />
        <span className="truncate font-medium">{current.name}</span>
        <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
          {current.provider}
        </span>
        <ChevronDown className={cn(
          'size-2.5 ml-auto shrink-0 transition-transform',
          open ? 'rotate-180' : '',
          isDark ? 'text-zinc-600' : 'text-gray-400',
        )} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={onClose} />
          <div
            className={cn(
              'absolute bottom-full left-0 right-0 mb-1 z-[110] border rounded-lg shadow-xl py-1 max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-100',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}
          >
            <div className={cn(
              'px-2.5 py-1 text-[9px] font-medium uppercase tracking-wider',
              isDark ? 'text-zinc-600' : 'text-gray-400',
            )}>
              {t('model')} — {isCursor ? t('cursorAgent') : t('conversation')}
            </div>
            {models.map((m) => {
              const isActive = m.id === (currentModel || current.id);
              return (
                <button
                  key={m.id}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] transition-colors',
                    isActive
                      ? (isDark
                          ? (isCursor ? 'bg-blue-600/10 text-blue-300' : 'bg-violet-600/10 text-violet-300')
                          : (isCursor ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'))
                      : (isDark
                          ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'),
                  )}
                  onClick={() => onChange(m.id)}
                >
                  {isActive && <Check className="size-2.5 shrink-0" />}
                  <span className={cn('font-medium', !isActive && 'ml-[14px]')}>{m.name}</span>
                  <span className={cn(
                    'text-[9px] ml-auto',
                    isActive
                      ? 'opacity-60'
                      : isDark ? 'text-zinc-600' : 'text-gray-400',
                  )}>
                    {m.provider}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function AgentConversation({
  agent,
  messages,
  isStreaming,
  isThinking,
  onSend,
  onClear,
  onBack,
  agents,
  onSelectAgent,
  onNewAgent,
  autoPickElement,
  onAutoPickHandled,
  onModelChange,
  ticketLink,
  onGoToTicket,
}: Props) {
  const { isDark, t } = usePluginSettings();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const autoScrollRef = useRef(true);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const thinkingStartRef = useRef(0);

  const [picking, setPicking] = useState(false);
  const [attachedElements, setAttachedElements] = useState<ElementReference[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    if (autoPickElement) {
      setPicking(true);
      onAutoPickHandled?.();
    }
  }, [autoPickElement, onAutoPickHandled]);

  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [fileQuery, setFileQuery] = useState('');
  const [fileHighlight, setFileHighlight] = useState(0);
  const atTriggerPosRef = useRef<number | null>(null);
  const fileResultsRef = useRef<string[]>([]);

  useEffect(() => {
    if (isThinking) {
      thinkingStartRef.current = Date.now();
      setThinkingElapsed(0);
      const iv = setInterval(() => {
        setThinkingElapsed(Math.floor((Date.now() - thinkingStartRef.current) / 1000));
      }, 200);
      return () => clearInterval(iv);
    } else {
      setThinkingElapsed(0);
    }
  }, [isThinking]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    autoScrollRef.current = atBottom;
    setShowScrollBtn(!atBottom);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      autoScrollRef.current = true;
      setShowScrollBtn(false);
    }
  };

  const addFile = useCallback((file: string) => {
    if (!attachedFiles.includes(file)) {
      setAttachedFiles((prev) => [...prev, file]);
    }
    if (atTriggerPosRef.current !== null) {
      const before = input.slice(0, atTriggerPosRef.current);
      const afterAt = input.slice(atTriggerPosRef.current);
      const spaceIdx = afterAt.search(/\s|$/);
      const after = afterAt.slice(spaceIdx === -1 ? afterAt.length : spaceIdx);
      setInput(before + after);
    }
    setShowFilePicker(false);
    setFileQuery('');
    atTriggerPosRef.current = null;
    setFileHighlight(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [attachedFiles, input]);

  const removeFile = useCallback((file: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f !== file));
  }, []);

  const handleElementPicked = useCallback((ref: ElementReference) => {
    setPicking(false);
    setAttachedElements((prev) => [...prev, ref]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const removeElement = useCallback((idx: number) => {
    setAttachedElements((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyE' || e.key.toLowerCase() === 'e')) {
        e.preventDefault();
        e.stopPropagation();
        setPicking((v) => !v);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const handleSubmit = () => {
    const msg = input.trim();
    if ((!msg && attachedFiles.length === 0 && attachedElements.length === 0) || isStreaming || isThinking) return;

    let finalMsg = msg;
    if (attachedElements.length > 0) {
      const elRefs = attachedElements.map((el) => {
        const parts = [`[Element: ${el.displayLabel}]`];
        if (el.componentName) parts.push(`Component: ${el.componentName}`);
        if (el.suggestedFiles.length > 0) parts.push(`File: ${el.suggestedFiles[0]}`);
        parts.push(`Path: ${el.jsPath}`);
        return parts.join(' | ');
      }).join('\n');
      finalMsg = finalMsg ? `${elRefs}\n\n${finalMsg}` : elRefs;
    }

    onSend(finalMsg, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput('');
    setAttachedFiles([]);
    setAttachedElements([]);
    setShowFilePicker(false);
    setFileQuery('');
    atTriggerPosRef.current = null;
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const isBusy = isStreaming || isThinking;

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 border-b shrink-0',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}
      >
        {onBack && (
          <button
            onClick={onBack}
            className={cn(
              'size-7 rounded-md flex items-center justify-center transition-colors shrink-0',
              isDark
                ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-800',
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
        )}

        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setShowAgentDropdown(!showAgentDropdown)}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1 rounded-md transition-colors',
              isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-100',
            )}
          >
            <div className="size-5 rounded-md bg-violet-600/20 flex items-center justify-center shrink-0">
              <Bot className="size-3 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-xs font-medium truncate',
                    isDark ? 'text-zinc-200' : 'text-gray-800',
                  )}
                >
                  {agent.name}
                </span>
                {isBusy && (
                  <span className="size-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
                )}
                {agent.model && (
                  <span className="text-[8px] text-violet-400/60 bg-violet-600/10 px-1 rounded shrink-0">
                    {agent.model}
                  </span>
                )}
              </div>
            </div>
            <ChevronDown className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-500')} />
          </button>

          {ticketLink && onGoToTicket && (
            <button
              onClick={(e) => { e.stopPropagation(); onGoToTicket(ticketLink.ticketId); }}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all shrink-0',
                isDark
                  ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 border border-amber-800/40'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
              )}
              title={`Ir al ticket: ${ticketLink.ticketTitle}`}
            >
              <Bookmark className="size-3" />
              <span className="truncate max-w-[120px]">{ticketLink.ticketTitle}</span>
            </button>
          )}

          {showAgentDropdown && agents && onSelectAgent && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowAgentDropdown(false)} />
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-[110] w-full border rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100',
                  isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
                )}
              >
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                      a.id === agent.id
                        ? (isDark ? 'bg-zinc-800 text-violet-300' : 'bg-gray-100 text-violet-600')
                        : (isDark
                          ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'),
                    )}
                    onClick={() => { onSelectAgent(a.id); setShowAgentDropdown(false); }}
                  >
                    <Bot className="size-3 text-violet-400/60 shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
                {onNewAgent && (
                  <>
                    <div className={cn('border-t my-1', isDark ? 'border-zinc-800' : 'border-gray-200')} />
                    <button
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-violet-400 transition-colors',
                        isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-100',
                      )}
                      onClick={() => { onNewAgent(); setShowAgentDropdown(false); }}
                    >
                      <Plus className="size-3" /> {t('newConversation')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={onClear}
          title={t('clearConversation')}
          className={cn(
            'size-6 rounded-md flex items-center justify-center transition-colors shrink-0',
            isDark
              ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
          )}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Activity bar */}
      {isBusy && (
        <div className={cn('h-0.5 shrink-0 overflow-hidden', isDark ? 'bg-zinc-900' : 'bg-gray-100')}>
          <div className="h-full w-1/3 bg-gradient-to-r from-violet-600 via-violet-400 to-violet-600 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full" />
        </div>
      )}

      {/* Versions panel (auto-created per message, rewindable) */}
      {(agent.type === 'cursor' || agent.type === 'conversation') && (
        <div className="shrink-0 max-h-[40%] overflow-y-auto">
          <AgentVersions agent={agent} />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-3 py-4 space-y-5"
        onScroll={handleScroll}
        onClick={() => inputRef.current?.focus()}
      >
        {messages.length === 0 && !isThinking ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/10 flex items-center justify-center mb-3 border border-violet-700/20">
              <Sparkles className="size-7 text-violet-400" />
            </div>
            <p className={cn('text-sm font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
              {t('aiAssistant')}
            </p>
            <p
              className={cn(
                'text-[11px] mt-1 max-w-[220px]',
                isDark ? 'text-zinc-600' : 'text-gray-400',
              )}
            >
              {t('askAnything')}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              if (msg.role === 'user') {
                return <UserBubble key={msg.id} message={msg} />;
              }
              return (
                <AssistantMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && isLast}
                  isLast={isLast}
                />
              );
            })}

            {isThinking && (
              <ThinkingIndicator elapsed={thinkingElapsed} />
            )}
          </>
        )}
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="flex justify-center -mt-8 relative z-10 pointer-events-none">
          <button
            onClick={scrollToBottom}
            className={cn(
              'pointer-events-auto size-6 rounded-full shadow-lg flex items-center justify-center transition-colors',
              isDark
                ? 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-700'
                : 'bg-white border border-gray-300 shadow hover:bg-gray-50',
            )}
          >
            <ArrowDown className={cn('size-3', isDark ? 'text-zinc-400' : 'text-gray-500')} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          'border-t p-2 shrink-0',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}
      >
        <div className={cn(
          'relative flex flex-col gap-1.5 border rounded-xl px-3 py-2 transition-colors',
          isBusy
            ? 'border-violet-500/20 bg-violet-950/10'
            : cn(
                isDark
                  ? 'bg-zinc-900/80 border-zinc-700/50 focus-within:border-violet-500/40'
                  : 'bg-gray-50 border-gray-300 focus-within:border-violet-500/40',
              ),
        )}
        >
          {showFilePicker && (
            <FilePicker
              query={fileQuery}
              onSelect={addFile}
              onClose={() => { setShowFilePicker(false); atTriggerPosRef.current = null; }}
              selectedFiles={attachedFiles}
              highlightIndex={fileHighlight}
              resultsRef={fileResultsRef}
            />
          )}

          {(attachedFiles.length > 0 || attachedElements.length > 0) && (
            <div className="flex flex-wrap gap-1 pb-0.5">
              {attachedElements.map((elRef, idx) => (
                <span
                  key={`el-${idx}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-600/15 border border-emerald-700/30 rounded-md text-[10px] text-emerald-300 group animate-in fade-in zoom-in-95 duration-100 max-w-[200px]"
                  title={elRef.jsPath}
                >
                  <MousePointerClick className="size-2.5 shrink-0 text-emerald-400/70" />
                  <span className="truncate">{elRef.displayLabel}</span>
                  <button
                    onClick={() => removeElement(idx)}
                    className="size-3 rounded-sm hover:bg-emerald-600/30 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2" />
                  </button>
                </span>
              ))}
              {attachedFiles.map((file) => (
                <FileChip key={file} file={file} onRemove={() => removeFile(file)} />
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            data-plugin-chat-input
            title={t('shiftEnter')}
            className={cn(
              'bg-transparent text-[13px] outline-none resize-none min-h-[36px] max-h-[120px] leading-relaxed',
              isDark
                ? 'text-zinc-200 placeholder:text-zinc-600'
                : 'text-gray-900 placeholder:text-gray-400',
            )}
            placeholder={isBusy ? t('thinkingPlaceholder') : `${t('writePlaceholder')} (@)`}
            rows={1}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

              const cursor = e.target.selectionStart;
              const textBefore = val.slice(0, cursor);
              const atMatch = textBefore.match(/@([^\s]*)$/);

              if (atMatch) {
                atTriggerPosRef.current = cursor - atMatch[0].length;
                setFileQuery(atMatch[1]);
                setShowFilePicker(true);
                setFileHighlight(0);
              } else if (showFilePicker) {
                setShowFilePicker(false);
                atTriggerPosRef.current = null;
              }
            }}
            onKeyDown={(e) => {
              if (showFilePicker) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setFileHighlight((h) => Math.min(h + 1, fileResultsRef.current.length - 1));
                  return;
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setFileHighlight((h) => Math.max(0, h - 1));
                  return;
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  const selected = fileResultsRef.current[fileHighlight];
                  if (selected) addFile(selected);
                  return;
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowFilePicker(false);
                  atTriggerPosRef.current = null;
                  return;
                }
              }

              if (e.key === 'Enter' && !e.shiftKey && !showFilePicker) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isBusy}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPicking(true)}
                disabled={isBusy}
                title={`${t('selectElement')} (Ctrl+Shift+E)`}
                className={cn(
                  'size-6 rounded-md flex items-center justify-center transition-colors',
                  picking
                    ? 'bg-violet-600/20 text-violet-400'
                    : isDark
                      ? 'text-zinc-500 hover:text-violet-400 hover:bg-zinc-800'
                      : 'text-gray-500 hover:text-violet-600 hover:bg-gray-100',
                )}
              >
                <MousePointerClick className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  if (showFilePicker) {
                    setShowFilePicker(false);
                  } else {
                    setShowFilePicker(true);
                    setFileQuery('');
                    setFileHighlight(0);
                  }
                }}
                disabled={isBusy}
                title={t('attachFileTitle')}
                className={cn(
                  'size-6 rounded-md flex items-center justify-center transition-colors',
                  showFilePicker
                    ? 'bg-violet-600/20 text-violet-400'
                    : isDark
                      ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
                )}
              >
                <AtSign className="size-3.5" />
              </button>
              <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                {isBusy ? (
                  <span className="flex items-center gap-1 text-violet-400/60">
                    <Loader2 className="size-2.5 animate-spin" />
                    {isThinking ? t('reasoningActive') : t('respondingStatus')}
                  </span>
                ) : (attachedFiles.length > 0 || attachedElements.length > 0) ? (
                  <span className="text-violet-400/60">
                    {attachedFiles.length > 0 && `${attachedFiles.length} ${attachedFiles.length > 1 ? t('filesWord') : t('fileWord')}`}
                    {attachedFiles.length > 0 && attachedElements.length > 0 && ' · '}
                    {attachedElements.length > 0 && `${attachedElements.length} ${attachedElements.length > 1 ? t('elements') : t('element')}`}
                  </span>
                ) : (
                  t('chatInputFooterHint')
                )}
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={(!input.trim() && attachedFiles.length === 0 && attachedElements.length === 0) || isBusy}
              className={cn(
                'px-3 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all',
                (input.trim() || attachedFiles.length > 0 || attachedElements.length > 0) && !isBusy
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : isDark
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              )}
            >
              <Send className="size-3" />
              {t('send')}
            </button>
          </div>
        </div>

        {/* Model selector */}
        {onModelChange && (agent.type === 'conversation' || agent.type === 'cursor') && (
          <ModelDropdown
            currentModel={agent.model}
            agentType={agent.type}
            onChange={(model) => { onModelChange(model); setShowModelDropdown(false); }}
            open={showModelDropdown}
            onToggle={() => setShowModelDropdown((v) => !v)}
            onClose={() => setShowModelDropdown(false)}
          />
        )}
      </div>

      <ElementPicker
        active={picking}
        onPick={handleElementPicked}
        onCancel={() => setPicking(false)}
      />
    </div>
  );
}
