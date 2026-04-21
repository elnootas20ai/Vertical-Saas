import { useState, useRef } from 'react';
import {
  Archive,
  Hammer,
  RotateCcw,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

type ActionStatus = 'idle' | 'running' | 'success' | 'error';

export function QuickActions() {
  const { isDark, t } = usePluginSettings();
  const [expanded, setExpanded] = useState(true);
  const [backupStatus, setBackupStatus] = useState<ActionStatus>('idle');
  const [buildStatus, setBuildStatus] = useState<ActionStatus>('idle');
  const [restartStatus, setRestartStatus] = useState<ActionStatus>('idle');
  const [buildLog, setBuildLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const runBackup = async () => {
    setBackupStatus('running');
    try {
      const res = await fetch('/api/plugin/actions/backup', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `download-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setBackupStatus('success');
      setTimeout(() => setBackupStatus('idle'), 3000);
    } catch (err) {
      console.error('Backup error:', err);
      setBackupStatus('error');
      setTimeout(() => setBackupStatus('idle'), 4000);
    }
  };

  const runBuild = async () => {
    setBuildStatus('running');
    setBuildLog('');
    setShowLog(true);

    try {
      const res = await fetch('/api/plugin/actions/build');
      if (!res.body) throw new Error('No stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalStatus: ActionStatus = 'success';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'error') finalStatus = 'error';
            setBuildLog((prev) => {
              const next = prev + parsed.content;
              requestAnimationFrame(() => {
                if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
              });
              return next;
            });
          } catch { /* skip */ }
        }
      }

      setBuildStatus(finalStatus);
      setTimeout(() => setBuildStatus('idle'), 5000);
    } catch (err) {
      setBuildLog((prev) => prev + `\n\nError: ${(err as Error).message}`);
      setBuildStatus('error');
      setTimeout(() => setBuildStatus('idle'), 5000);
    }
  };

  const runRestart = async () => {
    setRestartStatus('running');
    try {
      await fetch('/api/plugin/actions/restart-backend', { method: 'POST' });
      setRestartStatus('success');
      setTimeout(() => setRestartStatus('idle'), 3000);
    } catch {
      setRestartStatus('error');
      setTimeout(() => setRestartStatus('idle'), 4000);
    }
  };

  const StatusIcon = ({ status }: { status: ActionStatus }) => {
    if (status === 'running') return <Loader2 className="size-3 animate-spin" />;
    if (status === 'success') return <Check className="size-3 text-emerald-400" />;
    if (status === 'error') return <X className="size-3 text-red-400" />;
    return null;
  };

  return (
    <div className={cn('border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center justify-between w-full px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors',
          isDark ? 'text-zinc-500 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600',
        )}
      >
        <span>{t('quickActions')}</span>
        {expanded ? <ChevronUp className="size-3 text-zinc-500" /> : <ChevronDown className="size-3 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Backup */}
          <button
            onClick={runBackup}
            disabled={backupStatus === 'running'}
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs transition-all',
              backupStatus === 'running'
                ? cn(
                    'cursor-wait',
                    isDark ? 'bg-zinc-800/60 text-zinc-400' : 'bg-gray-100 text-gray-400',
                  )
                : isDark
                  ? 'bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            <Archive className="size-3.5 text-blue-400 shrink-0" />
            <span className="flex-1 text-left">
              {backupStatus === 'running'
                ? t('backupRunning')
                : backupStatus === 'success'
                  ? t('backupDone')
                  : backupStatus === 'error'
                    ? t('backupFailed')
                    : t('backup')}
            </span>
            <StatusIcon status={backupStatus} />
          </button>

          {/* Build */}
          <button
            onClick={runBuild}
            disabled={buildStatus === 'running'}
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs transition-all',
              buildStatus === 'running'
                ? cn(
                    'cursor-wait',
                    isDark ? 'bg-zinc-800/60 text-zinc-400' : 'bg-gray-100 text-gray-400',
                  )
                : isDark
                  ? 'bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            <Hammer className="size-3.5 text-amber-400 shrink-0" />
            <span className="flex-1 text-left">
              {buildStatus === 'running'
                ? t('buildRunning')
                : buildStatus === 'success'
                  ? t('buildDone')
                  : buildStatus === 'error'
                    ? t('buildFailed')
                    : t('build')}
            </span>
            <StatusIcon status={buildStatus} />
          </button>

          {/* Restart backend */}
          <button
            onClick={runRestart}
            disabled={restartStatus === 'running'}
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs transition-all',
              restartStatus === 'running'
                ? cn(
                    'cursor-wait',
                    isDark ? 'bg-zinc-800/60 text-zinc-400' : 'bg-gray-100 text-gray-400',
                  )
                : isDark
                  ? 'bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            <RotateCcw className="size-3.5 text-emerald-400 shrink-0" />
            <span className="flex-1 text-left">
              {restartStatus === 'running'
                ? t('restartRunning')
                : restartStatus === 'success'
                  ? t('restartDone')
                  : restartStatus === 'error'
                    ? t('restartFailed')
                    : t('restartBackend')}
            </span>
            <StatusIcon status={restartStatus} />
          </button>

          {/* Build log */}
          {showLog && buildLog && (
            <div className="relative mt-1">
              <div className="flex items-center justify-between px-2 py-1">
                <div
                  className={cn(
                    'flex items-center gap-1 text-[10px]',
                    isDark ? 'text-zinc-500' : 'text-gray-400',
                  )}
                >
                  <Terminal className="size-2.5" />
                  <span>{t('buildOutput')}</span>
                </div>
                <button
                  onClick={() => { setShowLog(false); setBuildLog(''); }}
                  className={cn(
                    'text-[10px] transition-colors',
                    isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  {t('clear')}
                </button>
              </div>
              <pre
                ref={logRef}
                className={cn(
                  'rounded-lg p-2 text-[10px] leading-relaxed max-h-40 overflow-y-auto font-mono whitespace-pre-wrap break-all border',
                  isDark
                    ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
                    : 'bg-gray-50 border-gray-200 text-gray-600',
                )}
              >
                {buildLog}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
