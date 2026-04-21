import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  User, Activity, Loader2, RefreshCw,
  X, Clock, CheckCircle2,
  AlertCircle, Info, FileText, Database, Settings,
  LogIn, Eye,
  Download, ChevronLeft, ChevronRight,
  Trash2, Zap, MessageSquare, Send,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { agentApi } from '../lib/api';
import { TabLoader } from './TabLoader';

// ── Types ──

interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  category: string;
  details: string;
  level: 'info' | 'warning' | 'error' | 'success';
  ip?: string;
  resource?: string;
}

interface LogRule {
  id: string;
  _rev: string;
  prompt: string;
  status: string;
  createdAt: string;
  activatedAt: string;
  agentId: string;
}

type SortField = 'timestamp' | 'user' | 'action' | 'category' | 'level';
type SortDir = 'asc' | 'desc';
type TabValue = 'rules' | 'activity';

// ── Constants ──

const ACTION_CATEGORIES = [
  'auth', 'crud', 'config', 'api', 'system', 'navigation', 'payment', 'export',
] as const;

const LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string; bgDark: string }> = {
  info:    { icon: Info,          color: 'text-blue-500',   bg: 'bg-blue-50',    bgDark: 'bg-blue-900/20' },
  success: { icon: CheckCircle2,  color: 'text-emerald-500', bg: 'bg-emerald-50', bgDark: 'bg-emerald-900/20' },
  warning: { icon: AlertCircle,   color: 'text-amber-500',  bg: 'bg-amber-50',   bgDark: 'bg-amber-900/20' },
  error:   { icon: AlertCircle,   color: 'text-red-500',    bg: 'bg-red-50',     bgDark: 'bg-red-900/20' },
};

const ACTION_ICONS: Record<string, typeof Activity> = {
  auth: LogIn,
  crud: Database,
  config: Settings,
  api: Activity,
  system: FileText,
  navigation: Eye,
  payment: Download,
  export: Download,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; bgDark: string }> = {
  pending:  { label: 'Pendiente', color: 'text-amber-500',   bg: 'bg-amber-50',   bgDark: 'bg-amber-900/20' },
  active:   { label: 'Activo',    color: 'text-emerald-500', bg: 'bg-emerald-50', bgDark: 'bg-emerald-900/20' },
  running:  { label: 'Creando...', color: 'text-blue-500',   bg: 'bg-blue-50',    bgDark: 'bg-blue-900/20' },
  removing: { label: 'Eliminando...', color: 'text-red-500', bg: 'bg-red-50',     bgDark: 'bg-red-900/20' },
  error:    { label: 'Error',     color: 'text-red-500',     bg: 'bg-red-50',     bgDark: 'bg-red-900/20' },
};

const PAGE_SIZE = 25;

// ── Component ──

interface Props {
  onCreateAgent?: (name: string, type: string, cwd?: string, model?: string, prompt?: string) => Promise<unknown>;
}

