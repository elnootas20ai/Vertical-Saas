import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useFinanceUserId } from '../../hooks/useFinanceUserId';
import {
  listBankTransactions, importBankFile, triggerAutoMatch,
  updateBankTransaction, reconcileTransaction, unlinkTransaction,
  deleteBankTransaction, fetchReconciliationAlerts,
  type BankTransaction, type ReconciliationMatch, type ReconciliationAlert,
} from '../../lib/bankReconciliationApi';
import {
  Upload, Search, X, Trash2, CheckCircle2, AlertTriangle,
  Link2, Unlink, Eye, EyeOff, Landmark, Bell,
  FileText, BarChart3, Sparkles, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function BankReconciliationPage() {
  const financeUserId = useFinanceUserId();
  const [bankTxs, setBankTxs] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [alerts, setAlerts] = useState<ReconciliationAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!financeUserId) return;
    try {
      const [txs, alertsData] = await Promise.all([
        listBankTransactions(financeUserId),
        fetchReconciliationAlerts(financeUserId).catch(() => []),
      ]);
      setBankTxs(txs);
      setAlerts(alertsData);
    } catch {
      toast.error('Error al cargar datos de conciliación');
    } finally {
      setLoading(false);
    }
  }, [financeUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !financeUserId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importBankFile(financeUserId, text, file.name);
      if (result.imported === 0 && result.duplicates === 0) {
        toast.error('No se encontraron transacciones en el archivo');
        return;
      }
      setBankTxs(prev => [...result.transactions, ...prev]);
      const msg = result.duplicates > 0
        ? `${result.imported} importadas, ${result.duplicates} duplicados omitidos (${result.bankName})`
        : `${result.imported} transacciones importadas (${result.bankName})`;
      toast.success(msg);
    } catch {
      toast.error('Error al importar el archivo');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAutoMatch = async () => {
    if (!financeUserId) return;
    try {
      const result = await triggerAutoMatch(financeUserId);
      setMatches(result.matches);
      if (result.totalMatches === 0) toast.info('No se encontraron coincidencias automáticas');
      else toast.success(`${result.totalMatches} coincidencia(s) encontrada(s) de ${result.totalProcessed} analizadas`);
    } catch {
      toast.error('Error en auto-conciliación');
    }
  };

  const handleApplyMatch = async (bankTxId: string, suggestion: ReconciliationMatch['suggestions'][0]) => {
    if (!financeUserId) return;
    try {
      const action = suggestion.entityType === 'movement' ? 'link_existing' : 'link_invoice';
      const updated = await reconcileTransaction(financeUserId, bankTxId, {
        action,
        targetId: suggestion.entityId,
      });
      setBankTxs(prev => prev.map(t => t._id === bankTxId ? updated : t));
      setMatches(prev => prev.filter(m => m.bankTransactionId !== bankTxId));
      toast.success('Transacción conciliada');
    } catch { toast.error('Error al conciliar'); }
  };

  const handleUnmatch = async (tx: BankTransaction) => {
    if (!financeUserId) return;
    try {
      const updated = await unlinkTransaction(financeUserId, tx._id);
      setBankTxs(prev => prev.map(t => t._id === tx._id ? updated : t));
      toast.success('Conciliación deshecha');
    } catch { toast.error('Error al deshacer'); }
  };

  const handleIgnore = async (tx: BankTransaction) => {
    if (!financeUserId) return;
    try {
      const newStatus = tx.status === 'ignored' ? 'unmatched' : 'ignored';
      const updated = await updateBankTransaction(financeUserId, { _id: tx._id, status: newStatus } as BankTransaction);
      setBankTxs(prev => prev.map(t => t._id === tx._id ? updated : t));
      toast.success(newStatus === 'ignored' ? 'Transacción ignorada' : 'Transacción restaurada');
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDelete = async (tx: BankTransaction) => {
    if (!financeUserId || !confirm('¿Eliminar esta transacción bancaria?')) return;
    try {
      await deleteBankTransaction(financeUserId, tx._id);
      setBankTxs(prev => prev.filter(t => t._id !== tx._id));
      toast.success('Transacción eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  const kpis = useMemo(() => ({
    total: bankTxs.length,
    matched: bankTxs.filter(t => t.status === 'matched').length,
    unmatched: bankTxs.filter(t => t.status === 'unmatched').length,
    ignored: bankTxs.filter(t => t.status === 'ignored').length,
    totalIncome: bankTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    totalExpense: bankTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
  }), [bankTxs]);

  const conciliationPct = kpis.total > 0 ? ((kpis.matched / kpis.total) * 100).toFixed(0) : '0';

  const filtered = useMemo(() => {
    let items = bankTxs;
    if (activeTab === 'unmatched') items = items.filter(t => t.status === 'unmatched');
    else if (activeTab === 'matched') items = items.filter(t => t.status === 'matched');
    else if (activeTab === 'ignored') items = items.filter(t => t.status === 'ignored');
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t => t.description.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q));
    }
    return items;
  }, [bankTxs, activeTab, search]);

  const getMatchForTx = (txId: string) => matches.find(m => m.bankTransactionId === txId);

  const tabsConfig = [
    { id: 'all', label: 'Todas', count: kpis.total || undefined },
    { id: 'unmatched', label: 'Sin conciliar', count: kpis.unmatched || undefined },
    { id: 'matched', label: 'Conciliadas', count: kpis.matched || undefined },
    { id: 'ignored', label: 'Ignoradas', count: kpis.ignored || undefined },
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case 'matched': return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Conciliada</span>;
      case 'ignored': return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Ignorada</span>;
      default: return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pendiente</span>;
    }
  };

  const matchTypeIcon = (tx: BankTransaction) => {
    if (tx.status !== 'matched') return null;
    if (tx.matchType === 'client_invoice') return <FileText className="w-3.5 h-3.5 text-blue-500 inline mr-1" />;
    if (tx.matchType === 'purchase_invoice') return <FileText className="w-3.5 h-3.5 text-orange-500 inline mr-1" />;
    return <Link2 className="w-3.5 h-3.5 text-green-500 inline mr-1" />;
  };

  const alertSeverityColor = (severity: string) => {
    if (severity === 'error') return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300';
    if (severity === 'warning') return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300';
    return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300';
  };

  return (
    <Layout title="Conciliación Bancaria" subtitle="Importa extractos y concilia con tus movimientos financieros">
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><FileText className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.total}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Transacciones importadas</div>
          </div>
          <div className={`p-4 border-2 rounded-xl ${kpis.unmatched > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
            <div className={`mb-2 ${kpis.unmatched > 0 ? 'text-amber-600' : 'text-green-600'}`}>{kpis.unmatched > 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}</div>
            <div className={`text-2xl font-bold ${kpis.unmatched > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-green-900 dark:text-green-200'}`}>{kpis.unmatched}</div>
            <div className={`text-xs mt-0.5 ${kpis.unmatched > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>Sin conciliar</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{conciliationPct}%</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Conciliación ({kpis.matched} de {kpis.total})</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="text-purple-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{fmt(kpis.totalIncome - kpis.totalExpense)}€</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Balance bancario</div>
          </div>
          {alerts.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
              <div className="text-red-600 mb-2"><Bell className="w-5 h-5" /></div>
              <div className="text-2xl font-bold text-red-900 dark:text-red-200">{alerts.length}</div>
              <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">Alertas activas</div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {kpis.total > 0 && (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Progreso de conciliación</span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{conciliationPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${conciliationPct}%` }} />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" /> {kpis.matched} conciliadas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" /> {kpis.unmatched} pendientes</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-400 rounded-full" /> {kpis.ignored} ignoradas</span>
            </div>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-red-500" />
                <span className="font-bold text-gray-900 dark:text-gray-100">Alertas ({alerts.length})</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {alerts.filter(a => a.severity === 'error').length} críticas
                </span>
              </div>
              {alertsOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {alertsOpen && (
              <div className="px-4 pb-4 space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${alertSeverityColor(alert.severity)}`}>
                    {alert.severity === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <Bell className="w-4 h-4 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{alert.title}</div>
                      <div className="text-xs mt-0.5 opacity-80">{alert.description}</div>
                    </div>
                    <span className="text-xs font-bold shrink-0">{fmt(alert.amount)}€</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <label className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-colors cursor-pointer ${importing ? 'bg-gray-400 text-white' : 'bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900'}`}>
              <Upload className="w-4 h-4" /> {importing ? 'Importando...' : 'Importar extracto'}
              <input ref={fileInputRef} type="file" accept=".csv,.ofx,.qfx" className="hidden" onChange={handleFileImport} disabled={importing} />
            </label>
            {kpis.unmatched > 0 && (
              <button onClick={handleAutoMatch} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 font-medium transition-colors">
                <Sparkles className="w-4 h-4" /> Auto-conciliar
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Soporta CSV (Santander, BBVA, CaixaBank, Sabadell) y OFX</p>
        </div>

        {/* Pending matches */}
        {matches.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Coincidencias sugeridas ({matches.length})
            </h3>
            <div className="space-y-2">
              {matches.map(match => {
                const tx = bankTxs.find(t => t._id === match.bankTransactionId);
                const best = match.suggestions[0];
                if (!tx || !best) return null;
                return (
                  <div key={match.bankTransactionId} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{tx.description}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{fmt(tx.amount)}€ · {new Date(tx.date).toLocaleDateString('es-ES')}</div>
                    </div>
                    <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{best.entityRef}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {best.entityType === 'movement' ? 'Movimiento' : best.entityType === 'client_invoice' ? 'Factura cliente' : 'Factura proveedor'}
                        {' · '}{best.reasons.join(', ')}
                      </div>
                    </div>
                    <div className={`text-xs font-bold shrink-0 ${best.score >= 80 ? 'text-green-600' : best.score >= 50 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {best.score}pts
                    </div>
                    <button onClick={() => handleApplyMatch(match.bankTransactionId, best)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
                      Aplicar
                    </button>
                    {match.suggestions.length > 1 && (
                      <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">+{match.suggestions.length - 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64" placeholder="Buscar transacción..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />Cargando transacciones...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Landmark className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin transacciones bancarias</p>
            <p className="text-sm mt-1">Importa un extracto bancario (CSV u OFX) para empezar</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Descripción</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Importe</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Conciliado con</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map(tx => {
                    const pendingMatch = getMatchForTx(tx._id);
                    return (
                      <tr key={tx._id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${tx.status === 'ignored' ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {new Date(tx.date).toLocaleDateString('es-ES')}
                          {tx.bankName && <div className="text-[10px] text-gray-400">{tx.bankName}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">{tx.description}</div>
                          {tx.reference && <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{tx.reference}</div>}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-bold ${tx.amount >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>
                          {tx.amount >= 0 ? '+' : ''}{fmt(tx.amount)}€
                        </td>
                        <td className="px-4 py-3 text-center">{statusBadge(tx.status)}</td>
                        <td className="px-4 py-3">
                          {tx.status === 'matched' ? (
                            <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                              {matchTypeIcon(tx)}
                              {tx.matchedEntityRef || tx.matchedMovementRef || '—'}
                            </span>
                          ) : pendingMatch ? (
                            <button onClick={() => handleApplyMatch(pendingMatch.bankTransactionId, pendingMatch.suggestions[0])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                              Sugerencia ({pendingMatch.suggestions[0]?.score}pts) — Aplicar
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {tx.status === 'matched' && (
                              <button onClick={() => handleUnmatch(tx)} className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Deshacer conciliación"><Unlink className="w-4 h-4 text-amber-600" /></button>
                            )}
                            <button onClick={() => handleIgnore(tx)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title={tx.status === 'ignored' ? 'Restaurar' : 'Ignorar'}>
                              {tx.status === 'ignored' ? <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" /> : <EyeOff className="w-4 h-4 text-gray-600 dark:text-gray-400" />}
                            </button>
                            <button onClick={() => handleDelete(tx)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
