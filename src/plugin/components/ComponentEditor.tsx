import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  Code,
  Eye,
  RefreshCw,
  FileCode,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  History,
  RotateCcw,
  Trash2,
  Clock,
} from 'lucide-react';
import type { Agent, SavedComponent, ChatMessage, ComponentVersion } from '../types';
import { agentApi } from '../lib/api';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { AgentConversation } from './AgentConversation';

type EditorTab = 'preview' | 'code' | 'history';

interface Props {
  component: SavedComponent;
  agent: Agent;
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  onSend: (message: string, attachedFiles?: string[]) => void;
  onClear: () => void;
  onBack: () => void;
  agents: Agent[];
  onSelectAgent: (id: string) => void;
  onNewAgent: () => void;
}

export function ComponentEditor({
  component, agent, messages, isStreaming, isThinking,
  onSend, onClear, onBack, agents, onSelectAgent, onNewAgent,
}: Props) {
  const { isDark, t } = usePluginSettings();
  const [editorTab, setEditorTab] = useState<EditorTab>('preview');
  const [code, setCode] = useState('');
  const [filePath, setFilePath] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [versions, setVersions] = useState<ComponentVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedVersionContent, setSelectedVersionContent] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadContent = useCallback(async () => {
    try {
      const data = await agentApi.getComponentContent(component.id);
      setCode(data.content);
      setFilePath(data.path);
    } catch { /* ignore */ }
  }, [component.id]);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const data = await agentApi.getComponentVersions(component.id);
      setVersions(data);
    } catch { /* ignore */ }
    setVersionsLoading(false);
  }, [component.id]);

  useEffect(() => { loadContent(); }, [loadContent]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadContent();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadContent]);

  useEffect(() => {
    const handler = () => {
      const refresh = async (attempt = 0) => {
        try {
          await loadContent();
          setPreviewKey((k) => k + 1);
        } catch {
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            return refresh(attempt + 1);
          }
        }
      };
      setTimeout(() => refresh(), 600);
    };
    window.addEventListener('plugin:message_done', handler);
    return () => window.removeEventListener('plugin:message_done', handler);
  }, [loadContent]);

  useEffect(() => {
    if (editorTab === 'history') loadVersions();
  }, [editorTab, loadVersions]);

  const refreshPreview = () => {
    loadContent();
    setPreviewKey((k) => k + 1);
  };

  const handleViewVersion = async (versionId: string) => {
    if (selectedVersionId === versionId) {
      setSelectedVersionId(null);
      setSelectedVersionContent(null);
      return;
    }
    try {
      const data = await agentApi.getComponentVersionContent(component.id, versionId);
      setSelectedVersionId(versionId);
      setSelectedVersionContent(data.content);
    } catch { /* ignore */ }
  };

  const handleRestoreVersion = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      await agentApi.restoreComponentVersion(component.id, versionId);
      await loadContent();
      await loadVersions();
      setSelectedVersionId(null);
      setSelectedVersionContent(null);
      setPreviewKey((k) => k + 1);
    } catch { /* ignore */ }
    setRestoringId(null);
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await agentApi.deleteComponentVersion(component.id, versionId);
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
      if (selectedVersionId === versionId) {
        setSelectedVersionId(null);
        setSelectedVersionContent(null);
      }
    } catch { /* ignore */ }
  };

  const handleSend = useCallback((message: string, files?: string[]) => {
    const allFiles = files ? [...files] : [];
    if (filePath && !allFiles.includes(filePath)) {
      allFiles.push(filePath);
    }
    onSend(message, allFiles.length > 0 ? allFiles : undefined);
  }, [onSend, filePath]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewUrl = `/api/plugin/components/${component.id}/preview?v=${previewKey}`;
  const panelHeight = panelExpanded ? 'h-[60%]' : 'h-[35%]';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-1 px-2 py-1.5 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <button
          onClick={onBack}
          className={cn(
            'size-7 rounded-md flex items-center justify-center transition-colors shrink-0',
            isDark ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-800',
          )}
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className={cn(
          'size-6 rounded-md flex items-center justify-center shrink-0',
          isDark ? 'bg-cyan-900/30 text-cyan-400' : 'bg-cyan-50 text-cyan-600',
        )}>
          <FileCode className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>
            {component.name}
          </p>
          <p className={cn('text-[9px] font-mono truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>
            {filePath || component.fileName}
          </p>
        </div>

        <button
          onClick={refreshPreview}
          className={cn(
            'size-6 rounded-md flex items-center justify-center transition-colors shrink-0',
            isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
          )}
          title={t('refreshPreview')}
        >
          <RefreshCw className="size-3" />
        </button>
        <button
          onClick={() => setPanelExpanded(!panelExpanded)}
          className={cn(
            'size-6 rounded-md flex items-center justify-center transition-colors shrink-0',
            isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
          )}
        >
          {panelExpanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
        </button>
      </div>

      {/* Preview/Code panel */}
      <div className={cn('shrink-0 flex flex-col border-b transition-all', panelHeight, isDark ? 'border-zinc-800' : 'border-gray-200')}>
        {/* Panel tabs */}
        <div className={cn(
          'flex items-center gap-0.5 px-2 py-1 border-b shrink-0',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}>
          <button
            onClick={() => setEditorTab('preview')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              editorTab === 'preview'
                ? isDark ? 'bg-cyan-900/30 text-cyan-300' : 'bg-cyan-50 text-cyan-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <Eye className="size-3" />
            Preview
          </button>
          <button
            onClick={() => setEditorTab('code')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              editorTab === 'code'
                ? isDark ? 'bg-violet-900/30 text-violet-300' : 'bg-violet-50 text-violet-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <Code className="size-3" />
            {t('codeLabel')}
          </button>
          <button
            onClick={() => setEditorTab('history')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              editorTab === 'history'
                ? isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <History className="size-3" />
            Historial
            {versions.length > 0 && (
              <span className={cn(
                'text-[8px] px-1 rounded-full tabular-nums',
                isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-500',
              )}>
                {versions.length}
              </span>
            )}
          </button>

          {editorTab === 'code' && (
            <button
              onClick={handleCopyCode}
              className={cn(
                'ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors',
                copied
                  ? 'text-emerald-400'
                  : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
              {copied ? t('copiedLabel') : t('copyLabel')}
            </button>
          )}
        </div>

        {/* Panel content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {editorTab === 'preview' ? (
            <iframe
              ref={iframeRef}
              key={previewKey}
              src={previewUrl}
              className={cn(
                'w-full h-full border-0',
                isDark ? 'bg-zinc-950' : 'bg-white',
              )}
              sandbox="allow-scripts"
              title={`${component.name} preview`}
            />
          ) : editorTab === 'code' ? (
            <div className={cn(
              'h-full overflow-auto font-mono text-[11px] leading-relaxed',
              isDark ? 'bg-zinc-900/50' : 'bg-gray-50',
            )}>
              <pre className="p-3">
                {code.split('\n').map((line, i) => (
                  <div key={i} className="flex">
                    <span className={cn(
                      'select-none w-8 shrink-0 text-right pr-3 tabular-nums',
                      isDark ? 'text-zinc-700' : 'text-gray-300',
                    )}>
                      {i + 1}
                    </span>
                    <span className={cn(isDark ? 'text-zinc-300' : 'text-gray-800')}>
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </pre>
            </div>
          ) : (
            <div className={cn(
              'h-full overflow-auto',
              isDark ? 'bg-zinc-900/50' : 'bg-gray-50',
            )}>
              {versionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className={cn('text-[10px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                    Cargando historial...
                  </p>
                </div>
              ) : versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <History className={cn('size-8 mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                  <p className={cn('text-xs text-center', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                    Sin versiones aún
                  </p>
                  <p className={cn('text-[10px] text-center mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                    Cada cambio en el código creará una versión automáticamente
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {selectedVersionContent !== null && (
                    <div className={cn(
                      'border-b',
                      isDark ? 'border-zinc-800 bg-zinc-950/50' : 'border-gray-200 bg-gray-100/50',
                    )}>
                      <div className={cn(
                        'flex items-center justify-between px-3 py-1.5',
                        isDark ? 'border-b border-zinc-800' : 'border-b border-gray-200',
                      )}>
                        <span className={cn('text-[10px] font-medium', isDark ? 'text-amber-400' : 'text-amber-600')}>
                          Vista previa de versión
                        </span>
                        <button
                          onClick={() => { setSelectedVersionId(null); setSelectedVersionContent(null); }}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded transition-colors',
                            isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                          )}
                        >
                          Cerrar
                        </button>
                      </div>
                      <div className={cn(
                        'max-h-[120px] overflow-auto font-mono text-[10px] leading-relaxed',
                      )}>
                        <pre className="p-2">
                          {selectedVersionContent.split('\n').map((line, i) => (
                            <div key={i} className="flex">
                              <span className={cn(
                                'select-none w-7 shrink-0 text-right pr-2 tabular-nums',
                                isDark ? 'text-zinc-700' : 'text-gray-300',
                              )}>
                                {i + 1}
                              </span>
                              <span className={cn(isDark ? 'text-zinc-400' : 'text-gray-700')}>
                                {line || ' '}
                              </span>
                            </div>
                          ))}
                        </pre>
                      </div>
                    </div>
                  )}
                  {versions.map((version) => {
                    const date = new Date(version.createdAt);
                    const now = new Date();
                    const diffMs = now.getTime() - date.getTime();
                    const diffMin = Math.floor(diffMs / 60000);
                    const diffHrs = Math.floor(diffMs / 3600000);
                    const timeAgo = diffMin < 1 ? 'ahora'
                      : diffMin < 60 ? `hace ${diffMin}m`
                      : diffHrs < 24 ? `hace ${diffHrs}h`
                      : date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    const isSelected = selectedVersionId === version.id;
                    const isRestoring = restoringId === version.id;
                    const sizeKb = (version.size / 1024).toFixed(1);

                    return (
                      <div
                        key={version.id}
                        className={cn(
                          'group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer',
                          isSelected
                            ? isDark ? 'bg-amber-900/15' : 'bg-amber-50'
                            : isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-gray-50',
                        )}
                        onClick={() => handleViewVersion(version.id)}
                      >
                        <div className={cn(
                          'size-6 rounded-md flex items-center justify-center shrink-0',
                          isSelected
                            ? isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600'
                            : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400',
                        )}>
                          <Clock className="size-3" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('text-[10px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                              {timeAgo}
                            </span>
                            {version.source === 'pre-restore' && (
                              <span className={cn(
                                'text-[8px] px-1 py-0.5 rounded',
                                isDark ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600',
                              )}>
                                pre-restaurar
                              </span>
                            )}
                          </div>
                          <p className={cn('text-[9px] font-mono truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                            {sizeKb}KB · {version.hash.slice(0, 8)}
                          </p>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestoreVersion(version.id); }}
                            disabled={isRestoring}
                            className={cn(
                              'size-6 rounded-md flex items-center justify-center transition-colors',
                              isRestoring
                                ? 'animate-spin text-amber-400'
                                : isDark
                                  ? 'opacity-0 group-hover:opacity-100 text-amber-500 hover:text-amber-400 hover:bg-zinc-700'
                                  : 'opacity-0 group-hover:opacity-100 text-amber-600 hover:text-amber-500 hover:bg-gray-200',
                            )}
                            title="Restaurar esta versión"
                          >
                            <RotateCcw className="size-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteVersion(version.id); }}
                            className={cn(
                              'size-6 rounded-md flex items-center justify-center transition-colors',
                              isDark
                                ? 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 hover:bg-zinc-700'
                                : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-gray-200',
                            )}
                            title="Eliminar versión"
                          >
                            <Trash2 className="size-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent chat */}
      <div className="flex-1 min-h-0">
        <AgentConversation
          agent={agent}
          messages={messages}
          isStreaming={isStreaming}
          isThinking={isThinking}
          onSend={handleSend}
          onClear={onClear}
          agents={agents}
          onSelectAgent={onSelectAgent}
          onNewAgent={onNewAgent}
        />
      </div>
    </div>
  );
}
