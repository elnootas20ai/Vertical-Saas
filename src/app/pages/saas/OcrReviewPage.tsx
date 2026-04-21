import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listProposals, listLogs, getOcrStats, approveProposal, rejectProposal,
  DOC_TYPE_LABELS, DOC_TYPE_ICONS, DOC_TYPE_COLORS, MODULE_LABELS,
  type OcrProposal, type OcrLog, type OcrStats,
} from '../../lib/ocrApi';
import {
  ScanLine, CheckCircle, XCircle, Clock, Eye, AlertTriangle, Copy,
  FileText, Filter, RefreshCw, Zap, Shield, Send, BarChart3,
  Loader2, ChevronDown,
} from 'lucide-react';

type Tab = 'proposals' | 'logs' | 'stats';

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : score >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}><Shield className="w-3 h-3" />{score}%</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    auto_approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    duplicate: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
  };
  const labels: Record<string, string> = {
    pending_review: 'Pendiente', auto_approved: 'Auto-aprobado', approved: 'Aprobado',
    rejected: 'Rechazado', completed: 'Completado', duplicate: 'Duplicado', failed: 'Error',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{labels[status] || status}</span>;
}

export default function OcrReviewPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('proposals');
  const [proposals, setProposals] = useState<OcrProposal[]>([]);
  const [logs, setLogs] = useState<OcrLog[]>([]);
  const [stats, setStats] = useState<OcrStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, logRes, statsRes] = await Promise.all([
        listProposals(filterStatus || undefined),
        listLogs(),
        getOcrStats(),
      ]);
      setProposals(propRes.proposals || []);
      setLogs(logRes.logs || []);
      setStats(statsRes.stats || null);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { reload(); }, [reload]);

  const handleApprove = async (proposalId: string) => {
    setActionLoading(proposalId);
    try {
      await approveProposal(proposalId);
      await reload();
    } catch {
      /* silent */
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    setActionLoading(proposalId);
    try {
      await rejectProposal(proposalId);
      await reload();
    } catch {
      /* silent */
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = proposals.filter((p) => p.status === 'pending_review').length;

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
              <ScanLine className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">OCR Transversal</h1>
              <p className="text-sm text-gray-500">Propuestas, historial y estadisticas de escaneo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{pendingCount} pendientes</span>
            )}
            <button onClick={reload} disabled={loading} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
              <div className="text-xs text-gray-500">Total procesados</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
              <div className="text-xs text-gray-500">Completados</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-amber-600">{stats.pendingProposals}</div>
              <div className="text-xs text-gray-500">Pendientes</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-400">{stats.duplicates}</div>
              <div className="text-xs text-gray-500">Duplicados</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-violet-600">{stats.avgConfidence}%</div>
              <div className="text-xs text-gray-500">Confianza media</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {([['proposals', 'Propuestas', FileText], ['logs', 'Historial', Clock], ['stats', 'Detalle', BarChart3]] as [Tab, string, typeof FileText][]).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'proposals' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-400" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">
                <option value="">Todos</option>
                <option value="pending_review">Pendientes</option>
                <option value="approved">Aprobados</option>
                <option value="auto_approved">Auto-aprobados</option>
                <option value="rejected">Rechazados</option>
              </select>
            </div>

            {loading && <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto" /></div>}

            {!loading && proposals.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <ScanLine className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-semibold">No hay propuestas</p>
                <p className="text-sm">Escanea un documento para generar propuestas automaticamente</p>
              </div>
            )}

            {!loading && proposals.map((p) => {
              const docType = p.ocrData?.documentType || 'otro';
              const isExpanded = expandedId === p._id;
              return (
                <div key={p._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => setExpandedId(isExpanded ? null : p._id)}>
                    <span className="text-2xl">{DOC_TYPE_ICONS[docType] || '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{p.sourceFileName || DOC_TYPE_LABELS[docType] || 'Documento'}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{DOC_TYPE_LABELS[docType] || docType}</span>
                        {p.destination && <><span>&rarr;</span><span>{MODULE_LABELS[(p.destination as Record<string, string>).module] || (p.destination as Record<string, string>).module}</span></>}
                        <span>&bull;</span>
                        <span>{new Date(p.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                    {p.ocrData?.confidenceScore && <ConfidenceBadge score={p.ocrData.confidenceScore} />}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
                      {p.ocrData && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                          <div><span className="text-gray-500">Emisor:</span> <strong>{p.ocrData.emitter || '\u2014'}</strong></div>
                          <div><span className="text-gray-500">Receptor:</span> <strong>{p.ocrData.receiver || '\u2014'}</strong></div>
                          <div><span className="text-gray-500">Fecha:</span> <strong>{p.ocrData.date || '\u2014'}</strong></div>
                          <div><span className="text-gray-500">Total:</span> <strong className="text-emerald-600">{p.ocrData.total != null ? `${p.ocrData.total}\u00a0\u20ac` : '\u2014'}</strong></div>
                        </div>
                      )}

                      {p.entity && (
                        <div className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-700/30 rounded-lg p-2">
                          <span>{p.entity.type === 'supplier' ? '🏭' : p.entity.type === 'client' ? '👤' : '👷'}</span>
                          <span className="text-gray-500">{p.entity.type === 'supplier' ? 'Proveedor' : p.entity.type === 'client' ? 'Cliente' : 'Trabajador'}:</span>
                          <strong>{p.entity.name}</strong>
                          <ConfidenceBadge score={p.entity.confidence} />
                        </div>
                      )}

                      {p.warnings && p.warnings.length > 0 && (
                        <div className="space-y-1">
                          {p.warnings.map((w, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg px-3 py-1.5">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {p.createdDocumentId && (
                        <div className="text-xs text-gray-400 font-mono">Documento creado: {p.createdDocumentId}</div>
                      )}

                      {p.status === 'pending_review' && (
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => handleReject(p._id)} disabled={actionLoading === p._id} className="flex-1 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:border-red-300 hover:text-red-600 transition-colors flex items-center justify-center gap-2 text-sm">
                            {actionLoading === p._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Rechazar
                          </button>
                          <button onClick={() => handleApprove(p._id)} disabled={actionLoading === p._id} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                            {actionLoading === p._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprobar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-2">
            {loading && <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto" /></div>}
            {!loading && logs.length === 0 && <div className="text-center py-12 text-gray-500"><p>No hay registros de procesamiento</p></div>}
            {!loading && logs.map((log) => (
              <div key={log._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <span className="text-xl">{DOC_TYPE_ICONS[log.detectedDocumentType] || '📄'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{log.sourceFileName || 'Documento'}</div>
                  <div className="text-xs text-gray-500">{DOC_TYPE_LABELS[log.detectedDocumentType] || log.detectedDocumentType} &bull; {new Date(log.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <StatusBadge status={log.status} />
                <ConfidenceBadge score={log.confidence} />
                <div className="text-xs text-gray-400">{log.processingTimeMs}ms</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && stats && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Documentos por tipo</h3>
              <div className="space-y-3">
                {Object.entries(stats.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xl">{DOC_TYPE_ICONS[type] || '📄'}</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">{DOC_TYPE_LABELS[type] || type}</span>
                    <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (count / stats.total) * 100)}%`, backgroundColor: DOC_TYPE_COLORS[type] || '#94a3b8' }} />
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
