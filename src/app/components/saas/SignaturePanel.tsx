import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PenLine, Clock, CheckCircle2, XCircle, AlertTriangle, Ban,
  Eye, Search, Send, FileText, RefreshCw, Download, MoreHorizontal,
  ChevronRight, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  listSignatureRequests,
  cancelSignatureRequest,
  sendSignatureReminder,
  type SignatureRequestRecord,
  type SignatureRequestStatus,
  SIGNATURE_STATUS_CONFIG,
  SIGNER_STATUS_CONFIG,
  getSignatureProgress,
  type SignatureListFilters,
} from '../../lib/signatureApi';
import { SignatureDetailDrawer } from './SignatureDetailDrawer';

interface Props {
  filters?: SignatureListFilters;
  compact?: boolean;
}

const STATUS_ICON: Record<string, typeof Clock> = {
  draft: FileText, pending: Clock, partially_signed: PenLine,
  completed: CheckCircle2, rejected: XCircle, expired: AlertTriangle, cancelled: Ban,
};

const TAB_FILTERS: { label: string; value: SignatureRequestStatus | 'all' }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Firmando', value: 'partially_signed' },
  { label: 'Completadas', value: 'completed' },
  { label: 'Rechazadas', value: 'rejected' },
];

export function SignaturePanel({ filters: externalFilters, compact }: Props) {
  const { user } = useAuth();
  const userId = user?.user_id || '';

  const [requests, setRequests] = useState<SignatureRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SignatureRequestStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<SignatureRequestRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await listSignatureRequests(userId, externalFilters);
      setRequests(data);
    } catch {
      toast.error('Error al cargar solicitudes de firma');
    } finally {
      setLoading(false);
    }
  }, [userId, externalFilters]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = requests;
    if (statusFilter !== 'all') result = result.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.documentName.toLowerCase().includes(q) ||
        r.signers.some((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) ||
        r.linkedEntityName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [requests, statusFilter, search]);

  const kpis = useMemo(() => {
    const pending = requests.filter((r) => ['pending', 'partially_signed'].includes(r.status)).length;
    const completed = requests.filter((r) => r.status === 'completed').length;
    const rejected = requests.filter((r) => r.status === 'rejected').length;
    const now = Date.now();
    const expiringSoon = requests.filter((r) =>
      ['pending', 'partially_signed'].includes(r.status) && r.expiresAt &&
      (new Date(r.expiresAt).getTime() - now) < 48 * 3_600_000 &&
      (new Date(r.expiresAt).getTime() - now) > 0,
    ).length;
    const total = requests.filter((r) => r.status !== 'draft' && r.status !== 'cancelled').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { pending, completed, rejected, expiringSoon, rate };
  }, [requests]);

  const handleRemind = async (req: SignatureRequestRecord) => {
    try {
      const { reminded } = await sendSignatureReminder(userId, req.id);
      toast.success(`Recordatorio enviado a ${reminded.length} firmante(s)`);
      load();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al enviar recordatorio');
    }
  };

  const handleCancel = async (req: SignatureRequestRecord) => {
    if (!window.confirm('¿Cancelar esta solicitud de firma?')) return;
    try {
      await cancelSignatureRequest(userId, req.id);
      toast.success('Solicitud cancelada');
      load();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al cancelar');
    }
  };

  const openDetail = (req: SignatureRequestRecord) => {
    setSelectedRequest(req);
    setDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Pendientes', value: kpis.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Completadas', value: kpis.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Rechazadas', value: kpis.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
            { label: 'Por caducar', value: kpis.expiringSoon, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
            { label: 'Tasa firma', value: `${kpis.rate}%`, icon: PenLine, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          ].map((kpi) => (
            <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3 flex items-center gap-3`}>
              <kpi.icon className={`w-5 h-5 ${kpi.color} shrink-0`} />
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{kpi.value}</p>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {TAB_FILTERS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((req) => {
            const cfg = SIGNATURE_STATUS_CONFIG[req.status] || SIGNATURE_STATUS_CONFIG.draft;
            const Icon = STATUS_ICON[req.status] || FileText;
            const progress = getSignatureProgress(req.signers);
            const isActive = ['pending', 'partially_signed'].includes(req.status);

            return (
              <div
                key={req.id}
                className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-sm transition-all cursor-pointer"
                onClick={() => openDetail(req)}
              >
                <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{req.documentName}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {progress.signed}/{progress.total} firmantes
                    </span>
                    {req.linkedEntityName && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {req.linkedEntityName}
                      </span>
                    )}
                    {req.expiresAt && isActive && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Caduca {new Date(req.expiresAt).toLocaleDateString('es-ES')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isActive && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemind(req); }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Enviar recordatorio"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {req.status === 'completed' && req.signedFileUrl && (
                    <a
                      href={req.signedFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                      title="Descargar firmado"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <PenLine className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {statusFilter !== 'all' ? 'Sin resultados para este filtro' : 'Sin solicitudes de firma'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Envía un documento a firma desde la pestaña de documentos
          </p>
        </div>
      )}

      {/* Detail drawer */}
      <SignatureDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        request={selectedRequest}
        onRemind={handleRemind}
        onCancel={handleCancel}
        onRefresh={load}
      />
    </div>
  );
}
