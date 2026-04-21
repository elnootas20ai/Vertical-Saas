import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Server,
  Monitor,
  Database,
  Info,
  AlertCircle,
  Loader2,
  Rocket,
  Globe,
  Hash,
  FileText,
  Layers,
  Sparkles,
  Heading1,
  Heading2,
  List,
  ListChecks,
  Type,
  Minus,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { agentApi } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (appName: string, port: number, prompt: string, cwd: string) => void;
}

interface StackOption {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

const BACKEND_STACKS: StackOption[] = [
  { id: 'node-express', name: 'Node + Express', icon: '🟢', desc: 'JavaScript/TypeScript' },
  { id: 'python-fastapi', name: 'Python + FastAPI', icon: '🐍', desc: 'Async, moderno' },
  { id: 'python-flask', name: 'Python + Flask', icon: '🐍', desc: 'Ligero, flexible' },
  { id: 'go-fiber', name: 'Go + Fiber', icon: '🔵', desc: 'Alto rendimiento' },
  { id: 'rust-actix', name: 'Rust + Actix', icon: '🦀', desc: 'Ultra rápido' },
  { id: 'bun-elysia', name: 'Bun + Elysia', icon: '🍞', desc: 'Runtime moderno' },
];

const FRONTEND_STACKS: StackOption[] = [
  { id: 'react-vite', name: 'React + Vite', icon: '⚛️', desc: 'SPA moderna' },
  { id: 'vue-vite', name: 'Vue + Vite', icon: '💚', desc: 'Progresivo' },
  { id: 'svelte-kit', name: 'SvelteKit', icon: '🔶', desc: 'Compilado' },
  { id: 'nextjs', name: 'Next.js', icon: '▲', desc: 'Fullstack React' },
  { id: 'nuxt', name: 'Nuxt', icon: '💚', desc: 'Fullstack Vue' },
  { id: 'vanilla', name: 'Vanilla JS', icon: '📄', desc: 'Sin framework' },
];

const MIN_DESCRIPTION_LENGTH = 100;

export function CreateAppDialog({ open, onClose, onCreated }: Props) {
  const { isDark, t } = usePluginSettings();

  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [port, setPort] = useState('3100');
  const [backendStack, setBackendStack] = useState('node-express');
  const [frontendStack, setFrontendStack] = useState('react-vite');
  const [showCouchInfo, setShowCouchInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [aiMaxChars, setAiMaxChars] = useState(400);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(100, Math.min(el.scrollHeight, 400))}px`;
  }, []);

  useEffect(() => { autoResize(); }, [description, autoResize]);

  const insertAtCursor = useCallback((prefix: string, suffix = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = description.slice(start, end);
    const before = description.slice(0, start);
    const after = description.slice(end);
    const needsNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const insertion = `${needsNewline}${prefix}${selected}${suffix}`;
    const newDesc = before + insertion + after;
    setDescription(newDesc);
    requestAnimationFrame(() => {
      const cursorPos = (before + needsNewline + prefix).length + selected.length;
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }, [description]);

  if (!open) return null;

  const sanitizedName = appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const descLength = description.length;
  const descValid = descLength >= MIN_DESCRIPTION_LENGTH;
  const nameValid = sanitizedName.length >= 2;
  const portNum = parseInt(port, 10);
  const portValid = portNum >= 1024 && portNum <= 65535;
  const formValid = nameValid && descValid && portValid;

  const inputClass = cn(
    'w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-violet-500/50 transition-colors',
    isDark
      ? 'bg-zinc-900 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-600'
      : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400',
  );

  const handleGenerateDesc = async () => {
    if (!description.trim() || description.trim().length < 10) return;
    setGeneratingDesc(true);
    try {
      const result = await agentApi.enhanceDescription(description.trim(), sanitizedName || 'mi-app', aiMaxChars);
      if (result.enhanced) {
        setDescription(result.enhanced);
      }
    } catch {
      /* keep current description */
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleCreate = async () => {
    if (!formValid) return;
    setError(null);
    setCreating(true);

    try {
      const result = await agentApi.validateApp({
        name: sanitizedName,
        description,
        port: portNum,
        backendStack,
        frontendStack,
      });

      onCreated(sanitizedName, portNum, result.prompt, result.cwd);
      setAppName('');
      setDescription('');
      setPort('3100');
      setBackendStack('node-express');
      setFrontendStack('react-vite');
      setError(null);
      setCreating(false);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setAppName('');
    setDescription('');
    setPort('3100');
    setBackendStack('node-express');
    setFrontendStack('react-vite');
    setError(null);
    setCreating(false);
    onClose();
  };

  const selectedBackend = BACKEND_STACKS.find((s) => s.id === backendStack)!;
  const selectedFrontend = FRONTEND_STACKS.find((s) => s.id === frontendStack)!;

  return (
    <div className="absolute inset-0 z-[300] flex flex-col">
      <div
        className={cn(
          'flex flex-col h-full w-full overflow-hidden animate-in fade-in duration-150',
          isDark ? 'bg-zinc-950' : 'bg-white',
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between px-4 py-2.5 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-600 to-cyan-600 flex items-center justify-center">
              <Rocket className="size-3.5 text-white" />
            </div>
            <div>
              <h2 className={cn('text-xs font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                {t('createApp')}
              </h2>
              <p className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>
                {t('createAppDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className={cn(
              'size-7 rounded-lg flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-400',
            )}
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              {/* Error */}
              {error && (
                <div className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 border',
                  isDark ? 'bg-red-950/60 border-red-900/50' : 'bg-red-50 border-red-200',
                )}>
                  <AlertCircle className={cn('size-4 shrink-0', isDark ? 'text-red-400' : 'text-red-500')} />
                  <p className={cn('text-xs flex-1', isDark ? 'text-red-300' : 'text-red-600')}>{error}</p>
                </div>
              )}

              {/* App Name */}
              <div>
                <label className={cn('flex items-center gap-1.5 text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  <Globe className="size-3.5" />
                  {t('appName')}
                </label>
                <input
                  className={inputClass}
                  placeholder={t('appNamePlaceholder')}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  autoFocus
                />
                {appName && (
                  <p className={cn('text-[10px] mt-1', isDark ? 'text-zinc-500' : 'text-gray-500')}>
                    {t('appPath')}: <span className="font-mono">/var/www/{sanitizedName}</span>
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className={cn('flex items-center gap-1.5 text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  <FileText className="size-3.5" />
                  {t('appDescription')}
                </label>

                {/* Toolbar */}
                <div className={cn(
                  'flex items-center gap-0.5 rounded-t-lg border border-b-0 px-1.5 py-1',
                  isDark ? 'bg-zinc-900/80 border-zinc-700/60' : 'bg-gray-50 border-gray-300',
                )}>
                  {[
                    { icon: Heading1, action: () => insertAtCursor('# '), title: t('appFmtH1') },
                    { icon: Heading2, action: () => insertAtCursor('## '), title: t('appFmtH2') },
                    { icon: Type, action: () => insertAtCursor('### '), title: t('appFmtH3') },
                    { icon: Minus, action: () => insertAtCursor('---\n'), title: t('appFmtDivider') },
                    { icon: List, action: () => insertAtCursor('- '), title: t('appFmtList') },
                    { icon: ListChecks, action: () => insertAtCursor('- [ ] '), title: t('appFmtCheck') },
                  ].map(({ icon: Ic, action, title }, i) => (
                    <button
                      key={i}
                      onClick={action}
                      title={title}
                      className={cn(
                        'size-6 rounded flex items-center justify-center transition-colors',
                        isDark ? 'hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-700',
                      )}
                    >
                      <Ic className="size-3" />
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  className={cn(
                    inputClass,
                    'resize-none rounded-t-none min-h-[100px]',
                    !descValid && descLength > 0
                      ? isDark ? 'border-amber-600/50' : 'border-amber-400'
                      : '',
                  )}
                  placeholder={t('appDescPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ overflow: 'hidden' }}
                />

                {/* Footer: char counter + AI enhance */}
                <div className="flex items-center justify-between mt-1.5">
                  <p className={cn(
                    'text-[10px] font-mono',
                    descValid
                      ? isDark ? 'text-emerald-500' : 'text-emerald-600'
                      : descLength > 0
                        ? isDark ? 'text-amber-500' : 'text-amber-600'
                        : isDark ? 'text-zinc-600' : 'text-gray-400',
                  )}>
                    {descLength}/{MIN_DESCRIPTION_LENGTH}
                  </p>
                </div>

                {/* AI Enhance section */}
                {description.trim().length >= 10 && (
                  <div className={cn(
                    'mt-2 rounded-xl border p-3 space-y-2.5',
                    isDark ? 'border-violet-800/30 bg-violet-950/20' : 'border-violet-200 bg-violet-50/50',
                  )}>
                    <div className="flex items-center gap-2">
                      <Sparkles className={cn('size-3.5', isDark ? 'text-violet-400' : 'text-violet-600')} />
                      <span className={cn('text-[11px] font-semibold flex-1', isDark ? 'text-violet-300' : 'text-violet-700')}>
                        {t('aiEnhance')}
                      </span>
                      <span className={cn('text-[10px] font-mono', isDark ? 'text-violet-400' : 'text-violet-600')}>
                        ~{aiMaxChars} chars
                      </span>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="range"
                        min={200}
                        max={2000}
                        step={100}
                        value={aiMaxChars}
                        onChange={(e) => setAiMaxChars(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-600"
                        style={{
                          background: isDark
                            ? `linear-gradient(to right, #7c3aed ${((aiMaxChars - 200) / 1800) * 100}%, #27272a ${((aiMaxChars - 200) / 1800) * 100}%)`
                            : `linear-gradient(to right, #7c3aed ${((aiMaxChars - 200) / 1800) * 100}%, #e5e7eb ${((aiMaxChars - 200) / 1800) * 100}%)`,
                        }}
                      />
                      <div className={cn('flex justify-between text-[8px] font-medium', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                        <span>{t('aiContextBrief')}</span>
                        <span>{t('aiContextDetailed')}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateDesc}
                      disabled={generatingDesc}
                      className={cn(
                        'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all',
                        generatingDesc
                          ? isDark ? 'bg-violet-900/40 text-violet-400' : 'bg-violet-100 text-violet-500'
                          : 'bg-violet-600 hover:bg-violet-500 text-white',
                      )}
                    >
                      {generatingDesc ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {generatingDesc ? t('aiGenerating') : t('aiEnhance')}
                    </button>
                  </div>
                )}
              </div>