export function ActivityLogs({ onCreateAgent }: Props) {
  const { isDark, t } = usePluginSettings();

  const [tab, setTab] = useState<TabValue>('rules');

  // Rules state
  const [rules, setRules] = useState<LogRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [newRulePrompt, setNewRulePrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  // ── Rules logic ──

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const data = await agentApi.logsGetRules();
      setRules(data.rules || []);
    } catch {
      setRules([]);
    }
    setRulesLoading(false);
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const buildActivatePrompt = (rulePrompt: string, ruleId: string) =>
    `Necesito que implementes la siguiente regla de logging/alerta en el backend Express de /var/www/backend:

## Regla solicitada:
"${rulePrompt}"

## Lo que debes hacer:
1. Analiza la regla y determina qué evento del backend necesita ser interceptado
2. Implementa la lógica necesaria para detectar ese evento
3. Cuando se detecte, guarda un documento en CouchDB (base: "activity-logs") con:
   - _id: "alert:<timestamp>:<uuid>"
   - type: "activity-log"
   - timestamp: fecha ISO
   - user: email del usuario o "system"
   - action: descripción de la acción detectada
   - category: categoría apropiada (auth, crud, config, api, system, payment, etc.)
   - details: descripción legible en español de lo que pasó
   - level: "warning" o "info" según corresponda
   - resource: recurso afectado
   - ruleId: "${ruleId}"

## Contexto técnico:
- Backend Express en /var/www/backend/index.js
- CouchDB en: process.env.COUCHDB_URL || 'http://admin:admin@localhost:5984'
- Ya existe middleware/activityLogger.js que loguea TODAS las peticiones (NO lo modifiques)
- Las rutas están en /var/www/backend/routers/*.js y /var/www/backend/controllers/*.js
- Puedes modificar controllers o routers existentes para añadir la lógica de esta alerta
- O crear un middleware específico si es más apropiado

## IMPORTANTE:
- NO rompas código existente
- NO modifiques middleware/activityLogger.js
- Añade la lógica de forma limpia, idealmente en el controller o router correspondiente
- Documenta con un comentario que incluya el ruleId: ${ruleId}
- El directorio de trabajo es /var/www/backend`;

  const handleCreateRule = async () => {
    const prompt = newRulePrompt.trim();
    if (!prompt || creating) return;
    if (!onCreateAgent) {
      setError('No se puede crear el agente. El sistema de agentes no está disponible.');
      return;
    }

    setError(null);
    setCreating(true);

    const tempId = `rule:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const optimisticRule: LogRule = {
      id: tempId,
      _rev: '',
      prompt,
      status: 'running',
      createdAt: new Date().toISOString(),
      activatedAt: '',
      agentId: '',
    };
    setRules(prev => [optimisticRule, ...prev]);
    setNewRulePrompt('');

    let savedRule: LogRule | null = null;
    try {
      const resp = await agentApi.logsCreateRule(prompt);
      savedRule = resp.rule as unknown as LogRule;
      setRules(prev =>
        prev.map(r => r.id === tempId ? { ...optimisticRule, id: savedRule!.id, _rev: savedRule!._rev, status: 'running' } : r),
      );
    } catch {
      setRules(prev =>
        prev.map(r => r.id === tempId ? { ...r, status: 'running' } : r),
      );
    }

    const ruleId = savedRule?.id || tempId;

    try {
      await onCreateAgent(
        `🔔 Log: ${prompt.slice(0, 50)}`,
        'cursor',
        '/var/www/backend',
        'claude-4.6-sonnet-medium-thinking',
        buildActivatePrompt(prompt, ruleId),
      );

      if (savedRule) {
        await agentApi.logsUpdateRule(ruleId, {
          status: 'active',
          activatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
      setRules(prev =>
        prev.map(r => r.id === ruleId || r.id === tempId ? { ...r, id: ruleId, status: 'active', activatedAt: new Date().toISOString() } : r),
      );
    } catch {
      setRules(prev =>
        prev.map(r => r.id === ruleId || r.id === tempId ? { ...r, id: ruleId, status: 'error' } : r),
      );
    }

    setCreating(false);
  };

  const handleRetryRule = async (rule: LogRule) => {
    if (!onCreateAgent) return;

    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: 'running' } : r));

    try {
      await onCreateAgent(
        `🔔 Log: ${rule.prompt.slice(0, 50)}`,
        'cursor',
        '/var/www/backend',
        'claude-4.6-sonnet-medium-thinking',
        buildActivatePrompt(rule.prompt, rule.id),
      );

      await agentApi.logsUpdateRule(rule.id, {
        status: 'active',
        activatedAt: new Date().toISOString(),
      }).catch(() => {});

      setRules(prev =>
        prev.map(r => r.id === rule.id ? { ...r, status: 'active', activatedAt: new Date().toISOString() } : r),
      );
    } catch {
      setRules(prev =>
        prev.map(r => r.id === rule.id ? { ...r, status: 'error' } : r),
      );
    }
  };

  const handleDeleteRule = async (rule: LogRule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: 'removing' } : r));

    if (rule.status === 'active' && onCreateAgent) {
      try {
        await onCreateAgent(
          `🗑️ Remove: ${rule.prompt.slice(0, 45)}`,
          'cursor',
          '/var/www/backend',
          'claude-4.6-sonnet-medium-thinking',
          `Necesito que elimines/reviertas una regla de logging del backend de /var/www/backend.

## Regla a eliminar:
"${rule.prompt}"

## ID de la regla: ${rule.id}

## Lo que debes hacer:
1. Busca en el código cualquier lógica con un comentario que contenga ruleId: ${rule.id}
2. Busca también lógica que coincida con la descripción de la regla
3. Elimina esa lógica de forma limpia
4. NO rompas código existente
5. NO toques middleware/activityLogger.js
6. El directorio de trabajo es /var/www/backend`,
        );
      } catch { /* agent creation might redirect */ }
    }

    try {
      await agentApi.logsDeleteRule(rule.id);
    } catch { /* */ }

    setRules(prev => prev.filter(r => r.id !== rule.id));
  };

  // ── Logs logic ──

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await agentApi.logsGetEntries();
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'activity') loadLogs();
  }, [tab, loadLogs]);

  const uniqueUsers = useMemo(() => {
    const set = new Set(logs.map((l) => l.user));
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let result = [...logs];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.user.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q) ||
          (l.resource || '').toLowerCase().includes(q),
      );
    }
    if (filterCategory) result = result.filter((l) => l.category === filterCategory);
    if (filterLevel) result = result.filter((l) => l.level === filterLevel);
    if (filterUser) result = result.filter((l) => l.user === filterUser);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'timestamp') cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      else cmp = (a[sortField] || '').localeCompare(b[sortField] || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [logs, search, filterCategory, filterLevel, filterUser, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, filterCategory, filterLevel, filterUser]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const activeFiltersCount = [filterCategory, filterLevel, filterUser].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCategory(null);
    setFilterLevel(null);
    setFilterUser(null);
    setSearch('');
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return iso; }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="size-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  };

  // ── Render ──

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header with tabs */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2.5 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className="flex items-center gap-1">
          <Activity className={cn('size-4', isDark ? 'text-indigo-400' : 'text-indigo-500')} />
          <span className={cn('font-semibold text-xs', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            {t('logsTitle')}
          </span>
        </div>
        <div className={cn(
          'flex items-center rounded-lg p-0.5',
          isDark ? 'bg-zinc-800/70' : 'bg-gray-100',
        )}>
          <button
            onClick={() => setTab('rules')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
              tab === 'rules'
                ? isDark ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                : isDark ? 'text-zinc-400 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              Reglas
              {rules.length > 0 && (
                <span className={cn(
                  'size-4 rounded-full flex items-center justify-center text-[8px] font-bold',
                  isDark ? 'bg-indigo-500/30 text-indigo-300' : 'bg-indigo-100 text-indigo-600',
                )}>
                  {rules.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab('activity')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
              tab === 'activity'
                ? isDark ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                : isDark ? 'text-zinc-400 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <span className="flex items-center gap-1">
              <Activity className="size-3" />
              Actividad
            </span>
          </button>
        </div>
      </div>

      {tab === 'rules' ? (
        /* ─── RULES TAB ─── */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* New rule input */}
          <div className={cn(
            'px-3 py-3 border-b shrink-0',
            isDark ? 'border-zinc-800' : 'border-gray-200',
          )}>
            <div className={cn(
              'flex items-start gap-2 rounded-xl p-2.5',
              isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-gray-50 border border-gray-200',
            )}>
              <MessageSquare className={cn('size-4 mt-0.5 shrink-0', isDark ? 'text-indigo-400' : 'text-indigo-500')} />
              <textarea
                value={newRulePrompt}
                onChange={(e) => setNewRulePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateRule();
                  }
                }}
                placeholder="Describe la regla de log que quieres... ej: &quot;Cuando un usuario cree un vehículo, registrar una alerta&quot;"
                rows={2}
                className={cn(
                  'flex-1 bg-transparent outline-none text-xs resize-none placeholder:opacity-50 leading-relaxed',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-500' : 'text-gray-700 placeholder:text-gray-400',
                )}
              />
              <button
                onClick={handleCreateRule}
                disabled={!newRulePrompt.trim() || creating}
                className={cn(
                  'shrink-0 size-8 rounded-lg flex items-center justify-center transition-all',
                  newRulePrompt.trim() && !creating
                    ? isDark
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    : isDark
                      ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                )}
              >
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </button>
            </div>
            {creating && (
              <div className={cn(
                'flex items-center gap-2 mt-2 px-1 text-[10px]',
                isDark ? 'text-indigo-400' : 'text-indigo-600',
              )}>
                <Loader2 className="size-3 animate-spin" />
                Creando agente para implementar la regla...
              </div>
            )}
            {error && (
              <div className={cn(
                'flex items-center gap-2 mt-2 px-1 text-[10px]',
                isDark ? 'text-red-400' : 'text-red-500',
              )}>
                <AlertCircle className="size-3 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Rules list */}
          <div className="flex-1 overflow-auto">
            {rulesLoading ? (
              <TabLoader compact text="Cargando reglas..." />
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 px-6">
                <div className={cn(
                  'size-12 rounded-2xl flex items-center justify-center',
                  isDark ? 'bg-indigo-900/20' : 'bg-indigo-50',
                )}>
                  <Zap className={cn('size-6', isDark ? 'text-indigo-400' : 'text-indigo-500')} />
                </div>
                <div className="text-center max-w-[260px]">
                  <h3 className={cn('text-xs font-semibold mb-1', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                    Sin reglas de logging
                  </h3>
                  <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                    Escribe arriba qué quieres monitorizar. Un agente implementará la regla en el backend automáticamente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {rules.map((rule) => {
                  const statusCfg = STATUS_CONFIG[rule.status] || STATUS_CONFIG.pending;
                  const isProcessing = rule.status === 'running' || rule.status === 'removing';

                  return (
                    <div
                      key={rule.id}
                      className={cn(
                        'rounded-xl p-3 transition-colors',
                        isDark ? 'bg-zinc-900/60 hover:bg-zinc-900' : 'bg-gray-50 hover:bg-gray-100/80',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn(
                          'size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                          isDark ? 'bg-zinc-800' : 'bg-white border border-gray-200',
                        )}>
                          {isProcessing ? (
                            <Loader2 className={cn('size-3.5 animate-spin', statusCfg.color)} />
                          ) : rule.status === 'active' ? (
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                          ) : rule.status === 'error' ? (
                            <AlertCircle className="size-3.5 text-red-500" />
                          ) : (
                            <Zap className={cn('size-3.5', isDark ? 'text-amber-400' : 'text-amber-500')} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-xs leading-relaxed',
                            isDark ? 'text-zinc-200' : 'text-gray-800',
                          )}>
                            {rule.prompt}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium',
                              statusCfg.color,
                              isDark ? statusCfg.bgDark : statusCfg.bg,
                            )}>
                              {statusCfg.label}
                            </span>
                            <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                              {formatDate(rule.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {(rule.status === 'pending' || rule.status === 'error') && (
                            <button
                              onClick={() => handleRetryRule(rule)}
                              disabled={!onCreateAgent}
                              className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                                rule.status === 'error'
                                  ? isDark ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                  : isDark ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
                                !onCreateAgent && 'opacity-40 cursor-not-allowed',
                              )}
                            >
                              {rule.status === 'error' ? <RefreshCw className="size-3" /> : <Zap className="size-3" />}
                              {rule.status === 'error' ? 'Reintentar' : 'Activar'}
                            </button>
                          )}
                          {!isProcessing && (
                            <button
                              onClick={() => handleDeleteRule(rule)}
                              className={cn(
                                'size-6 rounded-md flex items-center justify-center transition-colors',
                                isDark
                                  ? 'text-zinc-600 hover:text-red-400 hover:bg-red-900/20'
                                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50',
                              )}
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── ACTIVITY TAB ─── */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Search & filters bar */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 border-b shrink-0',
            isDark ? 'border-zinc-800' : 'border-gray-200',
          )}>
            <div className={cn(
              'flex items-center gap-1.5 flex-1 rounded-lg px-2.5 py-1.5 text-xs',
              isDark ? 'bg-zinc-900 text-zinc-300' : 'bg-gray-50 text-gray-700',
            )}>
              <Search className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('logsSearchPlaceholder')}
                className="flex-1 bg-transparent outline-none text-xs placeholder:text-inherit placeholder:opacity-50"
              />
              {search && (
                <button onClick={() => setSearch('')} className="shrink-0">
                  <X className="size-3 opacity-50 hover:opacity-100" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors',
                showFilters || activeFiltersCount > 0
                  ? isDark ? 'bg-indigo-600/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                  : isDark ? 'bg-zinc-900 text-zinc-400 hover:text-zinc-300' : 'bg-gray-50 text-gray-500 hover:text-gray-700',
              )}
            >
              <Filter className="size-3" />
              {t('logsFilter')}
              {activeFiltersCount > 0 && (
                <span className={cn(
                  'size-4 rounded-full flex items-center justify-center text-[8px] font-bold',
                  isDark ? 'bg-indigo-500 text-white' : 'bg-indigo-600 text-white',
                )}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <button
              onClick={loadLogs}
              disabled={logsLoading}
              className={cn(
                'size-7 rounded-lg flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
              )}
              title={t('logsRefresh')}
            >
              <RefreshCw className={cn('size-3', logsLoading && 'animate-spin')} />
            </button>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 border-b shrink-0 flex-wrap',
              isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50/50',
            )}>
              <select
                value={filterCategory || ''}
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-md border outline-none',
                  isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-200 text-gray-700',
                )}
              >
                <option value="">{t('logsAllCategories')}</option>
                {ACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={filterLevel || ''}
                onChange={(e) => setFilterLevel(e.target.value || null)}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-md border outline-none',
                  isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-200 text-gray-700',
                )}
              >
                <option value="">{t('logsAllLevels')}</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>

              <select
                value={filterUser || ''}
                onChange={(e) => setFilterUser(e.target.value || null)}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-md border outline-none',
                  isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-200 text-gray-700',
                )}
              >
                <option value="">{t('logsAllUsers')}</option>
                {uniqueUsers.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>

              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className={cn(
                    'text-[10px] px-2 py-1 rounded-md transition-colors',
                    isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50',
                  )}
                >
                  {t('logsClearFilters')}
                </button>
              )}
            </div>
          )}

          {/* Table */}
          {logsLoading ? (
            <TabLoader compact text="Cargando logs..." />
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
              <Search className={cn('size-6', isDark ? 'text-zinc-700' : 'text-gray-300')} />
              <p className={cn('text-xs', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('logsNoResults')}
              </p>
              <p className={cn('text-[10px] text-center max-w-[240px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                Los logs aparecerán conforme se use la API. Asegúrate de que el backend esté corriendo.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className={cn(
                  'sticky top-0 z-10',
                  isDark ? 'bg-zinc-900' : 'bg-gray-50',
                )}>
                  <tr className={cn('border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
                    <th className="text-left px-3 py-2 font-medium">
                      <button onClick={() => toggleSort('timestamp')} className="flex items-center gap-1 hover:opacity-80">
                        <Clock className="size-3" />
                        {t('logsDate')}
                        <SortIcon field="timestamp" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      <button onClick={() => toggleSort('user')} className="flex items-center gap-1 hover:opacity-80">
                        <User className="size-3" />
                        {t('logsUser')}
                        <SortIcon field="user" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      <button onClick={() => toggleSort('action')} className="flex items-center gap-1 hover:opacity-80">
                        <Activity className="size-3" />
                        {t('logsAction')}
                        <SortIcon field="action" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      <button onClick={() => toggleSort('category')} className="flex items-center gap-1 hover:opacity-80">
                        {t('logsCategory')}
                        <SortIcon field="category" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      <button onClick={() => toggleSort('level')} className="flex items-center gap-1 hover:opacity-80">
                        {t('logsLevel')}
                        <SortIcon field="level" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((log) => {
                    const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                    const LevelIcon = levelCfg.icon;
                    const CatIcon = ACTION_ICONS[log.category] || Activity;
                    return (
                      <tr
                        key={log.id}
                        className={cn(
                          'border-b transition-colors',
                          isDark
                            ? 'border-zinc-800/50 hover:bg-zinc-800/30'
                            : 'border-gray-100 hover:bg-gray-50',
                        )}
                      >
                        <td className={cn('px-3 py-2 whitespace-nowrap tabular-nums', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-100 text-gray-700',
                          )}>
                            <User className="size-2.5" />
                            {log.user}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className={cn('font-medium', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                              {log.action}
                            </span>
                            {log.details && (
                              <span className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                                {log.details}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px]',
                            isDark ? 'bg-zinc-800/50 text-zinc-400' : 'bg-gray-50 text-gray-500',
                          )}>
                            <CatIcon className="size-2.5" />
                            {log.category}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                            levelCfg.color,
                            isDark ? levelCfg.bgDark : levelCfg.bg,
                          )}>
                            <LevelIcon className="size-2.5" />
                            {log.level}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className={cn(
              'flex items-center justify-between px-3 py-2 border-t shrink-0',
              isDark ? 'border-zinc-800' : 'border-gray-200',
            )}>
              <span className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={cn(
                    'size-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-30',
                    isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500',
                  )}
                >
                  <ChevronLeft className="size-3" />
                </button>
                <span className={cn('text-[10px] tabular-nums px-1', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className={cn(
                    'size-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-30',
                    isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500',
                  )}
                >
                  <ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
