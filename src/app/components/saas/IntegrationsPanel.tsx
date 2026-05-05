import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  API_MODULES,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type ApiToken,
} from '../../lib/apiTokensApi';
import { getApiBase } from '../../lib/apiBase';

type PanelSection = 'tokens' | 'reference' | 'playground' | 'embed';

interface PlaygroundEndpoint {
  method: string;
  path: string;
  summary: string;
  pathParams?: readonly string[];
  queryParams?: readonly string[];
  bodyExample?: Record<string, unknown>;
}

interface PlaygroundResult {
  status: number;
  ok: boolean;
  duration: number;
  body: unknown;
  error?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-700 border border-blue-200',
  POST: 'bg-green-50 text-green-700 border border-green-200',
  PUT: 'bg-amber-50 text-amber-700 border border-amber-200',
  DELETE: 'bg-red-50 text-red-700 border border-red-200',
  PATCH: 'bg-purple-50 text-purple-700 border border-purple-200',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold font-mono ${METHOD_COLORS[method] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
    >
      {method}
    </span>
  );
}

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 200 && status < 300
      ? 'bg-green-50 text-green-700 border border-green-200'
      : status >= 400 && status < 500
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-red-50 text-red-700 border border-red-200';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold font-mono ${color}`}>
      {status}
    </span>
  );
}

