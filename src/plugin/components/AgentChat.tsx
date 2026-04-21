import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Square,
  RotateCcw,
  Terminal,
  Sparkles,
  ArrowDown,
  ChevronLeft,
  ChevronDown,
  Plus,
  MousePointerClick,
  ListOrdered,
  X,
} from 'lucide-react';
import AnsiToHtml from 'ansi-to-html';
import type { Agent, QueueItem, ElementReference } from '../types';
import { cn } from '../../app/components/ui/utils';
import { ElementPicker } from './ElementPicker';
import { AgentQueue } from './AgentQueue';
import { CursorAgentView } from './CursorAgentView';
import { usePluginSettings } from '../PluginProvider';

interface Props {
  agent: Agent;
  terminalOutput: string;
  onSend: (command: string) => void;
  onSignal: (signal: string) => void;
  onRestart: () => void;
  onBack?: () => void;
  agents?: Agent[];
  onSelectAgent?: (id: string) => void;
  onNewAgent?: () => void;
  queue?: QueueItem[];
  onAddToQueue?: (message: string, priority: 'normal' | 'high') => void;
  onRemoveFromQueue?: (itemId: string) => void;
  onClearQueue?: () => void;
  onReorderQueue?: (itemId: string, direction: 'up' | 'down') => void;
}

