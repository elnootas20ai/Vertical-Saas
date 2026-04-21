import { useState, useEffect } from 'react';
import { Terminal, X, Bot, Sparkles, MessageSquare, AlertCircle, Loader2, Download } from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { agentApi } from '../lib/api';
import { CHAT_MODELS, CURSOR_MODELS } from '../models';
import type { AgentType, CursorCliStatus } from '../types';

const TYPE_CONFIG: Record<AgentType, { icon: typeof Bot; color: string; activeBorder: string; activeBg: string }> = {
  conversation: { icon: MessageSquare, color: 'text-violet-400', activeBorder: 'border-violet-500/60', activeBg: 'bg-violet-600/10' },
  cursor: { icon: Sparkles, color: 'text-blue-400', activeBorder: 'border-blue-500/60', activeBg: 'bg-blue-600/10' },
  terminal: { icon: Terminal, color: 'text-emerald-400', activeBorder: 'border-emerald-500/60', activeBg: 'bg-emerald-600/10' },
};

export function CreateAgentDialog({ open, onClose, onCreate }: Props) {
  const { isDark, t } = usePluginSettings();
  const [name, setName] = useState('');
  const [type, setType] = useState<AgentType>('conversation');
  const [cwd, setCwd] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [prompt, setPrompt] = useState('');
  const [cliStatus, setCliStatus] = useState<CursorCliStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const typeLabels: Record<AgentType, { label: string; desc: string }> = {
    conversation: { label: t('conversation'), desc: t('chatWithAI') },
    cursor: { label: t('cursorAgent'), desc: t('aiPrograms') },
    terminal: { label: t('terminal'), desc: t('pureBash') },
  };

  const quickDirs = [
    { label: t('currentProject'), cwd: '' },
    { label: '/var/www/backend', cwd: '/var/www/backend' },
    { label: t('home'), cwd: '/root' },
  ];

  useEffect(() => {
    if (open && type === 'cursor') {
      agentApi.cursorStatus().then(setCliStatus).catch(() => setCliStatus({ available: false, path: null }));
    }
  }, [open, type]);

  if (!open) return null;

  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  const typeLabel = typeLabels[type].label;
  const typeDesc = typeLabels[type].desc;

  const inputClass = cn(
    'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500/50 transition-colors',
    isDark ? 'bg-zinc-900 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400',
  );

  const handleCreate = () => {
    const defaultNames: Record<AgentType, string> = {
      conversation: `Chat ${Date.now().toString(36)}`,
      cursor: `Agent ${Date.now().toString(36)}`,
      terminal: `Terminal ${Date.now().toString(36)}`,
    };
    const agentName = name.trim() || defaultNames[type];
    const agentModel = type === 'conversation' ? model : type === 'cursor' ? model : undefined;
    const agentPrompt = (type === 'cursor') && prompt.trim() ? prompt.trim() : undefined;
    onCreate(agentName, type, cwd || undefined, agentModel, agentPrompt);
    setName('');
    setCwd('');
    setModel('gpt-4o-mini');
    setPrompt('');
    setType('conversation');
    onClose();
  };

  const handleInstallCli = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await agentApi.cursorInstall();
      if (result.installed) {
        setCliStatus({ available: true, path: result.path || null });
      } else {
        setInstallError(result.error || 'No se pudo instalar');
      }
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  const typeInactive = isDark ? 'border-zinc-700/30 bg-zinc-900/40 hover:border-zinc-600' : 'border-gray-200 bg-gray-50 hover:border-gray-300';
  const modelInactive = isDark ? 'border-zinc-700/30 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300';
  const quickDirBtn = isDark
    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 border',
          isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200',
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between px-6 py-4 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <Icon className="size-5 text-white" />
            </div>
            <div>
              <h2 className={cn('text-base font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                {t('newLabel')} {typeLabel}
              </h2>
              <p className={cn('text-xs', isDark ? 'text-zinc-500' : 'text-gray-500')}>{typeDesc}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              'size-8 rounded-lg flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-400',
            )}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Type selector */}
          <div>
            <label className={cn('block text-xs font-medium mb-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>{t('type')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(TYPE_CONFIG) as [AgentType, (typeof TYPE_CONFIG)[AgentType]][]).map(([key, c]) => {
                const TIcon = c.icon;
                const lbl = typeLabels[key].label;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setType(key);
                      if (key === 'conversation') setModel('gpt-4o-mini');
                      else if (key === 'cursor') setModel('claude-4.6-sonnet-medium-thinking');
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all',
                      type === key ? `${c.activeBorder} ${c.activeBg}` : typeInactive,
                    )}
                  >
                    <TIcon className={cn('size-5', type === key ? c.color : isDark ? 'text-zinc-500' : 'text-gray-400')} />
                    <p className={cn('text-[11px] font-medium', type === key ? c.color : isDark ? 'text-zinc-400' : 'text-gray-500')}>
                      {lbl}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cursor CLI status warning */}
          {type === 'cursor' && cliStatus && !cliStatus.available && (
            <div
              className={cn(
                'rounded-lg p-3 border',
                isDark ? 'bg-amber-950/50 border-amber-800/40' : 'bg-amber-50 border-amber-200',
              )}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className={cn('size-4 shrink-0 mt-0.5', isDark ? 'text-amber-400' : 'text-amber-600')} />
                <div className="flex-1">
                  <p className={cn('text-xs font-medium', isDark ? 'text-amber-300' : 'text-amber-800')}>{t('cliNotFound')}</p>
                  <p className={cn('text-[10px] mt-0.5', isDark ? 'text-amber-400/70' : 'text-amber-600')}>{t('cliNeeded')}</p>
                  {installError && (
                    <p className="text-[10px] text-red-400 mt-1">{installError}</p>
                  )}
                  <button
                    onClick={handleInstallCli}
                    disabled={installing}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {installing ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                    {installing ? t('installing') : t('installCli')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>{t('name')}</label>
            <input
              className={inputClass}
              placeholder={
                type === 'conversation' ? t('placeholderConv') : type === 'cursor' ? t('placeholderCursor') : t('placeholderTerminal')
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>

          {/* Working directory (only for cursor/terminal) */}
          {type !== 'conversation' && (
            <div>
              <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                {t('workingDir')}
              </label>
              <input
                className={cn(inputClass, 'font-mono')}
                placeholder="/var/www/backend"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickDirs.map((d) => (
                  <button
                    key={d.cwd || 'project'}
                    onClick={() => setCwd(d.cwd)}
                    className={cn('px-2 py-0.5 rounded text-[10px] transition-colors', quickDirBtn)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model (conversation or cursor) */}
          {type === 'conversation' && (
            <div>
              <label className={cn('block text-xs font-medium mb-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>{t('model')}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {CHAT_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={cn(
                      'flex flex-col items-start rounded-lg border px-2.5 py-1.5 transition-all text-left',
                      model === m.id
                        ? 'border-violet-500/60 bg-violet-600/10 text-violet-300'
                        : modelInactive,
                    )}
                  >
                    <span className="text-[11px] font-medium">{m.name}</span>
                    <span
                      className={cn(
                        'text-[9px]',
                        model === m.id ? 'opacity-70' : isDark ? 'text-zinc-500' : 'text-gray-500',
                      )}
                    >
                      {m.provider}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'cursor' && (
            <div>
              <label className={cn('block text-xs font-medium mb-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>{t('model')}</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {CURSOR_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={cn(
                      'flex flex-col items-start rounded-lg border px-2.5 py-1.5 transition-all text-left',
                      model === m.id
                        ? 'border-blue-500/60 bg-blue-600/10 text-blue-300'
                        : modelInactive,
                    )}
                  >
                    <span className="text-[11px] font-medium">{m.name}</span>
                    <span
                      className={cn(
                        'text-[9px]',
                        model === m.id ? 'opacity-70' : isDark ? 'text-zinc-500' : 'text-gray-500',
                      )}
                    >
                      {m.provider}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'cursor' && (
            <div>
              <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                {t('initialInstruction')}{' '}
                <span className={isDark ? 'text-zinc-600' : 'text-gray-400'}>{t('optional')}</span>
              </label>
              <textarea
                className={cn(
                  'w-full border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500/50 resize-none transition-colors min-h-[60px]',
                  isDark ? 'bg-zinc-900 border-zinc-700/60 text-zinc-300 placeholder:text-zinc-600' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400',
                )}
                rows={2}
                placeholder={t('placeholderInstruction')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn('flex items-center justify-end gap-2 px-6 py-4 border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition-colors',
              isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100',
            )}
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={type === 'cursor' && cliStatus !== null && !cliStatus.available}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon className="size-3.5" />
            {t('create')} {typeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