function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copiado' : label}
    </button>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jsonHighlight(json: unknown): string {
  const str = JSON.stringify(json, null, 2);
  return str.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-blue-300';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-rose-300' : 'text-green-300';
      } else if (/true|false/.test(match)) {
        cls = 'text-yellow-300';
      } else if (/null/.test(match)) {
        cls = 'text-gray-400 dark:text-gray-500';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// ─── Token Card ───────────────────────────────────────────────────────────────

function TokenCard({
  token,
  onRevoke,
  justCreated,
}: {
  token: ApiToken;
  onRevoke: (id: string) => void;
  justCreated?: boolean;
}) {
  const [showToken, setShowToken] = useState(!!justCreated);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const isExpired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;

  const handleRevoke = async () => {
    if (!confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setRevoking(true);
    try {
      await onRevoke(token.id);
    } finally {
      setRevoking(false);
      setConfirmRevoke(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${isExpired ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-60' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isExpired ? 'bg-gray-100 dark:bg-gray-700' : 'bg-gray-900'}`}
          >
            <Key className={`w-4 h-4 ${isExpired ? 'text-gray-400 dark:text-gray-500' : 'text-white'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{token.name}</p>
              {isExpired && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600">
                  Expirado
                </span>
              )}
              {justCreated && (
                <span className="rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-600">
                  Nuevo
                </span>
              )}
            </div>
            {token.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{token.description}</p>}
            <div className="flex flex-wrap gap-1 mt-2">
              {token.permissions.length === 0 ? (
                <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">Sin permisos</span>
              ) : (
                token.permissions.map((p) => (
                  <span key={p} className="rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium">
                    {p}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isExpired && (
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                confirmRevoke
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
              }`}
            >
              {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {confirmRevoke ? 'Confirmar' : 'Revocar'}
            </button>
          )}
          {confirmRevoke && (
            <button
              onClick={() => setConfirmRevoke(false)}
              className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-gray-900 p-3 flex items-center justify-between gap-2">
        <code className="text-xs font-mono text-gray-100 truncate flex-1">
          {showToken && token.token ? token.token : `${token.prefix}${'•'.repeat(32)}`}
        </code>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowToken(!showToken)}
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-white transition-colors"
          >
            {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {token.token && <CopyButton value={token.token} label="Copiar" />}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Creado {formatDate(token.createdAt)}
        </span>
        <span className="flex items-center gap-1">
          <Circle className="w-3 h-3" /> Último uso: {formatDate(token.lastUsedAt)}
        </span>
        {token.expiresAt && (
          <span className={`flex items-center gap-1 ${isExpired ? 'text-red-500' : ''}`}>
            <AlertTriangle className="w-3.5 h-3.5" /> Expira {formatDate(token.expiresAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Create Token Modal ───────────────────────────────────────────────────────

const ALL_PERMISSIONS = ['vehicles', 'sales', 'clients', 'pipeline', 'documents', 'finance', 'team', 'calls', 'dashboard'];

function CreateTokenModal({
  userId,
  onCreated,
  onClose,
}: {
  userId: string;
  onCreated: (t: ApiToken) => void;
  onClose: () => void;
}) {
  useModalClose(true, onClose);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([...ALL_PERMISSIONS]);
  const [expiresInDays, setExpiresInDays] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const togglePerm = (p: string) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await createApiToken({
        name: name.trim(),
        description: description.trim(),
        userId,
        permissions,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      onCreated(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
              <Key className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Generar nuevo token</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">Solo se mostrará una vez — guárdalo bien</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Integración ERP, Webhook producción..."
              className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm outline-none focus:border-gray-900 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción (opcional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué se usará este token..."
              className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm outline-none focus:border-gray-900 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Expira en días (vacío = nunca)</label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="30, 90, 365..."
              min="1"
              max="3650"
              className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm outline-none focus:border-gray-900 transition-colors"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Permisos</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPermissions([...ALL_PERMISSIONS])} className="text-xs text-blue-600 hover:text-blue-800">
                  Todos
                </button>
                <span className="text-gray-300">·</span>
                <button type="button" onClick={() => setPermissions([])} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  Ninguno
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_PERMISSIONS.map((perm) => (
                <button
                  key={perm}
                  type="button"
                  onClick={() => togglePerm(perm)}
                  className={`rounded-xl px-3 py-2 text-xs font-medium border transition-all text-left ${
                    permissions.includes(perm)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {perm}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Generar token
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tokens Section ───────────────────────────────────────────────────────────

function TokensSection({ userId }: { userId: string }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listApiTokens(userId);
      setTokens(r.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando tokens');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreated = (token: ApiToken) => {
    setTokens((prev) => [token, ...prev]);
    setJustCreatedId(token.id);
    setShowCreate(false);
  };

  const handleRevoke = async (id: string) => {
    await revokeApiToken(id);
    setTokens((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Tokens de API</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {tokens.length} token{tokens.length !== 1 ? 's' : ''} activo{tokens.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTokens}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo token
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-xs text-blue-800">
          <p className="font-semibold mb-0.5">Autenticación por Bearer Token</p>
          <p className="text-blue-600">
            Incluye en cada request la cabecera:{' '}
            <code className="bg-blue-100 rounded px-1 font-mono">Authorization: Bearer tu_token</code>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
            <Key className="w-6 h-6 text-gray-400 dark:text-gray-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin tokens creados</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Genera tu primer token para acceder a la API</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black transition-colors"
          >
            <Plus className="w-4 h-4" />
            Generar primer token
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <TokenCard
              key={token.id}
              token={token}
              onRevoke={handleRevoke}
              justCreated={justCreatedId === token.id}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTokenModal userId={userId} onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ─── Reference Section ────────────────────────────────────────────────────────

function ReferenceSection() {
  const [expanded, setExpanded] = useState<string[]>([String(API_MODULES[0].id)]);
  const toggle = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const baseUrl = `${getApiBase()}/api/v1`;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-gray-100">Referencia de la API</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Todos los endpoints disponibles organizados por módulo</p>
      </div>

      <div className="rounded-2xl bg-gray-900 p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Base URL</p>
          <code className="text-sm font-mono text-green-300">{baseUrl}</code>
        </div>
        <CopyButton value={baseUrl} label="Copiar" />
      </div>

      <div className="space-y-2">
        {API_MODULES.map((module) => {
          const isOpen = expanded.includes(String(module.id));
          return (
            <div key={module.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => toggle(String(module.id))}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Code2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{module.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {module.description} · {module.endpoints.length} endpoint
                      {module.endpoints.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {module.endpoints.map((ep, idx) => {
                    const curlCmd = `curl -X ${ep.method} "${getApiBase()}${ep.path}" \\\n  -H "Authorization: Bearer TU_TOKEN" \\\n  -H "Content-Type: application/json"${ep.bodyExample ? ` \\\n  -d '${JSON.stringify(ep.bodyExample)}'` : ''}`;
                    return (
                      <div key={idx} className="p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MethodBadge method={ep.method} />
                          <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{ep.path}</code>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{ep.summary}</p>
                        {ep.pathParams && ep.pathParams.length > 0 && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-600 dark:text-gray-400">Path params:</span>{' '}
                            {ep.pathParams.map((p) => (
                              <code key={p} className="bg-gray-100 dark:bg-gray-700 rounded px-1 mr-1 font-mono">
                                :{p}
                              </code>
                            ))}
                          </div>
                        )}
                        {ep.queryParams && ep.queryParams.length > 0 && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-600 dark:text-gray-400">Query params:</span>{' '}
                            {ep.queryParams.map((p) => (
                              <code key={p} className="bg-gray-100 dark:bg-gray-700 rounded px-1 mr-1 font-mono">
                                {p}
                              </code>
                            ))}
                          </div>
                        )}
                        {ep.bodyExample && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium select-none">
                              Ver body de ejemplo
                            </summary>
                            <div className="mt-2 rounded-xl bg-gray-900 p-3 overflow-auto">
                              <pre
                                className="text-xs font-mono text-gray-200 whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{ __html: jsonHighlight(ep.bodyExample) }}
                              />
                            </div>
                          </details>
                        )}
                        <CopyButton value={curlCmd} label="Copiar cURL" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Playground Section ───────────────────────────────────────────────────────

const ALL_ENDPOINTS: (PlaygroundEndpoint & { module: string })[] = API_MODULES.flatMap((m) =>
  m.endpoints.map((ep) => ({ ...ep, module: m.label })),
);

function PlaygroundSection({ userId }: { userId: string }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [selectedEndpointIdx, setSelectedEndpointIdx] = useState(0);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [bodyValue, setBodyValue] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [running, setRunning] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const endpoint = ALL_ENDPOINTS[selectedEndpointIdx];

  useEffect(() => {
    listApiTokens(userId)
      .then((r) => {
        setTokens(r.tokens);
        if (r.tokens.length > 0) setSelectedTokenId(r.tokens[0].id);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    setPathValues({});
    setQueryValues({});
    setBodyValue(endpoint.bodyExample ? JSON.stringify(endpoint.bodyExample, null, 2) : '');
    setResult(null);
  }, [selectedEndpointIdx]);

  const buildUrl = () => {
    let path = endpoint.path;
    (endpoint.pathParams || []).forEach((p) => {
      path = path.replace(`:${p}`, encodeURIComponent(pathValues[p] || `:${p}`));
    });
    const qp = Object.entries(queryValues).filter(([, v]) => v.trim());
    if (qp.length > 0) path += '?' + qp.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return `${getApiBase()}${path}`;
  };

  const handleRun = async () => {
    const selectedToken = tokens.find((t) => t.id === selectedTokenId);
    if (!selectedToken?.token) {
      alert(
        'Para usar el playground, crea un nuevo token desde "Tokens de API". Los tokens ya guardados no exponen su valor completo por seguridad.',
      );
      return;
    }
    setRunning(true);
    setResult(null);
    const start = Date.now();
    try {
      const url = buildUrl();
      const init: RequestInit = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedToken.token}`,
        },
      };
      if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && bodyValue.trim()) {
        try {
          init.body = JSON.stringify(JSON.parse(bodyValue));
        } catch {
          init.body = bodyValue;
        }
      }
      const resp = await fetch(url, init);
      const duration = Date.now() - start;
      const body = await resp.json().catch(() => ({ _raw: '' }));
      setResult({ status: resp.status, ok: resp.ok, duration, body });
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        duration: Date.now() - start,
        body: null,
        error: err instanceof Error ? err.message : 'Error de red',
      });
    } finally {
      setRunning(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  };

  const curlCommand = `curl -X ${endpoint.method} "${buildUrl()}" \\\n  -H "Authorization: Bearer TU_TOKEN" \\\n  -H "Content-Type: application/json"${['POST', 'PUT', 'PATCH'].includes(endpoint.method) && bodyValue.trim() ? ` \\\n  -d '${bodyValue.replace(/\n/g, ' ')}'` : ''}`;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-gray-100">API Playground</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Prueba cualquier endpoint directamente desde el navegador</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Config */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Endpoint</p>
            </div>
            <div className="p-3">
              <select
                value={selectedEndpointIdx}
                onChange={(e) => setSelectedEndpointIdx(Number(e.target.value))}
                className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:border-gray-900 transition-colors bg-white dark:bg-gray-800"
              >
                {ALL_ENDPOINTS.map((ep, idx) => (
                  <option key={idx} value={idx}>
                    [{ep.method}] {ep.module} — {ep.path}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Token de autenticación</p>
            </div>
            <div className="p-3 space-y-2">
              {tokens.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 p-2">Sin tokens. Créalos en la sección Tokens de API.</p>
              ) : (
                <select
                  value={selectedTokenId}
                  onChange={(e) => setSelectedTokenId(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:border-gray-900 transition-colors bg-white dark:bg-gray-800"
                >
                  {tokens.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.prefix}...)
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-100">
                Solo puedes enviar requests con tokens recién generados (el valor completo está disponible justo tras crearlos).
              </p>
            </div>
          </div>

          {endpoint.pathParams && endpoint.pathParams.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Path Parameters</p>
              </div>
              <div className="p-3 space-y-2">
                {endpoint.pathParams.map((param) => (
                  <div key={param} className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">:{param}</code>
                    <input
                      value={pathValues[param] || ''}
                      onChange={(e) => setPathValues((prev) => ({ ...prev, [param]: e.target.value }))}
                      placeholder={`Valor para :${param}`}
                      className="flex-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.queryParams && endpoint.queryParams.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Query Parameters</p>
              </div>
              <div className="p-3 space-y-2">
                {endpoint.queryParams.map((param) => (
                  <div key={param} className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">{param}</code>
                    <input
                      value={queryValues[param] || ''}
                      onChange={(e) => setQueryValues((prev) => ({ ...prev, [param]: e.target.value }))}
                      placeholder={param === 'page' ? '1' : param === 'limit' ? '50' : `${param}`}
                      className="flex-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {['POST', 'PUT', 'PATCH'].includes(endpoint.method) && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Request Body (JSON)</p>
                {endpoint.bodyExample && (
                  <button
                    onClick={() => setBodyValue(JSON.stringify(endpoint.bodyExample, null, 2))}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Usar ejemplo
                  </button>
                )}
              </div>
              <div className="p-3">
                <textarea
                  value={bodyValue}
                  onChange={(e) => setBodyValue(e.target.value)}
                  rows={6}
                  placeholder='{ "key": "value" }'
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-mono outline-none focus:border-gray-900 transition-colors resize-none"
                />
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-gray-900 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <MethodBadge method={endpoint.method} />
              <code className="text-xs font-mono text-gray-300 break-all flex-1">{buildUrl()}</code>
            </div>
            <button
              onClick={handleRun}
              disabled={running || tokens.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:bg-gray-700 px-4 py-2.5 text-sm font-bold text-white transition-colors"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Enviando...' : 'Enviar request'}
            </button>
          </div>
        </div>

        {/* Right: Response */}
        <div className="space-y-4" ref={resultRef}>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Comando cURL</p>
              </div>
              <CopyButton value={curlCommand} />
            </div>
            <div className="bg-gray-900 p-4 overflow-auto max-h-32">
              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">{curlCommand}</pre>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Respuesta</p>
              {result && (
                <div className="flex items-center gap-2">
                  <StatusBadge status={result.status} />
                  <span className="text-xs text-gray-400 dark:text-gray-500">{result.duration}ms</span>
                </div>
              )}
            </div>
            <div className="bg-gray-900 p-4 min-h-48 max-h-96 overflow-auto">
              {!result ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <Terminal className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ejecuta un request para ver la respuesta aquí</p>
                </div>
              ) : result.error ? (
                <div className="text-red-400 text-sm font-mono">
                  <p className="text-red-300 font-semibold mb-1">Error de red</p>
                  <p>{result.error}</p>
                </div>
              ) : (
                <pre
                  className="text-xs font-mono text-gray-200 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: jsonHighlight(result.body) }}
                />
              )}
            </div>
          </div>

          {result && (
            <div
              className={`rounded-2xl p-4 border ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
            >
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                )}
                <p className={`text-sm font-semibold ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {result.ok ? `Respuesta exitosa — ${result.status}` : `Error — ${result.status || 'Sin conexión'}`}
                </p>
              </div>
              <p className={`text-xs mt-1 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                {result.ok
                  ? `Completado en ${result.duration}ms`
                  : result.error || 'El servidor devolvió un error'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function IntegrationsPanel() {
  const { user } = useAuth();
  const [section, setSection] = useState<PanelSection>('tokens');
  const userId =
    (user as { userId?: string; id?: string } | null)?.userId ||
    (user as { userId?: string; id?: string } | null)?.id ||
    '';

  const sections: { id: PanelSection; label: string; icon: React.ReactNode }[] = [
    { id: 'tokens', label: 'Tokens de API', icon: <Key className="w-4 h-4" /> },
    { id: 'reference', label: 'Referencia API', icon: <Code2 className="w-4 h-4" /> },
    { id: 'playground', label: 'Playground', icon: <Play className="w-4 h-4" /> },
    { id: 'embed', label: 'Formulario web', icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-bold text-gray-900 dark:text-gray-100">Integraciones y API</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Accede a todos tus datos de Vertial mediante la REST API</p>
      </div>

      <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              section === s.id
                ? 'border-gray-900 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {section === 'tokens' && <TokensSection userId={userId} />}
        {section === 'reference' && <ReferenceSection />}
        {section === 'playground' && <PlaygroundSection userId={userId} />}
        {section === 'embed' && <EmbedFormSection userId={userId} />}
      </div>
    </div>
  );
}

// ─── Embed Form Section ───────────────────────────────────────────────────────

function EmbedFormSection({ userId }: { userId: string }) {
  const [color, setColor] = useState('#6d28d9');
  const [copied, setCopied] = useState<'iframe' | 'link' | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const embedUrl = useMemo(
    () => `${baseUrl}/embed/${encodeURIComponent(userId)}?color=${encodeURIComponent(color)}`,
    [baseUrl, userId, color],
  );

  const iframeCode = useMemo(
    () => `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="680"\n  frameborder="0"\n  style="border-radius:12px;overflow:hidden"\n  title="Formulario de contacto"\n></iframe>`,
    [embedUrl],
  );

  function handleCopy(type: 'iframe' | 'link') {
    const text = type === 'iframe' ? iframeCode : embedUrl;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (!userId) {
    return (
      <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
        Inicia sesión para ver el código del formulario embebible
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Formulario web embebible (CRM-01)</h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Incrusta este formulario en la web de tu concesionario. Cuando un visitante lo rellene,
          se creará automáticamente un lead en tu pipeline CRM.
        </p>
      </div>

      {/* Color personalizer */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Color de marca:</label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-10 h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-700"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{color}</span>
      </div>

      {/* Preview link */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Enlace directo</p>
          <button
            onClick={() => handleCopy('link')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-medium transition-colors"
          >
            {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'link' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs font-mono text-blue-600 break-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
          {embedUrl}
        </p>
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <Eye className="w-3 h-3" />
          Previsualizar formulario
        </a>
      </div>

      {/* iFrame code */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Código iFrame para tu web</p>
          <button
            onClick={() => handleCopy('iframe')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-medium transition-colors"
          >
            {copied === 'iframe' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'iframe' ? 'Copiado' : 'Copiar código'}
          </button>
        </div>
        <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {iframeCode}
        </pre>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Nota:</strong> Los leads capturados aparecerán automáticamente en tu Pipeline CRM
        con origen <code className="bg-blue-100 px-1 rounded">web_form</code> y estado <em>Nuevo</em>.
      </div>
    </div>
  );
}