export function AgentChat({
  agent,
  terminalOutput,
  onSend,
  onSignal,
  onRestart,
  onBack,
  agents,
  onSelectAgent,
  onNewAgent,
  queue,
  onAddToQueue,
  onRemoveFromQueue,
  onClearQueue,
  onReorderQueue,
}: Props) {
  const { isDark, t } = usePluginSettings();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [picking, setPicking] = useState(false);
  const autoScrollRef = useRef(true);

  const ansiConverter = useMemo(
    () =>
      new AnsiToHtml({
        fg: isDark ? '#d4d4d8' : '#374151',
        bg: 'transparent',
        newline: true,
        escapeXML: true,
      }),
    [isDark],
  );

  const terminalHtml = useMemo(() => {
    if (!terminalOutput) return '';
    return ansiConverter.toHtml(terminalOutput);
  }, [terminalOutput, ansiConverter]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutput]);

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

  const handleSubmit = () => {
    const cmd = input.trim();
    if (!cmd && !attachedElement) return;
    let finalCmd = cmd;
    if (attachedElement) {
      const parts = [`[Element: ${attachedElement.displayLabel}]`];
      if (attachedElement.componentName) parts.push(`Component: ${attachedElement.componentName}`);
      if (attachedElement.suggestedFiles.length > 0) parts.push(`File: ${attachedElement.suggestedFiles[0]}`);
      parts.push(`Path: ${attachedElement.jsPath}`);
      const elRef = parts.join(' | ');
      finalCmd = cmd ? `${elRef}\n\n${cmd}` : elRef;
    }
    onSend(finalCmd);
    setHistory((prev) => [...prev.filter((h) => h !== finalCmd), finalCmd]);
    setHistoryIdx(-1);
    setInput('');
    setAttachedElement(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setInput(history[newIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < 0) return;
      const newIdx = historyIdx + 1;
      if (newIdx >= history.length) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(newIdx);
        setInput(history[newIdx] || '');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      onSignal('SIGINT');
    }
  };

  const [attachedElement, setAttachedElement] = useState<ElementReference | null>(null);

  const handleElementPicked = (ref: ElementReference) => {
    setPicking(false);
    setAttachedElement(ref);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

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

  const statusDot = {
    idle: 'bg-emerald-400',
    running: 'bg-blue-400 animate-pulse',
    stopped: 'bg-amber-400',
    error: 'bg-red-400',
  }[agent.status] || 'bg-zinc-500';

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
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
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
            <div className={cn(
              'size-5 rounded-md flex items-center justify-center shrink-0',
              agent.type === 'cursor' ? 'bg-violet-600/20' : 'bg-emerald-600/20',
            )}>
              {agent.type === 'cursor'
                ? <Sparkles className="size-3 text-violet-400" />
                : <Terminal className="size-3 text-emerald-400" />}
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
                <span className={cn('size-1.5 rounded-full shrink-0', statusDot)} />
                {agent.type === 'cursor' && agent.model && (
                  <span className="text-[8px] text-violet-400/60 bg-violet-600/10 px-1 rounded shrink-0">{agent.model}</span>
                )}
              </div>
              <p
                className={cn(
                  'text-[9px] truncate font-mono',
                  isDark ? 'text-zinc-600' : 'text-gray-400',
                )}
              >
                {agent.cwd}
              </p>
            </div>
            <ChevronDown className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-500')} />
          </button>

          {showAgentDropdown && agents && onSelectAgent && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowAgentDropdown(false)} />
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-[110] w-full rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 border',
                  isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
                )}
              >
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                      a.id === agent.id
                        ? (a.type === 'cursor' ? 'bg-zinc-800 text-violet-300' : 'bg-zinc-800 text-emerald-300')
                        : isDark
                          ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
                    )}
                    onClick={() => { onSelectAgent(a.id); setShowAgentDropdown(false); }}
                  >
                    {a.type === 'cursor'
                      ? <Sparkles className="size-3 text-violet-400/60 shrink-0" />
                      : <Terminal className="size-3 text-emerald-400/60 shrink-0" />}
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
                {onNewAgent && (
                  <>
                    <div
                      className={cn(
                        'border-t my-1',
                        isDark ? 'border-zinc-800' : 'border-gray-200',
                      )}
                    />
                    <button
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-emerald-400 transition-colors',
                        isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-50',
                      )}
                      onClick={() => { onNewAgent(); setShowAgentDropdown(false); }}
                    >
                      <Plus className="size-3" /> {t('newAgent')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {agent.status === 'running' && (
            <button
              onClick={() => onSignal('SIGINT')}
              title={t('stopAgent')}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-800/30 transition-colors"
            >
              <Square className="size-2.5 fill-current" />
              {t('stop')}
            </button>
          )}
          {agent.status !== 'running' && (
            <button
              onClick={() => onSignal('SIGINT')}
              title="Ctrl+C"
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors',
                isDark
                  ? 'text-zinc-500 hover:text-red-400 hover:bg-zinc-800'
                  : 'text-gray-500 hover:text-red-400 hover:bg-gray-100',
              )}
            >
              ^C
            </button>
          )}
          <button
            onClick={onRestart}
            title={t('restart')}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              isDark
                ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
            )}
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>

      {/* Activity bar */}
      {agent.status === 'running' && agent.type === 'cursor' && (
        <div className="h-0.5 shrink-0 bg-zinc-900 overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-violet-600 via-violet-400 to-violet-600 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full" />
        </div>
      )}

      {/* Output area */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto min-h-0 select-text',
          agent.type === 'cursor'
            ? cn('text-[13px] leading-relaxed', isDark ? 'bg-zinc-950' : 'bg-white')
            : cn(
                'font-mono text-[12px] leading-[1.4] p-2',
                isDark ? 'bg-[#0c0c0c]' : 'bg-gray-50',
              ),
        )}
        onScroll={handleScroll}
        onClick={() => inputRef.current?.focus()}
      >
        {!terminalOutput ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {agent.type === 'cursor'
              ? (
                  <Sparkles
                    className={cn(
                      'size-8 mb-2',
                      isDark ? 'text-violet-700' : 'text-violet-300',
                    )}
                  />
                )
              : (
                  <Terminal
                    className={cn('size-8 mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')}
                  />
                )}
            <p className={cn('text-[11px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              {agent.type === 'cursor' ? t('cursorReady') : t('terminalReady')}
            </p>
            <p className={cn('text-[10px] mt-1 font-mono', isDark ? 'text-zinc-600' : 'text-gray-400')}>{agent.cwd}</p>
            {agent.type === 'cursor' && (
              <p className={cn('text-[10px] text-violet-500/60 mt-1')}>{t('writeInstruction')}</p>
            )}
          </div>
        ) : agent.type === 'cursor' ? (
          <CursorAgentView
            output={terminalOutput}
            isRunning={agent.status === 'running'}
          />
        ) : (
          <div
            className={cn(
              'terminal-output whitespace-pre-wrap break-all',
              isDark ? 'text-zinc-300' : 'text-gray-700',
            )}
            dangerouslySetInnerHTML={{ __html: terminalHtml }}
          />
        )}
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="flex justify-center -mt-8 relative z-10 pointer-events-none">
          <button
            onClick={scrollToBottom}
            className={cn(
              'pointer-events-auto size-6 rounded-full border shadow-lg flex items-center justify-center transition-colors',
              isDark
                ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                : 'bg-white border-gray-300 hover:bg-gray-50',
            )}
          >
            <ArrowDown className={cn('size-3', isDark ? 'text-zinc-400' : 'text-gray-500')} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          'relative z-[45] border-t p-2 shrink-0',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}
      >
        {agent.type === 'cursor' ? (
          <div
            className={cn(
              'flex flex-col gap-1.5 rounded-xl px-3 py-2 border transition-colors focus-within:border-violet-500/40',
              isDark
                ? 'bg-zinc-900/80 border-zinc-700/50'
                : 'bg-gray-50 border-gray-300',
            )}
          >
            {attachedElement && (
              <div className="flex flex-wrap gap-1 pb-0.5">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-600/15 border border-emerald-700/30 rounded-md text-[10px] text-emerald-300 group animate-in fade-in zoom-in-95 duration-100 max-w-[200px]"
                  title={attachedElement.jsPath}
                >
                  <MousePointerClick className="size-2.5 shrink-0 text-emerald-400/70" />
                  <span className="truncate">{attachedElement.displayLabel}</span>
                  <button
                    onClick={() => setAttachedElement(null)}
                    className="size-3 rounded-sm hover:bg-emerald-600/30 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2" />
                  </button>
                </span>
              </div>
            )}
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              data-plugin-chat-input
              className={cn(
                'bg-transparent text-xs outline-none resize-none min-h-[32px] max-h-[120px] leading-relaxed',
                isDark
                  ? 'text-zinc-200 placeholder:text-zinc-600'
                  : 'text-gray-900 placeholder:text-gray-400',
              )}
              placeholder={t('writeInstruction')}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHistoryIdx(-1);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                } else if (e.key === 'ArrowUp' && !input) {
                  e.preventDefault();
                  if (history.length > 0) {
                    const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
                    setHistoryIdx(newIdx);
                    setInput(history[newIdx] || '');
                  }
                }
              }}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPicking(true)}
                  title={t('selectElement')}
                  className={cn(
                    'size-6 rounded-md flex items-center justify-center transition-colors',
                    isDark
                      ? 'text-zinc-600 hover:text-violet-400 hover:bg-zinc-800'
                      : 'text-gray-400 hover:text-violet-500 hover:bg-gray-100',
                  )}
                >
                  <MousePointerClick className="size-3.5" />
                </button>
                {onAddToQueue && input.trim() && (
                  <button
                    onClick={() => { onAddToQueue(input.trim(), 'normal'); setInput(''); }}
                    title={t('addToQueue')}
                    className={cn(
                      'size-6 rounded-md flex items-center justify-center transition-colors',
                      isDark
                        ? 'text-zinc-600 hover:text-amber-400 hover:bg-zinc-800'
                        : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100',
                    )}
                  >
                    <ListOrdered className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('shiftEnter')}</span>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() && !attachedElement}
                  className={cn(
                    'px-3 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all',
                    (input.trim() || attachedElement)
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
          </div>
        ) : (
          <div className={cn('flex flex-col gap-1 rounded-lg px-2 py-1.5 border transition-colors focus-within:border-emerald-500/40', isDark ? 'bg-[#0c0c0c] border-zinc-700/50' : 'bg-gray-50 border-gray-300')}>
            {attachedElement && (
              <div className="flex flex-wrap gap-1">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-600/15 border border-emerald-700/30 rounded-md text-[10px] text-emerald-300 group animate-in fade-in zoom-in-95 duration-100 max-w-[200px]"
                  title={attachedElement.jsPath}
                >
                  <MousePointerClick className="size-2.5 shrink-0 text-emerald-400/70" />
                  <span className="truncate">{attachedElement.displayLabel}</span>
                  <button
                    onClick={() => setAttachedElement(null)}
                    className="size-3 rounded-sm hover:bg-emerald-600/30 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2" />
                  </button>
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 text-xs font-mono shrink-0">$</span>
            <button
              onClick={() => setPicking(true)}
              title={t('selectElement')}
              className={cn(
                'shrink-0 size-5 rounded flex items-center justify-center transition-colors',
                isDark
                  ? 'text-zinc-600 hover:text-emerald-400 hover:bg-zinc-800'
                  : 'text-gray-400 hover:text-emerald-500 hover:bg-gray-100',
              )}
            >
              <MousePointerClick className="size-3" />
            </button>
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              data-plugin-chat-input
              type="text"
              className={cn(
                'flex-1 bg-transparent text-xs outline-none font-mono',
                isDark
                  ? 'text-zinc-200 placeholder:text-zinc-600'
                  : 'text-gray-900 placeholder:text-gray-400',
              )}
              placeholder={t('writeCommand')}
              value={input}
              onChange={(e) => { setInput(e.target.value); setHistoryIdx(-1); }}
              onKeyDown={handleKeyDown}
            />
            {onAddToQueue && input.trim() && (
              <button
                onClick={() => { onAddToQueue(input.trim(), 'normal'); setInput(''); }}
                title={t('addToQueue')}
                className={cn(
                  'shrink-0 size-5 rounded flex items-center justify-center transition-colors',
                  isDark
                    ? 'text-zinc-600 hover:text-amber-400 hover:bg-zinc-800'
                    : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100',
                )}
              >
                <ListOrdered className="size-3" />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() && !attachedElement}
              className={cn(
                'shrink-0 size-6 rounded-md flex items-center justify-center transition-all',
                (input.trim() || attachedElement)
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : isDark
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              )}
            >
              <Send className="size-3" />
            </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue panel */}
      {queue && onAddToQueue && onRemoveFromQueue && onClearQueue && onReorderQueue && (
        <AgentQueue
          queue={queue}
          onAdd={onAddToQueue}
          onRemove={onRemoveFromQueue}
          onClear={onClearQueue}
          onReorder={onReorderQueue}
        />
      )}

      {/* Element Picker overlay */}
      <ElementPicker
        active={picking}
        onPick={handleElementPicked}
        onCancel={() => setPicking(false)}
      />
    </div>
  );
}
