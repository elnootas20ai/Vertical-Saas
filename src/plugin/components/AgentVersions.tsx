import { useState, useEffect, useCallback } from 'react';
import {
  History,
  Undo2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
  Clock,
  MessageSquare,
  CircleDot,
  Circle,
} from 'lucide-react';
import type { Agent, AgentVersion, ChatMessage } from '../types';
import { agentApi } from '../lib/api';
import { cn } from '../../app/components/ui/utils';

interface Props {
  agent: Agent;
  onRewind?: (messages: ChatMessage[]) => void;
}

function VersionEntry({
  version,
  index,
  total,
  onRewind,
  busy,
}: {
  version: AgentVersion;
  index: number;
  total: number;
  onRewind: () => void;
  busy: boolean;
}) {
  const isLatest = index === total - 1;
  const isCurrent = version.isCurrent;

  return (
    <div className="flex gap-2 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center shrink-0 w-5">
        <div className={cn(
          'size-3.5 rounded-full flex items-center justify-center mt-1 transition-colors',
          isCurrent
            ? 'bg-violet-500 ring-2 ring-violet-500/30'
            : 'bg-zinc-700 group-hover:bg-zinc-500',
        )}>
          {isCurrent
            ? <CircleDot className="size-2 text-white" />
            : <Circle className="size-1.5 text-zinc-500" />}
        </div>
        {!isLatest && (
          <div className={cn(
            'w-px flex-1 min-h-[16px]',
            isCurrent ? 'bg-violet-500/30' : 'bg-zinc-700/50',
          )} />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 min-w-0 pb-2 rounded-lg transition-colors -mt-0.5',
        isCurrent ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
      )}>
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="size-2.5 text-zinc-500 shrink-0" />
              <span className={cn(
                'text-[10px] font-medium truncate block',
                isCurrent ? 'text-violet-300' : 'text-zinc-400',
              )}>
                {version.userMessage || 'Mensaje'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 ml-[14px]">
              <Clock className="size-2 text-zinc-600 shrink-0" />
              <span className="text-[8px] text-zinc-600 tabular-nums">
                {new Date(version.createdAt).toLocaleTimeString('es-ES', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span className="text-[8px] text-zinc-700">
                · {version.messageCount} msgs
              </span>
            </div>
          </div>

          {!isCurrent && (
            <button
              onClick={(e) => { e.stopPropagation(); onRewind(); }}
              disabled={busy}
              title="Rebobinar hasta aquí"
              className="size-5 rounded-md hover:bg-amber-600/20 flex items-center justify-center text-zinc-600 hover:text-amber-400 transition-colors disabled:opacity-30 shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Undo2 className="size-2.5" />
            </button>
          )}

          {isCurrent && (
            <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-violet-600/20 text-violet-400 font-medium shrink-0 mt-0.5">
              Actual
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentVersions({ agent, onRewind }: Props) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const loadVersions = useCallback(async () => {
    try {
      const list = await agentApi.getVersions(agent.id);
      setVersions(list);
    } catch { /* ignore */ }
  }, [agent.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.agentId === agent.id && detail?.versions) {
        setVersions(detail.versions);
      }
    };
    window.addEventListener('plugin:versions_updated', handler);
    return () => window.removeEventListener('plugin:versions_updated', handler);
  }, [agent.id]);

  const handleRewind = async (versionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await agentApi.rewindToVersion(agent.id, versionId);
      setVersions(result.version ? [
        ...versions.slice(0, versions.findIndex((v) => v.id === versionId) + 1).map((v) => ({
          ...v,
          isCurrent: v.id === versionId,
        })),
      ] : []);
      onRewind?.(result.messages);
    } catch (err) {
      setError((err as Error).message);
      await loadVersions();
    } finally {
      setBusy(false);
    }
  };

  if (versions.length === 0) return null;

  return (
    <div className="border-t border-zinc-800">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-zinc-800/40 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="size-3 text-zinc-500" />
        ) : (
          <ChevronDown className="size-3 text-zinc-500" />
        )}
        <History className="size-3 text-violet-400/70" />
        <span className="text-[10px] font-medium text-zinc-400">Versiones</span>
        <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full tabular-nums">
          {versions.length}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2">
          {error && (
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-900/40 rounded-lg px-2.5 py-1.5 mb-2">
              <AlertCircle className="size-3 text-red-400 shrink-0" />
              <p className="text-[10px] text-red-300 flex-1 truncate">{error}</p>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300">
                <X className="size-3" />
              </button>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 mb-2 text-amber-400/80">
              <Loader2 className="size-3 animate-spin" />
              <span className="text-[10px]">Rebobinando...</span>
            </div>
          )}

          <div className="max-h-[200px] overflow-y-auto pr-1">
            {[...versions].reverse().map((v, i) => (
              <VersionEntry
                key={v.id}
                version={v}
                index={versions.length - 1 - i}
                total={versions.length}
                onRewind={() => handleRewind(v.id)}
                busy={busy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
