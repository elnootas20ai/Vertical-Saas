import { useState, useEffect, useRef } from 'react';
import { Keyboard } from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import type { ShortcutConfig } from '../PluginPanel';
import { usePluginSettings } from '../PluginProvider';

interface Props {
  current: ShortcutConfig;
  onChange: (s: ShortcutConfig) => void;
}

function buildLabel(e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; key: string }): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(k);
  return parts.join('+');
}

export function ShortcutRecorder({ current, onChange }: Props) {
  const { isDark, t } = usePluginSettings();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const recRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    recRef.current = true;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        setPreview(buildLabel(e) + '+...');
        return;
      }

      const config: ShortcutConfig = {
        key: e.key.toLowerCase(),
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        label: buildLabel(e),
      };

      onChange(config);
      setRecording(false);
      setOpen(false);
      setPreview('');
      recRef.current = false;
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      recRef.current = false;
    };
  }, [recording, onChange]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'size-6 rounded-md flex items-center justify-center transition-colors',
          open
            ? (isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800')
            : (isDark
              ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'),
        )}
        title={`Quick command: ${current.label}`}
      >
        <Keyboard className="size-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => { setOpen(false); setRecording(false); setPreview(''); }} />
          <div
            className={cn(
              'absolute right-0 top-8 z-[110] border rounded-xl shadow-xl p-4 w-56 animate-in fade-in zoom-in-95 duration-100',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}
          >
            <p className={cn('text-[10px] font-semibold uppercase tracking-wider mb-3', isDark ? 'text-zinc-500' : 'text-gray-500')}>
              {t('quickCommandShortcut')}
            </p>

            <div className="mb-3">
              <p className={cn('text-[10px] mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>{t('currentShortcut')}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {current.label.split('+').map((part, i) => (
                  <kbd
                    key={i}
                    className={cn(
                      'inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 border rounded text-[10px] font-mono',
                      isDark
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-300'
                        : 'bg-gray-100 border-gray-300 text-gray-700',
                    )}
                  >
                    {part}
                  </kbd>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mb-2">
              {t('shortcutDesc')}
            </p>

            {recording ? (
              <div className="flex flex-col items-center gap-2 py-3 bg-violet-600/10 border border-violet-500/30 rounded-lg">
                <div className="size-6 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                  <div className="size-2 rounded-full bg-red-400" />
                </div>
                <p className="text-[10px] text-violet-300 font-medium">
                  {preview || t('pressShortcut')}
                </p>
                <button
                  onClick={() => { setRecording(false); setPreview(''); }}
                  className={cn(
                    'text-[9px]',
                    isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className={cn(
                  'w-full py-2 rounded-lg text-xs font-medium transition-colors',
                  isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
                )}
              >
                {t('recordShortcut')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