              {/* Port */}
              <div>
                <label className={cn('flex items-center gap-1.5 text-xs font-medium mb-1.5', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  <Hash className="size-3.5" />
                  {t('appPort')}
                </label>
                <input
                  className={cn(inputClass, 'font-mono w-32')}
                  type="number"
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
                {!portValid && port && (
                  <p className={cn('text-[10px] mt-1', isDark ? 'text-amber-500' : 'text-amber-600')}>
                    {t('portRange')}
                  </p>
                )}
              </div>

              {/* Backend Stack */}
              <div>
                <label className={cn('flex items-center gap-1.5 text-xs font-medium mb-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  <Server className="size-3.5" />
                  {t('backendStack')}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {BACKEND_STACKS.map((stack) => (
                    <button
                      key={stack.id}
                      onClick={() => setBackendStack(stack.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all text-left',
                        backendStack === stack.id
                          ? isDark
                            ? 'border-emerald-500/60 bg-emerald-600/10'
                            : 'border-emerald-500 bg-emerald-50'
                          : isDark
                            ? 'border-zinc-700/30 bg-zinc-900/40 hover:border-zinc-600'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                      )}
                    >
                      <span className="text-sm shrink-0">{stack.icon}</span>
                      <div className="min-w-0">
                        <span className={cn(
                          'text-[10px] font-medium block truncate',
                          backendStack === stack.id
                            ? isDark ? 'text-emerald-300' : 'text-emerald-700'
                            : isDark ? 'text-zinc-300' : 'text-gray-700',
                        )}>
                          {stack.name}
                        </span>
                        <span className={cn(
                          'text-[9px] block truncate',
                          backendStack === stack.id
                            ? isDark ? 'text-emerald-500/70' : 'text-emerald-600'
                            : isDark ? 'text-zinc-600' : 'text-gray-400',
                        )}>
                          {stack.desc}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Frontend Stack */}
              <div>
                <label className={cn('flex items-center gap-1.5 text-xs font-medium mb-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                  <Monitor className="size-3.5" />
                  {t('frontendStack')}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FRONTEND_STACKS.map((stack) => (
                    <button
                      key={stack.id}
                      onClick={() => setFrontendStack(stack.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all text-left',
                        frontendStack === stack.id
                          ? isDark
                            ? 'border-cyan-500/60 bg-cyan-600/10'
                            : 'border-cyan-500 bg-cyan-50'
                          : isDark
                            ? 'border-zinc-700/30 bg-zinc-900/40 hover:border-zinc-600'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                      )}
                    >
                      <span className="text-sm shrink-0">{stack.icon}</span>
                      <div className="min-w-0">
                        <span className={cn(
                          'text-[10px] font-medium block truncate',
                          frontendStack === stack.id
                            ? isDark ? 'text-cyan-300' : 'text-cyan-700'
                            : isDark ? 'text-zinc-300' : 'text-gray-700',
                        )}>
                          {stack.name}
                        </span>
                        <span className={cn(
                          'text-[9px] block truncate',
                          frontendStack === stack.id
                            ? isDark ? 'text-cyan-500/70' : 'text-cyan-600'
                            : isDark ? 'text-zinc-600' : 'text-gray-400',
                        )}>
                          {stack.desc}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CouchDB Info */}
              <div className={cn(
                'rounded-lg border p-3',
                isDark ? 'bg-orange-950/20 border-orange-900/30' : 'bg-orange-50 border-orange-200',
              )}>
                <div className="flex items-start gap-2.5">
                  <div className="size-7 rounded-lg bg-orange-600/20 flex items-center justify-center shrink-0">
                    <Database className={cn('size-3.5', isDark ? 'text-orange-400' : 'text-orange-600')} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-xs font-semibold', isDark ? 'text-orange-300' : 'text-orange-800')}>
                        CouchDB
                      </p>
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                        isDark ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-100 text-orange-700',
                      )}>
                        {t('alwaysIncluded')}
                      </span>
                      <button
                        onClick={() => setShowCouchInfo(!showCouchInfo)}
                        className={cn(
                          'size-5 rounded-md flex items-center justify-center transition-colors',
                          isDark ? 'hover:bg-orange-900/30 text-orange-500' : 'hover:bg-orange-100 text-orange-500',
                        )}
                      >
                        <Info className="size-3.5" />
                      </button>
                    </div>
                    <p className={cn('text-[10px] mt-0.5', isDark ? 'text-orange-400/70' : 'text-orange-700/80')}>
                      {t('couchdbBrief')}
                    </p>

                    {showCouchInfo && (
                      <div className={cn(
                        'mt-3 rounded-lg p-3 space-y-2',
                        isDark ? 'bg-zinc-900/80 border border-orange-900/20' : 'bg-white border border-orange-200',
                      )}>
                        <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-300' : 'text-gray-800')}>
                          {t('whyCouchdb')}
                        </p>
                        <ul className="space-y-1.5">
                          {[
                            t('couchReason1'),
                            t('couchReason2'),
                            t('couchReason3'),
                            t('couchReason4'),
                            t('couchReason5'),
                          ].map((reason, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className={cn('text-[9px] mt-0.5', isDark ? 'text-emerald-500' : 'text-emerald-600')}>●</span>
                              <span className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-600')}>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              {formValid && (
                <div className={cn(
                  'rounded-lg border p-3',
                  isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-200',
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className={cn('size-3.5', isDark ? 'text-violet-400' : 'text-violet-600')} />
                    <p className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                      {t('appSummary')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className={cn('text-[9px] uppercase tracking-wider', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('appPath')}</p>
                      <p className={cn('text-[11px] font-mono', isDark ? 'text-zinc-300' : 'text-gray-700')}>/var/www/{sanitizedName}</p>
                    </div>
                    <div>
                      <p className={cn('text-[9px] uppercase tracking-wider', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('appPort')}</p>
                      <p className={cn('text-[11px] font-mono', isDark ? 'text-zinc-300' : 'text-gray-700')}>:{port}</p>
                    </div>
                    <div>
                      <p className={cn('text-[9px] uppercase tracking-wider', isDark ? 'text-zinc-600' : 'text-gray-400')}>Backend</p>
                      <p className={cn('text-[11px]', isDark ? 'text-zinc-300' : 'text-gray-700')}>{selectedBackend.icon} {selectedBackend.name}</p>
                    </div>
                    <div>
                      <p className={cn('text-[9px] uppercase tracking-wider', isDark ? 'text-zinc-600' : 'text-gray-400')}>Frontend</p>
                      <p className={cn('text-[11px]', isDark ? 'text-zinc-300' : 'text-gray-700')}>{selectedFrontend.icon} {selectedFrontend.name}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
              <button
                onClick={handleClose}
                className={cn(
                  'px-4 py-2 rounded-lg text-xs font-medium transition-colors',
                  isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!formValid || creating}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Rocket className="size-3.5" />
                )}
                {creating ? t('creatingApp') : t('createApp')}
              </button>
            </div>
      </div>
    </div>
  );
}
